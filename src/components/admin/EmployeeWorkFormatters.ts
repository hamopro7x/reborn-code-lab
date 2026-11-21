export const num = (n: number, digits = 2) =>
  Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

const SHIFT_TZ = "Africa/Cairo";
const shiftPartsFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: SHIFT_TZ,
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});
const EN_DAY_TO_AR: Record<string, string> = {
  Sun: "الأحد", Mon: "الإثنين", Tue: "الثلاثاء", Wed: "الأربعاء",
  Thu: "الخميس", Fri: "الجمعة", Sat: "السبت",
};

/** Cairo-local shift date/time formatter shared by employee work tables. */
export function fmtShiftDate(ts: number) {
  const parts = shiftPartsFmt.formatToParts(new Date(ts));
  const get = (t: string) => parts.find((x) => x.type === t)?.value ?? "";
  const ampm = get("dayPeriod").toLowerCase().includes("a") ? "ص" : "م";
  return {
    day: EN_DAY_TO_AR[get("weekday")] ?? get("weekday"),
    date: `${get("day")}/${get("month")}/${get("year")}`,
    time: `${get("hour")}:${get("minute")} ${ampm}`,
  };
}


export function txnTime(ms: number) {
  const date = fmtShiftDate(ms);
  return `${date.day} - ${date.date} - ${date.time}`;
}
