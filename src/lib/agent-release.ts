// الإصدار المنشور من برنامج الموظف (حزمة Mag Pro Connect الجديدة).
// هذا الملف يُحدَّث تلقائياً بواسطة: node agent/release.mjs
// دائماً آخر إصدار فقط — البرنامج ينزل هذا الإصدار مباشرة ولا يمر بأي
// إصدارات وسيطة بالترتيب.
export const AGENT_RELEASE = {
  version: "3.0.0",
  notes: "حزمة Mag Pro Connect جديدة بالكامل: إزالة Mag Pro القديم تلقائياً، منع تعارض النسخ، نقل تسجيل الجهاز، وتحسين استقرار اتصال جميع الشاشات.",
  url: "https://mag-pro1.com/api/public/agent-download.exe",
  storageBucket: "site-assets",
  storagePath: "releases/MagProConnect-Setup-3.0.0.exe",
  size: 110516206,
  sha256: "a962505f416672ae47c5fef03ba1eaf2d8d4629ae8d13370f4bf0b446ea2ccac",
} as const;
