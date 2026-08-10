// الإصدار المنشور من برنامج الموظف (حزمة Mag Pro Connect الجديدة).
// هذا الملف يُحدَّث تلقائياً بواسطة: node agent/release.mjs
// دائماً آخر إصدار فقط — البرنامج ينزل هذا الإصدار مباشرة ولا يمر بأي
// إصدارات وسيطة بالترتيب.
export const AGENT_RELEASE = {
  version: "3.1.19",
  notes: "إصلاح توقف قناة الإشارات الذي كان يجعل الجهاز يظهر غير متصل، ومهلة لالتقاط الشاشة المعلّق.",
  url: "https://mag-pro1.com/api/public/agent-download.exe",
  storageBucket: "site-assets",
  storagePath: "releases/MagProConnect-Setup-3.1.19.exe",
  size: 110524617,
  sha256: "1019f37dccf054a2e32e3799317d5bb5824576cc237ae72e882ec33f0712c5ed",
} as const;
