/**
 * Phone-movement liveness layer (extra check, independent from face logic).
 *
 * Uses the device motion sensors (accelerometer, and gyroscope when present)
 * to prove the physical phone actually moved. A clear threshold prevents
 * sensor noise or a phone sitting still from ever passing.
 */

export type ShakeResult = { ok: boolean; reason?: "unsupported" | "denied" | "timeout" };

/** Peak linear-acceleration delta (m/s^2) that counts as a real shake. */
const ACCEL_THRESHOLD = 12;
/** Peak rotation rate (deg/s) that counts as a real shake when gyro exists. */
const ROTATION_THRESHOLD = 160;
/** How many strong samples are needed (avoids a single spike / tap). */
const NEEDED_HITS = 3;

export function motionSensorsAvailable() {
  return typeof window !== "undefined" && "DeviceMotionEvent" in window;
}

/** Asks iOS for motion permission when required. Returns false only if denied. */
export async function requestMotionPermission(): Promise<boolean> {
  const dm = (window as any).DeviceMotionEvent;
  if (!dm) return false;
  if (typeof dm.requestPermission !== "function") return true;
  try {
    return (await dm.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

/**
 * Waits for a genuine shake within `timeoutMs`.
 * `onProgress` reports 0..1 so the UI can nudge the user.
 */
export function waitForShake(
  timeoutMs = 8000,
  onProgress?: (ratio: number) => void,
): Promise<ShakeResult> {
  return new Promise((resolve) => {
    if (!motionSensorsAvailable()) {
      resolve({ ok: false, reason: "unsupported" });
      return;
    }

    let hits = 0;
    let last: { x: number; y: number; z: number } | null = null;
    let done = false;

    const finish = (r: ShakeResult) => {
      if (done) return;
      done = true;
      window.removeEventListener("devicemotion", onMotion as EventListener);
      clearTimeout(timer);
      resolve(r);
    };

    function onMotion(e: DeviceMotionEvent) {
      const a = e.accelerationIncludingGravity ?? e.acceleration;
      let strong = false;

      if (a && a.x != null && a.y != null && a.z != null) {
        const cur = { x: a.x, y: a.y, z: a.z };
        if (last) {
          const d = Math.hypot(cur.x - last.x, cur.y - last.y, cur.z - last.z);
          if (d >= ACCEL_THRESHOLD) strong = true;
        }
        last = cur;
      }

      const rot = e.rotationRate;
      if (!strong && rot) {
        const r = Math.hypot(rot.alpha ?? 0, rot.beta ?? 0, rot.gamma ?? 0);
        if (r >= ROTATION_THRESHOLD) strong = true;
      }

      if (strong) {
        hits++;
        onProgress?.(Math.min(1, hits / NEEDED_HITS));
        if (hits >= NEEDED_HITS) finish({ ok: true });
      }
    }

    const timer = setTimeout(() => finish({ ok: false, reason: "timeout" }), timeoutMs);
    window.addEventListener("devicemotion", onMotion as EventListener);
  });
}
