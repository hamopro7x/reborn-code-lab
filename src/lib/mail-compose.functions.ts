import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { adminDb, log, requireAdmin, roleOf } from "./mail/access.server";
import { sendInput } from "./mail/mail.schemas";

export const sendMail = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => sendInput.parse(i))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const total = (data.attachments ?? []).reduce((s, a) => s + a.base64.length * 0.75, 0);
    if (total > 20 * 1024 * 1024) throw new Error("حجم المرفقات أكبر من 20MB");
    const db = await adminDb();
    const { data: acc } = await db.from("mail_accounts").select("*").eq("id", data.accountId).maybeSingle();
    if (!acc) throw new Error("الحساب غير موجود");
    let threadId: string | undefined, inReplyTo: string | undefined, references: string | undefined, subject = data.subject;
    if (data.replyToId) {
      const { data: orig } = await db.from("mail_messages").select("account_id, gmail_thread_id, rfc_message_id, rfc_references, subject").eq("id", data.replyToId).maybeSingle();
      if (!orig || orig.account_id !== acc.id) throw new Error("الرسالة الأصلية غير صالحة");
      threadId = orig.gmail_thread_id ?? undefined;
      inReplyTo = orig.rfc_message_id || undefined;
      references = orig.rfc_references || undefined;
      if (!subject) subject = /^re:/i.test(orig.subject ?? "") ? orig.subject : `Re: ${orig.subject ?? ""}`;
    }
    const { buildRawMessage } = await import("@/lib/mail/mime-compose");
    const { accessTokenFor, gmail } = await import("@/lib/mail/google.server");
    const { importMessage } = await import("@/lib/mail/sync.server");
    const raw = buildRawMessage({ from: acc.display_name ? `${acc.display_name} <${acc.email}>` : acc.email, to: data.to, cc: data.cc, subject, body: data.body, inReplyTo, references, attachments: data.attachments });
    const token = await accessTokenFor(db, acc.id);
    const sent = await gmail(token, "/messages/send", { method: "POST", body: JSON.stringify({ raw, ...(threadId ? { threadId } : {}) }) });
    const localId = await importMessage(db, token, acc, sent.id, false);
    if (data.draftId) await db.from("mail_drafts").delete().eq("id", data.draftId);
    await log(db, { actor_id: context.userId, action: data.replyToId ? "replied" : "sent", account_id: acc.id, message_id: localId ?? data.replyToId ?? null, meta: { to: data.to.slice(0, 300) } });
    return { ok: true };
  });

// Local (site-only) drafts: every staff member can read them; only admins create/edit/send/delete.
export const listMailDrafts = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await roleOf(context.supabase, context.userId);
  const { data } = await (await adminDb()).from("mail_drafts").select("*").order("updated_at", { ascending: false }).limit(100);
  return data ?? [];
});

export const saveMailDraft = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    id: z.string().uuid().optional(), remove: z.boolean().optional(), accountId: z.string().uuid(),
    to: z.string().max(2000).default(""), cc: z.string().max(2000).default(""), subject: z.string().max(500).default(""), body: z.string().max(200_000).default(""), replyToId: z.string().uuid().optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const db = await adminDb();
    if (data.remove && data.id) { await db.from("mail_drafts").delete().eq("id", data.id); return { id: null }; }
    const row = { account_id: data.accountId, to_addr: data.to, cc_addr: data.cc, subject: data.subject, body: data.body, reply_to_message_id: data.replyToId ?? null, created_by: context.userId, updated_at: new Date().toISOString() };
    const { data: r, error } = data.id ? await db.from("mail_drafts").update(row).eq("id", data.id).select("id").single() : await db.from("mail_drafts").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    return { id: r.id as string };
  });
