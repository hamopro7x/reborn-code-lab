import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { adminDb, log, requireAdmin, roleOf } from "./mail/access.server";

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
    } catch { /* token revocation is best-effort; account cleanup continues. */ }
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
