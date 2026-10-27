import { createFileRoute } from "@tanstack/react-router";

// Google redirects here after consent. Protected by a one-time, expiring, hashed state
// tied to the admin who started the flow. Returns HTML that only reports ok/error to the opener.
function page(ok: boolean, msg: string) {
  const esc = msg.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const payload = JSON.stringify({ type: "mgpro-mail-oauth", ok, message: msg }).replace(/</g, "\\u003c");
  return new Response(
    `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>MG Pro</title></head><body style="font-family:sans-serif;background:#0b0b0b;color:#eee;text-align:center;padding:40px"><p>${esc}</p><script>try{if(window.opener)window.opener.postMessage(${payload},location.origin)}catch(e){}setTimeout(function(){window.close()},1200)</script></body></html>`,
    { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } },
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

        const { sha256Hex, encryptSecret } = await import("@/lib/mail/crypto.server");
        const { exchangeCode, verifiedIdentity, GMAIL_SCOPES, gmail, revokeToken } = await import("@/lib/mail/google.server");
        const { logActivity } = await import("@/lib/mail/sync.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const admin: any = supabaseAdmin;

        // Consume state atomically (single use + not expired).
        const nowIso = new Date().toISOString();
        const { data: st } = await admin.from("mail_oauth_states").update({ used_at: nowIso })
          .eq("state_hash", await sha256Hex(state)).is("used_at", null).gt("expires_at", nowIso)
          .select("user_id").maybeSingle();
        if (!st) return page(false, "انتهت صلاحية طلب الربط، ابدأ من جديد");
        const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", st.user_id);
        if (!(roles ?? []).some((r: any) => r.role === "admin")) return page(false, "غير مصرح");

        try {
          const tok = await exchangeCode(code);
          const granted = (tok.scope ?? "").split(" ");
          const needed = GMAIL_SCOPES.filter((s) => s.includes("gmail"));
          if (!needed.every((s) => granted.includes(s))) {
            await revokeToken(tok.access_token);
            return page(false, "لم يتم منح كل الصلاحيات المطلوبة");
          }
          const who = await verifiedIdentity(tok.access_token);
          const profile = await gmail(tok.access_token, "/profile");
          if (String(profile.emailAddress).toLowerCase() !== who.email) return page(false, "عدم تطابق الحساب");

          const { data: existing } = await admin.from("mail_accounts").select("id").eq("email", who.email).maybeSingle();
          let accountId: string;
          if (existing) {
            // Reconnect: keep linked_at + cursor so missed mail is recovered but no older history.
            accountId = existing.id;
            await admin.from("mail_accounts").update({ status: "active", last_error: null, display_name: who.name, updated_at: nowIso }).eq("id", accountId);
          } else {
            const { data: ins, error } = await admin.from("mail_accounts").insert({
              email: who.email, display_name: who.name, linked_at: nowIso, history_id: String(profile.historyId), created_by: st.user_id,
            }).select("id").single();
            if (error) throw new Error(error.message);
            accountId = ins.id;
          }
          const { data: oldSecret } = await admin.from("mail_account_secrets").select("refresh_token_ciphertext").eq("account_id", accountId).maybeSingle();
          if (!tok.refresh_token && !oldSecret) return page(false, "Google لم يرسل صلاحية دائمة، أزل وصول التطبيق من حساب Google ثم أعد المحاولة");
          await admin.from("mail_account_secrets").upsert({
            account_id: accountId,
            ...(tok.refresh_token ? { refresh_token_ciphertext: await encryptSecret(tok.refresh_token) } : {}),
            access_token_ciphertext: await encryptSecret(tok.access_token),
            access_expires_at: new Date(Date.now() + tok.expires_in * 1000).toISOString(),
            scopes: tok.scope, updated_at: nowIso,
          }, { onConflict: "account_id" });
          await logActivity(admin, { actor_id: st.user_id, action: existing ? "account_relinked" : "account_linked", account_id: accountId, meta: { email: who.email } });
          return page(true, `تم ربط ${who.email}`);
        } catch (e: any) {
          console.error("mail oauth callback failed:", String(e?.message ?? e).slice(0, 120));
          return page(false, "تعذر إكمال الربط");
        }
      },
    },
  },
});
