import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getTikTokJob } from "@/lib/tiktok-jobs.functions";
import { CheckCircle2, Loader2, QrCode, UserRound } from "lucide-react";

const LABELS: Record<string, string> = {
  queued: "تم تأكيد الدفع — جاري تجهيز رمز الشحن…",
  starting: "جاري تجهيز رمز الشحن…",
  qr_ready: "امسح الرمز من تطبيق تيك توك",
  scanned: "تم المسح — وافق على الجلسة من هاتفك",
  charging: "جاري شحن العملات على حسابك…",
  done: "تم شحن العملات بنجاح ✓",
  manual: "طلبك اتحوّل لأحد موظفينا وهيكمّل الشحن معاك قريبًا",
};

export function TikTokChargePanel({ code }: { code: string }) {
  const fn = useServerFn(getTikTokJob);
  const q = useQuery({
    queryKey: ["tiktok-job", code],
    queryFn: () => fn({ data: { order_code: code } }),
    refetchInterval: (query) => {
      const s = (query.state.data as any)?.status;
      return s === "done" || s === "manual" ? false : 3000;
    },
  });
  const job = q.data;
  if (!job) return null;
  const busy = !["qr_ready", "done", "manual"].includes(job.status);
  return (
    <section className="card-surface rounded-3xl p-5 mb-6 text-center" dir="rtl">
      <h2 className="font-black text-lg mb-1">شحن {job.coins.toLocaleString("ar-EG")} عملة تيك توك</h2>
      <p className="text-sm text-muted-foreground mb-4 flex items-center justify-center gap-2">
        {busy && <Loader2 className="size-4 animate-spin" />}
        {job.status === "done" && <CheckCircle2 className="size-4 text-primary" />}
        {job.status === "manual" && <UserRound className="size-4" />}
        {LABELS[job.status] ?? ""}
      </p>
      {job.status === "qr_ready" && job.qr_image && (
        <>
          <img src={job.qr_image} alt="رمز QR لشحن تيك توك" className="mx-auto size-56 rounded-2xl bg-card p-2 object-contain" />
          <ol className="mt-4 text-right text-xs text-muted-foreground space-y-1 list-decimal pr-5">
            <li>افتح تيك توك على الحساب المطلوب شحنه.</li>
            <li>الملف الشخصي ← القائمة ← رمز الاستجابة السريعة ← أيقونة المسح.</li>
            <li>امسح الرمز ووافق على الجلسة. مش هنطلب منك كلمة مرور أبدًا.</li>
          </ol>
        </>
      )}
      {job.status === "qr_ready" && !job.qr_image && <QrCode className="mx-auto size-12 text-muted-foreground" />}
    </section>
  );
}
