// Server-only helpers for TikTok coin auto-charge jobs.
export type TikTokAutoSettings = { enabled: boolean; daily_limit_egp: number; token: string };

export async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export async function readSettings(): Promise<TikTokAutoSettings> {
  const db = await admin();
  const { data } = await db.from("site_settings").select("value").eq("key", "tiktok_auto").maybeSingle();
  const v = (data?.value ?? {}) as Partial<TikTokAutoSettings>;
  return { enabled: !!v.enabled, daily_limit_egp: Number(v.daily_limit_egp ?? 0) || 0, token: String(v.token ?? "") };
}

export async function writeSettings(s: TikTokAutoSettings) {
  const db = await admin();
  const { error } = await db.from("site_settings").upsert(
    { key: "tiktok_auto", value: s, updated_at: new Date().toISOString() },
    { onConflict: "key" },
  );
  if (error) throw new Error("فشل حفظ الإعدادات");
}

/** Coins inside a pack name like "1,000 عملة" or "عملات 500". */
function coinsFromName(name: string) {
  const m = name.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[,،]/g, "").match(/\d+/);
  return m ? Number(m[0]) : 0;
}

/** Create jobs for confirmed orders that contain TikTok coin products. */
export async function enqueueConfirmedOrders() {
  const db = await admin();
  const { data: cat } = await db.from("categories").select("id").eq("slug", "tiktok-coins").maybeSingle();
  if (!cat) return;
  const { data: prods } = await db.from("products").select("id, slug, name").eq("category_id", cat.id);
  const byId = new Map<string, any>((prods ?? []).map((p: any) => [p.id, p]));
  if (!byId.size) return;
  const since = new Date(Date.now() - 3 * 86400_000).toISOString();
  const { data: orders } = await db.from("orders").select("id, total").eq("status", "confirmed").gte("created_at", since).limit(100);
  if (!orders?.length) return;
  const ids = orders.map((o: any) => o.id);
  const { data: existing } = await db.from("tiktok_jobs").select("order_id").in("order_id", ids);
  const done = new Set((existing ?? []).map((j: any) => j.order_id));
  const todo = ids.filter((id: string) => !done.has(id));
  if (!todo.length) return;
  const { data: items } = await db.from("order_items").select("order_id, product_id, quantity, unit_price").in("order_id", todo);
  const rows: any[] = [];
  for (const id of todo) {
    let coins = 0, amount = 0;
    for (const it of (items ?? []).filter((i: any) => i.order_id === id)) {
      const p = byId.get(it.product_id);
      if (!p) continue;
      coins += p.slug === "tiktok-coin-unit" ? it.quantity : coinsFromName(p.name) * it.quantity;
      amount += Number(it.unit_price) * it.quantity;
    }
    if (coins > 0) rows.push({ order_id: id, coins, amount_egp: amount });
  }
  if (rows.length) await db.from("tiktok_jobs").upsert(rows, { onConflict: "order_id", ignoreDuplicates: true });
}

export async function spentToday() {
  const db = await admin();
  const start = new Date(); start.setUTCHours(0, 0, 0, 0);
  const { data } = await db.from("tiktok_jobs").select("amount_egp").in("status", ["done", "charging"]).gte("updated_at", start.toISOString());
  return (data ?? []).reduce((s: number, r: any) => s + Number(r.amount_egp || 0), 0);
}
