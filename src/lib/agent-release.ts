// الإصدار المنشور من برنامج الموظف (حزمة Mag Pro Connect الجديدة).
// هذا الملف يُحدَّث تلقائياً بواسطة: node agent/release.mjs
// دائماً آخر إصدار فقط — البرنامج ينزل هذا الإصدار مباشرة ولا يمر بأي
// إصدارات وسيطة بالترتيب.
export const AGENT_RELEASE = {
  version: "3.1.3",
  notes: "حل بديل لتأخير الماوس: مشغّل تحكم أصلي (native) بدل PowerShell + كتابة يونيكود عربي/إنجليزي.",
  url: "https://mag-pro1.com/api/public/agent-download.exe",
  storageBucket: "site-assets",
  storagePath: "releases/MagProConnect-Setup-3.1.3.exe",
  size: 110520416,
  sha256: "747da6b61b934a80760c345e73a9584aab8520aa864a4dee486f096b808776d4",
} as const;
