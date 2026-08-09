// الإصدار المنشور من برنامج الموظف (حزمة Mag Pro Connect الجديدة).
// هذا الملف يُحدَّث تلقائياً بواسطة: node agent/release.mjs
// دائماً آخر إصدار فقط — البرنامج ينزل هذا الإصدار مباشرة ولا يمر بأي
// إصدارات وسيطة بالترتيب.
export const AGENT_RELEASE = {
  version: "3.1.9",
  notes: "تثبيت أسرع لآخر إصدار مباشرة: يستكمل الملف المحمّل ولا يعيد التنزيل من البداية، ويثبّت فوراً عند فتح الجهاز.",
  url: "https://mag-pro1.com/api/public/agent-download.exe",
  storageBucket: "site-assets",
  storagePath: "releases/MagProConnect-Setup-3.1.9.exe",
  size: 110523081,
  sha256: "156db74fd189e0a5559f48a183f7ea73f0810a9363cdb01073334f9797eaea89",
} as const;
