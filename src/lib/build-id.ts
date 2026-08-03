// معرّف النسخة الحالية من الموقع — يتغيّر مع كل نشر (Publish).
// نفس القيمة تُحقن في كود المتصفح وكود السيرفر في نفس البناء.
declare const __APP_BUILD_ID__: string;

export const APP_BUILD_ID: string =
  typeof __APP_BUILD_ID__ === "string" ? __APP_BUILD_ID__ : "dev";
