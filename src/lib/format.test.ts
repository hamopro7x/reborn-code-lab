import { describe, expect, it } from "vitest";
import { formatChatTimestamp, formatLocaleDateTime, formatTime } from "./format";
import { dateTimeFields, dateTimeValue } from "./date-time-input";

describe("site-wide 12-hour clock", () => {
  it("shows chat date, period-first 12-hour time, and the actual Cairo weekday", () => {
    expect(formatChatTimestamp("2026-11-18T00:32:00Z")).toBe("[ 2026 / 11 / 18 - ص 2:32 - الأربعاء ]");
  });
  it("keeps the chat date and weekday aligned across Cairo midnight", () => {
    expect(formatChatTimestamp("2026-11-20T22:05:00Z")).toBe("[ 2026 / 11 / 21 - ص 12:05 - السبت ]");
  });
  it.each([
    ["2026-11-17T00:05:00Z", "12:05 ص"],
    ["2026-11-17T09:05:00Z", "09:05 ص"],
    ["2026-11-17T12:05:00Z", "12:05 م"],
    ["2026-11-17T23:05:00Z", "11:05 م"],
  ])("uses 12 hours for %s", (date, expected) => {
    expect(formatTime(date, { timeZone: "UTC" })).toBe(expected);
  });
  it("preserves Cairo time and seconds", () => {
    expect(formatTime("2026-11-17T14:25:30Z", { timeZone: "Africa/Cairo", second: "2-digit" })).toBe("04:25:30 م");
  });
  it("forces 12 hours even for a 24-hour locale", () => {
    expect(formatLocaleDateTime("2026-11-17T16:25:00Z", "en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", hour12: false })).toBe("04:25 pm");
  });
  it.each([null, undefined, "", "invalid"])("handles missing or invalid timestamps: %s", (value) => {
    expect(formatTime(value)).toBe("—");
  });
  it.each([[12, "am", 0], [12, "pm", 12], [4, "pm", 16], [9, "am", 9]] as const)("converts input hour %s %s without changing the date", (hour, period, expected) => {
    const result = dateTimeValue({ date: "2026-11-17", hour: String(hour), minute: "25", period });
    expect(result).toBe(new Date(2026, 10, 17, expected, 25).toISOString());
    expect(dateTimeFields(result)).toEqual({ date: "2026-11-17", hour: String(hour), minute: "25", period });
  });
});