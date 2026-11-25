// Server-side incremental Gmail sync. Only messages after an account's linked_at are imported.
import { accessTokenFor, gmail, GmailHttpError, ReauthError } from "./google.server";
import { extractLogoUrl, folderFromLabels, header, parsePayload } from "./mime";

const LEASE_MS = 90_000;

export async function logActivity(admin: any, row: { actor_id?: string | null; action: string; account_id?: string | null; message_id?: string | null; meta?: any }) {
  const { error } = await admin.from("mail_activity").insert({ meta: {}, ...row });
  // Audit logging must not turn a completed OAuth link or sent email into a false failure.
  if (error) console.error("Mail activity log failed:", error.code ?? "database_error");
}

/** Fetches one Gmail message and stores it locally (idempotent). Returns new local id or null. */
export async function importMessage(admin: any, token: string, account: any, gmailId: string, notify = true): Promise<string | null> {
  const { data: tomb, error: tombError } = await admin.from("mail_local_tombstones").select("gmail_message_id").eq("account_id", account.id).eq("gmail_message_id", gmailId).maybeSingle();
  if (tombError) throw new Error(tombError.message);
  if (tomb) return null;
  const { data: existing, error: existingError } = await admin.from("mail_messages").select("id").eq("account_id", account.id).eq("gmail_message_id", gmailId).maybeSingle();
  if (existingError) throw new Error(existingError.message);
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
    sender_logo_url: extractLogoUrl(body.html),
    // Our own outgoing mail is already "read".
    is_read: folder === "sent" || folder === "drafts",
  };
  let { data: ins, error } = await admin.from("mail_messages").upsert(row, { onConflict: "account_id,gmail_message_id", ignoreDuplicates: true }).select("id").maybeSingle();
  // Missing-column fallback: before the sender-logo migration runs, save without the column.
  if (error && /sender_logo_url/i.test(error.message)) {
    const { sender_logo_url: _drop, ...rest } = row;
    ({ data: ins, error } = await admin.from("mail_messages").upsert(rest as typeof row, { onConflict: "account_id,gmail_message_id", ignoreDuplicates: true }).select("id").maybeSingle());
  }
  if (error) throw new Error(error.message);
  // ignoreDuplicates may return no row when another worker inserted the same message.
  // Resolve the canonical id so attachment/notification side effects can be repaired.
  let messageId = ins?.id ?? existing?.id;
  if (!messageId) {
    const { data: resolved, error: resolveError } = await admin.from("mail_messages").select("id").eq("account_id", account.id).eq("gmail_message_id", gmailId).maybeSingle();
    if (resolveError) throw new Error(resolveError.message);
    messageId = resolved?.id;
  }
  if (!messageId) throw new Error("Unable to resolve imported Gmail message");
  if (body.attachments.length) {
    const attachmentRows = body.attachments.map((a) => ({
      message_id: messageId, gmail_attachment_id: a.attachmentId, filename: a.filename.slice(0, 300), mime_type: a.mimeType, size_bytes: a.size,
    }));
    const { error: attachmentError } = await admin.from("mail_attachments").upsert(attachmentRows, {
      onConflict: "message_id,gmail_attachment_id", ignoreDuplicates: true,
    });
    if (attachmentError) throw new Error(attachmentError.message);
  }
  if (notify && (folder === "inbox" || folder === "spam" || folder === "other")) {
    const { data: staff, error: staffError } = await admin.from("user_roles").select("user_id, role");
    if (staffError) throw new Error(staffError.message);
    const ids = [...new Set((staff ?? []).filter((r: any) => r.role === "admin" || r.role === "employee").map((r: any) => r.user_id))];
    if (ids.length) {
      const { error: notificationError } = await admin.from("mail_notifications").upsert(ids.map((u) => ({ user_id: u, message_id: messageId })), { onConflict: "user_id,message_id", ignoreDuplicates: true });
      if (notificationError) throw new Error(notificationError.message);
    }
  }
  return ins?.id ?? null;
}

