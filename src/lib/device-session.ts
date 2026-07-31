// Session-scoped cache so we don't recompute fingerprint or re-hit
// checkDevice on every route navigation.
import { getDeviceFingerprint } from "./device";

let fpPromise: Promise<string> | null = null;
export function getCachedFingerprint(): Promise<string> {
  if (!fpPromise) fpPromise = getDeviceFingerprint();
  return fpPromise;
}

let deviceOk: boolean | null = null;
let deviceCheckPromise: Promise<{ ok: boolean; fingerprint: string }> | null = null;

export function getCachedDeviceOk(): boolean | null {
  return deviceOk;
}

export function ensureDeviceChecked(
  checkFn: (args: { data: { fingerprint: string; user_agent?: string } }) => Promise<any>,
): Promise<{ ok: boolean; fingerprint: string }> {
  if (deviceCheckPromise) return deviceCheckPromise;
  deviceCheckPromise = (async () => {
    const fingerprint = await getCachedFingerprint();
    try {
      const res: any = await checkFn({ data: { fingerprint, user_agent: navigator.userAgent } });
      deviceOk = !!res?.ok;
      return { ok: deviceOk, fingerprint };
    } catch {
      deviceOk = false;
      return { ok: false, fingerprint };
    }
  })();
  return deviceCheckPromise;
}

export function resetDeviceCache() {
  fpPromise = null;
  deviceOk = null;
  deviceCheckPromise = null;
}