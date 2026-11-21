/**
 * Stored Bybit card metadata administration.
 * Read-derived usage totals remain in the card transaction query service.
 */
export type BybitCard = {
  id?: string;
  pan4: string;
  brand: string;
  currency: string;
  status: string;
  name?: string;
  fullNumber?: string;
  cvv?: string;
  expiry?: string;
  txnCount: number;
  spend: number;
  lastUsed: number;
  virtual?: boolean;
};

/** يحدد نوع البطاقة من رقمها (IIN) */

function brandFromNumber(input: string): string | null {
  const n = String(input || "").replace(/\D/g, "");
  if (!n) return null;
  if (/^4/.test(n)) return "Visa";
  if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(n)) return "MasterCard";
  if (/^3[47]/.test(n)) return "Amex";
  if (/^(62|81)/.test(n)) return "UnionPay";
  if (/^35/.test(n)) return "JCB";
  if (/^(6011|64[4-9]|65)/.test(n)) return "Discover";
  if (/^3(0[0-5]|[68])/.test(n)) return "Diners";
  if (/^(50|5[6-9]|6)/.test(n)) return "Maestro";
  return null;
}

export async function createCard(input: {
  pan4: string;
  brand: string;
  currency: string;
  status: string;
  name?: string;
  fullNumber?: string;
  cvv?: string;
  expiry?: string;
  userId: string;
  accountId?: string;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await (supabaseAdmin as any).from("bybit_cards").insert({
    pan4: input.pan4,
    brand: input.brand,
    currency: input.currency,
    status: input.status,
    name: input.name,
    full_number: input.fullNumber,
    cvv: input.cvv,
    expiry: input.expiry,
    created_by: input.userId,
    account_id: input.accountId ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function deleteCard(id: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await (supabaseAdmin as any).from("bybit_cards").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function updateCard(input: {
  id: string;
  pan4: string;
  brand: string;
  currency: string;
  status: string;
  name?: string;
  fullNumber?: string;
  cvv?: string;
  expiry?: string;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await (supabaseAdmin as any)
    .from("bybit_cards")
    .update({
      pan4: input.pan4,
      brand: input.brand,
      currency: input.currency,
      status: input.status,
      name: input.name,
      full_number: input.fullNumber,
      cvv: input.cvv,
      expiry: input.expiry,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id);
  if (error) throw new Error(error.message);
}

/* ============================ Convert (تحويل عملة) ============================ */
