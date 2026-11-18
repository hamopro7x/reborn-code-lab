export type ShiftSection = "all" | "employee" | "wrong" | "receive" | "transfer" | "p2p" | "ext" | "int";

type Row = Record<string, unknown>;
const filled = (value: unknown) => value !== null && value !== undefined && String(value).trim() !== "";

/** Count employee input, not provider-only activity; reviewing the shift clears every badge. */
export function shiftSectionNotifications(input: {
  isAdmin: boolean;
  shiftId?: string;
  reviewed?: boolean;
  transactions?: Row[];
  manualCards?: Row[];
  manual?: Row[];
  external?: Row[];
}) {
  const counts: Record<ShiftSection, number> = { all: 0, employee: 0, wrong: 0, receive: 0, transfer: 0, p2p: 0, ext: 0, int: 0 };
  if (!input.isAdmin || !input.shiftId || input.reviewed !== false) return counts;
  counts.all = (input.transactions ?? []).filter((r) => filled(r.egp) || filled(r.quantity)).length
    + (input.manualCards ?? []).filter((r) => [r.merchant, r.amount, r.egp, r.quantity, r.pan4].some(filled)).length;
  for (const row of input.manual ?? []) {
    if (!filled(row.amount) && !filled(row.details)) continue;
    if (row.card === "employee") counts.employee++;
    if (row.card === "wrong") counts.wrong++;
    if (row.card === "receive") counts.receive++;
    if (row.card === "transfer") counts.transfer++;
  }
  counts.ext = (input.external ?? []).filter((r) => filled(r.note)).length;
  return counts;
}