import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getTikTokAdmin, saveTikTokAdmin, setTikTokJobStatus } from "@/lib/tiktok-jobs.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

const STATUS: Record<string, string> = {
  queued: "في الانتظار", starting: "بيبدأ", qr_ready: "الرمز ظاهر للعميل", scanned: "اتمسح",
  charging: "بيشحن", done: "تم ✓", manual: "يدوي",
};

export function TikTokAutoPanel() {
  const qc = useQueryClient();
  const getFn = useServerFn(getTikTokAdmin);
  const saveFn = useServerFn(saveTikTokAdmin);
  const setFn = useServerFn(setTikTokJobStatus);
  const q = useQuery({ queryKey: ["tiktok-admin"], queryFn: () => getFn(), refetchInterval: 5000 });
  const d = q.data;
  const [enabled, setEnabled] = useState(false);
  const [limit, setLimit] = useState("0");
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => { if (d) { setEnabled(d.enabled); setLimit(String(d.daily_limit_egp)); } }, [d?.enabled, d?.daily_limit_egp]);

  async function save(newToken = false) {
    try {
      const r = await saveFn({ data: { enabled, daily_limit_egp: Number(limit) || 0, new_token: newToken } });
      if (r.token) setToken(r.token);
      toast.success("اتحفظ");
      qc.invalidateQueries({ queryKey: ["tiktok-admin"] });
    } catch (e: any) { toast.error(e?.message ?? "حصل خطأ"); }
  }
  async function setStatus(id: string, status: "manual" | "done" | "queued") {
    await setFn({ data: { id, status } });
    qc.invalidateQueries({ queryKey: ["tiktok-admin"] });
  }

  if (q.isError) return <p className="text-sm text-destructive">لازم تشغّل ملف SQL الخاص بشحن تيك توك الأول.</p>;
  return (
    <div className="space-y-4 text-right" dir="rtl">
      <div className="rounded-2xl border border-border/60 bg-card/50 p-4 space-y-3">
        <h2 className="text-sm font-black">شحن تيك توك الأوتوماتيك</h2>
        <label className="flex items-center justify-between gap-3 text-sm">
          تشغيل الشحن الأوتوماتيك <Switch checked={enabled} onCheckedChange={setEnabled} />
        </label>
        <label className="block text-sm">الحد الأقصى في اليوم (جنيه، 0 = بدون حد)
          <Input type="number" min={0} value={limit} onChange={(e) => setLimit(e.target.value)} className="mt-1" />
        </label>
        <p className="text-xs text-muted-foreground">اتصرف النهارده: {Math.round(d?.spent_today ?? 0)} جنيه</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => save(false)}>حفظ</Button>
          <Button variant="outline" onClick={() => save(true)}>{d?.has_token ? "مفتاح عامل جديد" : "إنشاء مفتاح العامل"}</Button>
        </div>
        {token && (
          <div className="rounded-xl bg-muted p-3 text-xs break-all" dir="ltr">
            <p className="mb-1 text-right" dir="rtl">انسخ المفتاح ده دلوقتي وحطه في إعدادات العامل على السيرفر (مش هيظهر تاني):</p>
            {token}
          </div>
        )}
      </div>
      <div className="rounded-2xl border border-border/60 bg-card/50 p-4">
        <h3 className="text-sm font-black mb-3">آخر عمليات الشحن</h3>
        {!d?.jobs.length ? <p className="text-xs text-muted-foreground">مفيش عمليات لسه.</p> : (
          <div className="space-y-2">
            {d.jobs.map((j: any) => (
              <div key={j.id} className="rounded-xl border border-border/50 p-3 text-xs flex flex-wrap items-center gap-2 justify-between">
                <div>
                  <b>{j.order_code}</b> — {j.customer} — {Number(j.coins).toLocaleString("ar-EG")} عملة
                  <div className="text-muted-foreground">{STATUS[j.status] ?? j.status}{j.error ? ` — ${j.error}` : ""}</div>
                </div>
                <div className="flex gap-1">
                  {j.status !== "done" && j.status !== "manual" && <Button size="sm" variant="outline" onClick={() => setStatus(j.id, "manual")}>كمّل يدوي</Button>}
                  {j.status === "manual" && <Button size="sm" variant="outline" onClick={() => setStatus(j.id, "queued")}>إعادة المحاولة</Button>}
                  {j.status !== "done" && <Button size="sm" onClick={() => setStatus(j.id, "done")}>تم الشحن</Button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
