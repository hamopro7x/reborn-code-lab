const PIN_RE = /^\d{6}$/;
export async function hashPin(pin: string, salt: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${pin}`));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
export async function verifyPinAttempt(db: any, userId: string, pin: string, conflicts = 0): Promise<{ ok: boolean; reason?: string }> {
  if (!PIN_RE.test(pin)) return { ok: false as const, reason: "الرمز يجب أن يكون 6 أرقام" };
  const { data, error } = await db
    .from("work_pins")
    .select("pin_hash, pin_salt, fail_count, locked_until")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("تعذّر التحقق من رمز الاستلام — حاول مرة أخرى");
  if (!data) return { ok: false as const, reason: "NO_PIN" };

  const locked = data.locked_until ? new Date(data.locked_until).getTime() : 0;
  if (locked > Date.now()) {
    const mins = Math.max(1, Math.ceil((locked - Date.now()) / 60_000));
    return { ok: false as const, reason: `تم إيقاف المحاولات مؤقتًا، أعد المحاولة بعد ${mins} دقيقة` };
  }

  const same = (await hashPin(pin, data.pin_salt)) === data.pin_hash;
  // Compare-and-swap across processes: don't overwrite another request's failure/lock or PIN replacement.
  const writeAttempt = async (patch: { fail_count: number; locked_until: string | null }) => {
    let q = db.from("work_pins").update(patch)
      .eq("user_id", userId).eq("pin_hash", data.pin_hash).eq("pin_salt", data.pin_salt)
      .eq("fail_count", data.fail_count ?? 0);
    q = data.locked_until ? q.eq("locked_until", data.locked_until) : q.is("locked_until", null);
    return q.select("user_id").maybeSingle();
  };
  const retryConflict = async () => {
    if (conflicts >= 4) throw new Error("محاولات متزامنة — حاول مرة أخرى");
    return verifyPinAttempt(db, userId, pin, conflicts + 1);
  };
  if (!same) {
    const fails = (data.fail_count ?? 0) + 1;
    const { data: saved, error: saveError } = await writeAttempt({
        fail_count: fails,
        locked_until: fails >= 5 ? new Date(Date.now() + 5 * 60_000).toISOString() : null,
      });
    if (saveError) throw new Error("تعذّر تسجيل المحاولة — حاول مرة أخرى");
    if (!saved) return retryConflict();
    return {
      ok: false as const,
      reason:
        fails >= 5
          ? "محاولات خاطئة كثيرة — انتظر 5 دقائق"
          : `الرمز غير صحيح (${5 - fails} محاولات متبقية)`,
    };
  }

  const { data: saved, error: resetError } = await writeAttempt({ fail_count: 0, locked_until: null });
  if (resetError) throw new Error("تعذّر إتمام التحقق — حاول مرة أخرى");
  if (!saved) return retryConflict();
  return { ok: true as const };
}
