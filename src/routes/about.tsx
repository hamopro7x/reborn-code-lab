import { createFileRoute, Link } from "@tanstack/react-router";
import { Zap, ShieldCheck, Clock, Headphones, BadgePercent, Users } from "lucide-react";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { legalHead } from "@/components/site/LegalPage";

const FEATURES = [
  { icon: Zap, title: "تنفيذ سريع", text: "تنفيذ الطلبات بأسرع وقت بعد تأكيد الدفع" },
  { icon: ShieldCheck, title: "دفع آمن", text: "مراجعة دقيقة لكل عملية دفع لحماية حقك" },
  { icon: Clock, title: "متاح يوميًا", text: "استقبال الطلبات على مدار الأسبوع" },
  { icon: Headphones, title: "دعم متميز", text: "فريق دعم متخصص لمساعدتك عبر واتساب" },
  { icon: BadgePercent, title: "أسعار تنافسية", text: "أفضل الأسعار للخدمات الرقمية" },
  { icon: Users, title: "خدمات متكاملة", text: "ألعاب، تطبيقات، اشتراكات، أدوات AI وسوشيال ميديا" },
];

export const Route = createFileRoute("/about")({
  head: () => legalHead("/about", "من نحن | MG Pro", "تعرّف على متجر MG Pro للخدمات الرقمية: شحن الألعاب والتطبيقات، الاشتراكات الرقمية، أدوات الذكاء الاصطناعي، وخدمات السوشيال ميديا."),
  component: AboutPage,
});

function AboutPage() {
  return (
    <div dir="rtl" className="flex min-h-screen flex-col">
      <Header />
      <main className="container mx-auto w-full max-w-5xl flex-1 px-4 py-10 text-right md:py-16">
        <h1 className="mb-6 text-2xl font-bold md:text-3xl">من نحن</h1>
        <section className="mb-10 rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 text-lg font-bold md:text-xl">قصتنا</h2>
          <p className="mb-2 leading-8 text-muted-foreground">بدأت رحلة متجر MG Pro من فكرة بسيطة: توفير طريقة سهلة وسريعة لشحن الألعاب والتطبيقات والحصول على الخدمات الرقمية في مكان واحد.</p>
          <p className="leading-8 text-muted-foreground">اليوم نقدم شحن الألعاب والتطبيقات، الاشتراكات الرقمية، أدوات الذكاء الاصطناعي، وخدمات التسويق عبر السوشيال ميديا.</p>
        </section>
        <h2 className="mb-4 text-lg font-bold md:text-xl">لماذا تختار MG Pro؟</h2>
        <div className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl border border-border bg-card p-5">
              <f.icon className="mb-3 h-6 w-6 text-primary" />
              <p className="mb-1 font-bold">{f.title}</p>
              <p className="text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-primary/40 bg-card p-6 text-center">
          <p className="mb-3 text-lg font-bold">ابدأ الشحن الآن</p>
          <Link to="/shop" className="inline-block rounded-lg bg-primary px-6 py-2 font-bold text-primary-foreground">تصفح المنتجات</Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
