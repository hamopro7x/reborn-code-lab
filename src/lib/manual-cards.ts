import { supabase } from "@/integrations/supabase/client";

export type ManualCard = {
  id: string;
  name: string;
  brand: "visa" | "mastercard";
  kind: "virtual" | "physical";
  number: string;
  expiry: string;
  cvv?: string;
};


const KEY = "manual_cards";

export async function loadManualCards(): Promise<ManualCard[]> {
  const { data } = await supabase.from("site_settings").select("value").eq("key", KEY).maybeSingle();
  const value = (data?.value ?? null) as unknown;
  if (!value || !Array.isArray((value as { cards?: unknown[] }).cards)) return [];
  return ((value as { cards: ManualCard[] }).cards ?? []).filter((c) => c && c.id);
}

export async function saveManualCards(cards: ManualCard[]): Promise<void> {
  const { error } = await supabase
    .from("site_settings")
    .upsert({ key: KEY, value: { cards } as never, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw error;
}

export const last4Of = (num: string) => num.replace(/\D/g, "").slice(-4);

export const maskedPan = (num: string) => {
  const digits = num.replace(/\D/g, "");
  if (digits.length < 8) return digits || "—";
  return `${digits.slice(0, 4)} **** **${digits.slice(-6, -4)} ${digits.slice(-4)}`;
};
