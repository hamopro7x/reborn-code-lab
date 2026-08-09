// الإصدار المنشور من برنامج الموظف (حزمة Mag Pro Connect الجديدة).
// هذا الملف يُحدَّث تلقائياً بواسطة: node agent/release.mjs
// دائماً آخر إصدار فقط — البرنامج ينزل هذا الإصدار مباشرة ولا يمر بأي
// إصدارات وسيطة بالترتيب.
export const AGENT_RELEASE = {
  version: "3.1.13",
  notes: "تحسين تشغيل البث في الخلفية ومنع التجمّد عند ضعف الإنترنت مع استعادة الجودة تلقائياً.",
  url: "https://mag-pro1.com/api/public/agent-download.exe",
  storageBucket: "site-assets",
  storagePath: "releases/MagProConnect-Setup-3.1.13.exe",
  size: 110523695,
  sha256: "ff8f2a5a6474b4e1553d356c0f086d983e4236f17464732fbf4cb5ca40265c34",
} as const;
