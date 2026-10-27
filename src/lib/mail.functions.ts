import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Role = "admin" | "employee";

/** Role is re-read from user_roles on every call; UI hiding is never trusted. */
async function roleOf(supabase: any, userId: string): Promise<Role> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => r.role);
  if (roles.includes("admin")) return "admin";
  if (roles.includes("employee")) return "employee";
  throw new Error("Forbidden");
}
async function adminDb(): Promise<any> {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}
async function requireAdmin(ctx: any) {
  if ((await roleOf(ctx.supabase, ctx.userId)) !== "admin") throw new Error("هذا الإجراء للأدمن فقط");
}
async function log(db: any, row: any) {
  const { logActivity } = await import("@/lib/mail/sync.server");
  await logActivity(db, row);
}

const LIST_COLS = "id, account_id, gmail_thread_id, folder, from_addr, to_addr, subject, snippet, internal_date, has_attachments, is_read, starred, archived, trashed_at, label_ids";

export const mailMe = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => ({ role: await roleOf(context.supabase, context.userId) }));

export const listMailAccounts = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await roleOf(context.supabase, context.userId);
  const db = await adminDb();
  const { data, error } = await db.from("mail_accounts").select("id, email, display_name, status, last_error, linked_at, last_sync_at").order("created_at");
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const startMailLink = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await requireAdmin(context);
  const { randomToken, oauthStateKey, pkcePair, MAIL_OAUTH_COOKIE } = await import("@/lib/mail/crypto.server");
  const { authUrl } = await import("@/lib/mail/google.server");
  const { setCookie } = await import("@tanstack/react-start/server");
  const db = await adminDb();
  const state = randomToken(32);
  const nonce = randomToken(32);
  await db.from("mail_oauth_states").delete().lt("expires_at", new Date().toISOString());
  const { error } = await db.from("mail_oauth_states").insert({ state_hash: await oauthStateKey(state, nonce), user_id: context.userId, expires_at: new Date(Date.now() + 10 * 60_000).toISOString() });
  if (error) throw new Error(error.message);
  // HttpOnly nonce ties the flow to THIS browser; a leaked/forwarded consent link cannot complete elsewhere.
  setCookie(MAIL_OAUTH_COOKIE, nonce, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/public/mail-oauth", maxAge: 600 });
  const { challenge } = await pkcePair(state, nonce);
  return { url: authUrl(state, challenge) };
});

export const setMailAccountPaused = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid(), paused: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const db = await adminDb();
    await db.from("mail_accounts").update({ status: data.paused ? "paused" : "active", updated_at: new Date().toISOString() }).eq("id", data.id);
    await log(db, { actor_id: context.userId, action: data.paused ? "account_paused" : "account_resumed", account_id: data.id });
    return { ok: true };
  });

export const deleteMailAccount = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const db = await adminDb();
    const { data: acc } = await db.from("mail_accounts").select("email").eq("id", data.id).maybeSingle();
    if (!acc) return { ok: true };
    await db.from("mail_accounts").update({ status: "paused" }).eq("id", data.id);
    try {
      const { decryptSecret } = await import("@/lib/mail/crypto.server");
      const { revokeToken } = await import("@/lib/mail/google.server");
      const { data: s } = await db.from("mail_account_secrets").select("refresh_token_ciphertext").eq("account_id", data.id).maybeSingle();
      if (s) await revokeToken(await decryptSecret(s.refresh_token_ciphertext));
    } catch {}
    // Cascade removes secrets, messages, attachments, drafts, notifications, tombstones. Gmail is untouched.
    const { error } = await db.from("mail_accounts").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await log(db, { actor_id: context.userId, action: "account_unlinked", meta: { email: acc.email } });
    return { ok: true };
  });

export const syncMailNow = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ accountId: z.string().uuid().optional() }).parse(i ?? {}))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { syncAllMail } = await import("@/lib/mail/sync.server");
    return syncAllMail(await adminDb(), data.accountId);
  });

