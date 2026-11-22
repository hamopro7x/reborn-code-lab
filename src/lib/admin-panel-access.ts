export type PanelKey =
  | "overview" | "orders" | "categories" | "products" | "customers" | "employees"
  | "reviews" | "payments" | "currencies" | "timers" | "settings" | "courses" | "devices" | "reports" | "remote" | "cardtx" | "apikey" | "worksheet" | "sheet" | "mail" | "chat";

export const PANEL_KEYS: PanelKey[] = [
  "overview", "orders", "categories", "products", "customers", "employees",
  "reviews", "payments", "currencies", "timers", "settings", "courses", "devices",
  "reports", "remote", "cardtx", "apikey", "worksheet", "sheet", "mail", "chat",
];

/** Employee operational panels that are always available. */
export const BASE_EMPLOYEE_PANELS: PanelKey[] = ["orders", "courses", "worksheet", "mail", "chat"];

/**
 * Panels explicitly reviewed as safe for employee read-only sharing.
 * Do not add editable admin panels here unless they implement and enforce
 * a real read-only mode in both UI and server-side operations.
 */
export const SHAREABLE_EMPLOYEE_PANELS: PanelKey[] = ["overview", "customers", "reports"];

export function canEmployeeViewPanel(key: PanelKey, shared: PanelKey[]) {
  return BASE_EMPLOYEE_PANELS.includes(key) ||
    (SHAREABLE_EMPLOYEE_PANELS.includes(key) && shared.includes(key));
}
