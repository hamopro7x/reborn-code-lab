/** Match the admin sheet's EGP total using only employee-entered EGP cells. */
export function shiftEgpTotal(rows: readonly { egp?: unknown }[]): number {
  return rows.reduce((total, row) => {
    const value = Number(String(row.egp ?? "").replace(/[^\d.-]/g, ""));
    return Number.isFinite(value) ? total + Math.abs(value) : total;
  }, 0);
}