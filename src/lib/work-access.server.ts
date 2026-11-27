import { assertAdmin } from "./bybit-access";

export async function assertShiftView(sb: any, userId: string, shiftId: string) {
  try {
    await assertAdmin(sb, userId);
    return;
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "Forbidden") throw error;
    const mod = await import("./work.server");
    if ((await mod.getSharedShiftFor(userId)) === shiftId) return;
    throw new Error("Forbidden");
  }
}
