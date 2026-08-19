import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getWorkAuthChallenge, registerWorkDevice, claimWorkShift } from "@/lib/work.functions";
import { biometricSupported, registerBiometric, assertBiometric, captureFace } from "@/lib/work-client";

/** Face + device biometric claim flow, shared by the employee and admin views. */
export function useClaimWork(onClaimed: () => void) {
  const challengeFn = useServerFn(getWorkAuthChallenge);
  const registerFn = useServerFn(registerWorkDevice);
  const claimFn = useServerFn(claimWorkShift);
  const [busy, setBusy] = useState<"claim" | "device" | null>(null);

  const enrollDevice = async () => {
    if (!biometricSupported()) return toast.error("هذا الجهاز/المتصفح لا يدعم المصادقة البيومترية");
    setBusy("device");
    try {
      const { challenge, userId } = await challengeFn({ data: { purpose: "register" } });
      const cred = await registerBiometric({ challenge, userId, name: "Mag Pro" });
      await registerFn({ data: { ...cred, label: navigator.platform || "device" } });
      toast.success("تم تسجيل مصادقة هذا الجهاز");
    } catch (e) {
      toast.error((e as Error).message || "فشل تسجيل الجهاز");
    } finally {
      setBusy(null);
    }
  };

  const claim = async () => {
    setBusy("claim");
    try {
      const { challenge, credentials } = await challengeFn({ data: { purpose: "auth" } });
      if (!credentials.length) {
        await enrollDevice();
        setBusy("claim");
      }
      const ready = credentials.length
        ? credentials
        : (await challengeFn({ data: { purpose: "auth" } })).credentials;
      if (!ready.length) {
        toast.error("سجّل مصادقة الجهاز أولاً");
        return;
      }
      const fresh = await challengeFn({ data: { purpose: "auth" } });
      const face = await captureFace();
      const sig = await assertBiometric({
        challenge: fresh.challenge,
        credentialIds: fresh.credentials.map((c) => c.id),
      });
      const res = await claimFn({ data: { faceImage: face, ...sig } });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("تم استلام الشغل");
      onClaimed();
    } catch (e) {
      toast.error((e as Error).message || "فشل استلام الشغل");
    } finally {
      setBusy(null);
    }
  };

  return { busy, claim, enrollDevice };
}
