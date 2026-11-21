const partsFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});
/** Resolve a calendar midnight with IANA rules, not a permanent +03:00 offset. */
export function cairoMidnight(date: string): number {
  const utc = Date.parse(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(utc)) throw new Error("Invalid calendar date");
  let instant = utc;
  for (let i = 0; i < 3; i++) {
    const parts = partsFormat.formatToParts(instant);
    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
    const localAsUtc = Date.parse(`${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}Z`);
    instant += utc - localAsUtc;
  }
  return instant;
}
export function cairoCalendarRange(date: string, days = 1) {
  const end = new Date(`${date}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + days);
  return { start: new Date(cairoMidnight(date)).toISOString(), end: new Date(cairoMidnight(end.toISOString().slice(0, 10))).toISOString() };
}