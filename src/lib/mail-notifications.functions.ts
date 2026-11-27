import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { adminDb, requireAdmin, roleOf } from "./mail/access.server";

export const mailUnreadCount = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await roleOf(context.supabase, context.userId);
  const { count, error } = await (await adminDb()).from("mail_messages").select("id", { count: "exact", head: true }).eq("is_read", false).is("trashed_at", null).in("folder", ["inbox", "spam", "other"]);
  if (error) throw new Error(error.message);
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
  const { error: staleError } = await db.from("mail_notifications").update({ seen_at: new Date().toISOString() }).eq("user_id", context.userId).is("seen_at", null).lte("created_at", cutoff);
  if (staleError) throw new Error(staleError.message);
  return (data ?? []).map((n: any) => ({ id: n.id as string, messageId: n.message_id as string, subject: n.mail_messages?.subject ?? "", from: n.mail_messages?.from_addr ?? "" }));
});

export const listMailActivity = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await requireAdmin(context);
  const db = await adminDb();
  const { data, error } = await db.from("mail_activity").select("id, actor_id, action, account_id, message_id, meta, created_at").order("created_at", { ascending: false }).limit(200);
  if (error) throw new Error(error.message);
  const actorIds = [...new Set((data ?? []).map((r: any) => r.actor_id).filter(Boolean))];
  const { data: profiles, error: profilesError } = actorIds.length ? await db.from("profiles").select("id, full_name, email").in("id", actorIds) : { data: [] as any[], error: null };
  if (profilesError) throw new Error(profilesError.message);
  const names = new Map((profiles ?? []).map((p: any) => [p.id, p.full_name || p.email]));
  return (data ?? []).map((r: any) => ({ ...r, actor: names.get(r.actor_id) ?? "—" }));
});
