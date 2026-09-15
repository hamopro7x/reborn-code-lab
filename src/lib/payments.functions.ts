import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const listSchema = z.object({
  country_code: z.string().trim().min(2).max(4).optional(),
});

/** Publishable server client: no service-role secret required. */
async function publicClient() {
  const { createClient } = await import("@supabase/supabase-js");
  const { DATABASE_URL, DATABASE_PUBLISHABLE_KEY } = await import("@/integrations/supabase/config");
  const url = process.env["SUPABASE_URL"]?.replace(/\/$/, "") || DATABASE_URL;
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"] || DATABASE_PUBLISHABLE_KEY;
  return createClient(url, key, {
    global: { fetch: (input, init) => fetch(input, { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers)), apikey: key } }) },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Public list of active payment methods WITHOUT sensitive account details.
 * Reads the payment_methods_public view; account numbers are never exposed in bulk.
 */
export const listPublicPaymentMethods = createServerFn({ method: "POST" })
  .inputValidator((d) => listSchema.parse(d))
  .handler(async ({ data }) => {
    const supabase = await publicClient();
    let query = supabase
      .from("payment_methods_public")
      .select("id, name, type, icon, country_code, sort_order")
      .order("sort_order");
    if (data.country_code) {
      query = query.or(`country_code.eq.${data.country_code},country_code.is.null`);
    }
    const { data: rows, error } = await query;
    if (error) throw new Error("Failed to load payment methods");
    return rows ?? [];
  });

const detailSchema = z.object({ id: z.string().uuid() });

/**
 * Transfer details for ONE explicitly selected active payment method.
 * Keeps account numbers off the public Data API and prevents bulk harvesting.
 */
export const getPublicPaymentDetails = createServerFn({ method: "POST" })
  .inputValidator((d) => detailSchema.parse(d))
  .handler(async ({ data }) => {
    const supabase = await publicClient();
    const { data: rows, error } = await supabase.rpc("payment_method_details", { p_id: data.id });
    if (error) throw new Error("Failed to load payment method");
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) throw new Error("Invalid payment method");
    return row;
  });
