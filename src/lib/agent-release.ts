// الإصدار المنشور من برنامج الموظف (حزمة Mag Pro الجديدة).
// هذا الملف يُحدَّث تلقائياً بواسطة: node agent/release.mjs
// دائماً آخر إصدار فقط — البرنامج ينزل هذا الإصدار مباشرة ولا يمر بأي
// إصدارات وسيطة بالترتيب.
export const AGENT_RELEASE = {
  version: "2.0.11",
  notes: "منع توقف البرنامج بعد السكون أو فقد الشبكة، مع استعادة آمنة للاتصال وحماية من أخطاء إشارات البث.",
  url: "https://mag-pro1.com/api/public/agent-download.exe",
  storageBucket: "site-assets",
  storagePath: "releases/MagPro-Setup-2.0.11.exe",
  size: 110514664,
  sha256: "6141663e4e41146c5e7e8f3e75b43293209cc2348ffbad0465121ba7b0200347",
} as const;
