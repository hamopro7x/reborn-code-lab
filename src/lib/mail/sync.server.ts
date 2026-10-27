// Server-side incremental Gmail sync. Only messages after an account's linked_at are imported.
import { accessTokenFor, gmail, GmailHttpError, ReauthError } from "./google.server";
import { folderFromLabels, header, parsePayload } from "./mime";

const LEASE_MS = 90_000;

export async function logActivity(admin: any, row: { actor_id?: string | null; action: string; account_id?: string | null; message_id?: string | null; meta?: any }) {
  await admin.from("mail_activity").insert({ meta: {}, ...row });
}

/** Fetches one Gmail message and stores it locally (idempotent). Returns new local id or null. */
export async function importMessage(admin: any, token: string, account: any, gmailId: string, notify = true): Promise<string | null> {
  const { data: tomb } = await admin.from("mail_local_tombstones").select("gmail_message_id").eq("account_id", account.id).eq("gmail_message_id", gmailId).maybeSingle();
  if (tomb) return null;
  const { data: existing } = await admin.from("mail_messages").select("id").eq("account_id", account.id).eq("gmail_message_id", gmailId).maybeSingle();
  if (existing) return null;
  let m: any;
  try {
    m = await gmail(token, `/messages/${gmailId}?format=full`);
  } catch (e) {
    if (e instanceof GmailHttpError && e.status === 404) return null;
    throw e;
  }
  const internal = new Date(Number(m.internalDate ?? Date.now()));
  // Strict boundary: never import pre-link history.
  if (internal.getTime() < new Date(account.linked_at).getTime()) return null;
  const labels: string[] = m.labelIds ?? [];
  const folder = folderFromLabels(labels);
  if (folder === "trash") return null;
  const body = parsePayload(m.payload);
  const row = {
    account_id: account.id,
    gmail_message_id: m.id,
    gmail_thread_id: m.threadId,
    folder,
    from_addr: header(m.payload, "From").slice(0, 500),
    to_addr: header(m.payload, "To").slice(0, 2000),
    cc_addr: header(m.payload, "Cc").slice(0, 2000),
    subject: header(m.payload, "Subject").slice(0, 1000),
    snippet: String(m.snippet ?? "").slice(0, 500),
    rfc_message_id: header(m.payload, "Message-ID") || header(m.payload, "Message-Id"),
    rfc_references: header(m.payload, "References").slice(0, 4000),
    internal_date: internal.toISOString(),
    body_text: body.text?.slice(0, 500_000) ?? null,
    body_html: body.html?.slice(0, 1_000_000) ?? null,
    has_attachments: body.attachments.length > 0,
    // Our own outgoing mail is already "read".
    is_read: folder === "sent" || folder === "drafts",
  };
  const { data: ins, error } = await admin.from("mail_messages").upsert(row, { onConflict: "account_id,gmail_message_id", ignoreDuplicates: true }).select("id").maybeSingle();
  if (error) throw new Error(error.message);
  if (!ins) return null;
  if (body.attachments.length) {
    await admin.from("mail_attachments").insert(body.attachments.map((a) => ({
      message_id: ins.id, gmail_attachment_id: a.attachmentId, filename: a.filename.slice(0, 300), mime_type: a.mimeType, size_bytes: a.size,
    })));
  }
  if (notify && (folder === "inbox" || folder === "spam" || folder === "other")) {
    const { data: staff } = await admin.from("user_roles").select("user_id, role");
    const ids = [...new Set((staff ?? []).filter((r: any) => r.role === "admin" || r.role === "employee").map((r: any) => r.user_id))];
    if (ids.length) {
      await admin.from("mail_notifications").upsert(ids.map((u) => ({ user_id: u, message_id: ins.id })), { onConflict: "user_id,message_id", ignoreDuplicates: true });
    }
  }
  return ins.id;
}

async function removeLocal(admin: any, accountId: string, gmailIds: string[]) {
  for (let i = 0; i < gmailIds.length; i += 100) {
    const { error } = await admin.from("mail_messages").delete().eq("account_id", accountId).in("gmail_message_id", gmailIds.slice(i, i + 100));
    if (error) throw new Error(error.message);
  }
}

