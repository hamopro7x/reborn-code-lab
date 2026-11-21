import { Fragment, useEffect, useState } from "react";
import { useUiState } from "@/lib/ui-state";
import { usePersistentState } from "@/lib/persistent-state";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getBybitOverview, getBybitCardTxns, getBybitOnChain, getBybitInternal, getBybitP2P,
  getBybitCards, createBybitCard, deleteBybitCard, updateBybitCard,
} from "@/lib/bybit.functions";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BybitDocsCard } from "@/components/admin/BybitDocs";
import { useAdminBack } from "@/components/admin/back-nav";
import { BybitLedgerPanel } from "@/components/admin/BybitLedgerPanel";
import { cardPurchasePresenter } from "@/lib/bybit-spend";
import { RefreshCw, CreditCard, ChevronDown } from "lucide-react";
import { Stat, Chip, Empty, visibleCoins, MerchantLogo, CoinLogo, dt, money, type CoinRow } from "@/components/admin/bybit/BybitVisuals";
import { CardsPanel, BrandBadge, AddCardDialog, detectBrand } from "@/components/admin/bybit/BybitCardsUI";
import { AccountInfoCard } from "@/components/admin/bybit/BybitAccountInfoCard";
import { P2PTable } from "@/components/admin/bybit/BybitP2PTable";
import { AssetTable, TxnDetails } from "@/components/admin/bybit/BybitTransactionTables";

const TAB_KEY = "bybit_active_tab";

export function BybitAccountView({ isAdmin, accountId, accountName, onBack }: { isAdmin: boolean; accountId: string; accountName: string; onBack: () => void }) {
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
