import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { adminDb, log, requireAdmin, roleOf } from "./mail/access.server";
import { listInput } from "./mail-core.functions";

const LIST_COLS = "id, account_id, gmail_thread_id, folder, from_addr, to_addr, subject, snippet, internal_date, has_attachments, is_read, starred, archived, trashed_at, label_ids, sender_logo_url";

export const listMailMessages = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => listInput.parse(i ?? {}))
  .handler(async ({ data, context }) => {
    await roleOf(context.supabase, context.userId);
    const db = await adminDb();
    const buildQ = (cols: string) => {
      let q = db.from("mail_messages").select(cols).order("internal_date", { ascending: false }).limit(31);
      if (data.accountId) q = q.eq("account_id", data.accountId);
      if (data.before) q = q.lt("internal_date", data.before);
      if (data.view === "trash") q = q.not("trashed_at", "is", null);
      else {
        q = q.is("trashed_at", null);
        if (data.view === "inbox") q = q.eq("folder", "inbox").eq("archived", false);
        if (data.view === "sent") q = q.eq("folder", "sent");
        if (data.view === "drafts") q = q.eq("folder", "drafts");
        if (data.view === "spam") q = q.eq("folder", "spam");
        if (data.view === "archive") q = q.eq("archived", true);
        if (data.view === "starred") q = q.eq("starred", true);
        if (data.view === "label" && data.labelId) q = q.contains("label_ids", [data.labelId]);
      }
      const s = data.search?.trim().replace(/[%,()]/g, " ");
      if (s) q = q.or(`subject.ilike.%${s}%,from_addr.ilike.%${s}%,snippet.ilike.%${s}%,to_addr.ilike.%${s}%`);
      return q;
    };
    // Missing-column fallback: before the sender-logo migration runs, list without the column.
    let rows: any[] | null = null; let error: { message: string } | null = null;
    {
      const r = await buildQ(LIST_COLS);
      rows = r.data as any[] | null; error = r.error as { message: string } | null;
      if (error && /sender_logo_url/i.test(error.message)) {
        const retry = await buildQ(LIST_COLS.replace(", sender_logo_url", ""));
        rows = retry.data as any[] | null; error = retry.error as { message: string } | null;
      }
    }
    if (error) throw new Error(error.message);
    const items = (rows ?? []).slice(0, 30);
    return { items, nextBefore: (rows ?? []).length > 30 ? items[items.length - 1].internal_date : null };
  });

export const getMailThread = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await roleOf(context.supabase, context.userId);
    const db = await adminDb();
    const { data: msg, error: messageError } = await db.from("mail_messages").select("*").eq("id", data.id).maybeSingle();
    if (messageError) throw new Error(messageError.message);
    if (!msg) throw new Error("الرسالة غير موجودة");
    // Shared read state: only log on an actual unread → read transition. Gmail is never changed.
    const { data: flipped, error: readError } = await db.from("mail_messages").update({ is_read: true, read_at: new Date().toISOString(), read_by: context.userId })
      .eq("id", data.id).eq("is_read", false).select("id").maybeSingle();
    if (readError) throw new Error(readError.message);
    if (flipped) await log(db, { actor_id: context.userId, action: "read", account_id: msg.account_id, message_id: msg.id });
    // كل رسالة تُعرض وحدها: لا تجميع محادثات على الموقع.
    const { data: atts, error: attachmentError } = await db.from("mail_attachments").select("id, message_id, filename, mime_type, size_bytes").eq("message_id", msg.id);
    if (attachmentError) throw new Error(attachmentError.message);
    return { thread: [msg], attachments: atts ?? [] };
  });

export const setMailRead = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ ids: z.array(z.string().uuid()).min(1).max(100), read: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    await roleOf(context.supabase, context.userId); // employees + admin
    const db = await adminDb();
    const { data: changed, error } = await db.from("mail_messages")
      .update(data.read ? { is_read: true, read_at: new Date().toISOString(), read_by: context.userId } : { is_read: false, read_at: null, read_by: null })
      .in("id", data.ids).eq("is_read", !data.read).select("id, account_id");
    if (error) throw new Error(error.message);
    if (changed?.length) {
      const { error: activityError } = await db.from("mail_activity").insert(changed.map((m: any) => ({ actor_id: context.userId, action: data.read ? "marked_read" : "marked_unread", account_id: m.account_id, message_id: m.id })));
      if (activityError) throw new Error(activityError.message);
    }
    return { ok: true };
  });

