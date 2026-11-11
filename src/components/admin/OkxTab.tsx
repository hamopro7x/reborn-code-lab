import { useEffect, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Plus, RefreshCw, Trash2, Pencil, Wallet, ChevronLeft } from "lucide-react";
import {
  listOkxAccounts, addOkxAccount, removeOkxAccount, renameOkxAccount, getOkxBalances, getOkxMovements,
} from "@/lib/okx.functions";
import { AssetTable, Chip, CoinLogo, Field } from "@/components/admin/BybitTab";
import { useAdminBack } from "@/components/admin/back-nav";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type OkxAccountRow = { id: string; name: string; uid: string | null; sortOrder: number };

const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function OkxTab({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listOkxAccounts);
  const addFn = useServerFn(addOkxAccount);
  const removeFn = useServerFn(removeOkxAccount);
  const renameFn = useServerFn(renameOkxAccount);
  const [selected, setSelected] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addError, setAddError] = useState<{ message: string } | null>(null);
  const [renameTarget, setRenameTarget] = useState<OkxAccountRow | null>(null);

  const accounts = useQuery({ queryKey: ["okx-accounts"], queryFn: () => listFn() });
  const list = ((accounts.data as any)?.accounts ?? []) as OkxAccountRow[];

  const addAccount = useMutation({
    mutationFn: (data: { apiKey: string; apiSecret: string; passphrase: string; name: string }) => addFn({ data }),
    // Clear the previous attempt's error so a stale message is never mistaken for the new result.
    onMutate: () => setAddError(null),
    onSuccess: (res: any) => {
      if (res?.ok === false) {
        setAddError({ message: res.error || "تعذر ربط الحساب" });
        return;
      }
      setAddError(null);
      setAddOpen(false);
      toast.success("تمت إضافة حساب OKX");
      qc.invalidateQueries({ queryKey: ["okx-accounts"] });
    },
    onError: (e: any) => setAddError({ message: e?.message || "تعذر ربط الحساب" }),
  });
  const removeAccount = useMutation({
    mutationFn: (id: string) => removeFn({ data: { id } }),
    onSuccess: () => {
      toast.success("تم حذف الحساب");
      qc.invalidateQueries({ queryKey: ["okx-accounts"] });
    },
    onError: (e: any) => toast.error(e?.message || "فشل حذف الحساب"),
  });
  const rename = useMutation({
    mutationFn: (d: { id: string; name: string }) => renameFn({ data: d }),
    onSuccess: () => {
      toast.success("تم حفظ الاسم");
      setRenameTarget(null);
      qc.invalidateQueries({ queryKey: ["okx-accounts"] });
    },
    onError: (e: any) => toast.error(e?.message || "فشل الحفظ"),
  });

  const current = list.find((a) => a.id === selected) ?? null;
  useAdminBack(current ? () => setSelected(null) : null, [!!current]);

  if (current) return <OkxAccountView account={current} onBack={() => setSelected(null)} />;

  return (
    <div className="space-y-4 text-right" dir="rtl">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-primary/15 text-primary">
            <Wallet className="size-5" />
          </span>
          <div>
            <h2 className="text-base font-black">حسابات OKX</h2>
            <div className="text-[11px] text-muted-foreground">
              {accounts.isLoading ? "جاري التحميل…" : `${list.length} حساب مرتبط`}
            </div>
          </div>
        </div>
        {isAdmin && (
          <Button size="sm" className="rounded-xl" onClick={() => setAddOpen(true)}>
            <Plus className="ml-1 size-4" />إضافة حساب
          </Button>
        )}
      </div>

      {accounts.isLoading ? (
        <div className="flex justify-center p-10"><Loader2 className="size-6 animate-spin" /></div>
      ) : !list.length ? (
        <div className="rounded-3xl border border-border/60 bg-card/60 p-8 text-center text-sm text-muted-foreground">
          لا توجد حسابات OKX مربوطة بعد{isAdmin ? " — أضف حساب بمفتاح API (قراءة فقط)." : "."}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {list.map((a, i) => (
            <OkxAccountCard
              key={a.id}
              account={a}
              index={i}
              isAdmin={isAdmin}
              onOpen={() => setSelected(a.id)}
              onRename={() => setRenameTarget(a)}
              onDelete={() => {
                if (window.confirm(`حذف ${a.name}؟`)) removeAccount.mutate(a.id);
              }}
            />
          ))}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        التحويلات الداخلية والسحب والإيداع بتنزل في السجل المركزي وبتتربط بشفت الموظف المفتوح زي Bybit بالظبط.
      </p>

      <AddOkxDialog
        open={addOpen}
        busy={addAccount.isPending}
        error={addError}
        onClose={() => { setAddOpen(false); setAddError(null); }}
        onSubmit={(d) => addAccount.mutate(d)}
      />
      <RenameDialog
        account={renameTarget}
        busy={rename.isPending}
        onClose={() => setRenameTarget(null)}
        onSubmit={(name) => renameTarget && rename.mutate({ id: renameTarget.id, name })}
      />
    </div>
  );
}

function OkxAccountCard({
  account, index, isAdmin, onOpen, onRename, onDelete,
}: {
  account: OkxAccountRow;
  index: number;
  isAdmin: boolean;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const balFn = useServerFn(getOkxBalances);
  const q = useQuery({
    queryKey: ["okx-balances", account.id],
    queryFn: () => balFn({ data: { accountId: account.id } }),
    staleTime: 60_000,
  });
  const d = (q.data as any) ?? {};
  const usdt = ((d.coins ?? []) as any[]).find((c) => c.coin === "USDT");
  const no = account.sortOrder > 0 ? account.sortOrder : index + 1;
  return (
    <article className="rounded-3xl border border-border/60 bg-card/70 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-full border-2 border-primary text-lg font-black tabular-nums text-primary">
            {no}
          </span>
          <div>
            <div className="font-black">{account.name}</div>
            {account.uid && <div className="text-[11px] text-muted-foreground" dir="ltr">UID {account.uid}</div>}
          </div>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="size-8 rounded-lg" onClick={onRename} aria-label="تعديل الاسم">
              <Pencil className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" className="size-8 rounded-lg text-destructive" onClick={onDelete} aria-label="حذف الحساب">
              <Trash2 className="size-4" />
            </Button>
          </div>
        )}
      </div>
      <div className="mt-4 rounded-2xl border border-border/60 bg-background/60 p-4">
        {q.isLoading ? (
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        ) : d.failed ? (
          <div className="text-xs text-destructive">{d.failed}</div>
        ) : (
          <div className="flex items-end justify-between gap-3">
            <div dir="ltr" className="flex items-center gap-2">
              <CoinLogo coin="USDT" />
              <span className="text-sm font-bold text-muted-foreground">USDT</span>
              <span className="text-3xl font-black tabular-nums">
                {Number(usdt?.total ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground" dir="ltr">≈ {usd(Number(d.totalUsd ?? 0))}</div>
          </div>
        )}
      </div>
      <Button variant="secondary" className="mt-4 w-full rounded-xl" onClick={onOpen}>
        فتح الحساب <ChevronLeft className="mr-1 size-4" />
      </Button>
    </article>
  );
}

function OkxAccountView({ account, onBack }: { account: OkxAccountRow; onBack: () => void }) {
  const qc = useQueryClient();
  const balFn = useServerFn(getOkxBalances);
  const movFn = useServerFn(getOkxMovements);
  const [tab, setTab] = useState<"internal" | "onchain">("internal");
  const bal = useQuery({ queryKey: ["okx-balances", account.id], queryFn: () => balFn({ data: { accountId: account.id } }) });
  const mov = useQuery({
    queryKey: ["okx-movements", account.id],
    queryFn: () => movFn({ data: { accountId: account.id } }),
    refetchInterval: 30_000,
  });
  const m = (mov.data as any) ?? {};
  const internalQ = { isLoading: mov.isLoading, data: m.internal };
  const onchainQ = { isLoading: mov.isLoading, data: m.onchain };
  const coins = (((bal.data as any)?.coins ?? []) as any[]);
  const failed = (bal.data as any)?.failed || m.failed;

  function refresh() {
    qc.invalidateQueries({ queryKey: ["okx-balances", account.id] });
    qc.invalidateQueries({ queryKey: ["okx-movements", account.id] });
  }

  return (
    <div className="space-y-4 text-right" dir="rtl">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="rounded-xl" onClick={onBack}>رجوع</Button>
          <h2 className="text-sm font-black">{account.name}</h2>
        </div>
        <Button variant="outline" size="icon" className="rounded-xl" onClick={refresh} aria-label="تحديث">
          <RefreshCw className={`size-4 ${bal.isFetching || mov.isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {failed && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-xs text-destructive">
          تعذر جلب البيانات من OKX: {failed}
        </div>
      )}

      <div className="rounded-2xl border border-border/60 bg-card/70 p-4">
        {bal.isLoading ? (
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        ) : !coins.length ? (
          <div className="text-xs text-muted-foreground">لا يوجد رصيد</div>
        ) : (
          <div className="flex flex-wrap items-stretch gap-3">
            {coins.map((c) => (
              <div key={c.coin} className="inline-flex flex-col gap-1 rounded-xl border border-border/60 bg-background/60 p-3">
                <div dir="ltr" className="flex items-center gap-2">
                  <CoinLogo coin={c.coin} />
                  <span className="text-sm font-bold text-muted-foreground">{c.coin}</span>
                  <span className="text-3xl font-black tabular-nums">
                    {Number(c.total).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  التمويل {Number(c.funding).toFixed(2)} · التداول {Number(c.trading).toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-start gap-2">
        <Chip active={tab === "internal"} onClick={() => setTab("internal")}>السحب والإيداع الداخلي</Chip>
        <Chip active={tab === "onchain"} onClick={() => setTab("onchain")}>السحب والإيداع الخارجي</Chip>
      </div>
      {tab === "internal" && <AssetTable q={internalQ} title="" inChip="إيداع" outChip="سحب" showAddress hideChain />}
      {tab === "onchain" && <AssetTable q={onchainQ} title="" icon inChip="الاستلام" outChip="التحويل على السلسلة" showAddress={false} hideFeeOnDeposit />}
    </div>
  );
}

function AddOkxDialog({
  open, onClose, onSubmit, busy, error,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (d: { apiKey: string; apiSecret: string; passphrase: string; name: string }) => void;
  busy: boolean;
  error?: { message: string } | null;
}) {
  const [name, setName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) { setName(""); setApiKey(""); setApiSecret(""); setPassphrase(""); setErrors({}); }
  }, [open]);

  function submit() {
    const e: Record<string, string> = {};
    if (apiKey.trim().length < 8) e.apiKey = "مفتاح API مطلوب";
    if (apiSecret.trim().length < 8) e.apiSecret = "Secret Key مطلوب";
    if (!passphrase) e.passphrase = "الـ Passphrase مطلوبة";
    setErrors(e);
    if (Object.keys(e).length) return;
    onSubmit({ apiKey: apiKey.trim(), apiSecret: apiSecret.trim(), passphrase, name: name.trim() });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md text-right" dir="rtl">
        <DialogHeader>
          <DialogTitle>إضافة حساب OKX</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="اسم الحساب">
            <Input placeholder="مثال: OKX الرئيسي" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          </Field>
          <Field label="API Key" error={errors.apiKey}>
            <Input dir="ltr" placeholder="API Key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          </Field>
          <Field label="Secret Key" error={errors.apiSecret}>
            <Input dir="ltr" type="password" placeholder="Secret Key" value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} />
          </Field>
          <Field label="Passphrase" error={errors.passphrase}>
            <Input dir="ltr" type="password" placeholder="Passphrase" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
          </Field>
          <p className="text-[11px] text-muted-foreground">
            اعمل المفتاح من OKX ← API بصلاحية <b>Read</b> بس. لو سبت الاسم فاضي هيتكتب الـ UID أوتوماتيك.
          </p>
          {error && (
            <div className="space-y-1 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-[11px] text-destructive">
              <div>{error.message}</div>
            </div>
          )}
          <Button className="w-full rounded-xl" disabled={busy} onClick={submit}>
            {busy ? <Loader2 className="ml-1 size-4 animate-spin" /> : null} ربط الحساب
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RenameDialog({
  account, busy, onClose, onSubmit,
}: { account: OkxAccountRow | null; busy: boolean; onClose: () => void; onSubmit: (name: string) => void }) {
  const [name, setName] = useState("");
  useEffect(() => setName(account?.name ?? ""), [account]);
  return (
    <Dialog open={Boolean(account)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm text-right" dir="rtl">
        <DialogHeader>
          <DialogTitle>تعديل اسم الحساب</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          <Button className="w-full rounded-xl" disabled={busy || !name.trim()} onClick={() => onSubmit(name.trim())}>
            {busy ? <Loader2 className="ml-1 size-4 animate-spin" /> : null} حفظ
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
