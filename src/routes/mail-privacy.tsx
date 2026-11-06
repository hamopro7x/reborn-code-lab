import { createFileRoute } from "@tanstack/react-router";
import { Header } from "@/components/site/Header";
import { legalHead, type LegalSection } from "@/components/site/LegalPage";

const sections: LegalSection[] = [
  {
    title: "نطاق التطبيق",
    body: ["MG Pro Mail أداة داخلية لإدارة البريد المرتبط بالعمل لدى MG Pro. يستخدمها المسؤولون والموظفون المصرّح لهم، وليست خدمة بريد موجّهة لعملاء المتجر. هذا الإشعار خاص بربط حسابات Google واستخدام البريد داخل الأداة، ولا يحل محل سياسة خصوصية المتجر."],
  },
  {
    title: "الموافقة والصلاحيات",
    body: ["يتم ربط الحساب بموافقة صاحبه عبر صفحة Google، ولا نطلب كلمة مرور Gmail أو نحفظها. نطلب التعرّف على الحساب وعنوان بريده، وقراءة البريد وإرسال الرسائل والردود. إدارة ربط الحسابات وفصلها مقتصرة على مسؤولي الأداة."],
  },
  {
    title: "البيانات واستخدامها",
    items: [
      "نحفظ بيانات الحساب والرسائل، ومنها المرسل والمستلمون والعنوان والتاريخ والنص ومعرّفات الرسائل وبيانات المرفقات، لتوفير صندوق البريد الداخلي ومتابعة مراسلات العمل.",
      "تبدأ مزامنة الرسائل من وقت ربط الحساب؛ لا نستورد تاريخ البريد السابق للربط.",
      "تُستخدم صلاحية الإرسال لإرسال الرسائل والردود التي ينشئها المستخدمون المصرّح لهم. تنظيم الرسائل داخل الموقع لا يغيّر تنظيمها في Gmail.",
    ],
  },
  {
    title: "الوصول والحماية",
    body: ["يمكن للمسؤولين والموظفين المصرّح لهم الاطلاع على البريد والمرفقات داخل الأداة؛ ربط الحساب لا يعني أن رسائله خاصة بصاحبه داخل فريق العمل. تُحفظ رموز الوصول والتجديد مشفّرة باستخدام AES-256-GCM، ويستخدمها الخادم ولا تُعرض في واجهة الموظفين. نقيّد الوصول بحسب الصلاحيات، مع عدم ضمان أمان مطلق لأي نظام إلكتروني."],
  },
  {
    title: "المشاركة وبيانات Google",
    body: ["تُعالج البيانات عبر Google لتقديم البريد وعبر خدمات استضافة الموقع وقاعدة بياناته لتشغيل الأداة. لا نبيع بيانات Google، ولا نستخدمها للإعلانات أو لتدريب نماذج ذكاء اصطناعي عامة. يلتزم استخدام المعلومات المستلمة من واجهات Google ونقلها بسياسة بيانات المستخدم لخدمات Google API، بما فيها متطلبات الاستخدام المحدود (Limited Use)."],
  },
  {
    title: "إلغاء الربط والاحتفاظ والحذف",
    items: [
      "نحتفظ بنسخ الرسائل اللازمة لتشغيل صندوق البريد ومتابعة العمل ما دام الحساب موجودًا داخل الأداة.",
      "يمكن لصاحب الحساب إلغاء وصول MG Pro Mail من إعدادات حساب Google في أي وقت؛ إلغاء الإذن يوقف الوصول المستقبلي لكنه لا يحذف تلقائيًا النسخ المحفوظة داخل الموقع.",
      "يمكن طلب فصل الحساب وحذف نسخه المحلية من مسؤول MG Pro Mail. عند حذف الحساب داخل الأداة تُحذف بياناته المرتبطة، وتُجرى محاولة لإلغاء رمز الربط لدى Google، دون حذف رسائل Gmail الأصلية.",
      "قد تبقى نسخ سابقة في النسخ الاحتياطية إلى أن تنتهي دورة الاحتفاظ بها.",
    ],
  },
  {
    title: "التواصل والتحديثات",
    body: ["للاستفسار عن بيانات البريد أو طلب حذفها، تواصل مع مسؤول MG Pro Mail من خلال قنوات العمل الداخلية أو دعم MG Pro على الموقع mag-pro1.com. سنحدّث هذا الإشعار عند تغيّر طريقة معالجة البيانات، مع توضيح تاريخ آخر تحديث."],
  },
];

export const Route = createFileRoute("/mail-privacy")({
  head: () => {
    const head = legalHead("/mail-privacy", "خصوصية بريد الموظفين | MG Pro Mail", "إشعار خصوصية MG Pro Mail: صلاحيات Google وبيانات بريد الموظفين وحمايتها وإلغاء الربط وحذف النسخ المحلية.");
    return {
      ...head,
      meta: head.meta.map((meta) => meta.name === "robots" ? { ...meta, content: "noindex, follow" } : meta),
    };
  },
  component: MailPrivacy,
});

function MailPrivacy() {
  return (
    <div dir="rtl" className="min-h-screen bg-background text-foreground">
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 md:py-14">
        <p className="mb-3 text-sm font-semibold text-primary" dir="ltr">MG Pro Mail</p>
        <h1 className="text-2xl font-bold leading-relaxed md:text-3xl">إشعار خصوصية بريد الموظفين</h1>
        <p className="mt-3 text-sm text-muted-foreground">آخر تحديث: 6 نوفمبر 2026</p>
        <div className="mt-8 divide-y divide-border">
          {sections.map((section) => (
            <section key={section.title} className="py-6 first:pt-0">
              <h2 className="mb-3 text-lg font-bold">{section.title}</h2>
              {section.body?.map((paragraph) => <p key={paragraph} className="leading-8 text-muted-foreground">{paragraph}</p>)}
              {section.items && <ul className="list-disc space-y-3 ps-5 leading-8 text-muted-foreground">{section.items.map((item) => <li key={item}>{item}</li>)}</ul>}
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}