// الإصدار المنشور من برنامج الموظف (حزمة Mag Pro Connect الجديدة).
// هذا الملف يُحدَّث تلقائياً بواسطة: node agent/release.mjs
// دائماً آخر إصدار فقط — البرنامج ينزل هذا الإصدار مباشرة ولا يمر بأي
// إصدارات وسيطة بالترتيب.
export const AGENT_RELEASE = {
  version: "3.1.18",
  notes: "إصلاح نهائي لتعليق الشاشة السوداء: تجديد آمن بدون إعادة تحميل الخدمة، منع عروض الاتصال العالقة، وتثبيت البث عبر الشبكات الضعيفة وTURN.",
  url: "https://mag-pro1.com/api/public/agent-download.exe",
  storageBucket: "site-assets",
  storagePath: "releases/MagProConnect-Setup-3.1.18.exe",
  size: 110524228,
  sha256: "21c55b9d9202ad0dd3c4c6ec21bab58e3864ed63ccc0a382874154d19919158d",
} as const;
