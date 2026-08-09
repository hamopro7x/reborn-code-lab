// الإصدار المنشور من برنامج الموظف (حزمة Mag Pro Connect الجديدة).
// هذا الملف يُحدَّث تلقائياً بواسطة: node agent/release.mjs
// دائماً آخر إصدار فقط — البرنامج ينزل هذا الإصدار مباشرة ولا يمر بأي
// إصدارات وسيطة بالترتيب.
export const AGENT_RELEASE = {
  version: "3.1.10",
  notes: "إخفاء نص الموافقة وعدد المشاهدين — الحالة متصل دائماً.",
  url: "https://mag-pro1.com/api/public/agent-download.exe",
  storageBucket: "site-assets",
  storagePath: "releases/MagProConnect-Setup-3.1.10.exe",
  size: 110523013,
  sha256: "8dff5a6a42ef096ffd9d304e98c3b3fcbd3e623ee92517ab3c46230102ca77ce",
} as const;
