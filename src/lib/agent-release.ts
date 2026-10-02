// الإصدار المنشور من برنامج الموظف (حزمة Mag Pro Connect الجديدة).
// هذا الملف يُحدَّث تلقائياً بواسطة: node agent/release.mjs
// دائماً آخر إصدار فقط — البرنامج ينزل هذا الإصدار مباشرة ولا يمر بأي
// إصدارات وسيطة بالترتيب.
export const AGENT_RELEASE = {
  version: "3.1.37",
  notes: "تحسينات في الاستقرار وسرعة البث.",
  url: "https://mag-pro1.com/api/public/agent-download.exe",
  storageBucket: "site-assets",
  storagePath: "releases/MagProConnect-Setup-3.1.37.exe",
  size: 78302497,
  sha256: "9e05538d8386187fd3846f4bcdabacaeff7889eeda1805e629de548d3c3f0dfc",
  parts: [
  {
    "path": "releases/parts/3.1.37/part-00",
    "size": 40000000
  },
  {
    "path": "releases/parts/3.1.37/part-01",
    "size": 38302497
  }
],
} as const;
