// الإصدار المنشور من برنامج الموظف (حزمة Mag Pro Connect الجديدة).
// هذا الملف يُحدَّث تلقائياً بواسطة: node agent/release.mjs
// دائماً آخر إصدار فقط — البرنامج ينزل هذا الإصدار مباشرة ولا يمر بأي
// إصدارات وسيطة بالترتيب.
export const AGENT_RELEASE = {
  version: "3.1.22",
  notes: "تحسين جودة البث: صورة أوضح وحركة أنعم مع معدل بت أعلى وسقف دقة 1440p.",
  url: "https://mag-pro1.com/api/public/agent-download.exe",
  storageBucket: "site-assets",
  storagePath: "releases/MagProConnect-Setup-3.1.22.exe",
  size: 110525071,
  sha256: "c0876cea33aa5fd04e791b0e2016da40069ec579ffd1d6bc7cf0bcedf7e3e961",
} as const;
