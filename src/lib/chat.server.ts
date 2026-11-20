import { CHAT_BUCKET, validateChatFile } from "./chat-rules";
import type { ChatMessage, ChatState } from "./chat-rules";

export async function chatRole(db: any, userId: string) {
  const { data, error } = await db.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error("تعذر التحقق من العضوية");
  const roles = (data ?? []).map((r: { role: string }) => r.role);
  if (roles.includes("admin")) return "admin";
  if (roles.includes("employee")) return "employee";
  return null;
}

export async function chatRpc(db: any, name: string, args: Record<string, unknown> = {}) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw new Error(error.message ?? "تعذر تنفيذ الطلب");
  return data;
}

async function attachmentUrls(db: any, messages: ChatMessage[]) {
  const attachments = messages.flatMap((message) => message.attachments ?? []);
  if (!attachments.length) return messages;
  // Caller-scoped metadata policy + read RPC checked membership before this privileged storage operation.
  const { data: rows, error } = await db.from("staff_chat_attachments").select("id,path,mime,name").in("id", attachments.map((a) => a.id));
  if (error || !rows) throw new Error("تعذر تحميل المرفق");
  const byId = new Map<string, { path: string; mime: string; name: string }>(rows.map((r: any) => [r.id, r]));
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await Promise.all(attachments.map(async (attachment) => {
    const data = byId.get(attachment.id);
    if (!data) throw new Error("تعذر تحميل المرفق");
    const { data: signed, error: signError } = await supabaseAdmin.storage.from(CHAT_BUCKET)
      .createSignedUrl(data.path, 60, /^(image|audio|video)\//.test(data.mime) ? undefined : { download: data.name });
    if (signError || !signed?.signedUrl) throw new Error("تعذر فتح المرفق");
    attachment.url = signed.signedUrl;
  }));
  return messages;
}

export async function chatState(db: any, userId: string): Promise<ChatState> {
  const role = await chatRole(db, userId);
  const inactive: ChatState = { enabled: false, userId, role: role ?? "customer", owner: false, open: false, members: [], pending: [], notifications: [] };
  if (!role) return inactive;
  const { data, error } = await db.rpc("staff_chat_status");
  // Additive, review-only rollout: old schema means no group. Any other error fails closed, not an empty unread list.
  if (error?.code === "PGRST202" || error?.code === "42883") return inactive;
  if (error || !data) throw new Error("تعذر التحقق من الرسائل الإجبارية؛ حاول مرة أخرى");
  const state = data as ChatState;
  if (state.enabled && state.incoming === undefined) {
    // Older installed status RPC has no arrival cursor; derive it from RLS-readable messages so sounds still work.
    const { data: latest } = await db.from("staff_chat_messages").select("id,created_at")
      .neq("sender_id", userId).is("deleted_at", null).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1);
    state.incoming = latest?.[0] ? { id: latest[0].id, created_at: latest[0].created_at } : null;
  }
  const hydrated: ChatMessage[] = [];
  for (const pending of state.pending) {
    const rows = await chatRpc(db, "staff_chat_read", { p_id: pending.id });
    if (!rows[0]) throw new Error("تعذر فتح الرسالة الإجبارية");
    hydrated.push(rows[0]);
  }
  state.pending = await attachmentUrls(db, hydrated);
  return state;
}

export async function chatRead(db: any, userId: string, before?: string, id?: string, beforeId?: string) {
  if (!await chatRole(db, userId)) throw new Error("غير مصرح");
  const messages = await chatRpc(db, "staff_chat_read", { p_before: before ?? null, p_id: id ?? null, p_before_id: beforeId ?? null });
  return attachmentUrls(db, messages as ChatMessage[]);
}

export async function chatUpload(db: any, userId: string, file: File) {
  if (!await chatRole(db, userId)) throw new Error("غير مصرح");
  if (file.size > 25 * 1024 * 1024) throw new Error("الحد الأقصى للمرفق 25 ميجابايت");
  const declaredMime = file.type.split(";")[0] ?? "";
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { mime } = validateChatFile(file.name, declaredMime, bytes);
  const reservation = await chatRpc(db, "staff_chat_mutate", {
    p_action: "reserve", p_data: { name: file.name, mime, size: bytes.length },
  });
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.storage.from(CHAT_BUCKET).upload(reservation.path, bytes, { contentType: mime, upsert: false });
  if (error) throw new Error("فشل رفع الملف؛ لم يتم إرسال المرفق");
  await chatRpc(supabaseAdmin, "staff_chat_upload_ready", { p_id: reservation.id, p_user: userId });
  return { id: reservation.id as string, name: file.name, mime, size: bytes.length };
}