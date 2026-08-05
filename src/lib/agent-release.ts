// الإصدار المنشور من برنامج الموظف (حزمة Mag Pro الجديدة).
// هذا الملف يُحدَّث تلقائياً بواسطة: node agent/release.mjs
// دائماً آخر إصدار فقط — البرنامج ينزل هذا الإصدار مباشرة ولا يمر بأي
// إصدارات وسيطة بالترتيب.
export const AGENT_RELEASE = {
  version: "2.0.10",
  notes: "منع توقف واجهة البرنامج بإزالة اعتماد التشغيل الخارجي وإضافة استعادة تلقائية عند تجمد الواجهة أو تعطلها.",
  url: "https://mag-pro1.com/api/public/agent-download.exe",
  storageBucket: "site-assets",
  storagePath: "releases/MagPro-Setup-2.0.10.exe",
  size: 110514525,
  sha256: "539000c312a43f3c10ef4f3aec9cf6528bf426402070b5ecc58b1fc25c64cbe5",
} as const;
