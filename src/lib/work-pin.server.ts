/**
 * Employee PIN and shared-shift persistence.
 * PINs are salted and hashed; raw PIN values never leave this server module.
 */
import { admin } from "./work-db.server";
import { hashPin } from "./pin-attempt.server";


/**
 * Shift handover is gated by a 6-digit PIN instead of face matching.
 * The PIN is never stored in clear text: a random per-user salt plus SHA-256
 * is kept in `work_pins`, which is reachable only through the service role.
 */

const PIN_RE = /^\d{6}$/;

function randomSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function pinIsSet(userId: string): Promise<boolean> {
  const db = await admin();
  const { data, error } = await db.from("work_pins").select("user_id").eq("user_id", userId).maybeSingle();
  if (error) throw new Error("تعذّر التحقق من رمز الاستلام — حاول مرة أخرى");
  return !!data;}

/** Creates or replaces a PIN. `by` records who changed it (self or admin). */
export async function savePin(userId: string, pin: string, by: string, createOnly = false) {
  if (!PIN_RE.test(pin)) return { ok: false as const, error: "الرمز يجب أن يكون 6 أرقام" };
  const salt = randomSalt();
  const db = await admin();
  const row = {
      user_id: userId,
      pin_hash: await hashPin(pin, salt),
      pin_salt: salt,
      fail_count: 0,
      locked_until: null,      set_by: by,
    };
  const { error } = createOnly
    ? await db.from("work_pins").insert(row)
    : await db.from("work_pins").upsert(row, { onConflict: "user_id" });
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function clearPin(userId: string) {
  const db = await admin();
  const { error } = await db.from("work_pins").delete().eq("user_id", userId);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

/** Verifies a PIN, with a short lockout after 5 wrong tries. */
export async function verifyPin(userId: string, pin: string): Promise<{ ok: boolean; reason?: string }> {
  const { verifyPinAttempt } = await import("./pin-attempt.server");
  return verifyPinAttempt(await admin(), userId, pin);
}

/* شفت تمت مشاركته من الأدمن مع موظف — site_settings.shared_shifts = { userId: shiftId } */
async function readSharedShifts(): Promise<Record<string, string>> {
  const db = await admin();
  const { data } = await db.from("site_settings").select("value").eq("key", "shared_shifts").maybeSingle();
  return ((data as any)?.value ?? {}) as Record<string, string>;
}
export async function getSharedShiftFor(userId: string): Promise<string | null> {
  return (await readSharedShifts())[userId] ?? null;
}
export async function setSharedShiftFor(userId: string, shiftId: string | null) {
  const db = await admin();
  const map = await readSharedShifts();
  if (shiftId) map[userId] = shiftId;
  else delete map[userId];
  const { error } = await db
    .from("site_settings")
    .upsert({ key: "shared_shifts", value: map as any, updated_at: new Date().toISOString() } as any);
  if (error) throw new Error(error.message);
}
