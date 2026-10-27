import { createFileRoute } from "@tanstack/react-router";

// Google redirects here after consent. Protected by a one-time, expiring, hashed state
// tied to the admin who started the flow. Returns HTML that only reports ok/error to the opener.
function page(ok: boolean, msg: string) {
  const esc = msg.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const payload = JSON.stringify({ type: "mgpro-mail-oauth", ok, message: msg }).replace(/</g, "\\u003c");
  return new Response(
    `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>MG Pro</title></head><body style="font-family:sans-serif;background:#0b0b0b;color:#eee;text-align:center;padding:40px"><p>${esc}</p><script>try{if(window.opener)window.opener.postMessage(${payload},location.origin)}catch(e){}setTimeout(function(){window.close()},1200)</script></body></html>`,
    { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "Set-Cookie": "mgpro_mail_oauth=; Path=/api/public/mail-oauth; Max-Age=0; HttpOnly; Secure; SameSite=Lax" } },
  );
}

export const Route = createFileRoute("/api/public/mail-oauth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const state = url.searchParams.get("state") ?? "";
        const code = url.searchParams.get("code") ?? "";
        if (url.searchParams.get("error")) return page(false, "تم إلغاء الربط");
        if (!state || !code || state.length > 200 || code.length > 2000) return page(false, "طلب غير صالح");

        const { encryptSecret, oauthStateKey, pkcePair, MAIL_OAUTH_COOKIE } = await import("@/lib/mail/crypto.server");
        const { exchangeCode, verifiedIdentity, GMAIL_SCOPES, gmail, revokeToken } = await import("@/lib/mail/google.server");
        const { logActivity } = await import("@/lib/mail/sync.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const admin: any = supabaseAdmin;

        const nonce = (request.headers.get("cookie") ?? "").split(/;\s*/).find((c) => c.startsWith(`${MAIL_OAUTH_COOKIE}=`))?.slice(MAIL_OAUTH_COOKIE.length + 1) ?? "";
        if (!nonce) return page(false, "افتح الربط من نفس المتصفح اللي بدأت منه");

        // Consume state atomically (single use + not expired + bound to this browser's nonce).
        const nowIso = new Date().toISOString();
        const { data: st } = await admin.from("mail_oauth_states").update({ used_at: nowIso })
          .eq("state_hash", await oauthStateKey(state, nonce)).is("used_at", null).gt("expires_at", nowIso)
          .select("user_id").maybeSingle();
        if (!st) return page(false, "انتهت صلاحية طلب الربط، ابدأ من جديد");
        const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", st.user_id);
        if (!(roles ?? []).some((r: any) => r.role === "admin")) return page(false, "غير مصرح");

        let createdId: string | null = null;
        let tok: Awaited<ReturnType<typeof exchangeCode>> | null = null;
        try {
          tok = await exchangeCode(code, (await pkcePair(state, nonce)).verifier);
          const granted = (tok.scope ?? "").split(" ");
          if (!GMAIL_SCOPES.filter((x) => x.includes("gmail")).every((x) => granted.includes(x))) {
            await revokeToken(tok.refresh_token ?? tok.access_token);
            return page(false, "لم يتم منح كل الصلاحيات المطلوبة");
          }
          const who = await verifiedIdentity(tok.access_token);
          const profile = await gmail(tok.access_token, "/profile");
          if (String(profile.emailAddress).toLowerCase() !== who.email) throw new Error("account_mismatch");

          const { data: existing, error: exErr } = await admin.from("mail_accounts").select("id").eq("email", who.email).maybeSingle();
          if (exErr) throw new Error(exErr.message);
          const { data: oldSecret } = existing
            ? await admin.from("mail_account_secrets").select("account_id").eq("account_id", existing.id).maybeSingle()
            : { data: null };
          if (!tok.refresh_token && !oldSecret) return page(false, "Google لم يرسل صلاحية دائمة، أزل وصول التطبيق من حساب Google ثم أعد المحاولة");

          let accountId: string;
          if (existing) accountId = existing.id;
          else {
            const { data: ins, error } = await admin.from("mail_accounts").insert({
              email: who.email, display_name: who.name, linked_at: nowIso, history_id: String(profile.historyId), created_by: st.user_id, status: "paused",
            }).select("id").single();
            if (error) throw new Error(error.message);
            accountId = createdId = ins.id;
          }
          // Old good refresh token is kept unless Google issued a new one.
          const secret: any = {
            account_id: accountId,
            access_token_ciphertext: await encryptSecret(tok.access_token),
            access_expires_at: new Date(Date.now() + tok.expires_in * 1000).toISOString(),
            scopes: tok.scope, updated_at: nowIso,
          };
          if (tok.refresh_token) secret.refresh_token_ciphertext = await encryptSecret(tok.refresh_token);
          const { error: sErr } = oldSecret
            ? await admin.from("mail_account_secrets").update(secret).eq("account_id", accountId)
            : await admin.from("mail_account_secrets").insert(secret);
          if (sErr) throw new Error(sErr.message);
          // Activate only after credentials are safely stored. Reconnect keeps linked_at + cursor.
          const { error: aErr } = await admin.from("mail_accounts").update({ status: "active", last_error: null, display_name: who.name, updated_at: nowIso }).eq("id", accountId);
          if (aErr) throw new Error(aErr.message);
          createdId = null;
          await logActivity(admin, { actor_id: st.user_id, action: existing ? "account_relinked" : "account_linked", account_id: accountId, meta: { email: who.email } });
          return page(true, `تم ربط ${who.email}`);
        } catch (e: any) {
          if (createdId) {
            await admin.from("mail_accounts").delete().eq("id", createdId);
            if (tok) await revokeToken(tok.refresh_token ?? tok.access_token);
          }
          console.error("mail oauth callback failed:", String(e?.message ?? e).slice(0, 120));
          return page(false, "تعذر إكمال الربط");
        }
      },
    },
  },
});
