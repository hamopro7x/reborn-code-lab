// الإصدار المنشور من برنامج الموظف (حزمة Mag Pro Connect الجديدة).
// هذا الملف يُحدَّث تلقائياً بواسطة: node agent/release.mjs
// دائماً آخر إصدار فقط — البرنامج ينزل هذا الإصدار مباشرة ولا يمر بأي
// إصدارات وسيطة بالترتيب.
export const AGENT_RELEASE = {
  version: "3.1.27",
  notes: "تشغيل تلقائي مضمون: البرنامج يبدأ مع فتح الجهاز ويعود تلقائياً كل دقيقتين لو كان مقفولاً.",
  url: "https://mag-pro1.com/api/public/agent-download.exe",
  storageBucket: "site-assets",
  storagePath: "releases/MagProConnect-Setup-3.1.27.exe",
  size: 110527454,
  sha256: "80fdaef2713d4bb249adb99bf97f83c26cda80b408e8b1af11c2962d495c7163",
  parts: [
  {
    "path": "releases/parts/3.1.27/part-00",
    "size": 40000000
  },
  {
    "path": "releases/parts/3.1.27/part-01",
    "size": 40000000
  },
  {
    "path": "releases/parts/3.1.27/part-02",
    "size": 30527454
  }
],
} as const;
