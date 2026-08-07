// الإصدار المنشور من برنامج الموظف (حزمة Mag Pro Connect الجديدة).
// هذا الملف يُحدَّث تلقائياً بواسطة: node agent/release.mjs
// دائماً آخر إصدار فقط — البرنامج ينزل هذا الإصدار مباشرة ولا يمر بأي
// إصدارات وسيطة بالترتيب.
export const AGENT_RELEASE = {
  version: "3.1.0",
  notes: "إضافة التحكم عن بعد في جهاز الموظف (ماوس وكيبورد) من لوحة الإدارة.",
  url: "https://mag-pro1.com/api/public/agent-download.exe",
  storageBucket: "site-assets",
  storagePath: "releases/MagProConnect-Setup-3.1.0.exe",
  size: 110518642,
  sha256: "efe021d876a3f30da8ca83d49e293934326328ead5d9585294ca43508c3501be",
} as const;
