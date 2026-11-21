/**
 * Public server-function facade for the employee work and shift domain.
 *
 * Implementations are grouped by access scope:
 * - overview: admin reporting, central work ledger and P2P linking
 * - employee: caller-owned shift, PIN and manual transaction actions
 * - admin: employee work views, shift history and shared-shift controls
 *
 * Keep this facade stable: existing UI imports must not need to know the
 * internal module boundaries.
 */
export * from "./work-overview.functions";
export * from "./work-employee.functions";
export * from "./work-admin.functions";