/** Ids already stored or tombstoned, so replays never re-fetch them from Gmail. */
async function knownIds(admin: any, accountId: string, ids: string[]): Promise<Set<string>> {
  const known = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const [a, b] = await Promise.all([
      admin.from("mail_messages").select("gmail_message_id").eq("account_id", accountId).in("gmail_message_id", chunk),
      admin.from("mail_local_tombstones").select("gmail_message_id").eq("account_id", accountId).in("gmail_message_id", chunk),
    ]);
    if (a.error || b.error) throw new Error((a.error ?? b.error).message);
    for (const r of [...(a.data ?? []), ...(b.data ?? [])]) known.add(r.gmail_message_id);
  }
  return known;
}

// Each run has a time budget below the lease. Every page is processed fully; the history cursor
// only advances after the LAST page succeeds. If the budget runs out, the cursor stays put and the
// next run replays the same pages — already-imported ids are skipped without Gmail calls, so
// every run makes guaranteed forward progress and nothing is skipped.
const RUN_BUDGET_MS = 55_000;

async function importIds(admin: any, token: string, account: any, ids: string[], deadline: number) {
  const known = await knownIds(admin, account.id, ids);
  let imported = 0;
  for (const id of ids) {
    if (known.has(id)) continue;
    if (Date.now() > deadline) return { imported, complete: false };
    if (await importMessage(admin, token, account, id)) imported++;
  }
  return { imported, complete: true };
}

async function syncAccount(admin: any, account: any) {
  const deadline = Date.now() + RUN_BUDGET_MS;
  const token = await accessTokenFor(admin, account.id);
  let imported = 0;
  let complete = true;
  let newHistoryId: string | null = null;
  if (!account.history_id) {
    newHistoryId = String((await gmail(token, "/profile")).historyId);
  } else {
    try {
      let pageToken: string | undefined;
      let latest = account.history_id as string;
      do {
        const qs = new URLSearchParams({ startHistoryId: account.history_id, maxResults: "500" });
        for (const t of ["messageAdded", "messageDeleted", "labelAdded"]) qs.append("historyTypes", t);
        if (pageToken) qs.set("pageToken", pageToken);
        const h = await gmail(token, `/history?${qs}`);
        if (h.historyId) latest = String(h.historyId);
        const deleted: string[] = [];
        const added: string[] = [];
        for (const rec of h.history ?? []) {
          for (const d of rec.messagesDeleted ?? []) deleted.push(d.message.id);
          for (const l of rec.labelsAdded ?? []) if ((l.labelIds ?? []).includes("TRASH")) deleted.push(l.message.id);
          for (const a of rec.messagesAdded ?? []) added.push(a.message.id);
        }
        await removeLocal(admin, account.id, deleted);
        const del = new Set(deleted);
        const r = await importIds(admin, token, account, [...new Set(added)].filter((id) => !del.has(id)), deadline);
        imported += r.imported;
        if (!r.complete) { complete = false; break; }
        pageToken = h.nextPageToken;
        if (pageToken && Date.now() > deadline) { complete = false; break; }
      } while (pageToken);
      if (complete) newHistoryId = latest;
    } catch (e) {
      if (!(e instanceof GmailHttpError && e.status === 404)) throw e;
      const r = await recoverExpiredCursor(admin, token, account, deadline);
      imported += r.imported;
      complete = r.complete;
      if (r.complete) newHistoryId = r.historyId;
    }
  }
  if (complete) await reconcileSample(admin, token, account.id, deadline);
  const patch: any = { last_sync_at: new Date().toISOString(), status: "active", last_error: null, sync_lease_until: null, updated_at: new Date().toISOString() };
  if (newHistoryId) patch.history_id = newHistoryId; // never advanced past unprocessed items
  const { error } = await admin.from("mail_accounts").update(patch).eq("id", account.id);
  if (error) throw new Error(error.message);
  return imported;
}

/**
 * Cursor expired (long outage). Scan everything since linked_at (never earlier), import what is
 * missing, and — once the full listing completed — delete local copies no longer present in Gmail.
 * The new cursor is captured BEFORE scanning, so mail arriving during the scan is picked up next run.
 */
