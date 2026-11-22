import { describe, expect, it } from "vitest";
import {
  BASE_EMPLOYEE_PANELS,
  PANEL_KEYS,
  SHAREABLE_EMPLOYEE_PANELS,
  canEmployeeViewPanel,
} from "./admin-panel-access";

describe("employee panel access", () => {
  it("always allows the employee's operational panels", () => {
    for (const panel of BASE_EMPLOYEE_PANELS) {
      expect(canEmployeeViewPanel(panel, [])).toBe(true);
    }
  });

  it("allows only explicitly shareable read-only panels", () => {
    for (const panel of SHAREABLE_EMPLOYEE_PANELS) {
      expect(canEmployeeViewPanel(panel, [panel])).toBe(true);
    }
    expect(canEmployeeViewPanel("products", ["products" as any])).toBe(false);
    expect(canEmployeeViewPanel("categories", ["categories" as any])).toBe(false);
    expect(canEmployeeViewPanel("employees", ["employees" as any])).toBe(false);
    expect(canEmployeeViewPanel("payments", ["payments" as any])).toBe(false);
    expect(canEmployeeViewPanel("settings", ["settings" as any])).toBe(false);
  });

  it("does not expose unshared panels", () => {
    for (const panel of PANEL_KEYS) {
      if (!BASE_EMPLOYEE_PANELS.includes(panel)) {
        expect(canEmployeeViewPanel(panel, [])).toBe(false);
      }
    }
  });
});
