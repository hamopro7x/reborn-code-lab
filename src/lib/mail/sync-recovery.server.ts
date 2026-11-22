// Cursor recovery and bounded source-to-local reconciliation.
import { gmail, GmailHttpError } from "./google.server";
import { importIds, removeLocal, RUN_BUDGET_MS } from "./sync-import.server";

/**
 * Cursor expired (long outage). Scan everything since linked_at (never earlier), import what is
 * missing, and — once the full listing completed — delete local copies no longer present in Gmail.
 * The new cursor is captured BEFORE scanning, so mail arriving during the scan is picked up next run.
 */
export async function recoverExpiredCursor(admin: any, token: string, account: any, deadline: number) {
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
export async function reconcileSample(admin: any, token: string, accountId: string, deadline: number) {
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

