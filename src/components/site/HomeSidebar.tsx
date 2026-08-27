import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Gamepad2, CreditCard, Crown, Percent, Headphones, KeyRound, LayoutGrid,
  ShieldCheck, Clock, Zap, Wallet, Building2, Smartphone, Bitcoin,
} from "lucide-react";
import { listPublicPaymentMethods } from "@/lib/payments.functions";

const iconForSlug = (slug: string, name: string) => {
  const s = `${slug} ${name}`.toLowerCase();
  if (/game|لعب|ألعاب|العاب/.test(s)) return Gamepad2;
  if (/card|شحن|بطاق/.test(s)) return CreditCard;
  if (/sub|اشتراك/.test(s)) return Crown;
  if (/offer|عرض|خصم/.test(s)) return Percent;
  if (/device|accessor|جهاز|أجهزة|اكسسوار/.test(s)) return Headphones;
  if (/soft|key|برنام|مفات/.test(s)) return KeyRound;
  return LayoutGrid;
};

const payIcon = (type: string) => {
  const t = (type || "").toLowerCase();
  if (/bank|بنك/.test(t)) return Building2;
  if (/crypto|usdt|bit/.test(t)) return Bitcoin;
  if (/wallet|محفظ|vodafone|instapay/.test(t)) return Wallet;
  if (/card|visa|mastercard/.test(t)) return CreditCard;
  return Smartphone;
};

const perks = [
  { icon: ShieldCheck, title: "الدفع آمن", body: "عملية دفع آمنة ومحمية بالكامل." },
  { icon: Clock, title: "دعم فوري", body: "فريق الدعم جاهز لمساعدتك في أي وقت." },
  { icon: Zap, title: "تسليم فوري", body: "تستلم منتجك بعد إتمام الدفع." },
];

export function HomeSidebar({
  categories,
  loading,
}: {
  categories: any[];
  loading?: boolean;
}) {
  const activeCategory = useRouterState({
    select: (s) => (s.location.search as any)?.category as string | undefined,
  });
  const fetchPayments = useServerFn(listPublicPaymentMethods);
  const paymentsQ = useQuery({
    queryKey: ["public-payment-methods"],
    queryFn: () => fetchPayments({ data: {} }),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="space-y-4">
      {/* Categories */}
      <nav className="rounded-2xl border border-border bg-card overflow-hidden" aria-label="الأقسام">
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
          <span className="font-bold text-sm">الأقسام</span>
          <LayoutGrid className="size-4 text-muted-foreground shrink-0" />
        </div>
        <ul className="p-2">
          {loading &&
            Array.from({ length: 5 }).map((_, i) => (
              <li key={`sk-${i}`} className="h-10 m-1 rounded-lg bg-secondary/60 animate-pulse" />
            ))}
          {categories.map((c: any) => {
            const Icon = iconForSlug(c.slug ?? "", c.name ?? "");
            const isActive = activeCategory === c.slug;
            return (
              <li key={c.id}>
                <Link
                  to="/shop"
                  search={{ category: c.slug } as any}
                  aria-current={isActive ? "page" : undefined}
                  className={
                    "flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors duration-150 border-r-2 " +
                    (isActive
                      ? "bg-secondary text-lime border-lime font-bold"
                      : "text-foreground/85 border-transparent hover:bg-secondary hover:text-foreground")
                  }
                >
                  <span className="truncate">{c.name}</span>
                  <Icon className={"size-4 shrink-0 " + (isActive ? "text-lime" : "text-muted-foreground")} />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Perks */}
      <ul className="rounded-2xl border border-border bg-card divide-y divide-border">
        {perks.map((p) => (
          <li key={p.title} className="flex items-start gap-3 p-4">
            <p.icon className="size-5 shrink-0 text-lime mt-0.5" />
            <div className="min-w-0">
              <div className="text-sm font-bold">{p.title}</div>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{p.body}</p>
            </div>
          </li>
        ))}
      </ul>

      {/* Payment methods */}
      {(paymentsQ.data?.length ?? 0) > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="text-sm font-bold mb-3">طرق الدفع المتاحة</div>
          <ul className="grid grid-cols-2 gap-2">
            {paymentsQ.data!.map((m: any) => {
              const Icon = payIcon(m.type);
              return (
                <li
                  key={m.id}
                  className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-2 min-w-0"
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="text-xs truncate">{m.name}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
