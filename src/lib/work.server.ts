/**
 * Public facade for the Work & Shifts domain.
 * Keep existing imports stable while implementations are separated by
 * analytics, employee actions, P2P/transfers, manual rows, and shift history.
 */
export * from "./work-shared.server";
export * from "./work-analytics.server";
export * from "./work-p2p.server";
export * from "./work-transfers.server";
export * from "./work-employee.server";
export * from "./work-manual.server";
export * from "./work-history.server";
export { pinIsSet, savePin, clearPin, verifyPin, getSharedShiftFor, setSharedShiftFor } from "./work-pin.server";
