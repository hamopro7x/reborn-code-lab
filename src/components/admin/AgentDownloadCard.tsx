import { Button } from "@/components/ui/button";
import { Download, Copy } from "lucide-react";
import { toast } from "sonner";
import agentAsset from "../../../public/mag-pro-agent-windows.zip.asset.json";

const steps = [
  "نزّل ملف الوكيل على جهاز الموظف وفك الضغط (Extract All).",
  "افتح مجلد MagProAgent-win32-x64 واعمل دبل كليك على MagProAgent.exe.",
  "لو ظهرت شاشة حماية ويندوز اختر «More info» ثم «Run anyway».",
  "هيظهر كود من 6 حروف وأرقام — اكتبه في «مشاهدة شاشة موظف» تحت وهتشوف شاشته مباشرة.",
];

export function AgentDownloadCard() {
  const download = () => {
    fetch(agentAsset.url)
      .then((res) => {
        if (!res.ok) throw new Error(`فشل التنزيل: ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "mag-pro-agent-windows.zip";
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch((err) => toast.error(err.message));
  };

  return (
    <div className="card-surface rounded-2xl p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold">برنامج الوكيل الخاص بنا (Windows)</h3>
          <p className="text-sm text-muted-foreground">
            استضافة خاصة بالكامل — يثبَّت على جهاز الموظف ويبث شاشته لهذه اللوحة بدون أي خدمة خارجية.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={download}>
            <Download className="size-4 ml-1" /> تنزيل الوكيل
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              void navigator.clipboard.writeText(`${window.location.origin}${agentAsset.url}`);
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
