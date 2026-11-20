/**
 * Bybit display labels for the central ledger and shift sheets.
 * Keep the shared provider discriminator until independent data cleanup finishes.
 */
export async function accountLabels(db: any): Promise<Map<string, string>> {
  let res = await db
    .from("bybit_accounts")
    .select("id,name,sort_order,provider")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (res.error) {
    res = await db
      .from("bybit_accounts")
      .select("id,name,sort_order")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
  }
  const out = new Map<string, string>();
  let bybit = 0;
  for (const a of (res.data ?? []) as any[]) {
    if (a.provider != null && a.provider !== "bybit") continue;
    bybit++;
    out.set(a.id, `${a.name} (فيزا ${a.sort_order || bybit})`);
  }
  return out;
}
