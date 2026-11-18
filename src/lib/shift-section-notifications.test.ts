import { describe, expect, it } from "vitest";
import { shiftSectionNotifications } from "./shift-section-notifications";

const input = {
  isAdmin: true, shiftId: "shift-1", reviewed: false,
  transactions: [{ egp: 0 }, { quantity: 5 }, { egp: null, quantity: null }],
  manualCards: [{ merchant: "purchase" }, { merchant: "", amount: "" }],
  manual: [{ card: "employee", details: "رسالة" }, { card: "wrong", amount: "0" },
    { card: "receive", details: "استلام" }, { card: "transfer", amount: "10" }, { card: "wrong", details: "   " }],
  external: [{ note: "تحويل للعميل" }, { note: null }],
};
describe("unreviewed shift section notifications", () => {
  it("counts employee writing in its own section, including saved zero, but not empty or provider-only rows", () => {
    expect(shiftSectionNotifications(input)).toEqual({ all: 3, employee: 1, wrong: 1, receive: 1, transfer: 1, ext: 1, int: 0, p2p: 0 });
  });
  it("clears every section only when the shift is marked reviewed", () => {
    expect(Object.values(shiftSectionNotifications({ ...input, reviewed: true }))).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });
  it("does not show review notifications to employees or before selecting a shift", () => {
    expect(Object.values(shiftSectionNotifications({ ...input, isAdmin: false })).every((n) => n === 0)).toBe(true);
    expect(Object.values(shiftSectionNotifications({ ...input, shiftId: undefined })).every((n) => n === 0)).toBe(true);
  });
  it("does not assume an unknown review state means unreviewed", () => {
    expect(shiftSectionNotifications({ ...input, reviewed: undefined }).employee).toBe(0);
  });
});