async function removeLocal(admin: any, accountId: string, gmailIds: string[]) {
  for (let i = 0; i < gmailIds.length; i += 100) {
    const { error } = await admin.from("mail_messages").delete().eq("account_id", accountId).in("gmail_message_id", gmailIds.slice(i, i + 100));
    if (error) throw new Error(error.message);
  }
}

/** Tombstoned ids are skipped; existing messages are replayed to repair partial side effects. */
async function knownIds(admin: any, accountId: string, ids: string[]): Promise<Set<string>> {
  const known = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data, error } = await admin.from("mail_local_tombstones").select("gmail_message_id").eq("account_id", accountId).in("gmail_message_id", chunk);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) known.add(r.gmail_message_id);
  }
  return known;
}

// Each run has a time budget below the lease. Every page is processed fully; the history cursor
// only advances after the LAST page succeeds. If the budget runs out, the cursor stays put and the
// next run replays the same pages — existing messages are rechecked to repair missing attachments
// and notifications, while tombstoned ids are skipped. Nothing is skipped.
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
  // The deletion safety net checks a rotating slice once per minute per account,
  // not on every few-second run (it costs a count query plus Gmail calls).
  if (complete && reconcileDue(account.last_sync_at)) await reconcileSample(admin, token, account.id, deadline);
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

export function reconcileDue(lastSyncAt: string | null | undefined, now = Date.now()): boolean {
  if (!lastSyncAt) return true;
  const last = new Date(lastSyncAt).getTime();
  if (!Number.isFinite(last)) return true;
  return Math.floor(last / 60_000) !== Math.floor(now / 60_000);
}

/** Bounded safety net for source deletions history might miss: checks a rotating slice each minute. */
async function reconcileSample(admin: any, token: string, accountId: string, deadline: number) {
  const { count, error: countError } = await admin.from("mail_messages").select("id", { count: "exact", head: true }).eq("account_id", accountId);
  if (countError) throw new Error(countError.message);
  if (!count) return;
  const SIZE = 15;
  const offset = (Math.floor(Date.now() / 60_000) * SIZE) % count;
  const { data, error: sampleError } = await admin.from("mail_messages").select("gmail_message_id").eq("account_id", accountId).order("id").range(offset, offset + SIZE - 1);
  if (sampleError) throw new Error(sampleError.message);
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
  let q = admin.from("mail_accounts").select("*").in("status", ["active", "error"]);
  if (onlyAccountId) q = q.eq("id", onlyAccountId);
  const { data: accounts, error } = await q;
  if (error) throw new Error(error.message);
  const results: { id: string; imported?: number; error?: string; skipped?: boolean }[] = [];
  for (const acc of accounts ?? []) {
    // Compute the lease window immediately before claiming each account. A timestamp
    // captured before the whole sequential loop can already be expired for later accounts.
    const leaseNow = new Date();
    const { data: locked, error: leaseError } = await admin.from("mail_accounts")
      .update({ sync_lease_until: new Date(leaseNow.getTime() + LEASE_MS).toISOString() })
      .eq("id", acc.id)
      .or(`sync_lease_until.is.null,sync_lease_until.lt.${leaseNow.toISOString()}`)
      .select("id").maybeSingle();
    if (leaseError) throw new Error(leaseError.message);
    if (!locked) { results.push({ id: acc.id, skipped: true }); continue; }
    try {
      results.push({ id: acc.id, imported: await syncAccount(admin, acc) });
    } catch (e: any) {
      const reauth = e instanceof ReauthError;
      const { error: stateError } = await admin.from("mail_accounts").update({
        status: reauth ? "reauth_required" : "error", last_error: String(e?.message ?? e).slice(0, 300), sync_lease_until: null,
      }).eq("id", acc.id);
      if (stateError) console.error("Mail sync failure state update failed:", stateError.code ?? "database_error");
      results.push({ id: acc.id, error: reauth ? "reauth_required" : "sync_failed" });
    }
  }
  return results;
}
