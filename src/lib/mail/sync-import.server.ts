// Idempotent Gmail message import and local persistence helpers.
import { gmail, GmailHttpError } from "./gmail-api.server";
import { folderFromLabels, header, parsePayload } from "./mime-parse";
import { extractLogoUrl } from "./mime-sanitize";

export const RUN_BUDGET_MS = 55_000;

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
    sender_logo_url: extractLogoUrl(body.html),
    // Our own outgoing mail is already "read".
    is_read: folder === "sent" || folder === "drafts",
  };
  let { data: ins, error } = await admin.from("mail_messages").upsert(row, { onConflict: "account_id,gmail_message_id", ignoreDuplicates: true }).select("id").maybeSingle();
  // Missing-column fallback: before the sender-logo migration runs, save without the column.
  if (error && /sender_logo_url/i.test(error.message)) {
    const rest = { ...row };
    delete rest.sender_logo_url;
    ({ data: ins, error } = await admin.from("mail_messages").upsert(rest as typeof row, { onConflict: "account_id,gmail_message_id", ignoreDuplicates: true }).select("id").maybeSingle());
  }
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

export async function removeLocal(admin: any, accountId: string, gmailIds: string[]) {
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
export async function importIds(admin: any, token: string, account: any, ids: string[], deadline: number) {
  const known = await knownIds(admin, account.id, ids);
  let imported = 0;
  for (const id of ids) {
    if (known.has(id)) continue;
    if (Date.now() > deadline) return { imported, complete: false };
    if (await importMessage(admin, token, account, id)) imported++;
  }
  return { imported, complete: true };
}

