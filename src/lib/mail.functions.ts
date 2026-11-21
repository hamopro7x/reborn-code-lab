/**
 * Stable public facade for Gmail server functions.
 * Keep consumer imports on this path while implementations stay grouped by
 * account lifecycle, message operations, composition, and notifications.
 */
export * from "./mail-core.functions";
export * from "./mail-read.functions";
export * from "./mail-compose.functions";
export * from "./mail-notifications.functions";
