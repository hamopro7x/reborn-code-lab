import { Download } from "lucide-react";
import agentAsset from "../../../public/mag-pro-agent-windows.zip.asset.json";

const steps = [
  "نزّل ملف الوكيل على جهاز الموظف وفك الضغط (Extract All).",
  "افتح مجلد MagProAgent-win32-x64 واعمل دبل كليك على MagProAgent.exe.",
  "لو ظهرت شاشة حماية ويندوز اختر «More info» ثم «Run anyway».",
  "الموظف يكتب اسمه ويضغط «أوافق وسجّل الجهاز» — موافقة واحدة فقط لأول مرة.",
  "بعد التسجيل البرنامج يضيف نفسه لبدء تشغيل ويندوز: لو الموظف قفل اللابتوب وفتحه تاني يشتغل لوحده في الخلفية بدون أي خطوة منه.",
  "بعد كده الجهاز يظهر فوق في «أجهزة الموظفين المسجّلة»، واضغط «مشاهدة» أي وقت وهو متصل.",
];


export function AgentDownloadCard() {
  return (
    <div className="card-surface rounded-2xl p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold">برنامج المراقبة الخاص بنا (Windows)</h3>
          <p className="text-sm text-muted-foreground">
            موافقة واحدة من الموظف عند أول تشغيل — بعدها يعمل تلقائيًا في الخلفية وتشاهد شاشته
            من اللوحة وقت ما تحب زي سيستم كاميرات المراقبة.
          </p>
        </div>
        <a
          href={agentAsset.url}
          download="mag-pro-agent-windows.zip"
          className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <Download className="size-4 ml-1" /> تنزيل البرنامج
        </a>
      </div>
      <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">
        <strong>مهم:</strong> ده برنامج ويندوز — مش إضافة كروم. لا تحاول تحميله من صفحة
        <span dir="ltr" className="mx-1 font-mono">chrome://extensions</span>
        وإلا هتظهر رسالة «ملف البيان مفقود».
      </div>
      <ol className="text-sm text-muted-foreground space-y-1 list-decimal ps-5">
        {steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
    </div>
  );
}
