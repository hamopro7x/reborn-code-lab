// الإصدار المنشور من برنامج الموظف (حزمة Mag Pro Connect الجديدة).
// هذا الملف يُحدَّث تلقائياً بواسطة: node agent/release.mjs
// دائماً آخر إصدار فقط — البرنامج ينزل هذا الإصدار مباشرة ولا يمر بأي
// إصدارات وسيطة بالترتيب.
export const AGENT_RELEASE = {
  version: "3.1.26",
  notes: "تشغيل تلقائي متعدد الآليات: البرنامج يبدأ فور تشغيل الجهاز حتى لو أُغلق نهائياً.",
  url: "https://mag-pro1.com/api/public/agent-download.exe",
  storageBucket: "site-assets",
  storagePath: "releases/MagProConnect-Setup-3.1.26.exe",
  size: 110527266,
  sha256: "ed26543cf74785fd89426305d72cc69a0b9f5500b67e17bb401132c814ea013a",
  parts: [
  {
    "path": "releases/parts/3.1.26/part-00",
    "size": 40000000
  },
  {
    "path": "releases/parts/3.1.26/part-01",
    "size": 40000000
  },
  {
    "path": "releases/parts/3.1.26/part-02",
    "size": 30527266
  }
],
} as const;
