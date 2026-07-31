import { Button } from "@/components/ui/button";
import { Download, Copy } from "lucide-react";
import { toast } from "sonner";

const steps = [
  "نزّل ملف الإضافة على جهاز الموظف وفك الضغط (Extract All).",
  "افتح كروم واكتب في العنوان: chrome://extensions",
  "شغّل «وضع المطوّر / Developer mode» من أعلى اليمين.",
  "اضغط «Load unpacked» واختر المجلد اللي فكّيت ضغطه.",
  "اضغط على أيقونة الإضافة ← «بدء المشاركة» ← اختر الشاشة، هيظهر كود من 6 خانات.",
  "اكتب الكود في «مشاهدة شاشة موظف» تحت وهتشوف شاشته مباشرة.",
];

export function ExtensionDownloadCard() {
  const download = () => {
    fetch("/mag-pro-extension.zip")
      .then((res) => {
        if (!res.ok) throw new Error(`فشل التنزيل: ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "mag-pro-extension.zip";
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch((err) => toast.error(err.message));
  };

  return (
    <div className="card-surface rounded-2xl p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold">إضافة كروم الخاصة بنا</h3>
          <p className="text-sm text-muted-foreground">
            إضافة متصفح (Chrome / Edge) تُثبَّت على جهاز الموظف وتبث شاشته لهذه اللوحة مباشرة.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={download}>
            <Download className="size-4 ml-1" /> تنزيل الإضافة
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              void navigator.clipboard.writeText(`${window.location.origin}/mag-pro-extension.zip`);
              toast.success("تم نسخ رابط التنزيل");
            }}
          >
            <Copy className="size-4 ml-1" /> نسخ الرابط
          </Button>
        </div>
      </div>
      <ol className="text-sm text-muted-foreground space-y-1 list-decimal ps-5">
        {steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
    </div>
  );
}
