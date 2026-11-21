import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listBybitAccounts, addBybitAccount } from "@/lib/bybit.functions";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import type { BybitAccountRow } from "@/components/admin/bybit/types";

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

export function formatLeft(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d > 0 ? `${d}d ` : ""}${pad(h)}:${pad(m)}:${pad(sec)}`;
}

export function FreezeDialog({ account, pending, onClose, onConfirm }: { account: any; pending: boolean; onClose: () => void; onConfirm: (frozenUntil: string | null) => void }) {
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

export function AddAccountDialog({
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

export function EditAccountDialog({
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
