// الإصدار المنشور من برنامج الموظف (حزمة Mag Pro Connect الجديدة).
// هذا الملف يُحدَّث تلقائياً بواسطة: node agent/release.mjs
// دائماً آخر إصدار فقط — البرنامج ينزل هذا الإصدار مباشرة ولا يمر بأي
// إصدارات وسيطة بالترتيب.
export const AGENT_RELEASE = {
  version: "3.1.4",
  notes: "استمرار بث الشاشة عند ضعف الشبكة أو السكون، إصلاح ICE تلقائياً، واستعادة التقاط الشاشة بدون فصل المشاهد.",
  url: "https://mag-pro1.com/api/public/agent-download.exe",
  storageBucket: "site-assets",
  storagePath: "releases/MagProConnect-Setup-3.1.4.exe",
  size: 110520986,
  sha256: "81da9c2840f9d27c98b10ca61dab9d326ce51dc21c6ed55b77e88368b55663a2",
} as const;