const listInput = z.object({
  view: z.enum(["inbox", "sent", "drafts", "archive", "starred", "spam", "trash", "label", "all"]).default("inbox"),
  accountId: z.string().uuid().optional(),
  labelId: z.string().uuid().optional(),
  search: z.string().max(200).optional(),
  before: z.string().max(40).optional(),
});

export const listMailMessages = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => listInput.parse(i ?? {}))
  .handler(async ({ data, context }) => {
    await roleOf(context.supabase, context.userId);
    const db = await adminDb();
    let q = db.from("mail_messages").select(LIST_COLS).order("internal_date", { ascending: false }).limit(31);
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
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const items = (rows ?? []).slice(0, 30);
    return { items, nextBefore: (rows ?? []).length > 30 ? items[items.length - 1].internal_date : null };
  });

export const getMailThread = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await roleOf(context.supabase, context.userId);
    const db = await adminDb();
    const { data: msg } = await db.from("mail_messages").select("*").eq("id", data.id).maybeSingle();
    if (!msg) throw new Error("الرسالة غير موجودة");
    // Shared read state: only log on an actual unread → read transition. Gmail is never changed.
    const { data: flipped } = await db.from("mail_messages").update({ is_read: true, read_at: new Date().toISOString(), read_by: context.userId })
      .eq("id", data.id).eq("is_read", false).select("id").maybeSingle();
    if (flipped) await log(db, { actor_id: context.userId, action: "read", account_id: msg.account_id, message_id: msg.id });
    // كل رسالة تُعرض وحدها: لا تجميع محادثات على الموقع.
    const { data: atts } = await db.from("mail_attachments").select("id, message_id, filename, mime_type, size_bytes").eq("message_id", msg.id);
    return { thread: [msg], attachments: atts ?? [] };
  });

export const setMailRead = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ ids: z.array(z.string().uuid()).min(1).max(100), read: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    await roleOf(context.supabase, context.userId); // employees + admin
    const db = await adminDb();
    const { data: changed } = await db.from("mail_messages")
      .update(data.read ? { is_read: true, read_at: new Date().toISOString(), read_by: context.userId } : { is_read: false, read_at: null, read_by: null })
      .in("id", data.ids).eq("is_read", !data.read).select("id, account_id");
    if (changed?.length) await db.from("mail_activity").insert(changed.map((m: any) => ({ actor_id: context.userId, action: data.read ? "marked_read" : "marked_unread", account_id: m.account_id, message_id: m.id })));
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
    const { data: msgs } = await db.from("mail_messages").select("id, account_id, gmail_message_id, label_ids").in("id", data.ids);
    const set = (patch: any) => db.from("mail_messages").update(patch).in("id", data.ids);
    switch (data.action) {
      case "star": await set({ starred: true }); break;
      case "unstar": await set({ starred: false }); break;
      case "archive": await set({ archived: true }); break;
      case "unarchive": await set({ archived: false }); break;
      case "trash": await set({ trashed_at: new Date().toISOString() }); break;
      case "restore": await set({ trashed_at: null }); break;
      case "delete":
        await db.from("mail_local_tombstones").upsert((msgs ?? []).map((m: any) => ({ account_id: m.account_id, gmail_message_id: m.gmail_message_id, deleted_by: context.userId })), { onConflict: "account_id,gmail_message_id" });
        await db.from("mail_messages").delete().in("id", data.ids);
        break;
      case "add_label":
      case "remove_label":
        if (!data.labelId) throw new Error("اختر تصنيفًا");
        for (const m of msgs ?? []) {
          const cur: string[] = m.label_ids ?? [];
          const next = data.action === "add_label" ? [...new Set([...cur, data.labelId])] : cur.filter((x) => x !== data.labelId);
          await db.from("mail_messages").update({ label_ids: next }).eq("id", m.id);
        }
    }
    await db.from("mail_activity").insert((msgs ?? []).map((m: any) => ({
      actor_id: context.userId, action: data.action, account_id: m.account_id, message_id: data.action === "delete" ? null : m.id, meta: { gmail_message_id: data.action === "delete" ? m.gmail_message_id : undefined, label_id: data.labelId },
    })));
    return { ok: true };
  });

