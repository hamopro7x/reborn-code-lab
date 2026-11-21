import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/format";
import { livePoll } from "@/lib/live-poll";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BrandBadge, LedgerRowDetails, statusBadge } from "@/components/admin/BybitLedgerPanel";
import {
  saveMyTxnEntry, getMyManualTxns, addMyManualTxn, saveMyManualTxn,
  addMyManualCardTxn, saveMyManualCardTxn, clearMyManualTxns,
  getEmployeeManualTxns, getShiftManualTxns,
} from "@/lib/work.functions";

export type ManualKind = "wrong" | "employee" | "receive" | "transfer";

function last4(detail: Record<string, unknown>) {
  const raw = String(
    detail["pan4"] ??
      detail["cardNo"] ??
      detail["cardNumber"] ??
      detail["maskedCardNo"] ??
      detail["pan"] ??
      "",
  ).replace(/\D/g, "");
  return raw ? raw.slice(-4) : "—";
}
/** Card mark + last 4 digits. The brand comes from the main account card * records (pan4 -> brand reference map), never chosen by hand. */
export function Last4Cell({
  detail,
  brands,
}: {
  detail: Record<string, unknown>;
  brands: Record<string, string>;
}) {
  const digits = last4(detail);
  const brand = String(
    brands[digits] ?? detail["cardBrand"] ?? detail["brand"] ?? detail["cardType"] ?? "",
  );
  return (
    <span className="flex items-center justify-center gap-2">
      <BrandBadge brand={brand} />
      <span className="tabular-nums">{digits}</span>
    </span>
  );
}

/** «المعاملات» in the employee view = card (visa) transactions only. */
const isCardTxn = (kind: unknown) => /^(card|refund)$/i.test(String(kind ?? ""));

/** 10-minute edit window, measured against the SERVER clock (a client clock
 *  that is wrong or tampered with cannot widen it — the server re-checks too). */
const EDIT_WINDOW_MS = 5 * 60 * 1000;

function useEditWindow(savedAt: string | null | undefined, serverNow: string | null | undefined) {
  const skewRef = useRef(0);
  useEffect(() => {
    if (serverNow) skewRef.current = new Date(serverNow).getTime() - Date.now();
  }, [serverNow]);

  const expired = () => {
    if (!savedAt) return false;
    return Date.now() + skewRef.current - new Date(savedAt).getTime() >= EDIT_WINDOW_MS;
  };
  const [locked, setLocked] = useState(expired);
  useEffect(() => {
    setLocked(expired());
    if (!savedAt) return;
    const t = window.setInterval(() => setLocked(expired()), 5000);
    return () => window.clearInterval(t);
  }, [savedAt, serverNow]);
  return locked;
}

/** One employee-entered cell: saved on blur/Enter, editable for 10 minutes
 *  after the server-side save time, then permanently locked (🔒). */
