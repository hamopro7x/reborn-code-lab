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
import { BybitDocsCard } from "@/components/admin/BybitDocs";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { FintechBackdrop } from "@/components/admin/FintechBackdrop";
import { useAdminBack } from "@/components/admin/back-nav";
import { BybitLedgerPanel } from "@/components/admin/BybitLedgerPanel";
import { cardPurchasePresenter } from "@/lib/bybit-spend";
import { RefreshCw, CreditCard, ChevronDown, Loader2, Wallet } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Stat, Chip, Empty, visibleCoins, MerchantLogo, CoinLogo, dt } from "@/components/admin/bybit/BybitVisuals";
import { detectBrand, BrandBadge, CardsPanel, AddCardDialog } from "@/components/admin/bybit/BybitCardsUI";
import { BybitAccountInfoCard as AccountInfoCard } from "@/components/admin/bybit/BybitAccountInfoCard";
import type { BybitAccountRow } from "@/components/admin/bybit/types";
import { AccountSummaryCard } from "@/components/admin/bybit/AccountSummaryCard";
import { P2PTable } from "@/components/admin/bybit/BybitP2PTable";
import { AssetTable, TxnDetails } from "@/components/admin/bybit/BybitTransactionTables";

const TAB_KEY = "bybit_active_tab";
const money = (n: number, c = "USD") => `${c} ${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;



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



