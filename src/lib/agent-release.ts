// الإصدار المنشور من برنامج الموظف (حزمة Mag Pro Connect الجديدة).
// هذا الملف يُحدَّث تلقائياً بواسطة: node agent/release.mjs
// دائماً آخر إصدار فقط — البرنامج ينزل هذا الإصدار مباشرة ولا يمر بأي
// إصدارات وسيطة بالترتيب.
export const AGENT_RELEASE = {
  version: "3.1.24",
  notes: "إظهار شاشة تسجيل الجهاز بعد التثبيت وربط التطبيق بقاعدة الموقع الحقيقي.",
  url: "https://mag-pro1.com/api/public/agent-download.exe",
  // رابط مطلق لمخزن الملفات (يعمل من أي دومين، بما فيه mag-pro1.com)
  directAssetPath:
    "https://id-preview--335637d3-bc9b-407f-9e44-b28bda5c78dc.lovable.app/__l5e/assets-v1/1ec3f9c4-83bd-48bf-86c3-a66e6ec68dc0/MagProConnect-Setup-3.1.24.exe",
  storageBucket: "site-assets",
  storagePath: "releases/MagProConnect-Setup-3.1.24.exe",
  size: 110526779,
  sha256: "01b2ca55881d64776c54af70e1d3003191d0eedcf26c39a2b89e648850d1a19e",
  parts: [],
} as const;
