// الإصدار المنشور من برنامج الموظف (حزمة Mag Pro Connect الجديدة).
// هذا الملف يُحدَّث تلقائياً بواسطة: node agent/release.mjs
// دائماً آخر إصدار فقط — البرنامج ينزل هذا الإصدار مباشرة ولا يمر بأي
// إصدارات وسيطة بالترتيب.
export const AGENT_RELEASE = {
  version: "3.1.23",
  notes: "بدء أسرع مع ويندوز، استعادة تلقائية للاتصال، بث أوضح للنصوص، وتحكم فوري بقناة بيانات منفصلة.",
  url: "https://mag-pro1.com/api/public/agent-download.exe",
  storageBucket: "site-assets",
  storagePath: "releases/MagProConnect-Setup-3.1.23.exe",
  size: 110526725,
  sha256: "3cf538b8b59f3264d907025dc134d492f078e73031e672859a55be7aa6311c06",
  // أجزاء الملف على المخزن (لخطط التخزين التي ترفض ملفًا واحدًا كبيرًا).
  // يُستخدم تلقائيًا عندما لا يكون الملف الكامل موجودًا، ويُدمج أثناء التنزيل.
  parts: [
    { path: "releases/parts/3.1.23/part-00", size: 40000000 },
    { path: "releases/parts/3.1.23/part-01", size: 40000000 },
    { path: "releases/parts/3.1.23/part-02", size: 30526725 },
  ],
} as const;