export function EntryCell({
  row,
  field,
  serverNow,
  onSaved,
  readOnly,
}: {
  row: any;
  field: "egp" | "quantity";
  serverNow?: string | null;
  onSaved: () => void;
  readOnly?: boolean;
}) {
  const saveFn = useServerFn(saveMyTxnEntry);
  const saved = row[field];
  const savedAt = (field === "egp" ? row.egpAt : row.quantityAt) ?? null;
  const locked = useEditWindow(savedAt, serverNow) || !!readOnly;
  const initial = saved === null || saved === undefined ? "" : String(saved);
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const sentRef = useRef(initial);

  // Keep the input in sync with the freshest server value (query refetch).
  useEffect(() => {
    setValue(initial);
    sentRef.current = initial;
  }, [initial]);

  const commit = (raw: string) => {
    const txt = String(raw).replace(/,/g, "").trim();
    if (!txt || txt === sentRef.current) return;
    const n = Number(txt);
    if (!Number.isFinite(n) || n < 0) return;
    sentRef.current = txt;
    setBusy(true);
    void saveFn({ data: { ledgerId: row.ledgerId, field, value: n } })
      .then((res: any) => {
        if (res?.ok) {
          toast.success("تم الحفظ");
          onSaved();
        } else {
          sentRef.current = initial;
          toast.error(String(res?.error ?? "تعذر الحفظ"));
          onSaved();
        }
      })
      .catch((e) => {
        sentRef.current = initial;
        toast.error(e instanceof Error ? e.message : "تعذر الحفظ");
      })
      .finally(() => setBusy(false));
  };

  if (locked) {
    return (
      <span
        title="انتهت مدة التعديل المسموحة لهذه القيمة."
        className="inline-flex items-center justify-center gap-1 tabular-nums"
      >
        {saved === null || saved === undefined
          ? "—"
          : Number(saved).toLocaleString("en-US", { maximumFractionDigits: 4 })}
        
      </span>
    );
  }

  return (
    <div className="flex items-center justify-center gap-1">
      <input
        inputMode="decimal"
        data-no-autosave
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => commit(value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="h-8 w-20 border-0 bg-transparent px-2 text-center text-xs tabular-nums outline-none focus:bg-white/5"
      />
      {busy ? <Loader2 className="size-3 animate-spin text-muted-foreground" /> : null}
    </div>
  );
}



/** Original transaction details, rendered exactly like the central ledger. */
export function TxnDetailsDialog({ row, onClose }: { row: any | null; onClose: () => void }) {
  return (
    <Dialog open={!!row} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent dir="rtl" className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>تفاصيل المعاملة الأصلية</DialogTitle>
        </DialogHeader>
        {row ? (
          <LedgerRowDetails
            row={{ ...row, id: row.ledgerId, refId: row.refId ?? "—" }}
            badgeText={statusBadge(String(row.kind), String(row.status ?? "")).text}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- «المعاملات الغلط» + «خاص بالموظف» (manual) ---------------- */

/** One manual cell: saved to the database immediately on blur/Enter, editable
 *  for 10 minutes after the server-side save time, then locked (🔒). */
export function ManualCell({
  id,
  field,
  initial,
  savedAt,
  serverNow,
  numeric,
  autoFocus,
  onSaved,
  readOnly,
}: {
  id: string;
  field: "amount" | "details";
  initial: string;
  savedAt: string | null;
  serverNow?: string | null;
  numeric?: boolean;
  autoFocus?: boolean;
  onSaved: () => void;
  readOnly?: boolean;
}) {
  const saveFn = useServerFn(saveMyManualTxn);
  const locked = useEditWindow(savedAt, serverNow) || !!readOnly;
  const [value, setValue] = useState(initial);
  const savedRef = useRef(initial);
  const valueRef = useRef(initial);

  // آخر قيمة اتبعتت ولسه ما اتأكدتش من السيرفر (null = مفيش حفظ معلّق).
  const pendingRef = useRef<string | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // اعرض أحدث قيمة من قاعدة البيانات — إلا لو الموظف عنده كتابة لسه ما اتحفظتش
  // أو حفظ معلّق؛ كان تحديث قديم بيرجع يمسح اللي اتكتب فيختفي.
  useEffect(() => {
    if (pendingRef.current !== null) return;
    if (valueRef.current !== savedRef.current) return;
    setValue(initial);
    savedRef.current = initial;
    valueRef.current = initial;  }, [initial]);

  const flush = (v: string, attempt = 0) => {    if (v === savedRef.current && pendingRef.current === null) return;
    if (retryRef.current) {
      clearTimeout(retryRef.current);
      retryRef.current = null;
    }
    pendingRef.current = v;
    void saveFn({ data: { id, field, value: v } })
      .then((res: any) => {
        if (res && res.ok === false) {
          if (pendingRef.current === v) pendingRef.current = null;
          toast.error(String(res.error ?? "تعذر الحفظ"));
          return;
        }
        if (pendingRef.current === v) {
          pendingRef.current = null;
          savedRef.current = v;
        }
        // Refresh from the DB only after the save resolved (no race).
        onSaved();
      })
      .catch(() => {
        // خطأ شبكة: إعادة المحاولة تلقائيًا بدل ضياع القيمة.
        if (pendingRef.current !== v) return;
        if (attempt < 5) {
          retryRef.current = setTimeout(() => flushRef.current(v, attempt + 1), 1500 * (attempt + 1));
        } else {
          pendingRef.current = null;
          toast.error("تعذر الحفظ، حاول مرة أخرى");
        }
      });
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  // حفظ تلقائي أثناء الكتابة: كان الحفظ عند مغادرة الخانة فقط، فلو الموظف
  // فضل واقف في الخانة القيمة ما كانتش بتتحفظ، وبعد 5 دقائق الصف يتقفل
  // أو يتمسح كصف فاضي، فالأدمن ما يشوفش حاجة.
  useEffect(() => {
    if (locked || value === savedRef.current || value === pendingRef.current) return;
    const t = setTimeout(() => flushRef.current(valueRef.current), 700);
    return () => clearTimeout(t);
  }, [value, locked]);

  // Save pending edits when the section unmounts, or when the tab/window
  // is hidden or closed — otherwise a fast "type then leave" loses the value.
  useEffect(() => {
    const onHide = () => {
      if (valueRef.current !== savedRef.current && valueRef.current !== pendingRef.current)
        flushRef.current(valueRef.current);
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    window.addEventListener("beforeunload", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("beforeunload", onHide);
      onHide();
    };
  }, []);

  // «المبلغ» accepts digits (incl. Arabic-Indic) and one decimal point only;
  // «التفاصيل» is free text (letters, numbers, symbols, spaces) and optional.
  const clean = (raw: string) => {
    if (!numeric) return raw;
    const latin = raw
      .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
      .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
      .replace(/[\u066b\u060c,]/g, ".")
      .replace(/[^\d.]/g, "");
    const [head, ...rest] = latin.split(".");
    return rest.length ? `${head}.${rest.join("")}` : head ?? "";
  };

  if (locked) {
    return (
      <div
        title="انتهت مدة التعديل المسموحة لهذه القيمة."
        className={`flex h-full w-full min-w-0 items-start gap-1 px-3 py-2.5 text-xs text-foreground/90 ${
          numeric ? "justify-center tabular-nums" : "justify-end text-right"
        }`}
      >
        <span className="w-full break-words [overflow-wrap:anywhere] whitespace-pre-wrap">{value}</span>
      </div>
    );
  }

  if (!numeric) {
    // «التفاصيل»: نص متعدد الأسطر — العرض ثابت والارتفاع هو الذي يزيد.
    return (
      <textarea
        data-no-autosave
        autoFocus={autoFocus}
        rows={1}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          const el = e.target as HTMLTextAreaElement;
          el.style.height = "auto";
          el.style.height = `${el.scrollHeight}px`;
        }}
        ref={(el) => {
          if (el) {
            el.style.height = "auto";
            el.style.height = `${el.scrollHeight}px`;
          }
        }}
        onBlur={(e) => flush(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            (e.target as HTMLTextAreaElement).blur();
          }
        }}
        className="block min-h-[2.6rem] w-full min-w-0 max-w-full resize-none overflow-hidden whitespace-pre-wrap break-words [overflow-wrap:anywhere] border-0 bg-transparent px-3 py-2.5 text-right text-xs text-foreground/90 outline-none placeholder:text-transparent"
      />
    );
  }

  return (
    <input
      data-no-autosave
      autoFocus={autoFocus}
      inputMode="decimal"
      value={value}
      onChange={(e) => setValue(clean(e.target.value))}
      onBlur={(e) => flush(clean(e.target.value))}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className="h-full w-full min-w-0 border-0 bg-transparent px-3 py-2.5 text-center text-xs tabular-nums text-foreground/90 outline-none placeholder:text-transparent"
    />
  );
}


export function ManualCard({
  card,
  title,
  rows,
  serverNow,
  onAdd,
  onClear,
  onSaved,
  adding,
  clearing,
  newestId,
  isAdmin,
  readOnly,
  onDelete,
  header,
}: {
  card: ManualKind;
  title: string;
  rows: {
    id: string;
    amount: string;
    details: string;
    shiftId?: string | null;
    createdAt?: string;
    amountSavedAt?: string | null;
    detailsSavedAt?: string | null;
  }[];
  serverNow?: string | null;
  onAdd: (card: ManualKind) => void;
  onClear: (card: ManualKind) => void;
  onSaved: () => void;
  adding: boolean;
  clearing: boolean;
  newestId: string | null;
  isAdmin: boolean;
  readOnly?: boolean;
  onDelete?: (id: string) => void;
  /** Custom header replaces the default blue title bar. */
  header?: React.ReactNode;
}) {
  const totalAmount = useMemo(() => {
    return rows.reduce((sum, r) => {
      const latin = String(r.amount ?? "")
        .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
        .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
        .replace(/[\u066b\u060c,]/g, ".")
        .replace(/[^\d.]/g, "");
      const [head, ...rest] = latin.split(".");
      const normalized = rest.length ? `${head}.${rest.join("")}` : head ?? "";
      const n = parseFloat(normalized);
      return Number.isFinite(n) ? sum + n : sum;
    }, 0);
  }, [rows]);

  const totalCount = rows.length;

  return (    <div className="data-surface">
      {header ? (
        header
      ) : (        <div className="data-table-head relative flex items-center justify-center px-3 py-3">
          <span className="text-sm font-black">{title}</span>
          <div className="absolute left-3 flex items-center gap-2">
            {!readOnly && isAdmin && rows.length > 0 && (
              <button
                type="button"
                onClick={() => onClear(card)}
                disabled={clearing}
                className="table-btn disabled:opacity-60"
                title="تصفير الصفوف (أدمن فقط)"
              >
                {clearing ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Trash2 className="size-3 text-destructive" />
                )}
                <span className="whitespace-nowrap">تصفير</span>
              </button>
            )}
            {!readOnly && (
              <button
                type="button"
                onClick={() => onAdd(card)}
                disabled={adding}
                className="table-btn disabled:opacity-60"
              >
                <span className="grid size-4 place-items-center rounded-full bg-[oklch(0.5_0.14_255)] text-[11px] leading-none text-[oklch(0.98_0_0)]">
                  {adding ? <Loader2 className="size-2.5 animate-spin" /> : "+"}
                </span>
                <span className="whitespace-nowrap">إضافة معاملة جديدة</span>
              </button>
            )}
          </div>
        </div>
      )}

      <div className="max-h-[520px] min-h-[520px] overflow-y-auto overflow-x-hidden scrollbar-hide">
        <table className="data-table manual-table text-center">
          <thead className="sticky top-0 z-10">
            {isAdmin && (
              <tr className="summary-row admin-summary">
                <th className="w-[24%]">
                  <span className="summary-text">
                    <span className="text-white/90">الإجمالي</span>
                    <span className="value">: {totalAmount.toLocaleString("en-US")}</span>
                  </span>
                </th>
                <th>
                  <span className="summary-text">
                    <span className="text-white/90">إجمالي المعاملات</span>
                    <span className="value">: {totalCount.toLocaleString("en-US")}</span>
                  </span>
                </th>
                <th className="w-[34%]">&nbsp;</th>
              </tr>
            )}
            <tr>
              <th className="w-[24%]">المبلغ</th>
              <th>التفاصيل</th>
              <th className="w-[34%]">التاريخ والوقت</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="!p-0">
                  <ManualCell
                    id={r.id}
                    field="amount"
                    initial={r.amount}
                    savedAt={r.createdAt ?? null}
                    serverNow={serverNow}
                    numeric
                    autoFocus={!readOnly && r.id === newestId}
                    onSaved={onSaved}
                    readOnly={readOnly}
                  />
                </td>
                <td className="!p-0">
                  <ManualCell
                    id={r.id}
                    field="details"
                    initial={r.details}
                    savedAt={r.createdAt ?? null}
                    serverNow={serverNow}
                    onSaved={onSaved}
                    readOnly={readOnly}
                  />
                </td>

                <td className="text-[11px] text-muted-foreground">
                  <div className="flex items-center justify-center gap-2">
                    <span>{formatDateTime(r.createdAt)}</span>
                    {onDelete && !r.shiftId && (
                      <button
                        type="button"
                        onClick={() => onDelete(r.id)}
                        title="حذف الصف (بدون شفت)"
                        className="grid size-6 shrink-0 place-items-center rounded-lg border border-destructive/50 text-destructive transition hover:bg-destructive/15 active:scale-95"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


/** Two independent manual cards, side by side (same design + autosave/lock). */
export function ManualSection({
  isAdmin,
  cards,
  viewUserId,
  viewShiftId,
  blank = false,
}: {
  isAdmin: boolean;
  cards: { card: ManualKind; title: string }[];
  /** أدمن يشاهد بيانات موظف محدد (قراءة فقط). */
  viewUserId?: string;
  /** أدمن يشاهد شفتًا محددًا — سجل ذلك الشفت فقط (قراءة فقط). */
  viewShiftId?: string;
  /** جدول فارغ تمامًا (الأدمن لم يختر شفتًا بعد). */
  blank?: boolean;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(getMyManualTxns);
  const empListFn = useServerFn(getEmployeeManualTxns);
  const shiftListFn = useServerFn(getShiftManualTxns);
  const addFn = useServerFn(addMyManualTxn);
  const clearFn = useServerFn(clearMyManualTxns);
  const [adding, setAdding] = useState<ManualKind | null>(null);
  const [clearing, setClearing] = useState<ManualKind | null>(null);
  const [newestId, setNewestId] = useState<string | null>(null);
  const readOnly = !!viewUserId || !!viewShiftId || blank;
  const [page, setPage] = useState(1);
  const card = cards[0]?.card;
  useEffect(() => setPage(1), [viewShiftId, viewUserId, card]);
  const listKey = viewShiftId
    ? ["shift-manual-txns", viewShiftId]
    : viewUserId
      ? ["emp-manual-txns", viewUserId]
      : ["my-manual-txns"];

  const q = useQuery({
    queryKey: [...listKey, card, page],
    queryFn: () =>
      viewShiftId
        ? shiftListFn({ data: { shiftId: viewShiftId, card, page } })
        : viewUserId
          ? empListFn({ data: { userId: viewUserId, card, page } })
          : listFn({ data: { card, page } }),
    enabled: !blank,
    // التحديث اللحظي يتولى تحديث هذه القائمة، فلا داعي لإعادة جلبها من
    // الصفر مع كل فتح للقسم — كان ذلك أحد أسباب بطء ظهور البيانات.
    staleTime: 3_000,
    // عرض الأدمن: تحديث دوري كاحتياطي لو التحديث اللحظي فوّت تغيير.
    refetchInterval: readOnly ? livePoll(15_000) : false,
    refetchIntervalInBackground: false,
  });

  const all = blank ? [] : ((q.data as any)?.rows ?? []);
  useEffect(() => {
    if (!q.isSuccess) return;
    const last = Math.max(1, Math.ceil(Number(q.data?.total ?? 0) / PAGE_SIZE));
    if (page > last) setPage(last);
  }, [q.isSuccess, q.data?.total, page]);
  const serverNow = (q.data as any)?.serverNow ?? null;
  const refresh = () => void qc.invalidateQueries({ queryKey: listKey });

  const add = async (card: ManualKind) => {
    setAdding(card);
    try {
      const res: any = await addFn({ data: { card } });
      if (res?.ok) {
        setNewestId(String(res?.id ?? res?.row?.id ?? "") || null);
        await qc.invalidateQueries({ queryKey: ["my-manual-txns"] });
      } else toast.error(String(res?.error ?? "تعذر الإضافة"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر الإضافة");
    } finally {
      setAdding(null);
    }
  };

  const clear = async (card: ManualKind) => {
    if (!confirm("سيتم حذف جميع المعاملات في هذا الكرت. متابعة؟")) return;
    setClearing(card);
    try {      const res: any = await clearFn({ data: { card } });
      if (res?.ok) {
        toast.success("تم التصفير");
        await qc.invalidateQueries({ queryKey: ["my-manual-txns"] });
      } else toast.error(String(res?.error ?? "تعذر التصفير"));    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر التصفير");
    } finally {
      setClearing(null);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4">
      {cards.map((c) => (
        <ManualCard
          key={c.card}
          card={c.card}
          title={c.title}
          rows={all.filter((r: any) => r.card === c.card)}
          serverNow={serverNow}
          onAdd={add}
          onClear={clear}
          onSaved={refresh}
          adding={adding === c.card}
          clearing={clearing === c.card}
          newestId={newestId}
          isAdmin={isAdmin}
          readOnly={readOnly}
        />
      ))}
      {q.isError && <div role="alert" className="text-destructive">تعذّر تحميل التسجيلات. <Button variant="outline" onClick={() => void q.refetch()}>أعد المحاولة</Button></div>}
      <PaginationBar page={page} total={Number(q.data?.total ?? 0)} pageSize={PAGE_SIZE} onPage={setPage} />
    </div>
  );
}

/* ============ «معاملة يدوية» داخل قسم المعاملات — الموظف فقط ============
 * سجل مستقل عن معاملات الـAPI. الشفت يُستنتج على السيرفر، والتاريخ/الوقت
 * من ساعة السيرفر، والتعديل 10 دقائق من وقت الإنشاء (يُفرض على السيرفر أيضًا)،
 * ولا يوجد حذف إطلاقًا. */

const MANUAL_TXN_WINDOW_MS = 10 * 60 * 1000;

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