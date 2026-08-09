// الإصدار المنشور من برنامج الموظف (حزمة Mag Pro Connect الجديدة).
// هذا الملف يُحدَّث تلقائياً بواسطة: node agent/release.mjs
// دائماً آخر إصدار فقط — البرنامج ينزل هذا الإصدار مباشرة ولا يمر بأي
// إصدارات وسيطة بالترتيب.
export const AGENT_RELEASE = {
  version: "3.1.7",
  notes: "إصلاح ظهور الجهاز غير متصل: نبض كل 10 ثوانٍ ومراقب مستقل يعيد تشغيل خدمة البث تلقائياً عند تعليقها.",
  url: "https://mag-pro1.com/api/public/agent-download.exe",
  storageBucket: "site-assets",
  storagePath: "releases/MagProConnect-Setup-3.1.7.exe",
  size: 110522354,
  sha256: "0500ef98da0821b86ad81224e8e39e54c38e5ac29ff38681738bcceb47be3374",
} as const;
