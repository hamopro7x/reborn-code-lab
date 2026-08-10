// الإصدار المنشور من برنامج الموظف (حزمة Mag Pro Connect الجديدة).
// هذا الملف يُحدَّث تلقائياً بواسطة: node agent/release.mjs
// دائماً آخر إصدار فقط — البرنامج ينزل هذا الإصدار مباشرة ولا يمر بأي
// إصدارات وسيطة بالترتيب.
export const AGENT_RELEASE = {
  version: "3.1.17",
  notes: "إصلاح جذري لتعليق الاتصال والشاشة السوداء: بدء الإشارات فوراً، تخفيف حمل الترميز، منع المصافحات المكررة، وتحسين التعافي على الإنترنت الضعيف.",
  url: "https://mag-pro1.com/api/public/agent-download.exe",
  storageBucket: "site-assets",
  storagePath: "releases/MagProConnect-Setup-3.1.17.exe",
  size: 110524088,
  sha256: "c9a5df8b8e74783859e4ee3d46e8cb81ed3dc399269d76bd63f7f46dba678e18",
} as const;
