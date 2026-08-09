// الإصدار المنشور من برنامج الموظف (حزمة Mag Pro Connect الجديدة).
// هذا الملف يُحدَّث تلقائياً بواسطة: node agent/release.mjs
// دائماً آخر إصدار فقط — البرنامج ينزل هذا الإصدار مباشرة ولا يمر بأي
// إصدارات وسيطة بالترتيب.
export const AGENT_RELEASE = {
  version: "3.1.5",
  notes: "استعادة اتصال البث بدون تجمد: معالجة تفاوض ICE المتزامن، إزالة المسارات القديمة، ومنع ضياع مرشحات الاتصال.",
  url: "https://mag-pro1.com/api/public/agent-download.exe",
  storageBucket: "site-assets",
  storagePath: "releases/MagProConnect-Setup-3.1.5.exe",
  size: 110521001,
  sha256: "36f91fa4c6095a87553d106f99d0b4a8aaa331bf91ffd5143e20faff99d3e06d",
} as const;
