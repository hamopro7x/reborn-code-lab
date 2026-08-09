// الإصدار المنشور من برنامج الموظف (حزمة Mag Pro Connect الجديدة).
// هذا الملف يُحدَّث تلقائياً بواسطة: node agent/release.mjs
// دائماً آخر إصدار فقط — البرنامج ينزل هذا الإصدار مباشرة ولا يمر بأي
// إصدارات وسيطة بالترتيب.
export const AGENT_RELEASE = {
  version: "3.1.6",
  notes: "حارس ذاتي يجدّد التقاط الشاشة والاتصال تلقائياً كل بضع دقائق لمنع تجمّد البث.",
  url: "https://mag-pro1.com/api/public/agent-download.exe",
  storageBucket: "site-assets",
  storagePath: "releases/MagProConnect-Setup-3.1.6.exe",
  size: 110521789,
  sha256: "79531c1d60bb5cc737f9a6be7062fa19ac4eba14a23923c1ec43ce9a7227c0cc",
} as const;