export const listMailLabels = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await roleOf(context.supabase, context.userId);
  const { data } = await (await adminDb()).from("mail_labels").select("id, name, color").order("name");
  return data ?? [];
});

export const saveMailLabel = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ name: z.string().trim().min(1).max(40), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#d4af37"), remove: z.string().uuid().optional() }).parse(i))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const db = await adminDb();
    if (data.remove) await db.from("mail_labels").delete().eq("id", data.remove);
    else { const { error } = await db.from("mail_labels").insert({ name: data.name, color: data.color }); if (error) throw new Error(error.message); }
    await log(db, { actor_id: context.userId, action: data.remove ? "label_deleted" : "label_created", meta: { name: data.name } });
    return { ok: true };
  });

export const downloadMailAttachment = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await roleOf(context.supabase, context.userId);
    const db = await adminDb();
    const { data: a } = await db.from("mail_attachments").select("filename, mime_type, gmail_attachment_id, mail_messages!inner(account_id, gmail_message_id)").eq("id", data.id).maybeSingle();
    if (!a) throw new Error("المرفق غير موجود");
    const { accessTokenFor, gmail } = await import("@/lib/mail/google.server");
    const m: any = (a as any).mail_messages;
    const r = await gmail(await accessTokenFor(db, m.account_id), `/messages/${m.gmail_message_id}/attachments/${a.gmail_attachment_id}`);
    return { filename: a.filename, mimeType: a.mime_type || "application/octet-stream", base64: String(r.data).replace(/-/g, "+").replace(/_/g, "/") };
  });

const sendInput = z.object({
  accountId: z.string().uuid(),
  to: z.string().trim().min(3).max(2000),
  cc: z.string().max(2000).optional().default(""),
  subject: z.string().max(500).default(""),
  body: z.string().max(200_000).default(""),
  replyToId: z.string().uuid().optional(),
  draftId: z.string().uuid().optional(),
  attachments: z.array(z.object({ filename: z.string().max(200), mimeType: z.string().max(120), base64: z.string() })).max(10).optional(),
});

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
    const { buildRawMessage } = await import("@/lib/mail/mime");
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

export const mailUnreadCount = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await roleOf(context.supabase, context.userId);
  const { count } = await (await adminDb()).from("mail_messages").select("id", { count: "exact", head: true }).eq("is_read", false).is("trashed_at", null).in("folder", ["inbox", "spam", "other"]);
  return { unread: count ?? 0 };
});

/**
 * Atomically claims this user's unseen notifications (sets seen_at and returns the rows in one
 * statement). A reload, a second tab or a retry can never receive the same notification twice.
 */
export const claimMailNotifications = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await roleOf(context.supabase, context.userId);
  const db = await adminDb();
  const cutoff = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data, error } = await db.from("mail_notifications").update({ seen_at: new Date().toISOString() })
    .eq("user_id", context.userId).is("seen_at", null).gt("created_at", cutoff)
    .select("id, message_id, mail_messages!inner(subject, from_addr)");
  if (error) throw new Error(error.message);
  // Stale ones (offline > 24h) are silently marked seen instead of a burst of alerts.
  await db.from("mail_notifications").update({ seen_at: new Date().toISOString() }).eq("user_id", context.userId).is("seen_at", null).lte("created_at", cutoff);
  return (data ?? []).map((n: any) => ({ id: n.id as string, messageId: n.message_id as string, subject: n.mail_messages?.subject ?? "", from: n.mail_messages?.from_addr ?? "" }));
});

export const listMailActivity = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await requireAdmin(context);
  const db = await adminDb();
  const { data } = await db.from("mail_activity").select("id, actor_id, action, account_id, message_id, meta, created_at").order("created_at", { ascending: false }).limit(200);
  const actorIds = [...new Set((data ?? []).map((r: any) => r.actor_id).filter(Boolean))];
  const { data: profiles } = actorIds.length ? await db.from("profiles").select("id, full_name, email").in("id", actorIds) : { data: [] as any[] };
  const names = new Map((profiles ?? []).map((p: any) => [p.id, p.full_name || p.email]));
  return (data ?? []).map((r: any) => ({ ...r, actor: names.get(r.actor_id) ?? "—" }));
});
