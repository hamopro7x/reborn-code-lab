import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const createSchema = z.object({
  name: z.string().trim().min(2).max(60),
  scopes: z.array(z.enum(["read", "write"])).min(1),
  expires_in_days: z.number().int().min(0).max(3650).default(0),
});

const idSchema = z.object({ id: z.string().uuid() });

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: roles } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (!(roles ?? []).some((r: { role: string }) => r.role === "admin")) {
    throw new Error("Forbidden: admin only");
  }
}

export const listApiKeys = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as any);
    const { data, error } = await (context as any).supabase
      .from("api_keys")
      .select("id, name, key_prefix, scopes, last_used_at, revoked_at, expires_at, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => createSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const { randomBytes, createHash } = await import("node:crypto");

    const raw = `mp_live_${randomBytes(24).toString("base64url")}`;
    const hash = createHash("sha256").update(raw).digest("hex");
    const expires =
      data.expires_in_days > 0
        ? new Date(Date.now() + data.expires_in_days * 86_400_000).toISOString()
        : null;

    const { data: row, error } = await (context as any).supabase
      .from("api_keys")
      .insert({
        name: data.name,
        key_prefix: raw.slice(0, 16),
        key_hash: hash,
        scopes: data.scopes,
        created_by: (context as any).userId,
        expires_at: expires,
      })
      .select("id, name, key_prefix, scopes, expires_at, created_at")
      .single();
    if (error) throw new Error(error.message);

    // The full key is returned exactly once and never stored in plaintext.
    return { key: raw, record: row };
  });

export const revokeApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => idSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const { error } = await (context as any).supabase
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => idSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const { error } = await (context as any).supabase.from("api_keys").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
