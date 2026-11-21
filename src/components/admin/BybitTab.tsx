import { Fragment, useEffect, useState, useRef } from "react";
import { useUiState } from "@/lib/ui-state";
import { usePersistentState } from "@/lib/persistent-state";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getBybitOverview, getBybitCardTxns, syncAllBybitCardTxns, getBybitOnChain, getBybitInternal, getBybitP2P,
  getBybitCards, createBybitCard, deleteBybitCard, updateBybitCard,
  listBybitAccounts, addBybitAccount, removeBybitAccount, updateBybitAccount,
} from "@/lib/bybit.functions";
import { formatDateTime } from "@/lib/format";
import { BybitDocsCard } from "@/components/admin/BybitDocs";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { FintechBackdrop } from "@/components/admin/FintechBackdrop";
import { useAdminBack } from "@/components/admin/back-nav";
import { BybitLedgerPanel } from "@/components/admin/BybitLedgerPanel";
import { cardPurchasePresenter } from "@/lib/bybit-spend";
import { RefreshCw, CreditCard, Layers, ArrowUp, ArrowDown, ChevronDown, Loader2, Trash2, Copy, Pencil, Wallet, BarChart3, Clock, PieChart, Lock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Stat, Chip, Empty, visibleCoins, MerchantLogo, CoinLogo, CoinBalanceCard, ChainLogo } from "@/components/admin/bybit/BybitVisuals";
import { detectBrand, BrandBadge, CardsPanel, AddCardDialog } from "@/components/admin/bybit/BybitCardsUI";
import { BybitAccountInfoCard as AccountInfoCard } from "@/components/admin/bybit/BybitAccountInfoCard";

const TAB_KEY = "bybit_active_tab";
const money = (n: number, c = "USD") => `${c} ${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dt = (ms: number) => formatDateTime(ms);

type BybitAccountRow = {
  id: string;
  name: string;
  uid: string | null;
  sortOrder?: number;
  monthlyCashback?: number;
  frozen?: boolean;
  frozenUntil?: string | null;
};

export function BybitTab({ isAdmin }: { isAdmin: boolean }) {

  const qc = useQueryClient();
  const listFn = useServerFn(listBybitAccounts);
  const addFn = useServerFn(addBybitAccount);
  const removeFn = useServerFn(removeBybitAccount);
  const updateFn = useServerFn(updateBybitAccount);
  const [selected, setSelected] = usePersistentState<string | null>("bybit_selected_account", null);
  // القسم يفتح على المنظرة المركزية أولاً، وبعدها يفتح المستخدم باقي الحسابات.
  const [listOpen, setListOpen] = usePersistentState<boolean>("bybit_list_open", false);

  // كل مرة يُفتح فيها قسم معاملات الفيزا يبدأ من المنظرة المركزية، لا من حساب محدد.
  useEffect(() => {
    setSelected(null);
    setListOpen(false);
  }, []);

  const [addOpen, setAddOpen] = useState(false);
  const [addError, setAddError] = useState<{ message: string; serverIp?: string | null } | null>(null);
  const [editAccount, setEditAccount] = useState<BybitAccountRow | null>(null);

  const accounts = useQuery({ queryKey: ["bybit-accounts"], queryFn: () => listFn() });
  const list = (((accounts.data as any)?.accounts ?? []) as BybitAccountRow[])
    .slice()
    .sort((a, b) => {
      const ao = a.sortOrder && a.sortOrder > 0 ? a.sortOrder : Number.MAX_SAFE_INTEGER;
      const bo = b.sortOrder && b.sortOrder > 0 ? b.sortOrder : Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;
      return a.name.localeCompare(b.name, "ar");
    });


  // مزامنة معاملات كل الحسابات في الخلفية (مش الحساب المفتوح بس)
  const syncAllFn = useServerFn(syncAllBybitCardTxns);
  const syncedRef = useRef(false);
  useEffect(() => {
    if (syncedRef.current || list.length === 0) return;
    syncedRef.current = true;
    const t = setTimeout(() => {
      void syncAllFn().then(() => {
        qc.invalidateQueries({ queryKey: ["bybit-card"] });
        qc.invalidateQueries({ queryKey: ["bybit-overview"] });
      });
    }, 800);
    return () => clearTimeout(t);
  }, [list.length, qc, syncAllFn]);

  const addAccount = useMutation({
    mutationFn: (data: { apiKey: string; apiSecret: string; name: string; force?: boolean }) => addFn({ data }),
    onSuccess: (res: any) => {
      if (res?.ok === false) {
        setAddError({ message: res.error || "تعذر ربط الحساب", serverIp: res.serverIp ?? null });
        return;
      }
      setAddError(null);
      toast.success("تمت إضافة الحساب");
      setAddOpen(false);
      qc.invalidateQueries({ queryKey: ["bybit-accounts"] });
    },
    onError: (e: any) => setAddError({ message: e?.message || "تعذر ربط الحساب" }),
  });
  const removeAccount = useMutation({
    mutationFn: (data: { id: string }) => removeFn({ data }),
    onSuccess: () => {
      toast.success("تم حذف الحساب");
      qc.invalidateQueries({ queryKey: ["bybit-accounts"] });
    },
    onError: (e: any) => toast.error(e?.message || "فشل حذف الحساب"),
  });
  const saveAccount = useMutation({
    mutationFn: (data: { id: string; name: string; monthlyCashback: number; sortOrder: number }) => updateFn({ data }),
    onSuccess: () => {
      toast.success("تم حفظ بيانات الحساب");
      setEditAccount(null);
      qc.invalidateQueries({ queryKey: ["bybit-accounts"] });
    },
    onError: (e: any) => toast.error(e?.message || "فشل حفظ البيانات"),
  });
  const [freezeTarget, setFreezeTarget] = useState<any>(null);
  const freezeAccount = useMutation({
    mutationFn: (data: { id: string; frozen: boolean; frozenUntil?: string | null }) => updateFn({ data }),
    onSuccess: (_r, v) => {
      toast.success(v.frozen ? "تم تجميد الحساب" : "تم فك التجميد");
      setFreezeTarget(null);
      qc.invalidateQueries({ queryKey: ["bybit-accounts"] });
    },
    onError: (e: any) =>
      toast.error(/frozen/i.test(e?.message ?? "") ? "شغل كود تجميد الحسابات في قاعدة البيانات الأول" : e?.message || "فشل التجميد"),
  });


  const current = list.find((a) => a.id === selected) ?? null;

  useAdminBack(!current && listOpen ? () => setListOpen(false) : null, [!!current, listOpen]);

  if (current) {
    return (
      <BybitAccountView
        isAdmin={isAdmin}
        accountId={current.id}
        accountName={current.name}
        onBack={() => setSelected(null)}
      />
    );
  }

  if (!listOpen) {
    return (
      <div className="space-y-4 text-right" dir="rtl">
        <button
          type="button"
          onClick={() => setListOpen(true)}
          className="w-full rounded-2xl border border-border/60 bg-card/60 p-5 text-right transition hover:border-primary/60 hover:bg-card"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="size-10 rounded-xl bg-blue-500/15 text-blue-400 grid place-items-center">
                <Wallet className="size-5" />
              </span>
              <div>
                <div className="text-[11px] text-muted-foreground">
                  {accounts.isLoading ? "جاري التحميل…" : `${list.length} حساب مرتبط`}
                </div>
              </div>
            </div>
            <span className="text-xs text-muted-foreground">فتح ›</span>
          </div>
        </button>
        <BybitLedgerPanel />
      </div>
    );
  }


  return (
    <div className="relative space-y-4 text-right" dir="rtl">
      <FintechBackdrop fullscreen />
      {accounts.isLoading ? (
        <div className="relative z-10 flex justify-center p-10"><Loader2 className="size-6 animate-spin" /></div>
      ) : !list.length ? (
        <div className="relative z-10 rounded-3xl border border-border/60 bg-card/60 p-8 text-center text-sm text-muted-foreground">
          لا توجد حسابات مربوطة بعد{isAdmin ? " — أضف حسابا بمفتاح API (قراءة فقط)." : "."}
        </div>
      ) : (
        <div className="relative z-10 grid auto-rows-auto grid-cols-1 items-start gap-4 xl:grid-cols-2">
          {list.map((a, i) => (
            <AccountSummaryCard
              key={a.id}
              account={a}
              index={i}
              isAdmin={isAdmin}
              onOpen={() => setSelected(a.id)}
              onDelete={() => removeAccount.mutate({ id: a.id })}
              onEdit={() => setEditAccount(a)}
              onToggleFreeze={() => (a.frozen ? freezeAccount.mutate({ id: a.id, frozen: false }) : setFreezeTarget(a))}
              onFreezeExpired={() => qc.invalidateQueries({ queryKey: ["bybit-accounts"] })}
              freezePending={freezeAccount.isPending && freezeAccount.variables?.id === a.id}
            />
          ))}
        </div>
      )}




      <FreezeDialog
        account={freezeTarget}
        pending={freezeAccount.isPending}
        onClose={() => setFreezeTarget(null)}
        onConfirm={(frozenUntil) => freezeTarget && freezeAccount.mutate({ id: freezeTarget.id, frozen: true, frozenUntil })}
      />
      <AddAccountDialog
        open={addOpen}
        busy={addAccount.isPending}
        error={addError}
        onClose={() => { setAddOpen(false); setAddError(null); }}
        onSubmit={(d) => addAccount.mutate(d)}
      />

      <EditAccountDialog
        account={editAccount}
        busy={saveAccount.isPending}
        onClose={() => setEditAccount(null)}
        onSubmit={(d) => saveAccount.mutate(d)}
      />

    </div>
  );
}

function AccountSummaryCard({
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


function validateBybitCreds({ name, apiKey, apiSecret }: { name: string; apiKey: string; apiSecret: string }) {
  const e: { name?: string; apiKey?: string; apiSecret?: string } = {};
  const n = name.trim();
  const k = apiKey.trim();
  const sec = apiSecret.trim();
  if (n.length > 60) e.name = "اسم الحساب لازم يكون أقل من 60 حرف";
  if (!k) e.apiKey = "أدخل API Key";
  else if (k.length < 8 || k.length > 200) e.apiKey = "مفتاح API غير صالح (من 8 إلى 200 حرف)";
  else if (!/^[A-Za-z0-9_-]+$/.test(k)) e.apiKey = "مفتاح API يحتوي على رموز غير مسموحة";
  if (!sec) e.apiSecret = "أدخل API Secret";
  else if (sec.length < 8 || sec.length > 400) e.apiSecret = "السر غير صالح (من 8 إلى 400 حرف)";
  else if (!/^[A-Za-z0-9_-]+$/.test(sec)) e.apiSecret = "السر يحتوي على رموز غير مسموحة";
  return e;
}

export function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] text-muted-foreground block">{label}</label>
      {children}
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}

function formatLeft(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d > 0 ? `${d}d ` : ""}${pad(h)}:${pad(m)}:${pad(sec)}`;
}

