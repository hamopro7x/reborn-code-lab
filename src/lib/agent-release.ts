// الإصدار المنشور من برنامج الموظف (حزمة Mag Pro Connect الجديدة).
// هذا الملف يُحدَّث تلقائياً بواسطة: node agent/release.mjs
// دائماً آخر إصدار فقط — البرنامج ينزل هذا الإصدار مباشرة ولا يمر بأي
// إصدارات وسيطة بالترتيب.
export const AGENT_RELEASE = {
  version: "3.1.3",
  notes: "إصلاح كامل للكيبورد العربي والإنجليزي وتسريع استجابة الماوس بقنوات تحكم منفصلة",
  url: "https://mag-pro1.com/api/public/agent-download.exe",
  storageBucket: "site-assets",
  storagePath: "releases/MagProConnect-Setup-3.1.3.exe",
  size: 110519544,
  sha256: "0d9daba9972fcba88362b44b6a04819fe3ccfa9797f79148edd13d8c36ab489c",
} as const;
