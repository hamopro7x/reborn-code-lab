// الإصدار المنشور من برنامج الموظف (حزمة Mag Pro Connect الجديدة).
// هذا الملف يُحدَّث تلقائياً بواسطة: node agent/release.mjs
// دائماً آخر إصدار فقط — البرنامج ينزل هذا الإصدار مباشرة ولا يمر بأي
// إصدارات وسيطة بالترتيب.
export const AGENT_RELEASE = {
  version: "3.1.25",
  notes: "ثبات التشغيل في الخلفية: منع ويندوز من تجميد البرنامج المخفي حتى لا ينقطع الاتصال.",
  url: "https://mag-pro1.com/api/public/agent-download.exe",
  storageBucket: "site-assets",
  storagePath: "releases/MagProConnect-Setup-3.1.25.exe",
  size: 110527065,
  sha256: "a55043bcdf4988fa5d83cb5d2394c1d20829c6e82c35eec5a3d08afa88e2afa6",
  parts: [
  {
    "path": "releases/parts/3.1.25/part-00",
    "size": 40000000
  },
  {
    "path": "releases/parts/3.1.25/part-01",
    "size": 40000000
  },
  {
    "path": "releases/parts/3.1.25/part-02",
    "size": 30527065
  }
],
} as const;