export const organizeMail = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    ids: z.array(z.string().uuid()).min(1).max(100),
    action: z.enum(["star", "unstar", "archive", "unarchive", "trash", "restore", "delete", "add_label", "remove_label"]),
    labelId: z.string().uuid().optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const db = await adminDb();
    const { data: msgs, error: messagesError } = await db.from("mail_messages").select("id, account_id, gmail_message_id, label_ids").in("id", data.ids);
    if (messagesError) throw new Error(messagesError.message);
    if (!msgs?.length) throw new Error("لم يتم العثور على الرسائل المطلوبة");
    const set = async (patch: any) => { const { error } = await db.from("mail_messages").update(patch).in("id", data.ids); if (error) throw new Error(error.message); };
    switch (data.action) {
      case "star": await set({ starred: true }); break;
      case "unstar": await set({ starred: false }); break;
      case "archive": await set({ archived: true }); break;
      case "unarchive": await set({ archived: false }); break;
      case "trash": await set({ trashed_at: new Date().toISOString() }); break;
      case "restore": await set({ trashed_at: null }); break;
      case "delete": {
        const { error: tombstoneError } = await db.from("mail_local_tombstones").upsert((msgs ?? []).map((m: any) => ({ account_id: m.account_id, gmail_message_id: m.gmail_message_id, deleted_by: context.userId })), { onConflict: "account_id,gmail_message_id" });
        if (tombstoneError) throw new Error(tombstoneError.message);
        const { error: deleteError } = await db.from("mail_messages").delete().in("id", data.ids);
        if (deleteError) throw new Error(deleteError.message);
        break;
      }
      case "add_label":
      case "remove_label":
        if (!data.labelId) throw new Error("اختر تصنيفًا");
        for (const m of msgs ?? []) {
          const cur: string[] = m.label_ids ?? [];
          const next = data.action === "add_label" ? [...new Set([...cur, data.labelId])] : cur.filter((x) => x !== data.labelId);
          const { error } = await db.from("mail_messages").update({ label_ids: next }).eq("id", m.id);
          if (error) throw new Error(error.message);
        }
    }
    const { error: activityError } = await db.from("mail_activity").insert((msgs ?? []).map((m: any) => ({
      actor_id: context.userId, action: data.action, account_id: m.account_id, message_id: data.action === "delete" ? null : m.id, meta: { gmail_message_id: data.action === "delete" ? m.gmail_message_id : undefined, label_id: data.labelId },
    })));
    if (activityError) throw new Error(activityError.message);
    return { ok: true };
  });

export const listMailLabels = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await roleOf(context.supabase, context.userId);
  const { data, error } = await (await adminDb()).from("mail_labels").select("id, name, color").order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const saveMailLabel = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ name: z.string().trim().min(1).max(40), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#d4af37"), remove: z.string().uuid().optional() }).parse(i))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const db = await adminDb();
    if (data.remove) { const { error } = await db.from("mail_labels").delete().eq("id", data.remove); if (error) throw new Error(error.message); }
    else { const { error } = await db.from("mail_labels").insert({ name: data.name, color: data.color }); if (error) throw new Error(error.message); }
    await log(db, { actor_id: context.userId, action: data.remove ? "label_deleted" : "label_created", meta: { name: data.name } });
    return { ok: true };
  });

export const downloadMailAttachment = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await roleOf(context.supabase, context.userId);
    const db = await adminDb();
    const { data: a, error } = await db.from("mail_attachments").select("filename, mime_type, size_bytes, gmail_attachment_id, mail_messages!inner(account_id, gmail_message_id)").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!a) throw new Error("المرفق غير موجود");
    if (Number(a.size_bytes ?? 0) > 20 * 1024 * 1024) throw new Error("حجم المرفق يتجاوز الحد المسموح للتنزيل");
    const { accessTokenFor, gmail } = await import("@/lib/mail/google.server");
    const m: any = (a as any).mail_messages;
    const r = await gmail(await accessTokenFor(db, m.account_id), `/messages/${m.gmail_message_id}/attachments/${a.gmail_attachment_id}`);
    const encoded = String(r?.data ?? "");
    const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
    const decodedSize = Math.max(0, Math.floor(normalized.length * 3 / 4) - padding);
    if (decodedSize > 20 * 1024 * 1024) throw new Error("حجم المرفق الفعلي يتجاوز الحد المسموح للتنزيل");
    return { filename: a.filename, mimeType: a.mime_type || "application/octet-stream", base64: normalized };
  });

export const sendInput = z.object({
  accountId: z.string().uuid(),
  to: z.string().trim().min(3).max(2000),
  cc: z.string().max(2000).optional().default(""),
  subject: z.string().max(500).default(""),
  body: z.string().max(200_000).default(""),
  replyToId: z.string().uuid().optional(),
  draftId: z.string().uuid().optional(),
  attachments: z.array(z.object({ filename: z.string().max(200), mimeType: z.string().max(120), base64: z.string() })).max(10).optional(),
});
