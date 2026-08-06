// الإصدار المنشور من برنامج الموظف (حزمة Mag Pro الجديدة).
// هذا الملف يُحدَّث تلقائياً بواسطة: node agent/release.mjs
// دائماً آخر إصدار فقط — البرنامج ينزل هذا الإصدار مباشرة ولا يمر بأي
// إصدارات وسيطة بالترتيب.
export const AGENT_RELEASE = {
  version: "2.0.14",
  notes: "إصلاح تشغيل جميع شاشات الموظفين معاً: تضمين مسارات الاتصال كاملة داخل العرض والإجابة، ومنع أول بث من استهلاك سعة الشبكة وإيقاف بقية الأجهزة.",
  url: "https://mag-pro1.com/api/public/agent-download.exe",
  storageBucket: "site-assets",
  storagePath: "releases/MagPro-Setup-2.0.14.exe",
  size: 110515634,
  sha256: "dd4a825dcf0a1c8c2383705a5f391ca94491fa91a88f8a44e936278c885e5d5c",
} as const;
