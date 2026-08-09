// الإصدار المنشور من برنامج الموظف (حزمة Mag Pro Connect الجديدة).
// هذا الملف يُحدَّث تلقائياً بواسطة: node agent/release.mjs
// دائماً آخر إصدار فقط — البرنامج ينزل هذا الإصدار مباشرة ولا يمر بأي
// إصدارات وسيطة بالترتيب.
export const AGENT_RELEASE = {
  version: "3.1.12",
  notes: "إصلاح نهائي لاتصال الشاشة عبر TURN وتنظيف جلسات البث القديمة المتراكمة.",
  url: "https://mag-pro1.com/api/public/agent-download.exe",
  storageBucket: "site-assets",
  storagePath: "releases/MagProConnect-Setup-3.1.12.exe",
  size: 110523166,
  sha256: "c76d1e167ee955a151de8ff433cc7e3c7be624cb4da99bfd7af29a83a675da25",
} as const;
