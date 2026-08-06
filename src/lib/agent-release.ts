// الإصدار المنشور من برنامج الموظف (حزمة Mag Pro الجديدة).
// هذا الملف يُحدَّث تلقائياً بواسطة: node agent/release.mjs
// دائماً آخر إصدار فقط — البرنامج ينزل هذا الإصدار مباشرة ولا يمر بأي
// إصدارات وسيطة بالترتيب.
export const AGENT_RELEASE = {
  version: "2.0.12",
  notes: "إصلاح عدم بدء البث: قبول إجابة المشاهد في كل الحالات، إعادة بناء الاتصال العالق، ورشقة إطارات مفتاحية عند الاتصال.",
  url: "https://mag-pro1.com/api/public/agent-download.exe",
  storageBucket: "site-assets",
  storagePath: "releases/MagPro-Setup-2.0.12.exe",
  size: 110515067,
  sha256: "11b3b22026f7dc8b91c28fcef4136181f75d220bbb36758ccd953102a96dc388",
} as const;
