// الإصدار المنشور من برنامج الموظف (حزمة Mag Pro Connect الجديدة).
// هذا الملف يُحدَّث تلقائياً بواسطة: node agent/release.mjs
// دائماً آخر إصدار فقط — البرنامج ينزل هذا الإصدار مباشرة ولا يمر بأي
// إصدارات وسيطة بالترتيب.
export const AGENT_RELEASE = {
  version: "3.1.15",
  notes: "منع تضارب محاولات إعادة الاتصال، تنظيف الاتصالات المعلقة، وتكرار إصلاح ICE تلقائياً بدون قطع البث السليم.",
  url: "https://mag-pro1.com/api/public/agent-download.exe",
  storageBucket: "site-assets",
  storagePath: "releases/MagProConnect-Setup-3.1.15.exe",
  size: 110523853,
  sha256: "42f22e85f596bfa9659fba6d2bf01ec58a2d631fcd0b4aa12fe57fadfe532411",
} as const;
