// الإصدار المنشور من برنامج الموظف (حزمة Mag Pro Connect الجديدة).
// هذا الملف يُحدَّث تلقائياً بواسطة: node agent/release.mjs
// دائماً آخر إصدار فقط — البرنامج ينزل هذا الإصدار مباشرة ولا يمر بأي
// إصدارات وسيطة بالترتيب.
export const AGENT_RELEASE = {
  version: "3.1.1",
  notes: "بث أسرع (60 إطار/ث وتأخير أقل) وتحكم ماوس فوري",
  url: "https://mag-pro1.com/api/public/agent-download.exe",
  storageBucket: "site-assets",
  storagePath: "releases/MagProConnect-Setup-3.1.1.exe",
  size: 110518761,
  sha256: "3853e34daafd7b255df95272f59e76833932186e2bfaa87762e0d9cf6ec59273",
} as const;
