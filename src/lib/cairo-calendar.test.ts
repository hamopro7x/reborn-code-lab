import { expect, it } from "vitest";
import { cairoCalendarRange } from "./cairo-calendar";
it("uses Cairo winter UTC+2 rather than dropping an hour of November reports", () => {
  expect(cairoCalendarRange("2026-11-20")).toEqual({ start: "2026-11-19T22:00:00.000Z", end: "2026-11-20T22:00:00.000Z" });
});
it("uses Cairo summer UTC+3", () => {
  expect(cairoCalendarRange("2026-07-20")).toEqual({ start: "2026-07-19T21:00:00.000Z", end: "2026-07-20T21:00:00.000Z" });
});
it("keeps the whole DST-ending week rather than assuming seven 24-hour days", () => {
  expect(cairoCalendarRange("2026-10-24", 7)).toEqual({ start: "2026-10-23T21:00:00.000Z", end: "2026-10-30T22:00:00.000Z" });
});