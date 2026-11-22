// Per-account Gmail sync orchestration and lease management.
import { accessTokenFor, gmail, GmailHttpError, ReauthError } from "./google.server";
import { importIds, removeLocal, RUN_BUDGET_MS } from "./sync-import.server";
import { recoverExpiredCursor, reconcileDue, reconcileSample } from "./sync-recovery.server";

const LEASE_MS = 90_000;

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
