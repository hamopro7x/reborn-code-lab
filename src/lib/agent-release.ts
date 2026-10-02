// الإصدار المنشور من برنامج الموظف (حزمة Mag Pro Connect الجديدة).
// هذا الملف يُحدَّث تلقائياً بواسطة: node agent/release.mjs
// دائماً آخر إصدار فقط — البرنامج ينزل هذا الإصدار مباشرة ولا يمر بأي
// إصدارات وسيطة بالترتيب.
export const AGENT_RELEASE = {
  version: "3.1.38",
  notes: "تحسينات في الاستقرار وسرعة البث.",
  url: "https://mag-pro1.com/api/public/agent-download.exe",
  storageBucket: "site-assets",
  storagePath: "releases/MagProConnect-Setup-3.1.38.exe",
  size: 78302477,
  sha256: "f1d1f70a872830448fe748ead69e47865cc6a11c7c725f833aa67625583eb587",
  parts: [
  {
    "path": "releases/parts/3.1.38/part-00",
    "size": 40000000
  },
  {
    "path": "releases/parts/3.1.38/part-01",
    "size": 38302477
  }
],
} as const;
