import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { chatRead, chatRole, chatRpc, chatState, chatUpload } from "./chat.server";

export const getChatState = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .handler(({ context }) => chatState(context.supabase, context.userId));

export const getChatMessages = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ before: z.string().datetime({ offset: true }).optional(), beforeId: z.string().uuid().optional(), id: z.string().uuid().optional() }).parse(input ?? {}))
  .handler(({ context, data }) => chatRead(context.supabase, context.userId, data.before, data.id, data.beforeId));

const actionSchema = z.object({
  action: z.enum(["send", "edit", "hide", "delete", "vote", "ack", "seen", "state"]),
  payload: z.object({
    id: z.string().uuid().optional(), body: z.string().max(10000).optional(), open: z.boolean().optional(),
    mandatory: z.boolean().optional(), everyone: z.boolean().optional(), mentions: z.array(z.string().uuid()).max(100).optional(),
    mandatoryMentions: z.array(z.string().uuid()).max(100).optional(),
    attachments: z.array(z.string().uuid()).max(10).optional(), choices: z.array(z.number().int().min(0).max(19)).max(20).optional(),
    poll: z.object({ question: z.string().trim().min(1).max(500), options: z.array(z.string().trim().min(1).max(200)).min(2).max(20), multiple: z.boolean() }).nullable().optional(),
  }),
});
export const mutateChat = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input) => actionSchema.parse(input))
  .handler(async ({ context, data }) => {
    if (!await chatRole(context.supabase, context.userId)) throw new Error("غير مصرح");
    if (data.action === "send" && (data.payload.mandatory || data.payload.mandatoryMentions?.length)) {
      const state = await chatState(context.supabase, context.userId);
      if (!state.targetedMandatory) throw new Error("لازم تطبيق تحديث منشن القراءة الإجبارية الأول؛ الرسالة لم تُرسل");
    }
    return chatRpc(context.supabase, "staff_chat_mutate", { p_action: data.action, p_data: data.payload });
  });

export const uploadChatFile = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input) => {
    if (!(input instanceof FormData)) throw new Error("ملف غير صالح");
    const file = input.get("file");
    if (!(file instanceof File)) throw new Error("اختر ملفًا");
    return file;
  }).handler(({ context, data }) => chatUpload(context.supabase, context.userId, data));

export const getChatReceipts = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    if (await chatRole(context.supabase, context.userId) !== "admin") throw new Error("للأدمن فقط");
    const { data: rows, error } = await context.supabase.from("staff_chat_receipts" as never).select("user_id,read_at").eq("message_id", data.id);
    if (error) throw new Error("تعذر تحميل تأكيدات القراءة");
    return rows as unknown as { user_id: string; read_at: string | null }[];
  });