async function recoverExpiredCursor(admin: any, token: string, account: any, deadline: number) {
  const historyId = String((await gmail(token, "/profile")).historyId);
  const after = Math.floor(new Date(account.linked_at).getTime() / 1000) - 1;
  const present = new Set<string>();
  let imported = 0;
  let pageToken: string | undefined;
  do {
    const qs = new URLSearchParams({ q: `after:${after} -in:trash`, maxResults: "500", includeSpamTrash: "true" });
    if (pageToken) qs.set("pageToken", pageToken);
    const l = await gmail(token, `/messages?${qs}`);
    const ids: string[] = (l.messages ?? []).map((m: any) => m.id);
    ids.forEach((id) => present.add(id));
    const r = await importIds(admin, token, account, ids, deadline);
    imported += r.imported;
    if (!r.complete) return { imported, complete: false, historyId };
    pageToken = l.nextPageToken;
    if (pageToken && Date.now() > deadline) return { imported, complete: false, historyId };
  } while (pageToken);
  // Full listing done: anything local but absent at source was deleted/trashed in Gmail.
  const { data: local, error } = await admin.from("mail_messages").select("gmail_message_id, internal_date").eq("account_id", account.id);
  if (error) throw new Error(error.message);
  const scanStart = Date.now() - RUN_BUDGET_MS;
  const gone = (local ?? []).filter((m: any) => !present.has(m.gmail_message_id) && new Date(m.internal_date).getTime() < scanStart).map((m: any) => m.gmail_message_id);
  await removeLocal(admin, account.id, gone);
  return { imported, complete: true, historyId };
}

/** Bounded safety net for source deletions history might miss: checks a rotating slice each run. */
async function reconcileSample(admin: any, token: string, accountId: string, deadline: number) {
  const { count } = await admin.from("mail_messages").select("id", { count: "exact", head: true }).eq("account_id", accountId);
  if (!count) return;
  const SIZE = 15;
  const offset = (Math.floor(Date.now() / 60_000) * SIZE) % count;
  const { data } = await admin.from("mail_messages").select("gmail_message_id").eq("account_id", accountId).order("id").range(offset, offset + SIZE - 1);
  const gone: string[] = [];
  for (const m of data ?? []) {
    if (Date.now() > deadline) break;
    try {
      const r = await gmail(token, `/messages/${m.gmail_message_id}?format=minimal`);
      if ((r.labelIds ?? []).includes("TRASH")) gone.push(m.gmail_message_id);
    } catch (e) {
      if (e instanceof GmailHttpError && e.status === 404) gone.push(m.gmail_message_id);
      else break;
    }
  }
  await removeLocal(admin, accountId, gone);
}

/** Sync every active account with a per-account lease so runs never overlap. */
export async function syncAllMail(admin: any, onlyAccountId?: string) {
  const now = new Date();
  let q = admin.from("mail_accounts").select("*").in("status", ["active", "error"]);
  if (onlyAccountId) q = q.eq("id", onlyAccountId);
  const { data: accounts, error } = await q;
  if (error) throw new Error(error.message);
  const results: { id: string; imported?: number; error?: string; skipped?: boolean }[] = [];
  for (const acc of accounts ?? []) {
    const { data: locked } = await admin.from("mail_accounts")
      .update({ sync_lease_until: new Date(now.getTime() + LEASE_MS).toISOString() })
      .eq("id", acc.id)
      .or(`sync_lease_until.is.null,sync_lease_until.lt.${now.toISOString()}`)
      .select("id").maybeSingle();
    if (!locked) { results.push({ id: acc.id, skipped: true }); continue; }
    try {
      results.push({ id: acc.id, imported: await syncAccount(admin, acc) });
    } catch (e: any) {
      const reauth = e instanceof ReauthError;
      await admin.from("mail_accounts").update({
        status: reauth ? "reauth_required" : "error", last_error: String(e?.message ?? e).slice(0, 300), sync_lease_until: null,
      }).eq("id", acc.id);
      results.push({ id: acc.id, error: reauth ? "reauth_required" : "sync_failed" });
    }
  }
  return results;
}
