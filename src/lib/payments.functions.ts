import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const listSchema = z.object({
  country_code: z.string().trim().min(2).max(4).optional(),
});

/**
 * Public list of active payment methods WITHOUT sensitive account details.
 * Account numbers are never exposed in bulk.
 */
export const listPublicPaymentMethods = createServerFn({ method: "POST" })
  .inputValidator((d) => listSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = supabaseAdmin
      .from("payment_methods")
      .select("id, name, type, icon, country_code, sort_order")
      .eq("active", true)
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("payment_methods")
      .select("id, name, type, account_number, account_name, instructions")
      .eq("id", data.id)
      .eq("active", true)
      .maybeSingle();
    if (error) throw new Error("Failed to load payment method");
    if (!row) throw new Error("Invalid payment method");
    return row;
  });
