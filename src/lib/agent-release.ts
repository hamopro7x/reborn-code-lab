// الإصدار المنشور من برنامج الموظف (حزمة Mag Pro الجديدة).
// هذا الملف يُحدَّث تلقائياً بواسطة: node agent/release.mjs
// دائماً آخر إصدار فقط — البرنامج ينزل هذا الإصدار مباشرة ولا يمر بأي
// إصدارات وسيطة بالترتيب.
export const AGENT_RELEASE = {
  version: "2.0.9",
  notes: "إصلاح تعليق واجهة البرنامج عند الفتح وضمان الاتصال وإرسال النبضات تلقائياً.",
  url: "https://mag-pro1.com/api/public/agent-download.exe",
  storageBucket: "site-assets",
  storagePath: "releases/MagPro-Setup-2.0.9.exe",
  size: 110513959,
  sha256: "116afa5e2e0dc2fe29cc95263226187636a393d726a7ade05f19a55ce1d033a9",
} as const;
