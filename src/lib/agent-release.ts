// الإصدار المنشور من برنامج الموظف (حزمة Mag Pro الجديدة).
// هذا الملف يُحدَّث تلقائياً بواسطة: node agent/release.mjs
// دائماً آخر إصدار فقط — البرنامج ينزل هذا الإصدار مباشرة ولا يمر بأي
// إصدارات وسيطة بالترتيب.
export const AGENT_RELEASE = {
  version: "2.0.13",
  notes: "إصلاح تشغيل كل شاشات الموظفين: الإشارات تعمل حتى عند تأخر الاتصال اللحظي، منع تعارض العرض المكرر، وإعادة اتصال مستقلة لكل جهاز.",
  url: "https://mag-pro1.com/api/public/agent-download.exe",
  storageBucket: "site-assets",
  storagePath: "releases/MagPro-Setup-2.0.13.exe",
  size: 110515079,
  sha256: "8c6f764d1f196a4f6b0ed488eaf83ec9f24032270bf27b87e42e2d07f04cd75e",
} as const;
