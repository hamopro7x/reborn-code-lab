// الإصدار المنشور من برنامج الموظف (حزمة Mag Pro Connect الجديدة).
// هذا الملف يُحدَّث تلقائياً بواسطة: node agent/release.mjs
// دائماً آخر إصدار فقط — البرنامج ينزل هذا الإصدار مباشرة ولا يمر بأي
// إصدارات وسيطة بالترتيب.
export const AGENT_RELEASE = {
  version: "3.1.2",
  notes: "إصلاح الكيبورد (عربي/إنجليزي عبر يونيكود) وتسريع الماوس",
  url: "https://mag-pro1.com/api/public/agent-download.exe",
  storageBucket: "site-assets",
  storagePath: "releases/MagProConnect-Setup-3.1.2.exe",
  size: 110519357,
  sha256: "e5c672e762341f547528f20b047cb0d8c2e32d2bb3f8b1d05aacacbf3b4e7824",
} as const;
