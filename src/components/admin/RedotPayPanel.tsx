import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { redotpayStatus, redotpayConnect, redotpayDisconnect } from "@/lib/redotpay.functions";

export function RedotPayPanel() {
  const qc = useQueryClient();
  const statusFn = useServerFn(redotpayStatus);
  const connectFn = useServerFn(redotpayConnect);
  const disconnectFn = useServerFn(redotpayDisconnect);

  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [warn, setWarn] = useState<{ error: string; serverIp: string | null } | null>(null);

  const status = useQuery({ queryKey: ["redotpay-status"], queryFn: () => statusFn() });
  const connected = Boolean((status.data as any)?.connected);

  async function connect(force = false) {
    if (apiKey.trim().length < 8 || apiSecret.trim().length < 8) {
      toast.error("أدخل مفتاح API والسر بشكل صحيح");
      return;
    }
    setBusy(true);
    try {
      const r: any = await connectFn({ data: { apiKey: apiKey.trim(), apiSecret: apiSecret.trim(), force } });
      if (r?.ok) {
        toast.success("تم ربط حساب RedotPay");
        setApiKey(""); setApiSecret(""); setWarn(null);
        qc.invalidateQueries({ queryKey: ["redotpay-status"] });
      } else {
        setWarn({ error: r?.error ?? "فشل الاتصال", serverIp: r?.serverIp ?? null });
        toast.error(r?.error ?? "فشل الاتصال");
      }
    } catch (e: any) {
      toast.error(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await disconnectFn();
      toast.success("تم فصل حساب RedotPay");
      qc.invalidateQueries({ queryKey: ["redotpay-status"] });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div dir="rtl" className="rounded-3xl border border-border/60 bg-card/70 p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs">
          <span className={`size-2 rounded-full ${connected ? "bg-emerald-400" : "bg-muted-foreground"}`} />
          <span className="text-muted-foreground">
            {connected ? `RedotPay مرتبط — ${(status.data as any)?.keyPreview ?? ""}` : "RedotPay غير مرتبط — أضف مفتاح API"}
          </span>
        </div>
        {connected && (
          <Button variant="destructive" size="sm" className="rounded-xl" disabled={busy} onClick={disconnect}>
            فصل الحساب
          </Button>
        )}
      </div>

      {!connected && (
        <div className="mt-4 grid gap-3">
          <div>
            <Label className="text-xs">API Key</Label>
            <Input value={apiKey} onChange={(e) => setApiKey(e.target.value)} dir="ltr" placeholder="RedotPay API Key" />
          </div>
          <div>
            <Label className="text-xs">API Secret</Label>
            <Input value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} dir="ltr" type="password" placeholder="RedotPay API Secret" />
          </div>
          <div className="flex gap-2">
            <Button className="rounded-xl" disabled={busy} onClick={() => connect(false)}>
              {busy ? "جاري الاختبار..." : "ربط الحساب"}
            </Button>
            {warn && (
              <Button variant="secondary" className="rounded-xl" disabled={busy} onClick={() => connect(true)}>
                احفظ رغم التحذير
              </Button>
            )}
          </div>
          {warn && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-[11px] leading-relaxed">
              <p className="text-amber-300">{warn.error}</p>
              {warn.serverIp && (
                <p className="mt-1 text-muted-foreground">
                  لو المفتاح مقيّد بـ IP، أضف عنوان الخادم: <span dir="ltr" className="font-mono">{warn.serverIp}</span>
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
