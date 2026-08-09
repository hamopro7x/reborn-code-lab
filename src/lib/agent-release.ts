// الإصدار المنشور من برنامج الموظف (حزمة Mag Pro Connect الجديدة).
// هذا الملف يُحدَّث تلقائياً بواسطة: node agent/release.mjs
// دائماً آخر إصدار فقط — البرنامج ينزل هذا الإصدار مباشرة ولا يمر بأي
// إصدارات وسيطة بالترتيب.
export const AGENT_RELEASE = {
  version: "3.1.8",
  notes: "روبوت إصلاح تلقائي: يستجيب لأوامر لوحة الإدارة (تجديد الالتقاط، إعادة تشغيل الخدمة، تحديث فوري لآخر إصدار).",
  url: "https://mag-pro1.com/api/public/agent-download.exe",
  storageBucket: "site-assets",
  storagePath: "releases/MagProConnect-Setup-3.1.8.exe",
  size: 110522632,
  sha256: "839111c8c1562dfe32a1027009afbd2e9eecdbf990f137fad37a45987fefbce6",
} as const;
