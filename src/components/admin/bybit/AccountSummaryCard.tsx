import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getBybitOverview } from "@/lib/bybit.functions";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Clock, Lock, Pencil, Trash2, Copy, Loader2, BarChart3, PieChart } from "lucide-react";
import { CoinBalanceCard, visibleCoins, type CoinRow } from "@/components/admin/bybit/BybitVisuals";
import { formatLeft } from "@/components/admin/bybit/BybitAccountManagement";
import type { BybitAccountRow } from "@/components/admin/bybit/types";

export function AccountSummaryCard({
  account, index, isAdmin, onOpen, onDelete, onEdit, onToggleFreeze, freezePending, onFreezeExpired,
}: {
  onFreezeExpired?: () => void;
  onToggleFreeze?: () => void;
  freezePending?: boolean;
  account: BybitAccountRow;
  index: number;
  isAdmin: boolean;
  onOpen: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const overviewFn = useServerFn(getBybitOverview);
  const q = useQuery({
    queryKey: ["bybit-overview", account.id],
    queryFn: () => overviewFn({ data: { accountId: account.id } }),
    // Balances hit the provider API per card; reuse them for a minute so
    // switching sections does not re-fetch every account each time.
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  });
  const d = (q.data as any) ?? {};
  const coins = visibleCoins((d.coins ?? []) as CoinRow[]);
  const cashback = Number(account.monthlyCashback ?? 0);
  const frozenUntilMs = account.frozenUntil ? new Date(account.frozenUntil).getTime() : null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!account.frozen || !frozenUntilMs) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [account.frozen, frozenUntilMs]);
  const timeLeft = frozenUntilMs ? frozenUntilMs - now : null;
  const frozen = Boolean(account.frozen) && (timeLeft === null || timeLeft > 0);
  const expiredRef = useRef(false);
  useEffect(() => {
    if (account.frozen && timeLeft !== null && timeLeft <= 0 && !expiredRef.current) {
      expiredRef.current = true;
      onFreezeExpired?.();
    }
  }, [account.frozen, timeLeft, onFreezeExpired]);
  const visaNo = account.sortOrder && account.sortOrder > 0 ? account.sortOrder : index + 1;

  if (frozen) {
    return (
      <article className="relative flex h-[320px] min-h-[320px] w-full flex-col overflow-hidden rounded-[24px] border border-teal-400/25 bg-[oklch(0.16_0.03_190)] p-4 sm:p-5 shadow-[0_0_0_1px_oklch(0.7_0.13_190_/_0.08),0_18px_50px_-24px_oklch(0.6_0.15_190_/_0.45)] max-sm:rounded-[22px] max-sm:px-3.5 max-sm:pb-4 max-sm:pt-[18px]">
        <div aria-hidden className="pointer-events-none absolute inset-x-[-4%] top-[102px] h-[75px] w-[108%] -rotate-[4deg] rounded-[50%] border-t-2 border-teal-400/20" />
        <div aria-hidden className="pointer-events-none absolute inset-x-[-4%] top-[120px] h-[75px] w-[108%] -rotate-[3deg] rounded-[50%] border-t-2 border-teal-400/15" />

        <header dir="ltr" className="relative z-10 grid min-h-[84px] grid-cols-[88px_150px_minmax(0,1fr)] items-center gap-1 max-sm:min-h-[150px] max-sm:grid-cols-[88px_155px] max-sm:items-start">
          <div className="relative grid size-[76px] place-items-center justify-self-start rounded-full border-[3px] border-teal-300 bg-[oklch(0.11_0.035_180)] text-[30px] font-black tabular-nums text-teal-300 max-sm:size-[76px] max-sm:text-[34px]">
            <span aria-hidden className="absolute -inset-[9px] rounded-full border border-dashed border-teal-300/70" />
            <span aria-hidden className="absolute -inset-1 rounded-full border border-teal-300/40" />
            {visaNo}
          </div>

          <div dir="rtl" className="min-h-[64px] w-[150px] border-l border-dashed border-teal-300/45 pl-[13px] text-right max-sm:min-h-[78px] max-sm:w-[155px] max-sm:pl-2">
            <div className="flex items-center justify-start gap-2 whitespace-nowrap text-[13px] font-bold text-foreground/80 max-sm:text-[13px]">
              <Clock className="size-6 shrink-0 text-teal-300 max-sm:size-5" />
              <span>استرداد بنسبة</span>
            </div>
            <strong dir="ltr" className="mt-1 block text-center text-[24px] font-black leading-none text-teal-300 max-sm:text-[30px]">
              {cashback.toLocaleString("en-US", { maximumFractionDigits: 2 })}%
            </strong>
          </div>

          <div dir="rtl" className="self-start pt-1.5 text-right max-sm:col-span-2 max-sm:flex max-sm:items-center max-sm:justify-between max-sm:gap-2 max-sm:px-0.5 max-sm:pt-0">
            <div className="flex items-center justify-start gap-1">
              <div className="whitespace-nowrap text-base font-extrabold max-sm:text-[13px]">حساب {account.name}</div>
              {isAdmin && (
                <div className="flex items-center gap-0.5">
                  <Button variant="ghost" size="icon" className="size-7 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={onToggleFreeze} disabled={freezePending} title="فك التجميد">
                    <Lock className="size-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground" onClick={onEdit} title="تعديل">
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="size-7 text-destructive hover:bg-destructive/10" onClick={onDelete} title="حذف">
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              )}
            </div>
            {account.uid && (
              <button
                type="button"
                className="mt-2 flex items-center justify-start gap-2 text-[13px] text-muted-foreground transition-colors duration-150 hover:text-teal-300 max-sm:mt-0 max-sm:text-[11px]"
                title="نسخ UID"
                onClick={() => { navigator.clipboard?.writeText(account.uid ?? ""); toast.success("تم نسخ UID"); }}
              >
                <Copy className="size-4" />
                <span dir="ltr" className="tabular-nums">UID {account.uid}</span>
              </button>
            )}
          </div>
        </header>

        <section dir="ltr" className="relative z-10 grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_190px] items-center gap-[18px] pt-1 max-sm:grid-cols-1 max-sm:gap-3 max-sm:pt-2">
          <div dir="rtl" className="px-2 text-center max-sm:px-0">
            <div dir="rtl" className="mb-1.5 flex items-center justify-center gap-2.5">
              <span dir="ltr" className="inline-flex items-center gap-1 rounded-[8px] border border-destructive/80 px-2 py-1 text-xs font-bold text-destructive">
                {timeLeft !== null ? formatLeft(timeLeft) : "بدون وقت"}
                <Clock className="size-3.5" />
              </span>
              <span className="flex h-[40px] w-[36px] items-center justify-center text-destructive" aria-hidden="true">
                <svg viewBox="0 0 64 72" className="size-full overflow-visible">
                  <path d="M17 30V22C17 10.4 23.7 4 32 4s15 6.4 15 18v8" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
                  <rect x="8" y="27" width="48" height="39" rx="9" fill="currentColor" />
                  <circle cx="32" cy="44" r="5" className="fill-background" />
                  <path d="M32 48v8" className="stroke-background" strokeWidth="5" strokeLinecap="round" />
                </svg>
              </span>
            </div>
            <h3 className="m-0 text-[24px] font-black leading-tight text-destructive max-sm:text-[30px]">الحساب مجمد</h3>
            <p className="mt-1 whitespace-nowrap text-[12px] font-bold text-muted-foreground max-sm:whitespace-normal max-sm:text-xs">لا يمكنك إجراء أي معاملة حتى يتم إلغاء التجميد</p>
          </div>

          <div dir="ltr" className="h-[96px] min-h-[96px] max-h-[96px] w-full max-w-[190px] shrink-0 max-sm:row-start-2 max-sm:h-[100px] max-sm:w-full max-sm:max-w-[290px] max-sm:justify-self-center">
            {q.isLoading ? (
              <div className="relative h-full w-full rounded-[18px] p-[3px] bg-[radial-gradient(120%_120%_at_50%_0%,oklch(0.55_0.13_170/0.28),transparent_70%)]">
                <div className="grid h-full w-full place-items-center rounded-[15px] bg-[oklch(0.055_0.008_190)] shadow-[0_0_28px_-10px_oklch(0.6_0.14_170/0.35)]">
                  <Loader2 className="size-5 animate-spin" />
                </div>
              </div>
            ) : d.failed ? (
              <span className="col-span-2 grid h-full place-items-center text-xs text-destructive">تعذر جلب الرصيد</span>
            ) : (
              <div className="h-full w-full overflow-hidden">
                {coins.map((c) => (
                  <CoinBalanceCard key={c.coin} coin={c} />
                ))}
              </div>
            )}
          </div>
        </section>

        <button
          type="button"
          disabled={!isAdmin}
          onClick={isAdmin ? onOpen : undefined}
          className={`relative z-10 mt-auto flex h-[44px] w-full shrink-0 items-center justify-center gap-3 rounded-2xl border border-teal-500/50 bg-teal-900/55 text-sm font-bold text-teal-100 transition-all hover:border-teal-300/60 hover:brightness-125 max-sm:mt-3.5 max-sm:h-[52px] max-sm:text-sm ${isAdmin ? "cursor-pointer" : "cursor-not-allowed"}`}
        >
          {isAdmin ? (
            <BarChart3 className="size-[22px] text-teal-300" />
          ) : (
            <Lock className="size-[18px] text-destructive" />
          )}
          <span>عرض بيانات الحساب</span>
        </button>
      </article>
    );
  }

  return (
    <div className={`relative flex flex-col overflow-hidden rounded-[24px] border border-teal-400/25 bg-[oklch(0.16_0.03_190)] p-4 sm:p-5 shadow-[0_0_0_1px_oklch(0.7_0.13_190_/_0.08),0_18px_50px_-24px_oklch(0.6_0.15_190_/_0.45)] transition-shadow hover:shadow-[0_0_0_1px_oklch(0.7_0.13_190_/_0.2),0_22px_60px_-20px_oklch(0.65_0.16_190_/_0.6)] ${frozen ? "h-[400px] min-h-[400px]" : "h-[320px] min-h-[320px]"}`}>
      {/* Decorative glow + wave */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-20 right-1/4 h-56 w-56 rounded-full bg-teal-400/10 blur-3xl" />
        <svg viewBox="0 0 400 120" preserveAspectRatio="none" className="absolute inset-x-0 top-12 h-20 w-full opacity-60">
          <path d="M0 80 C 60 20, 120 110, 200 60 S 340 10, 400 70" fill="none" stroke="oklch(0.75 0.14 190)" strokeOpacity="0.35" strokeWidth="1.5" />
          <path d="M0 95 C 70 45, 140 120, 210 75 S 350 30, 400 88" fill="none" stroke="oklch(0.75 0.14 190)" strokeOpacity="0.18" strokeWidth="1.5" />
        </svg>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col gap-3">
        {/* Top row — identity on right (RTL), gauge on left (visual) */}
        <div className={`grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3 ${frozen ? "relative z-30" : ""}`}>
          {/* right cluster (visually): identity + action icons */}
          <div className="flex items-start justify-start gap-2 sm:gap-3">
            <div className="min-w-0 text-right pt-1">
              <div className="flex items-center justify-end gap-1">
                {isAdmin && (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 rounded-full border border-teal-400/25 bg-teal-400/5 text-teal-300 hover:bg-teal-400/15 hover:text-teal-200"
                      onClick={() => { navigator.clipboard?.writeText(account.uid ?? ""); toast.success("تم نسخ UID"); }}
                      title="نسخ UID"
                    >
                      <Copy className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className={`size-8 rounded-lg ${frozen ? "bg-destructive/15 text-destructive" : "text-muted-foreground hover:text-foreground"}`} onClick={onToggleFreeze} disabled={freezePending} title={frozen ? "فك التجميد" : "تجميد الحساب"}>
                      <Lock className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-8 rounded-lg text-muted-foreground hover:text-foreground" onClick={onEdit} title="تعديل">
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-8 rounded-lg text-destructive" onClick={onDelete} title="حذف">
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                )}
                <div className="truncate text-sm font-black">حساب {account.name}</div>
              </div>
              {account.uid && (
                <div className="flex items-center justify-end gap-1 text-[11px] text-muted-foreground mt-1">
                  <span dir="ltr" className="tabular-nums">UID {account.uid}</span>
                  <button
                    type="button"
                    className="grid size-5 place-items-center rounded-md hover:bg-teal-400/10 hover:text-teal-300"
                    title="نسخ UID"
                    onClick={() => { navigator.clipboard?.writeText(account.uid ?? ""); toast.success("تم نسخ UID"); }}
                  >
                    <Copy className="size-3" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* left cluster: gauge on the left, cashback on the right (matches image-280) */}
          <div dir="ltr" className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center shrink-0">
              <div className="relative grid size-[80px] sm:size-[92px] place-items-center">
                {/* outer tick ring */}
                <div
                  className="absolute inset-0 rounded-full opacity-80"
                  aria-hidden
                  style={{
                    background:
                      "repeating-conic-gradient(from 0deg, oklch(0.78 0.14 190) 0deg 0.8deg, transparent 0.8deg 10deg)",
                    WebkitMask: "radial-gradient(closest-side, transparent 78%, #000 79%, #000 92%, transparent 93%)",
                    mask: "radial-gradient(closest-side, transparent 78%, #000 79%, #000 92%, transparent 93%)",
                  }}
                />
                {/* thin outer circle */}
                <div className="absolute inset-[4px] rounded-full border border-teal-400/25" aria-hidden />
                {/* glowing main ring */}
                <div className="absolute inset-[10px] rounded-full border-[3px] border-teal-400 shadow-[0_0_26px_-2px_oklch(0.75_0.15_190_/_0.85),inset_0_0_22px_-6px_oklch(0.75_0.15_190_/_0.9)]" aria-hidden />
                <span className="relative text-3xl sm:text-4xl font-black text-teal-300 tabular-nums" dir="ltr">{visaNo}</span>
              </div>
            </div>

            {/* vertical dashed divider */}
            <div className="h-14 sm:h-16 w-0 border-r border-dashed border-teal-400/45" aria-hidden />

            <div className="flex flex-col items-end gap-1 pt-1">
              <div className="flex items-center gap-2">
                <PieChart className="size-4 text-teal-400 shrink-0" />
                <span className="text-sm text-foreground/90 whitespace-nowrap text-right">استرداد بنسبة</span>
              </div>
              <div className="text-2xl sm:text-3xl font-black text-teal-300 tabular-nums leading-none" dir="ltr">
                {cashback.toLocaleString("en-US", { maximumFractionDigits: 2 })}%
              </div>
            </div>
          </div>
        </div>

        {/* Balances — bottom right aligned, lowered and slightly larger */}
        <div className={`ml-auto mt-auto h-[96px] min-h-[96px] max-h-[96px] w-full max-w-[190px] shrink-0 overflow-hidden ${frozen ? "absolute bottom-0 right-0 z-30 h-[116px] min-h-[116px] max-h-[116px] max-w-[234px] pointer-events-none" : ""}`}>
          {q.isLoading ? (
            <div className="relative h-full w-full rounded-[18px] p-[3px] bg-[radial-gradient(120%_120%_at_50%_0%,oklch(0.55_0.13_170/0.28),transparent_70%)]">
              <div className="grid h-full w-full place-items-center rounded-[15px] bg-[oklch(0.055_0.008_190)] shadow-[0_0_28px_-10px_oklch(0.6_0.14_170/0.35)]">
                <Loader2 className="size-5 animate-spin" />
              </div>
            </div>
          ) : (
            <div className="h-full w-full overflow-hidden">
              {coins.map((c) => (
                <CoinBalanceCard key={c.coin} coin={c} />
              ))}
            </div>
          )}
        </div>

        {d.failed ? (
          <div className="shrink-0 rounded-xl border border-destructive/40 bg-destructive/10 p-2 text-[11px] text-destructive-foreground line-clamp-2">
            تعذر جلب البيانات: {String(d.failed)}
          </div>
        ) : (
          <button
            type="button"
            onClick={frozen ? undefined : onOpen}
            disabled={frozen}
            className={`mt-auto flex w-full shrink-0 items-center justify-center gap-2 rounded-2xl border border-teal-400/35 bg-[linear-gradient(135deg,oklch(0.32_0.08_190),oklch(0.22_0.06_190))] px-4 py-3 text-sm font-bold text-teal-100 shadow-[0_0_20px_-10px_oklch(0.7_0.15_190_/_0.8)] transition-all hover:border-teal-300/60 hover:brightness-125 hover:shadow-[0_0_28px_-8px_oklch(0.72_0.16_190_/_0.9)] disabled:cursor-not-allowed ${frozen ? "h-14 pr-[min(44%,234px)]" : ""}`}
          >
            <BarChart3 className="size-4 text-teal-300" />
            عرض بيانات الحساب
          </button>
        )}
      </div>
      {frozen && (
        <div className="pointer-events-none absolute inset-0 z-20 text-center" role="status" aria-label="الحساب مجمد">
           <div className="absolute inset-x-4 top-[132px] flex flex-col items-center gap-3">
             <div className="flex items-center gap-4" dir="ltr">
               <span className="flex items-center gap-1.5 rounded-full border border-destructive/60 bg-destructive/10 px-3 py-1 text-xs font-bold text-destructive" dir="ltr">
                 <Clock className="size-3.5" />
                 {timeLeft !== null ? <span className="tabular-nums">{formatLeft(timeLeft)}</span> : <span>بدون وقت</span>}
               </span>
               <Lock className="size-12 fill-destructive text-destructive" strokeWidth={1.8} aria-hidden="true" />
             </div>
             <strong className="text-2xl font-black text-destructive">الحساب مجمد</strong>
             <p className="max-w-full text-sm font-bold text-destructive">لا يمكن إجراء أي معاملة حتى يتم فك التجميد</p>
          </div>
        </div>
      )}
    </div>
  );
}
