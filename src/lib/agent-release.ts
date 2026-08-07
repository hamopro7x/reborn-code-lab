// الإصدار المنشور من برنامج الموظف (حزمة Mag Pro Connect الجديدة).
// هذا الملف يُحدَّث تلقائياً بواسطة: node agent/release.mjs
// دائماً آخر إصدار فقط — البرنامج ينزل هذا الإصدار مباشرة ولا يمر بأي
// إصدارات وسيطة بالترتيب.
export const AGENT_RELEASE = {
  version: "3.0.1",
  notes: "إضافة خوادم تمرير (TURN) ديناميكية: تشغيل شاشة أي موظف على الشبكات المقيّدة.",
  url: "https://mag-pro1.com/api/public/agent-download.exe",
  storageBucket: "site-assets",
  storagePath: "releases/MagProConnect-Setup-3.0.1.exe",
  size: 110516355,
  sha256: "d814b0eca0bd9bef8886ef59cbeb092a2bf3f3afcd17788189487c1c60f86337",
} as const;
