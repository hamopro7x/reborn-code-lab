// الإصدار المنشور من برنامج الموظف (حزمة Mag Pro Connect الجديدة).
// هذا الملف يُحدَّث تلقائياً بواسطة: node agent/release.mjs
// دائماً آخر إصدار فقط — البرنامج ينزل هذا الإصدار مباشرة ولا يمر بأي
// إصدارات وسيطة بالترتيب.
export const AGENT_RELEASE = {
  version: "3.1.11",
  notes: "إصلاح ثبات بث الشاشة على الشبكات الضعيفة ومنع قطع الاتصال الخاطئ عند ثبات الصورة.",
  url: "https://mag-pro1.com/api/public/agent-download.exe",
  storageBucket: "site-assets",
  storagePath: "releases/MagProConnect-Setup-3.1.11.exe",
  size: 110522851,
  sha256: "81819f6b57119fff5c64bbdd948c41f2dbcfa2d544fc822a354cc2b4f4c8cb38",
} as const;
