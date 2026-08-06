// الإصدار المنشور من برنامج الموظف (حزمة Mag Pro الجديدة).
// هذا الملف يُحدَّث تلقائياً بواسطة: node agent/release.mjs
// دائماً آخر إصدار فقط — البرنامج ينزل هذا الإصدار مباشرة ولا يمر بأي
// إصدارات وسيطة بالترتيب.
export const AGENT_RELEASE = {
  version: "2.0.15",
  notes: "إصلاح نهائي لتشغيل جميع شاشات الموظفين معاً: تقليل تزاحم طلبات الإشارات وتوزيعها بين الأجهزة، وتنظيف رسائل كل جهاز بصورة مستقلة.",
  url: "https://mag-pro1.com/api/public/agent-download.exe",
  storageBucket: "site-assets",
  storagePath: "releases/MagPro-Setup-2.0.15.exe",
  size: 110515703,
  sha256: "6dce19bf803e3d8c8dfc64438c3489cdf61d6d7c124daa65d61696500fc91a2e",
} as const;
