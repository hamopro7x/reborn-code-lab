// Session-scoped cache so we don't recompute fingerprint or re-hit
// checkDevice on every route navigation.
import { getDeviceFingerprint, getDeviceSignature, getLegacyDeviceFingerprint } from "./device";

let fpPromise: Promise<string> | null = null;
export function getCachedFingerprint(): Promise<string> {
  if (!fpPromise) fpPromise = getDeviceFingerprint();
  return fpPromise;
}

let sigPromise: Promise<string> | null = null;
export function getCachedSignature(): Promise<string> {
  if (!sigPromise) sigPromise = getDeviceSignature();
  return sigPromise;
}

let legacyPromise: Promise<string> | null = null;
function getCachedLegacy(): Promise<string> {
  if (!legacyPromise) legacyPromise = getLegacyDeviceFingerprint();
  return legacyPromise;
}

let deviceOk: boolean | null = null;
let deviceCheckPromise: Promise<{ ok: boolean; fingerprint: string; error?: string }> | null = null;

export function getCachedDeviceOk(): boolean | null {
  return deviceOk;
}

export function ensureDeviceChecked(
  checkFn: (args: {
    data: { fingerprint: string; user_agent?: string; hw_signature?: string; legacy_fingerprint?: string };
  }) => Promise<any>,
): Promise<{ ok: boolean; fingerprint: string; error?: string }> {
  if (deviceCheckPromise) return deviceCheckPromise;
  deviceCheckPromise = (async () => {
    const [fingerprint, hw_signature, legacy_fingerprint] = await Promise.all([
      getCachedFingerprint(),
      getCachedSignature(),
      getCachedLegacy(),
    ]);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res: any = await checkFn({
          data: { fingerprint, user_agent: navigator.userAgent, hw_signature, legacy_fingerprint },
        });
        if (res?.error) throw new Error(String(res.error));
        if (typeof res?.ok !== "boolean") throw new Error("تعذّر التحقق من الجهاز");
        deviceOk = res.ok;
        return { ok: res.ok, fingerprint };
      } catch (e) {
        const error = (e as Error)?.message || "تعذّر التحقق من الجهاز";
        const transient = /internal server|\b50[234]\b|fetch|network|timeout|timed out|شبكة/i.test(error);
        if (transient && attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
          continue;
        }
        // A failed check is unknown, not an authorization decision. Do not
        // retain the rejected promise across navigation or manual retries.
        deviceOk = null;
        deviceCheckPromise = null;
        return { ok: false, fingerprint, error };
      }
    }
    return { ok: false, fingerprint, error: "تعذّر التحقق من الجهاز" };
  })();
  return deviceCheckPromise;
}

export function resetDeviceCache() {
  fpPromise = null;
  sigPromise = null;
  legacyPromise = null;
  deviceOk = null;
  deviceCheckPromise = null;
}
