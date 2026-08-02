// الإصدار المنشور من برنامج الموظف.
// هذه القيم ثابتة في كود الموقع — أي تحديث لا يصل لأجهزة الموظفين
// إلا بعد الضغط على "Publish changes" (نشر التحديث) من الموقع.
export const AGENT_RELEASE = {
  version: "1.8.10",
  notes: "منع تكرار تنزيل التحديث وتشغيل دورة تثبيت واحدة في الخلفية",
  url: "https://mag-pro1.com/api/public/agent-download.exe",
} as const;
