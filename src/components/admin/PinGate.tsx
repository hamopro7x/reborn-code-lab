/**
 * PinGate — shift handover behind a 6-digit PIN.
 *
 * The employee creates the PIN the first time they take over a shift; after
 * that every handover simply asks for it. The PIN is verified on the server
 * (hashed, with a short lockout after repeated wrong tries), so nothing here
 * can be bypassed from the browser.
 */
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { claimWorkShift, getMyPinStatus, setMyPin } from "@/lib/work.functions";

const DIGITS = /^\d*$/;

function PinField({
  value,
  onChange,
  onEnter,
  label,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onEnter: () => void;
  label: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-bold text-white/75">{label}</span>
      <Input
        dir="ltr"
        inputMode="numeric"
        autoComplete="off"
        type="password"
        maxLength={6}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          if (DIGITS.test(v)) onChange(v.slice(0, 6));
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") onEnter();
        }}
        className="h-12 text-center text-2xl font-black tracking-[0.5em]"
        placeholder="******"
      />
    </label>
  );
}

export function PinGate({
  open,
  onOpenChange,
  onClaimed,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onClaimed: () => void;
}) {
  const statusFn = useServerFn(getMyPinStatus);
  const createFn = useServerFn(setMyPin);
  const claimFn = useServerFn(claimWorkShift);

  const status = useQuery({
    queryKey: ["my-pin-status"],
    queryFn: () => statusFn() as Promise<{ hasPin: boolean }>,
    enabled: open,
    staleTime: 60_000,
  });

  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const qc = useQueryClient();
  const busyRef = useRef(false);

  useEffect(() => {
    if (!open) {
      setPin("");
      setPin2("");
      setError("");
      setBusy(false);
      busyRef.current = false;
    }
  }, [open]);

  const creating = status.data ? !status.data.hasPin : false;

  async function submit() {
    if (busyRef.current) return;
    setError("");
    if (pin.length !== 6) {
      setError("اكتب 6 أرقام");
      return;
    }
    if (creating && pin !== pin2) {
      setError("الرمزان غير متطابقين");
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      if (creating) {
        const res = (await createFn({ data: { pin } })) as { ok: boolean; error?: string };
        if (!res.ok) {
          setError(res.error ?? "تعذّر حفظ الرمز");
          return;
        }
        await qc.invalidateQueries({ queryKey: ["my-pin-status"] });
        toast.success("تم حفظ الرمز");
      }
      const claim = (await claimFn({ data: { pin } })) as { ok: boolean; error?: string };
      if (!claim.ok) {
        if (claim.error === "NO_PIN") {
          await qc.invalidateQueries({ queryKey: ["my-pin-status"] });
          setError("لم يتم العثور على رمز — أنشئ رمزًا جديدًا");
          return;
        }
        setError(claim.error ?? "تعذّر استلام الشغل");
        return;
      }
      toast.success("تم استلام الشغل");
      onOpenChange(false);
      onClaimed();
    } catch (e: any) {
      setError(String(e?.message ?? e).slice(0, 160));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-right text-base font-black">
            <KeyRound className="size-4 text-blue-400" />
            {creating ? "إنشاء رمز الاستلام" : "أدخل رمز الاستلام"}
          </DialogTitle>
        </DialogHeader>

        {status.isLoading ? (
          <div className="grid h-24 place-items-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-center text-xs font-bold text-white/70">
              {creating
                ? "أنشئ رمزًا من 6 أرقام تستخدمه في كل استلام شغل"
                : "اكتب رمزك السري المكوّن من 6 أرقام"}
            </p>

            <PinField
              autoFocus
              label={creating ? "الرمز الجديد" : "الرمز السري"}
              value={pin}
              onChange={setPin}
              onEnter={() => void submit()}
            />
            {creating && (
              <PinField
                label="تأكيد الرمز"
                value={pin2}
                onChange={setPin2}
                onEnter={() => void submit()}
              />
            )}

            {error && (
              <p className="rounded-xl bg-destructive/15 px-3 py-2 text-center text-xs font-bold text-destructive">
                {error}
              </p>
            )}

            <Button
              className="w-full gap-2 font-black"
              disabled={busy}
              onClick={() => void submit()}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
              {creating ? "حفظ واستلام الشغل" : "استلام الشغل"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Hook helper: gives a starter + the gate node to render. */
export function usePinClaim(onClaimed: () => void) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  return {
    open,
    start: () => setOpen(true),
    node: (
      <PinGate
        open={open}
        onOpenChange={setOpen}
        onClaimed={() => {
          qc.invalidateQueries({ queryKey: ["my-work-state"] });
          onClaimed();
        }}
      />
    ),
  };
}
