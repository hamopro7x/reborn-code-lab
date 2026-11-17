export type DateTimeFields = { date: string; hour: string; minute: string; period: "am" | "pm" };

export function dateTimeFields(value: string | null | undefined): DateTimeFields {
  const d = value ? new Date(value) : null;
  if (!d || isNaN(d.getTime())) return { date: "", hour: "12", minute: "00", period: "am" };
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    hour: String(d.getHours() % 12 || 12), minute: pad(d.getMinutes()),
    period: d.getHours() < 12 ? "am" : "pm",
  };
}

export function dateTimeValue(fields: DateTimeFields): string | null {
  if (!fields.date) return null;
  const hour = Number(fields.hour);
  const minute = Number(fields.minute);
  if (!Number.isInteger(hour) || hour < 1 || hour > 12 || !Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  const h24 = hour % 12 + (fields.period === "pm" ? 12 : 0);
  const d = new Date(`${fields.date}T${String(h24).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`);
  return isNaN(d.getTime()) ? null : d.toISOString();
}