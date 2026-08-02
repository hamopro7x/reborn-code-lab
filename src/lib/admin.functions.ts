import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const isAdmin = (data ?? []).some((r: any) => r.role === "admin");
  if (!isAdmin) throw new Error("Forbidden: admin only");
}

const createEmpSchema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(6).max(100),
  full_name: z.string().trim().min(2).max(120),
});

export const createEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => createEmpSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Pre-approve this email server-side (private allowlist) so the DB signup gate
    // allows it. Never rely on client-supplied user_metadata for this decision.
    const { error: allowErr } = await supabaseAdmin.rpc("admin_allow_signup", { p_email: data.email });
    if (allowErr) throw new Error(allowErr.message);

    const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (cErr || !created?.user) throw new Error(cErr?.message || "Failed to create user");

    const uid = created.user.id;
    // Upsert profile (handle_new_user trigger blocks non-allowed emails; do it manually)
    await supabaseAdmin.from("profiles").upsert({ id: uid, email: data.email, full_name: data.full_name });
    const { error: rErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: uid, role: "employee" });
    if (rErr) {
      await supabaseAdmin.auth.admin.deleteUser(uid);
      throw new Error(rErr.message);
    }
    return { id: uid, email: data.email };
  });

const idSchema = z.object({ user_id: z.string().uuid() });

export const deleteEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => idSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    if (data.user_id === context.userId) throw new Error("Cannot delete yourself");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Prevent deleting admins
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user_id);
    if ((roles ?? []).some((r: any) => r.role === "admin")) {
      throw new Error("Cannot delete another admin");
    }
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listEmployees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role, created_at");
    const ids = (roles ?? []).map((r: any) => r.user_id);
    if (!ids.length) return [];
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, avatar_url")
      .in("id", ids);
    const map = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    const results = await Promise.all(
      (roles ?? []).map(async (r: any) => {
        const p: any = map.get(r.user_id);
        let avatar_signed_url: string | null = null;
        if (p?.avatar_url) {
          const { data: signed } = await supabaseAdmin.storage
            .from("avatars")
            .createSignedUrl(p.avatar_url, 60 * 60 * 24);
          avatar_signed_url = signed?.signedUrl ?? null;
        }
        return {
          user_id: r.user_id,
          role: r.role,
          created_at: r.created_at,
          email: p?.email ?? "",
          full_name: p?.full_name ?? "",
          avatar_url: p?.avatar_url ?? null,
          avatar_signed_url,
        };
      }),
    );
    return results;
  });

const avatarSchema = z.object({
  user_id: z.string().uuid(),
  path: z.string().min(1).max(300),
});

export const updateEmployeeAvatar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => avatarSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Remove any older avatar file for this user (keep bucket tidy)
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("avatar_url")
      .eq("id", data.user_id)
      .maybeSingle();
    if (existing?.avatar_url && existing.avatar_url !== data.path) {
      await supabaseAdmin.storage.from("avatars").remove([existing.avatar_url]);
    }
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ avatar_url: data.path })
      .eq("id", data.user_id);
    if (error) throw new Error(error.message);
    const { data: signed } = await supabaseAdmin.storage
      .from("avatars")
      .createSignedUrl(data.path, 60 * 60 * 24);
    return { ok: true, avatar_signed_url: signed?.signedUrl ?? null };
  });

export const listCustomers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    const staff = (roles ?? []).some((r: any) => r.role === "admin" || r.role === "employee");
    if (!staff) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: orders } = await supabaseAdmin
      .from("orders")
      .select("id, customer_name, customer_email, customer_phone, customer_country, total, currency_code, status, created_at")
      .order("created_at", { ascending: false });

    type Row = {
      email: string; name: string; phone: string; country: string;
      orders: number; confirmed: number; last_at: string;
      total_by_currency: Record<string, number>;
    };
    const map = new Map<string, Row>();
    for (const o of orders ?? []) {
      const key = (o.customer_email || o.customer_phone || "").toLowerCase();
      if (!key) continue;
      let row = map.get(key);
      if (!row) {
        row = {
          email: o.customer_email, name: o.customer_name, phone: o.customer_phone,
          country: o.customer_country, orders: 0, confirmed: 0, last_at: o.created_at,
          total_by_currency: {},
        };
        map.set(key, row);
      }
      row.orders += 1;
      if (o.status === "confirmed" || o.status === "completed") {
        row.confirmed += 1;
        row.total_by_currency[o.currency_code] = (row.total_by_currency[o.currency_code] ?? 0) + Number(o.total);
      }
      if (new Date(o.created_at) > new Date(row.last_at)) row.last_at = o.created_at;
    }
    return Array.from(map.values()).sort((a, b) => b.orders - a.orders);
  });

export const deleteAllOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ids, error: selErr } = await supabaseAdmin.from("orders").select("id");
    if (selErr) throw new Error(selErr.message);
    const orderIds = (ids ?? []).map((r: any) => r.id);
    if (!orderIds.length) return { deleted: 0 };
    const { error: itemsErr } = await supabaseAdmin.from("order_items").delete().in("order_id", orderIds);
    if (itemsErr) throw new Error(itemsErr.message);
    const { error: ordersErr } = await supabaseAdmin.from("orders").delete().in("id", orderIds);
    if (ordersErr) throw new Error(ordersErr.message);
    return { deleted: orderIds.length };
  });
const updateEmpSchema = z.object({
  user_id: z.string().uuid(),
  full_name: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().email().max(200).optional(),
  password: z.string().min(6).max(100).optional(),
});

export const updateEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => updateEmpSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const authUpdate: { email?: string; password?: string; user_metadata?: Record<string, unknown> } = {};
    if (data.email) authUpdate.email = data.email;
    if (data.password) authUpdate.password = data.password;
    if (data.full_name) authUpdate.user_metadata = { full_name: data.full_name };
    if (Object.keys(authUpdate).length) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, authUpdate);
      if (error) throw new Error(error.message);
    }

    const profileUpdate: { email?: string; full_name?: string } = {};
    if (data.email) profileUpdate.email = data.email;
    if (data.full_name) profileUpdate.full_name = data.full_name;
    if (Object.keys(profileUpdate).length) {
      const { error } = await supabaseAdmin.from("profiles").update(profileUpdate).eq("id", data.user_id);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
