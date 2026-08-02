import { Download } from "lucide-react";

const steps = [
  "نزّل ملف التثبيت MagPro-Setup.exe على جهاز الموظف (حزمة Mag Pro الجديدة).",
  "دبل كليك على الملف → لو ظهرت شاشة حماية ويندوز اختر «More info» ثم «Run anyway».",
  "التثبيت صامت تمامًا — مفيش نافذة أوامر ولا خطوات، البرنامج يفتح لوحده بعد ثوانٍ.",
  "الموظف يكتب اسمه ويضغط «أوافق وسجّل الجهاز» — موافقة واحدة فقط لأول مرة.",
  "البرنامج بيتسجّل في التشغيل التلقائي لويندوز، فبعد إيقاف الجهاز وتشغيله يبدأ وحده في الخلفية.",
  "لإزالته: لوحة التحكم → «إضافة أو إزالة البرامج» → Mag Pro → Uninstall.",
  "بعد كده الجهاز يظهر فوق في «أجهزة الموظفين المسجّلة»، واضغط «مشاهدة» أي وقت وهو متصل.",
  "لو حذفت الجهاز من اللوحة: البرنامج عند الموظف هيعرض «مفتاح ربط» — اكتبه في خانة «إضافة جهاز بمفتاح الربط» فوق ليرجع يعمل دائمًا.",
  "التحديثات بعد كده تنزل وتتثبت لوحدها بصمت وبآخر إصدار مباشرة — الموظف مش محتاج يعمل أي حاجة.",

];

export function AgentDownloadCard() {
  return (
    <div className="card-surface rounded-2xl p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold">برنامج المراقبة الخاص بنا (Windows) — نسخة تثبيت</h3>
          <p className="text-sm text-muted-foreground">
            ملف تثبيت رسمي (Setup) يتثبت ويتشال زي أي برنامج ويندوز. موافقة واحدة من الموظف عند
            أول تشغيل — بعدها يعمل تلقائيًا في الخلفية وتشاهد شاشته من اللوحة وقت ما تحب.
          </p>
        </div>
        <a
          href="/api/public/agent-download.exe"
          download="MagPro-Setup.exe"
          className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <Download className="size-4 ml-1" /> تنزيل ملف التثبيت
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
