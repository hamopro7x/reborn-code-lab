// الإصدار المنشور من برنامج الموظف (حزمة Mag Pro Connect الجديدة).
// هذا الملف يُحدَّث تلقائياً بواسطة: node agent/release.mjs
// دائماً آخر إصدار فقط — البرنامج ينزل هذا الإصدار مباشرة ولا يمر بأي
// إصدارات وسيطة بالترتيب.
export const AGENT_RELEASE = {
  version: "3.1.20",
  notes: "تسريع قناة الإشارات: تبادل فوري أثناء المصافحة يقلل زمن بدء البث وتأخير الشاشة.",
  url: "https://mag-pro1.com/api/public/agent-download.exe",
  storageBucket: "site-assets",
  storagePath: "releases/MagProConnect-Setup-3.1.20.exe",
  size: 110524980,
  sha256: "00570ec6b4d156236d00e6edf7646b7ce991957c6375206e57321794f85d2857",
} as const;
