// Server-side incremental Gmail sync. Only messages after an account's linked_at are imported.
import { accessTokenFor, gmail, GmailHttpError, ReauthError } from "./google.server";
import { folderFromLabels, header, parsePayload } from "./mime";

const LEASE_MS = 90_000;
const MAX_NEW_PER_RUN = 100;

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
  if (!gmailIds.length) return;
  await admin.from("mail_messages").delete().eq("account_id", accountId).in("gmail_message_id", gmailIds);
}

async function syncAccount(admin: any, account: any) {
  const token = await accessTokenFor(admin, account.id);
  let historyId: string | null = account.history_id;
  let imported = 0;
  if (!historyId) {
    const p = await gmail(token, "/profile");
    historyId = String(p.historyId);
  }
  try {
    let pageToken: string | undefined;
    let latest = historyId;
    do {
      const qs = new URLSearchParams({ startHistoryId: historyId!, maxResults: "200" });
      for (const t of ["messageAdded", "messageDeleted", "labelAdded"]) qs.append("historyTypes", t);
      if (pageToken) qs.set("pageToken", pageToken);
      const h = await gmail(token, `/history?${qs}`);
      latest = String(h.historyId ?? latest);
      const deleted: string[] = [];
      for (const rec of h.history ?? []) {
        for (const d of rec.messagesDeleted ?? []) deleted.push(d.message.id);
        for (const l of rec.labelsAdded ?? []) if ((l.labelIds ?? []).includes("TRASH")) deleted.push(l.message.id);
      }
      await removeLocal(admin, account.id, deleted);
      const deletedSet = new Set(deleted);
      for (const rec of h.history ?? []) {
        for (const a of rec.messagesAdded ?? []) {
          if (deletedSet.has(a.message.id) || imported >= MAX_NEW_PER_RUN) continue;
          if (await importMessage(admin, token, account, a.message.id)) imported++;
        }
      }
      pageToken = imported >= MAX_NEW_PER_RUN ? undefined : h.nextPageToken;
      // If we stopped early, keep the cursor so the remainder is picked up next run.
      if (imported >= MAX_NEW_PER_RUN) latest = historyId!;
    } while (pageToken);
    historyId = latest;
  } catch (e) {
    if (!(e instanceof GmailHttpError && e.status === 404)) throw e;
    // Cursor expired: recover missed mail since the later of linked_at / last sync (never before linked_at).
    const since = Math.max(new Date(account.linked_at).getTime(), new Date(account.last_sync_at ?? account.linked_at).getTime() - 3600_000);
    const p = await gmail(token, "/profile");
    let pageToken: string | undefined;
    do {
      const qs = new URLSearchParams({ q: `after:${Math.floor(since / 1000)}`, maxResults: "100", includeSpamTrash: "true" });
      if (pageToken) qs.set("pageToken", pageToken);
      const l = await gmail(token, `/messages?${qs}`);
      for (const m of l.messages ?? []) if (await importMessage(admin, token, account, m.id)) imported++;
      pageToken = imported < MAX_NEW_PER_RUN ? l.nextPageToken : undefined;
    } while (pageToken);
    historyId = String(p.historyId);
  }
  await admin.from("mail_accounts").update({
    history_id: historyId, last_sync_at: new Date().toISOString(), status: "active", last_error: null, sync_lease_until: null, updated_at: new Date().toISOString(),
  }).eq("id", account.id);
  return imported;
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