function FreezeDialog({ account, pending, onClose, onConfirm }: { account: any; pending: boolean; onClose: () => void; onConfirm: (frozenUntil: string | null) => void }) {
  const [mode, setMode] = useState<"timed" | "manual">("timed");
  const [days, setDays] = useState("0");
  const [hours, setHours] = useState("1");
  const [minutes, setMinutes] = useState("0");
  useEffect(() => { if (account) { setMode("timed"); setDays("0"); setHours("1"); setMinutes("0"); } }, [account]);
  const totalMs = ((Number(days) || 0) * 86400 + (Number(hours) || 0) * 3600 + (Number(minutes) || 0) * 60) * 1000;
  const pick = (on: boolean) => `flex-1 rounded-lg border px-3 py-2 text-sm font-bold ${on ? "border-destructive bg-destructive/15 text-destructive" : "border-border text-muted-foreground"}`;
  const submit = () => {
    if (mode === "manual") return onConfirm(null);
    if (totalMs <= 0) return toast.error("حدد مدة التجميد");
    onConfirm(new Date(Date.now() + totalMs).toISOString());
  };
  return (
    <Dialog open={!!account} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm text-right" dir="rtl">
        <DialogHeader>
          <DialogTitle>تجميد حساب {account?.name}</DialogTitle>
        </DialogHeader>
        <div className="flex gap-2">
          <button type="button" className={pick(mode === "timed")} onClick={() => setMode("timed")}>لمدة محددة</button>
          <button type="button" className={pick(mode === "manual")} onClick={() => setMode("manual")}>بدون وقت</button>
        </div>
        {mode === "timed" ? (
          <div className="grid grid-cols-3 gap-2">
            <Field label="أيام"><Input type="number" min={0} value={days} onChange={(e) => setDays(e.target.value)} /></Field>
            <Field label="ساعات"><Input type="number" min={0} value={hours} onChange={(e) => setHours(e.target.value)} /></Field>
            <Field label="دقائق"><Input type="number" min={0} value={minutes} onChange={(e) => setMinutes(e.target.value)} /></Field>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">الحساب هيفضل مجمد لحد ما تفك التجميد بنفسك</p>
        )}
        <Button variant="destructive" className="w-full" onClick={submit} disabled={pending}>
          {pending ? "جاري التجميد…" : "تجميد الحساب"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function AddAccountDialog({
  open, onClose, onSubmit, busy, error,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (d: { apiKey: string; apiSecret: string; name: string; force?: boolean }) => void;
  busy: boolean;
  error?: { message: string; serverIp?: string | null } | null;
}) {
  const [name, setName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [errors, setErrors] = useState<{ name?: string; apiKey?: string; apiSecret?: string }>({});
  useEffect(() => {
    if (!open) { setName(""); setApiKey(""); setApiSecret(""); setErrors({}); }
  }, [open]);

  function submit(force = false) {
    const e = validateBybitCreds({ name, apiKey, apiSecret });
    setErrors(e);
    if (Object.keys(e).length) return;
    onSubmit({ apiKey: apiKey.trim(), apiSecret: apiSecret.trim(), name: name.trim(), force });
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md text-right" dir="rtl">
        <DialogHeader>
          <DialogTitle>إضافة حساب Bybit</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="اسم الحساب" error={errors.name}>
            <Input placeholder="مثال: حساب الشركة الرئيسي" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          </Field>
          <Field label="API Key" error={errors.apiKey}>
            <Input dir="ltr" placeholder="API Key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          </Field>
          <Field label="API Secret" error={errors.apiSecret}>
            <Input dir="ltr" placeholder="API Secret" type="password" value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} />
          </Field>
          <p className="text-[11px] text-muted-foreground">لو سبت الاسم فاضي هيتجاب أوتوماتيك من Bybit بعد التحقق من المفتاح.</p>
          {error && (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 space-y-2 text-[11px] text-destructive">
              <div>{error.message}</div>
              {error.serverIp && (
                <div className="text-muted-foreground" dir="ltr">
                  Server IP: {error.serverIp}
                </div>
              )}
              <div className="text-muted-foreground">
                تقدر تحفظ الحساب برضه وتصلح صلاحيات المفتاح من Bybit بعدين.
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full rounded-xl"
                disabled={busy}
                onClick={() => submit(true)}
              >
                {busy ? <Loader2 className="size-4 ml-1 animate-spin" /> : null} احفظ الحساب رغم التحذير
              </Button>
            </div>
          )}
          <Button className="w-full rounded-xl" disabled={busy} onClick={() => submit(false)}>
            {busy ? <Loader2 className="size-4 ml-1 animate-spin" /> : null} ربط الحساب
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditAccountDialog({
  account, onClose, onSubmit, busy,
}: {
  account: BybitAccountRow | null;
  onClose: () => void;
  onSubmit: (d: { id: string; name: string; monthlyCashback: number; sortOrder: number }) => void;
  busy: boolean;
}) {
  const [name, setName] = useState("");
  const [cashback, setCashback] = useState("0");
  const [order, setOrder] = useState("1");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (account) {
      setName(account.name ?? "");
      setCashback(String(account.monthlyCashback ?? 0));
      setOrder(String(account.sortOrder ?? 1));
      setError(null);
    }
  }, [account]);

  function submit() {
    if (!account) return;
    const n = name.trim();
    if (!n) return setError("اسم الحساب مطلوب");
    const c = Number(cashback);
    if (!Number.isFinite(c) || c < 0 || c > 100) return setError("نسبة الاسترداد لازم تكون بين 0 و 100");
    const o = Math.trunc(Number(order));
    if (!Number.isFinite(o) || o < 1 || o > 9999) return setError("رقم الفيزا لازم يكون بين 1 و 9999");
    setError(null);
    onSubmit({ id: account.id, name: n.slice(0, 60), monthlyCashback: c, sortOrder: o });
  }

  return (
    <Dialog open={!!account} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md text-right" dir="rtl">
        <DialogHeader>
          <DialogTitle>تعديل بيانات الفيزا</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="رقم الفيزا">
            <Input
              dir="ltr"
              type="number"
              min={1}
              max={9999}
              step="1"
              value={order}
              onChange={(e) => setOrder(e.target.value)}
            />
          </Field>
          <Field label="اسم الحساب">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          </Field>
          <Field label="الاسترداد الشهري (%)">
            <Input
              dir="ltr"
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={cashback}
              onChange={(e) => setCashback(e.target.value)}
            />
          </Field>
          {account?.uid && (
            <p className="text-[11px] text-muted-foreground" dir="ltr">UID {account.uid}</p>
          )}
          {error && <p className="text-[11px] text-destructive">{error}</p>}
          <Button className="w-full rounded-xl" disabled={busy} onClick={submit}>
            {busy ? <Loader2 className="size-4 ml-1 animate-spin" /> : null} حفظ التعديلات
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}


function BybitAccountView({ isAdmin, accountId, accountName, onBack }: { isAdmin: boolean; accountId: string; accountName: string; onBack: () => void }) {
  const qc = useQueryClient();
  // الموظف يشاهد كل بيانات القسم (قراءة فقط). الأدوات الخاصة بالأدمن
  // (إضافة/حذف حساب، مفاتيح API، التحويل، تعديل البطاقات وبيانات الحساب)
  // محكومة بـ isAdmin في مكانها.
  const show = (_k: "balance" | "spend" | "txns" | "onchain" | "internal" | "cards" | "account" | "docs") => true;
  const [tab, setTab] = useUiState<"card" | "onchain" | "internal" | "p2p">("bybit", "tab", "card");
  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(TAB_KEY) : null;
    if (saved === "card" || saved === "onchain" || saved === "internal" || saved === "p2p") setTab(saved);
  }, []);
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(TAB_KEY, tab);
  }, [tab]);

  const overviewFn = useServerFn(getBybitOverview);
  const cardsFn = useServerFn(getBybitCards);
  const [cardsOpen, setCardsOpen] = useState(false);
  useAdminBack(cardsOpen ? () => setCardsOpen(false) : onBack, [cardsOpen, onBack]);
  const [addCardOpen, setAddCardOpen] = useState(false);
  const chainFn = useServerFn(getBybitOnChain);
  const internalFn = useServerFn(getBybitInternal);
  const p2pFn = useServerFn(getBybitP2P);
  const createCardFn = useServerFn(createBybitCard);
  const deleteCardFn = useServerFn(deleteBybitCard);
  const updateCardFn = useServerFn(updateBybitCard);
  const [editCard, setEditCard] = useState<any | null>(null);

  const overview = useQuery({ queryKey: ["bybit-overview", accountId], queryFn: () => overviewFn({ data: { accountId } }) });
  const chain = useQuery({ queryKey: ["bybit-chain", accountId], queryFn: () => chainFn({ data: { accountId } }), enabled: tab === "onchain" });
  const internal = useQuery({ queryKey: ["bybit-internal", accountId], queryFn: () => internalFn({ data: { accountId } }), enabled: tab === "internal" });
  const p2p = useQuery({ queryKey: ["bybit-p2p", accountId], queryFn: () => p2pFn({ data: { accountId } }), enabled: tab === "p2p" });
  const cards = useQuery({ queryKey: ["bybit-cards", accountId], queryFn: () => cardsFn({ data: { accountId } }), enabled: cardsOpen });

  const createCard = useMutation({
    mutationFn: (data: { pan4: string; brand: string; currency: string; status: string; name?: string; fullNumber?: string; cvv?: string; expiry?: string }) =>
      createCardFn({ data: { ...data, accountId } }),
    onSuccess: () => {
      toast.success("تمت إضافة البطاقة");
      setAddCardOpen(false);
      qc.invalidateQueries({ queryKey: ["bybit-cards", accountId] });
    },
    onError: (e: any) => toast.error(e?.message || "فشل إضافة البطاقة"),
  });
  const updateCard = useMutation({
    mutationFn: (data: any) => updateCardFn({ data }),
    onSuccess: () => {
      toast.success("تم تحديث البطاقة");
      setEditCard(null);
      qc.invalidateQueries({ queryKey: ["bybit-cards", accountId] });
    },
    onError: (e: any) => toast.error(e?.message || "فشل تعديل البطاقة"),
  });
  const deleteCard = useMutation({
    mutationFn: (data: { id: string }) => deleteCardFn({ data }),
    onSuccess: () => {
      toast.success("تم حذف البطاقة");
      qc.invalidateQueries({ queryKey: ["bybit-cards", accountId] });
    },
    onError: (e: any) => toast.error(e?.message || "فشل حذف البطاقة"),
  });

  const configured = (overview.data as any)?.configured !== false;
  const failed = (overview.data as any)?.failed as string | undefined;
  const partialErrors = ((overview.data as any)?.errors ?? []) as string[];
  const coinBalances = visibleCoins(((overview.data as any)?.coins ?? []) as CoinRow[]);
  const monthSpend = (overview.data as any)?.monthSpend ?? 0;
  const daySpend = (overview.data as any)?.daySpend ?? 0;
  const monthFees = Number((overview.data as any)?.monthFees ?? 0);
  const dayFees = Number((overview.data as any)?.dayFees ?? 0);

  


  function refreshAll() {
    qc.invalidateQueries({ queryKey: ["bybit-overview", accountId] });
    qc.invalidateQueries({ queryKey: ["bybit-card", accountId] });
    qc.invalidateQueries({ queryKey: ["bybit-chain", accountId] });
    qc.invalidateQueries({ queryKey: ["bybit-internal", accountId] });
  }

  return (
    <div className="space-y-4 text-right" dir="rtl">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {cardsOpen && <h2 className="text-sm font-bold">بطاقاتي</h2>}
        </div>
        {!cardsOpen && (
          <div className="flex items-center gap-2">
            {show("cards") && (
              <Button variant="secondary" size="sm" className="rounded-xl" onClick={() => setCardsOpen(true)}>
                <CreditCard className="size-4 ml-1" />بطاقة
              </Button>
            )}
            <Button variant="outline" size="icon" className="rounded-xl" onClick={refreshAll}>
              <RefreshCw className={`size-4 ${overview.isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        )}
      </div>
      {cardsOpen ? (
        <>
          <CardsPanel q={cards} isAdmin={isAdmin} onAdd={() => setAddCardOpen(true)} onDelete={(id) => deleteCard.mutate({ id })} onEdit={(c) => setEditCard(c)} onToggleFreeze={(c, frozen) => updateCard.mutate({ id: c.id, pan4: c.pan4 ?? "", brand: c.brand ?? "Visa", currency: c.currency ?? "USD", status: frozen ? "frozen" : "active", name: c.name ?? "", fullNumber: c.fullNumber ?? "", cvv: c.cvv ?? "", expiry: c.expiry ?? "" })} />
          {show("account") && <AccountInfoCard isAdmin={isAdmin} accountId={accountId} />}
          <BybitDocsCard isAdmin={isAdmin} accountId={accountId} />
          <AddCardDialog
            open={addCardOpen}
            onClose={() => setAddCardOpen(false)}
            onSubmit={(data) => createCard.mutate(data)}
            busy={createCard.isPending}
          />
          <AddCardDialog
            open={Boolean(editCard)}
            card={editCard}
            onClose={() => setEditCard(null)}
            onSubmit={(data) => updateCard.mutate({ ...data, id: editCard?.id })}
            busy={updateCard.isPending}
          />
        </>
      ) : (
      <>
      {!configured && !isAdmin && (
        <div className="rounded-2xl border border-border/60 bg-card/60 p-6 text-sm text-muted-foreground">
          لم يتم ربط حساب Bybit بعد — مطلوب مفتاح API (قراءة فقط) لعرض الرصيد والمعاملات.
        </div>
      )}
      {failed && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-xs text-destructive-foreground">
          تعذر جلب البيانات من Bybit: {failed}
        </div>
      )}
      {!failed && partialErrors.length > 0 && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-400" dir="ltr">
          {partialErrors.map((e, i) => (
            <div key={i}>{e}</div>
          ))}
        </div>
      )}

      {/* Balance cards */}
      {show("balance") && (
        <div className="rounded-2xl border border-border/60 bg-card/70 p-4">
          <div className="flex flex-wrap items-stretch gap-3">
            {coinBalances.map((c) => (
              <div
                key={c.coin}
                className="rounded-xl border border-border/60 bg-background/60 p-3 inline-flex flex-col gap-1"
              >
                <div dir="ltr" className="flex items-center gap-2">
                  <CoinLogo coin={c.coin} />
                  <span className="text-sm font-bold text-muted-foreground">{c.coin}</span>
                  <span className="text-3xl font-black tracking-tight tabular-nums">
                    {c.balance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground" dir="ltr">≈ {money(c.usd)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Spending stats inside account detail */}

      {show("spend") && (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-border/60 bg-card/70 p-3">
            <div className="text-xs font-bold text-muted-foreground mb-2 px-1">الإنفاق</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Stat label="الإنفاق الشهري" value={`$${monthSpend.toFixed(2)}`} />
              <Stat label="الإنفاق اليومي" value={`$${daySpend.toFixed(2)}`} />
            </div>
          </div>
          <div className="rounded-2xl border border-border/60 bg-card/70 p-3">
            <div className="text-xs font-bold text-muted-foreground mb-2 px-1">رسوم الفيزا</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Stat label="رسوم الفيزا الشهرية" value={`$${monthFees.toFixed(2)}`} />
              <Stat label="رسوم الفيزا اليومية" value={`$${dayFees.toFixed(2)}`} />
            </div>
          </div>
        </div>
      )}



      {/* Tabs */}
      <div className="flex items-center justify-start gap-2">
        {show("txns") && <Chip active={tab === "card"} onClick={() => setTab("card")}>المعاملات</Chip>}
        {show("onchain") && <Chip active={tab === "onchain"} onClick={() => setTab("onchain")}>السحب والإيداع الخارجي</Chip>}
        {show("internal") && <Chip active={tab === "internal"} onClick={() => setTab("internal")}>السحب والإيداع الداخلي</Chip>}
        {show("txns") && <Chip active={tab === "p2p"} onClick={() => setTab("p2p")}>طلبات P2P</Chip>}
      </div>

      {tab === "card" && show("txns") && <CardTable accountId={accountId} />}
      {tab === "onchain" && show("onchain") && <AssetTable q={chain} title="" icon inChip="الاستلام" outChip="التحويل على السلسلة" showAddress={false} hideFeeOnDeposit />}
      {tab === "internal" && show("internal") && <AssetTable q={internal} title="" inChip="إيداع" outChip="سحب" showAddress hideChain />}
      {tab === "p2p" && show("txns") && <P2PTable q={p2p} />}
      </>
      )}
    </div>
  );
}

/** يحدد نوع البطاقة تلقائيًا من رقمها */
function CardTable({ accountId }: { accountId?: string }) {
  const cardsFn = useServerFn(getBybitCards);
  const cards = useQuery({
    queryKey: ["bybit-cards", accountId],
    queryFn: () => cardsFn({ data: { accountId } }),
  });
  const brandByPan4: Record<string, string> = {};
  for (const c of ((cards.data as any)?.cards ?? []) as any[]) {
    const pan4 = String(c?.pan4 ?? "").trim();
    if (!pan4) continue;
    brandByPan4[pan4] = detectBrand(String(c?.fullNumber ?? "")) || String(c?.brand ?? "Visa");
  }
  return <CardTableInner brandByPan4={brandByPan4} accountId={accountId} />;
}

function P2PTable({ q }: { q: any }) {
  const [side, setSide] = usePersistentState<"all" | "buy" | "sell">("bybit.p2p.side", "buy");
  const rows: any[] = (q.data?.rows ?? []).filter((r: any) => r.status !== "pending");
  const shown = rows.filter((r) => (side === "all" ? true : r.side === side));

  return (
    <div className="rounded-3xl border border-border/60 bg-card/70 overflow-hidden">
      <div className="flex items-center justify-start gap-1 p-4">
        <Chip active={side === "buy"} onClick={() => setSide("buy")}>شراء</Chip>
        <Chip active={side === "sell"} onClick={() => setSide("sell")}>بيع</Chip>
        <Chip active={side === "all"} onClick={() => setSide("all")}>الجميع</Chip>
      </div>
      {q.isLoading ? (
        <Empty text="جار التحميل…" />
      ) : q.data?.failed ? (
        <div className="p-6 text-center text-xs text-destructive" dir="ltr">{String(q.data.failed)}</div>
      ) : !shown.length ? (
        <Empty text="لا توجد طلبات P2P" />
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="p-4 text-right font-normal">النوع / التاريخ</th>
                <th className="p-4 text-right font-normal">رقم الطلب</th>
                <th className="p-4 text-right font-normal">السعر</th>
                <th className="p-4 text-right font-normal">المبلغ / الكمية</th>
                <th className="p-4 text-right font-normal">الطرف المقابل</th>
                <th className="p-4 text-right font-normal">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="border-b border-border/40 hover:bg-muted/10 transition-colors">
                  <td className="p-4">
                    <div className="font-bold">
                      {r.coin} <span className={r.side === "buy" ? "text-emerald-400" : "text-destructive"}>{r.side === "buy" ? "شراء" : "بيع"}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground" dir="ltr">{formatDateTime(r.time)}</div>
                  </td>
                  <td className="p-4 font-mono text-xs" dir="ltr">{r.id}</td>
                  <td className="p-4" dir="ltr">{r.fiat} {r.price}</td>
                  <td className="p-4" dir="ltr">
                    <div>{r.fiat} {r.amount}</div>
                    <div className="text-[11px] text-muted-foreground">{r.coin} {r.quantity}</div>
                  </td>
                  <td className="p-4">{r.counterparty || "—"}</td>
                  <td className="p-4">
                    <span className={r.status === "اكتملت" ? "text-emerald-400" : r.status === "ملغاة" ? "text-destructive" : ""}>{r.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CardTableInner({
  brandByPan4 = {},
  accountId,
}: {
  brandByPan4?: Record<string, string>;
  accountId?: string;
}) {
  const [filter, setFilter] = usePersistentState<"all" | "success" | "failed" | "refund">("bybit.card.filter", "all");
  const [openId, setOpenId] = usePersistentState<string | null>("bybit.card.open", null);
  const PAGE_SIZE = 150;
  const [page, setPage] = useState(1);

  // A page number from another account/filter must never make the newly opened
  // account appear empty.
  useEffect(() => setPage(1), [accountId, filter]);

  // The archive is read one page at a time: the full stored history is far too
  // large to travel in a single response, which is what left the table empty.
  const txnsFn = useServerFn(getBybitCardTxns);
  const q = useQuery({
    queryKey: ["bybit-card", accountId, filter, page],
    queryFn: () => txnsFn({ data: { accountId, status: filter, page, pageSize: PAGE_SIZE } }),
    staleTime: 30_000,
  });

  const shown: any[] = (q.data as any)?.rows ?? [];
  const total = Number((q.data as any)?.total ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(page, pageCount);

  return (
    <div className="rounded-3xl border border-border/60 bg-card/70 overflow-hidden">
      <div className="flex items-center justify-start gap-2 p-4">
        <div className="flex items-center gap-1">
          <Chip active={filter === "all"} onClick={() => setFilter("all")}>الكل</Chip>
          <Chip active={filter === "success"} onClick={() => setFilter("success")}>المشتريات الناجحة</Chip>
          <Chip active={filter === "failed"} onClick={() => setFilter("failed")}>المشتريات الفاشلة</Chip>
          <Chip active={filter === "refund"} onClick={() => setFilter("refund")}>المبلغ المسترد</Chip>
        </div>
      </div>
      {q.isLoading ? (
        <Empty text="جار التحميل…" />
      ) : !shown.length ? (
        <Empty text="لا توجد معاملات" />
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="p-4 text-right font-normal">اسم التاجر</th>
                <th className="p-4 text-center font-normal">إجمالي المبلغ المصحح</th>
                <th className="p-4 text-right font-normal">النوع</th>
                <th className="p-4 text-right font-normal">الحالة</th>
                <th className="p-4 text-right font-normal">تاريخ ووقت المعاملة</th>
                <th className="p-4 text-right font-normal">آخر 4 أرقام للبطاقة</th>
                <th className="p-4 text-right font-normal">الإجراء</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((t) => (
                <Fragment key={t.id}>
                <tr className="border-b border-border/40 hover:bg-muted/10 transition-colors">
                  <td className="p-4">
                    <div className="flex items-center justify-start gap-3">
                      <MerchantLogo name={t.merchant} />
                      <span className="font-semibold">{t.merchant}</span>
                    </div>
                  </td>
                  <td className="p-4 text-center font-bold tabular-nums text-destructive" dir="ltr">
                    -{t.currency} {Math.abs(t.amount).toFixed(2)}
                  </td>
                  <td className="p-4 text-xs text-muted-foreground">
                    {t.status === "refund" ? "استرداد" : t.type ? String(t.type) : "شراء"}
                  </td>
                  <td className="p-4">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${cardPurchasePresenter(t).cls}`}>
                      {cardPurchasePresenter(t).text}
                    </span>
                  </td>
                  <td className="p-4 text-xs text-muted-foreground tabular-nums">{dt(t.time)}</td>
                  <td className="p-4">
                    <span className="inline-flex items-center gap-2">
                      <span className="scale-90 origin-right">
                        <BrandBadge brand={brandByPan4[String(t.pan4 ?? "").trim()] || t.cardBrand || "Visa"} />
                      </span>
                      <span className="font-bold tabular-nums">{t.pan4 || "—"}</span>
                    </span>
                  </td>
                  <td className="p-4">
                    <button
                      onClick={() => setOpenId((v: string | null) => (v === t.id ? null : t.id))}
                      className="table-btn"
                    >
                      التفاصيل
                      <ChevronDown className={`size-3.5 transition-transform ${openId === t.id ? "rotate-180" : ""}`} />
                    </button>
                  </td>
                </tr>
                {openId === t.id && (
                  <tr className="border-b border-border/40 bg-muted/20">
                    <td colSpan={7} className="p-4">
                      <TxnDetails txn={t} />
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pageCount > 1 && (
        <div className="flex flex-wrap items-center justify-center gap-2 border-t border-border/40 p-4" dir="rtl">
          <button
            onClick={() => setPage(Math.max(1, current - 1))}
            disabled={current === 1}
            className="rounded-lg border border-border/60 bg-card px-3 py-1.5 text-xs disabled:opacity-40"
          >
            السابق
          </button>
          {Array.from({ length: pageCount }, (_, i) => i + 1)
            .filter((p) => p === 1 || p === pageCount || Math.abs(p - current) <= 2)
            .map((p, i, arr) => (
              <Fragment key={p}>
                {i > 0 && arr[i - 1] !== undefined && p - (arr[i - 1] as number) > 1 && (
                  <span className="px-1 text-xs text-muted-foreground">…</span>
                )}
                <button
                  onClick={() => setPage(p)}
                  className={`min-w-9 rounded-lg border px-3 py-1.5 text-xs tabular-nums ${
                    p === current
                      ? "border-primary bg-primary text-primary-foreground font-bold"
                      : "border-border/60 bg-card hover:bg-muted/20"
                  }`}
                >
                  {p}
                </button>
              </Fragment>
            ))}
          <button
            onClick={() => setPage(Math.min(pageCount, current + 1))}
            disabled={current === pageCount}
            className="rounded-lg border border-border/60 bg-card px-3 py-1.5 text-xs disabled:opacity-40"
          >
            التالي
          </button>
        </div>
      )}
    </div>
  );
}

type FieldDef = [string, string];

const CORE_FIELDS: FieldDef[] = [
  ["txnId", "معرف المعاملة"],
  ["orderId", "معرف الطلب / المرجع"],
  ["paymentId", "معرف الدفع"],
  ["authCode", "كود التفويض"],
  ["stage", "مرحلة المعاملة"],
  ["eventCode", "كود الحدث"],
  ["createdAt", "تاريخ الإنشاء"],
  ["updatedAt", "آخر تحديث"],
];

const AMOUNT_FIELDS: FieldDef[] = [
  ["transactionAmount", "مبلغ المعاملة"],
  ["transactionCurrency", "عملة المعاملة"],
  ["localAmount", "المبلغ بالعملة المحلية"],
  ["localCurrency", "العملة المحلية"],
  ["grossAmount", "المبلغ الإجمالي"],
  ["netAmount", "الصافي"],
  ["feeAmount", "الرسوم"],
  ["foreignTxnFee", "رسوم المعاملة الأجنبية"],
  ["tax", "الضريبة"],
  ["shipping", "الشحن"],
  ["paidWithCrypto", "المدفوع بالعملة الرقمية"],
  ["paidWithFiat", "المدفوع نقدا"],
  ["protectionEligibility", "أهلية الحماية"],
];

const PROCESSOR_FIELDS: FieldDef[] = [
  ["responseCode", "كود استجابة المعالج"],
  ["declineCode", "كود الرفض"],
  ["declineReason", "سبب الرفض"],
  ["avsCode", "نتيجة AVS"],
  ["cvvCode", "نتيجة CVV"],
  ["paymentAdviceCode", "Payment Advice Code"],
  ["apiErrorCode", "كود خطأ الـ API"],
];

const MERCHANT_FIELDS: FieldDef[] = [
  ["merchantName", "اسم التاجر"],
  ["mcc", "فئة التاجر (MCC)"],
  ["merchantLocation", "الموقع"],
  ["merchantWebsite", "الموقع الإلكتروني"],
  ["merchantEmail", "البريد الإلكتروني"],
  ["merchantDescription", "وصف التاجر"],
  ["terminalId", "معرف الطرفية"],
  ["storeId", "معرف المتجر"],
];


function has(d: Record<string, string | number | null>, k: string) {
  return d[k] !== null && d[k] !== undefined && d[k] !== "";
}

const DATE_KEYS = new Set(["createdAt", "updatedAt", "txnCreate"]);

function fmtValue(key: string, value: string | number | null): string {
  const s = String(value ?? "").trim();
  if (!s) return "—";
  if (DATE_KEYS.has(key)) {
    const n = Number(s);
    if (Number.isFinite(n) && n > 1_000_000_000) return dt(n < 1e12 ? n * 1000 : n);
  }
  if (/^-?\d+(\.\d+)?$/.test(s) && s.includes(".")) {
    const n = Number(s);
    if (Number.isFinite(n)) {
      const abs = Math.abs(n);
      const digits = abs > 0 && abs < 0.01 ? 6 : 2;
      return n.toLocaleString("en-US", { maximumFractionDigits: digits });
    }
  }
  if (/^-?\d+(\.\d+)?[eE][-+]?\d+$/.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) return n === 0 ? "0" : n.toLocaleString("en-US", { maximumFractionDigits: 6 });
  }
  return s;
}

/**
 * Fee breakdown per transaction, read from the transaction's own data.
 * A fee is only shown when the provider actually reports one — either as an
 * explicit fee field, or as the gap between the charged total and the
 * transaction amount. Fee-free transactions show the full amount instead.
 */
function feeBreakdown(txn: any) {
  const d = (txn?.detail ?? {}) as Record<string, any>;
  const num = (v: any) => {
    const n = Number(v ?? NaN);
    return Number.isFinite(n) ? Math.abs(n) : null;
  };
  const total = num(txn?.amount) ?? num(d["basicAmount"]) ?? num(d["grossAmount"]);
  const net = num(d["transactionAmount"]) ?? num(d["basicAmount"]);

  let fee: number | null = null;
  for (const k of ["foreignTxnFee", "feeAmount", "fee", "handlingFee"]) {
    const n = num(d[k]);
    if (n) { fee = n; break; }
  }
  if (fee === null && total !== null && net !== null && total - net > 0.0049) fee = total - net;

  const spend = fee !== null && total !== null ? total - fee : (net ?? total);
  return { total, fee, spend };
}

function TxnDetails({ txn }: { txn: any }) {
  const d = (txn?.detail ?? {}) as Record<string, string | number | null>;
  const { total, fee, spend } = feeBreakdown(txn);
  const cur = String(txn?.currency || "USD");
  const money = (n: number) => `${cur} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const sections = [
    { defs: CORE_FIELDS, title: "بيانات المعاملة الأساسية" },
    { defs: AMOUNT_FIELDS, title: "تفصيل العملة والرسوم" },
    { defs: PROCESSOR_FIELDS, title: "بيانات المعالج وسبب الرفض" },
    { defs: MERCHANT_FIELDS, title: "تفاصيل التاجر" },
  ]
    .map((s) => ({ ...s, fields: s.defs.filter(([k]) => has(d, k)) }))
    .filter((s) => s.fields.length);

  return (
    <div className="rounded-2xl border border-border/50 bg-muted/10 p-4" dir="rtl">
      <div className="flex flex-col gap-5">
        {sections.map((s) => (
          <div key={s.title}>
            <div className="mb-3 text-sm font-black">{s.title}</div>
            <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              {s.fields.map(([k, label]) => (
                <div key={k} className="flex items-start justify-between gap-3 border-b border-border/30 pb-2">
                  <div className="shrink-0 text-[11px] text-muted-foreground">{label}</div>
                  <div className="break-all text-left text-sm font-semibold" dir="auto">
                    {fmtValue(k, d[k])}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div>
          <div className="mb-3 text-sm font-black">الرسوم والمبلغ المحتسب</div>
          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["إجمالي المعاملة", total !== null ? money(total) : "—"],
              ["الرسوم", fee !== null && fee > 0 ? money(fee) : "بدون رسوم"],
              ["المحتسب في الصرف الشهري", spend !== null ? money(spend) : "—"],
            ].map(([label, value]) => (
              <div key={label} className="flex items-start justify-between gap-3 border-b border-border/30 pb-2">
                <div className="shrink-0 text-[11px] text-muted-foreground">{label}</div>
                <div className="break-all text-left text-sm font-semibold" dir="auto">{value}</div>
              </div>
            ))}
          </div>
        </div>
        {!sections.length && (
          <div className="text-xs text-muted-foreground">لا توجد تفاصيل إضافية لهذه المعاملة.</div>
        )}
      </div>
    </div>
  );
}




export function AssetTable({
  q, title, inChip, outChip, showAddress, icon, hideFeeOnDeposit, hideChain,
}: { q: any; title: string; inChip: string; outChip: string; showAddress: boolean; icon?: boolean; hideFeeOnDeposit?: boolean; hideChain?: boolean }) {
  const [dir, setDir] = usePersistentState<"out" | "in">(`bybit.asset.${title}.dir`, "out");
  const [openId, setOpenId] = usePersistentState<string | null>(`bybit.asset.${title}.open`, null);
  const deposits: any[] = q.data?.deposits ?? [];
  const withdrawals: any[] = q.data?.withdrawals ?? [];
  const rows = dir === "in" ? deposits : withdrawals;
  const showFee = !showAddress && !(hideFeeOnDeposit && dir === "in");
  const colCount = 4 + (hideChain ? 0 : 1) + (showAddress ? 1 : showFee ? 1 : 0);

  return (
    <div className="rounded-3xl border border-border/60 bg-card/70 overflow-hidden">
      <div className={`flex items-center gap-2 p-4 ${title ? "justify-between" : "justify-start"}`}>
        {title && (
          <div className="text-base font-black inline-flex items-center gap-2">
            {title} {icon && <Layers className="size-4 text-muted-foreground" />}
          </div>
        )}
        <div className="flex items-center gap-2">
          <Chip active={dir === "out"} onClick={() => setDir("out")}>
            <span className="inline-flex items-center gap-1"><ArrowUp className="size-3" /> {outChip}</span>
          </Chip>
          <Chip active={dir === "in"} onClick={() => setDir("in")}>
            <span className="inline-flex items-center gap-1"><ArrowDown className="size-3" /> {inChip}</span>
          </Chip>
        </div>
      </div>
      {q.isLoading ? (
        <Empty text="جار التحميل…" />
      ) : !rows.length ? (
        <Empty text="لا توجد سجلات" />
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="p-3 text-right">عملة</th>
                {!hideChain && <th className="p-3 text-right">نوع السلسلة</th>}
                <th className="p-3 text-right">الكمية</th>
                {showAddress ? (
                  <th className="p-3 text-right">العنوان</th>
                ) : showFee ? (
                  <th className="p-3 text-right">الرسوم</th>
                ) : null}
                <th className="p-3 text-right">الحالة</th>
                <th className="p-3 text-right">التاريخ والوقت</th>
                <th className="p-3 text-right">الإجراء</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Fragment key={r.id}>
                <tr className="border-b border-border/40 hover:bg-muted/10 transition-colors">
                  <td className="p-3">
                    <div className="flex items-center justify-start gap-2">
                      <CoinLogo coin={r.coin} />
                      <span className="font-bold">{r.coin}</span>
                    </div>
                  </td>
                  {!hideChain && (
                    <td className="p-3">
                      <div className="flex items-center justify-start gap-2">
                        <ChainLogo chain={r.chain} />
                        <span className="text-sky-400 font-bold">{r.chain || "—"}</span>
                      </div>
                    </td>
                  )}
                  <td className={`p-3 font-bold tabular-nums ${r.amount < 0 ? "text-destructive" : "text-emerald-400"}`}>
                    {r.amount < 0 ? "-" : "+"}{Math.abs(r.amount)}
                  </td>
                  {showAddress ? (
                    <td className="p-3 text-xs text-muted-foreground">{r.address || "—"}</td>
                  ) : showFee ? (
                    <td className="p-3 text-xs text-muted-foreground tabular-nums">{r.coin} {r.fee}</td>
                  ) : null}
                  <td className="p-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-1 text-[11px] font-bold ${r.status === "فاشلة" ? "bg-red-500/15 text-red-400" : r.status === "ناجحة" ? "bg-emerald-500/15 text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground tabular-nums">{dt(r.time)}</td>
                  <td className="p-3">
                    <button
                      onClick={() => setOpenId((v: string | null) => (v === r.id ? null : r.id))}
                      className="table-btn"
                    >
                      التفاصيل
                      <ChevronDown className={`size-3.5 transition-transform ${openId === r.id ? "rotate-180" : ""}`} />
                    </button>
                  </td>
                </tr>
                {openId === r.id && (
                  <tr className="border-b border-border/40 bg-muted/20">
                    <td colSpan={colCount} className="p-4">
                      <AssetDetails row={r} />
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const ASSET_DETAIL_LABELS: Array<[string, string]> = [
  ["id", "المعرف"],
  ["coin", "العملة"],
  ["chain", "نوع السلسلة"],
  ["amount", "الكمية"],
  ["fee", "الرسوم"],
  ["address", "العنوان"],
  ["txId", "معرف المعاملة"],
  ["status", "الحالة"],
];

function AssetDetails({ row }: { row: any }) {
  const fields = ASSET_DETAIL_LABELS.filter(
    ([k]) => row?.[k] !== null && row?.[k] !== undefined && row?.[k] !== "",
  );
  return (
    <div className="grid gap-4">
      <div className="text-sm font-black">تفاصيل المعاملة</div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {fields.map(([k, label]) => (
          <div key={k}>
            <div className="text-[11px] text-muted-foreground">{label}</div>
            <div className="text-sm font-semibold break-all" dir="ltr">{String(row[k])}</div>
          </div>
        ))}
      </div>
      <div className="text-[11px] text-muted-foreground">{dt(row.time)}</div>
    </div>
  );
}

export function ApiKeyPanel({ onSaved }: { configured?: boolean; onSaved?: () => void }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listBybitAccounts);
  const addFn = useServerFn(addBybitAccount);

  const [open, setOpen] = useState(true);
  const [name, setName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [errors, setErrors] = useState<{ name?: string; apiKey?: string; apiSecret?: string }>({});
  const [busy, setBusy] = useState(false);

  const accounts = useQuery({ queryKey: ["bybit-accounts"], queryFn: () => listFn() });
  const list = ((accounts.data as any)?.accounts ?? []) as Array<{ id: string; name: string; uid: string | null }>;

  async function connect() {
    const e = validateBybitCreds({ name, apiKey, apiSecret });
    setErrors(e);
    if (Object.keys(e).length) {
      toast.error(Object.values(e)[0] as string);
      return;
    }
    setBusy(true);
    try {
      const r: any = await addFn({ data: { apiKey: apiKey.trim(), apiSecret: apiSecret.trim(), name: name.trim() } });
      if (r?.ok) {
        toast.success("تمت إضافة حساب Bybit جديد");
        setName(""); setApiKey(""); setApiSecret(""); setOpen(false);
        qc.invalidateQueries({ queryKey: ["bybit-accounts"] });
        onSaved?.();
      } else {
        toast.error(`فشل الاتصال: ${r?.error ?? "تحقق من المفاتيح"}`);
      }
    } catch (e: any) {
      toast.error(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-3xl border border-border/60 bg-card/70 p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs">
          <span className={`size-2 rounded-full ${list.length ? "bg-emerald-400" : "bg-muted-foreground"}`} />
          <span className="text-muted-foreground">
            {list.length ? `${list.length} حساب مرتبط` : "لا توجد حسابات مربوطة — أضف مفتاح API من منصة Bybit"}
          </span>
        </div>
        <Button variant="secondary" size="sm" className="rounded-xl" onClick={() => setOpen((v) => !v)}>
          {open ? "إغلاق" : "إضافة حساب جديد"}
        </Button>
      </div>

      {!!list.length && (
        <div className="mt-3 flex flex-wrap gap-2">
          {list.map((a) => (
            <span key={a.id} className="rounded-lg border border-border/60 bg-background/60 px-2 py-1 text-[11px]">
              {a.name}
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="mt-4 grid gap-3">
          <Field label="اسم الحساب" error={errors.name}>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="مثال: حساب الشركة الرئيسي" className="rounded-xl" />
          </Field>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="API Key" error={errors.apiKey}>
              <Input dir="ltr" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="API Key" className="rounded-xl" />
            </Field>
            <Field label="API Secret" error={errors.apiSecret}>
              <Input dir="ltr" type="password" value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} placeholder="API Secret" className="rounded-xl" />
            </Field>
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-muted-foreground leading-5">
              أنشئ المفتاح من Bybit → API Management بصلاحيات قراءة فقط (Wallet / Assets / Card). كل مفتاح يضيف حسابا جديدا مستقلا.
            </p>
            <Button className="rounded-xl" onClick={connect} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin ml-1" /> : null}
              إضافة الحساب
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}



