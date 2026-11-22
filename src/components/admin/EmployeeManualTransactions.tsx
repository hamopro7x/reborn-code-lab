import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { addMyManualCardTxn, saveMyManualCardTxn } from "@/lib/work.functions";

/* ============ «معاملة يدوية» داخل قسم المعاملات — الموظف فقط ============
 * سجل مستقل عن معاملات الـAPI. الشفت يُستنتج على السيرفر، والتاريخ/الوقت
 * من ساعة السيرفر، والتعديل 10 دقائق من وقت الإنشاء (يُفرض على السيرفر أيضًا)،
 * ولا يوجد حذف إطلاقًا. */

export const MANUAL_TXN_WINDOW_MS = 10 * 60 * 1000;

/** نموذج إضافة معاملة يدوية — بدون اختيار شفت وبدون تاريخ/وقت. */
export function ManualTxnDialog({
  open,
  onClose,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const addFn = useServerFn(addMyManualCardTxn);
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [egp, setEgp] = useState("");
  const [quantity, setQuantity] = useState("");
  const [pan4, setPan4] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setMerchant("");
      setAmount("");
      setEgp("");
      setQuantity("");
      setPan4("");
    }
  }, [open]);

  const submit = async () => {
    setBusy(true);
    try {
      const res: any = await addFn({ data: { merchant, amount, egp, quantity, pan4 } });

      if (!res?.ok) {
        toast.error(res?.error ?? "تعذّر إضافة المعاملة");
        return;
      }
      toast.success("تم إضافة المعاملة");
      onAdded();
      onClose();
    } catch {
      toast.error("تعذّر إضافة المعاملة");
    } finally {
      setBusy(false);
    }
  };

  const field =
    "w-full rounded-xl border border-border/50 bg-[oklch(0.13_0.02_270)] px-3 py-2 text-xs font-bold outline-none focus:border-[oklch(0.55_0.14_255)]";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm font-black">إضافة معاملة يدوية</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <div className="mb-1 text-[11px] font-bold text-muted-foreground">اسم التاجر</div>
            <input className={field} value={merchant} onChange={(e) => setMerchant(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="mb-1 text-[11px] font-bold text-muted-foreground">إجمالي الذي قمت بدفعه</div>
              <input className={field} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
            </div>
            <div>
              <div className="mb-1 text-[11px] font-bold text-muted-foreground">المبلغ الذي استلمته من العميل</div>
              <input className={field} value={egp} onChange={(e) => setEgp(e.target.value)} inputMode="decimal" />
            </div>
          </div>
          <div>
            <div className="mb-1 text-[11px] font-bold text-muted-foreground">الكمية</div>
            <input
              className={field}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              inputMode="decimal"
            />
          </div>
          <div>
            <div className="mb-1 text-[11px] font-bold text-muted-foreground">
              آخر 4 أرقام للبطاقة - أو طريقة الدفع التي دفعت من خلالها
            </div>
            {/* خانة حرة: أرقام/حروف/رموز/مسافات */}
            <input className={field} type="text" value={pan4} onChange={(e) => setPan4(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="table-btn">
              إلغاء
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy}
              className="table-btn disabled:opacity-60"
            >
              {busy ? <Loader2 className="mx-auto size-3.5 animate-spin" /> : "حفظ"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** خانة قابلة للتعديل خلال 10 دقائق من الإنشاء فقط. */
export function ManualTxnCell({
  row,
  field,
  locked,
  onSaved,
}: {
  row: any;
  field: "merchant" | "amount" | "egp" | "quantity" | "pan4";
  locked: boolean;
  onSaved: () => void;
}) {
  const saveFn = useServerFn(saveMyManualCardTxn);
  const current = String(row[field] ?? "");
  const [value, setValue] = useState<string>(current);
  const [busy, setBusy] = useState(false);
  useEffect(() => setValue(current), [row.id, current]);

  if (locked) return <span>{current || "—"}</span>;

  const commit = async () => {
    if (value === current) return;
    setBusy(true);
    try {
      const res: any = await saveFn({ data: { id: row.id, field, value } });
      if (!res?.ok) {
        toast.error(res?.error ?? "تعذّر الحفظ");
        setValue(current);
      } else onSaved();
    } catch {
      toast.error("تعذّر الحفظ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <input
      type="text"
      value={value}
      disabled={busy}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => void commit()}
      className="w-full min-w-[70px] border-0 bg-transparent px-2 py-1 text-center text-[11px] font-bold outline-none focus:bg-white/5"
    />
  );
}

/**
 * نفس الواجهة تُستخدم في الحالتين: *  - الموظف: بدون `viewUserId` → بياناته الخاصة (قابلة للتعديل كما هي).
 *  - الأدمن بعد اختيار موظف: `viewUserId` → بيانات ذلك الموظف فقط (قراءة).
 */