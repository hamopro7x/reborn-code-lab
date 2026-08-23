import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const SETTINGS_KEY = "admin_sheet";
const MIN_ROWS = 9;
const BASE_COLS = 4;
const DEFAULT_WIDTH = 200;
const MIN_WIDTH = 90;
/** عدد الصفوف الفاضية اللي تفضل دايمًا في آخر الجدول (خانات لا تنتهي) */
const ROW_BUFFER = 25;

type SheetColumn = { id: string; name: string; width?: number };

type SheetData = {
  columns: SheetColumn[];
  rows: Record<string, string>[];
};

const uid = () => Math.random().toString(36).slice(2, 10);

const isEmptyRow = (r: Record<string, string>) =>
  !r || Object.values(r).every((v) => !v || !String(v).trim());

/** يضمن وجود صفوف فاضية دايمًا في الآخر فلا ينتهي الجدول */
const withBuffer = (rows: Record<string, string>[]): Record<string, string>[] => {
  let last = -1;
  rows.forEach((r, i) => {
    if (!isEmptyRow(r)) last = i;
  });
  const needed = last + 1 + ROW_BUFFER;
  if (rows.length >= needed) return rows;
  return [...rows, ...Array.from({ length: needed - rows.length }, () => ({}))];
};

const emptySheet = (): SheetData => ({
  columns: Array.from({ length: BASE_COLS }, () => ({ id: uid(), name: "" })),
  rows: withBuffer(Array.from({ length: MIN_ROWS }, () => ({}))),
});


/** خلية نصية تلتف تلقائيًا وتزيد ارتفاعها حسب المحتوى */
function AutoCell({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(47, el.scrollHeight)}px`;
  }, []);

  useLayoutEffect(() => {
    resize();
  }, [value, resize]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      data-no-autosave
      className="admin-sheet-cell block w-full resize-none bg-transparent px-3 py-[14px] text-right text-xs leading-5 text-foreground outline-none focus:bg-white/5"
    />
  );
}

/**
 * جدول بيانات حر (Spreadsheet) خاص بالأدمن فقط.
 * أعمدة يضيفها الأدمن بنفسه + خلايا حرة، ويُحفظ في قاعدة البيانات.
 */
export function AdminSheet() {
  const [data, setData] = useState<SheetData>(() => emptySheet());
  const [loading, setLoading] = useState(true);
  const [deleteMode, setDeleteMode] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const timer = useRef<number | null>(null);
  const drag = useRef<{ id: string; startX: number; startW: number } | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  // عرض العمود الأساسي = عرض الواجهة ÷ 4 (يظهر 4 أعمدة فقط)
  const [baseWidth, setBaseWidth] = useState(DEFAULT_WIDTH);

  useEffect(() => {
    const measure = () => {
      const el = surfaceRef.current;
      if (!el) return;
      const w = el.clientWidth;
      if (w > 0) setBaseWidth(Math.max(MIN_WIDTH, Math.floor(w / BASE_COLS)));
    };
    measure();
    window.addEventListener("resize", measure);
    const id = window.setInterval(measure, 800);
    return () => {
      window.removeEventListener("resize", measure);
      window.clearInterval(id);
    };
  }, [loading]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: row } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", SETTINGS_KEY)
        .maybeSingle();
      if (!alive) return;
      const v = row?.value as SheetData | null;
      if (v && Array.isArray(v.columns) && Array.isArray(v.rows)) {
        const columns = v.columns
          .filter((c) => c && typeof c.id === "string")
          // العرض الافتراضي القديم يُهمل ليأخذ العمود عرض الأساس المحسوب
          .map((c) => ({
            id: c.id,
            name: c.name ?? "",
            ...(typeof c.width === "number" && c.width !== DEFAULT_WIDTH ? { width: c.width } : {}),
          }));
        setData({
          columns: columns.length ? columns : emptySheet().columns,
          rows: v.rows.length < MIN_ROWS
            ? [...v.rows, ...Array.from({ length: MIN_ROWS - v.rows.length }, () => ({}))]
            : v.rows,
        });
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const persist = useCallback((next: SheetData) => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      const { error } = await supabase
        .from("site_settings")
        .upsert({ key: SETTINGS_KEY, value: next as never, updated_at: new Date().toISOString() });
      if (error) toast.error("تعذر الحفظ: " + error.message);
    }, 600);
  }, []);

  const update = useCallback(
    (mutate: (prev: SheetData) => SheetData) => {
      setData((prev) => {
        const next = mutate(prev);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const addColumn = () =>
    update((prev) => ({
      ...prev,
      columns: [...prev.columns, { id: uid(), name: "" }],
    }));

  const renameColumn = (id: string, name: string) =>
    update((prev) => ({
      ...prev,
      columns: prev.columns.map((c) => (c.id === id ? { ...c, name } : c)),
    }));

  const setCell = (rowIndex: number, colId: string, value: string) =>
    update((prev) => {
      const rows = prev.rows.map((r, i) => (i === rowIndex ? { ...r, [colId]: value } : r));
      // أضف صفًا جديدًا تلقائيًا عند الكتابة في الصف الأخير
      if (rowIndex === rows.length - 1 && value) rows.push({});
      return { ...prev, rows };
    });

  const handleDeleteClick = () => {
    if (!deleteMode) {
      setSelected({});
      setDeleteMode(true);
      return;
    }
    const ids = Object.keys(selected).filter((k) => selected[k]);
    if (ids.length === 0) {
      setDeleteMode(false);
      return;
    }
    update((prev) => {
      let columns = prev.columns.filter((c) => !ids.includes(c.id));
      // لا يقل الجدول عن 4 أعمدة أساسية
      while (columns.length < BASE_COLS) columns = [...columns, { id: uid(), name: "" }];
      return {
        columns,
        rows: prev.rows.map((r) => {
          const next = { ...r };
          ids.forEach((id) => delete next[id]);
          return next;
        }),
      };
    });
    setSelected({});
    setDeleteMode(false);
  };

  // حذف الكل: مسح كل البيانات والأعمدة الإضافية والرجوع إلى 4 أعمدة فارغة
  const deleteAll = () => {
    update(() => emptySheet());
    setSelected({});
    setDeleteMode(false);
  };

  // سحب حدود العمود لتغيير عرضه (بدون التأثير على باقي الأعمدة)
  const startResize = (e: React.PointerEvent, col: SheetColumn) => {
    e.preventDefault();
    e.stopPropagation();
    drag.current = { id: col.id, startX: e.clientX, startW: col.width ?? baseWidth };

    const move = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      // اتجاه RTL: السحب لليسار يزيد العرض
      const delta = d.startX - ev.clientX;
      const w = Math.max(MIN_WIDTH, Math.round(d.startW + delta));
      setData((prev) => ({
        ...prev,
        columns: prev.columns.map((c) => (c.id === d.id ? { ...c, width: w } : c)),
      }));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      drag.current = null;
      setData((prev) => {
        persist(prev);
        return prev;
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const cols = useMemo(() => data.columns, [data.columns]);
  const totalWidth = useMemo(
    () => cols.reduce((s, c) => s + (c.width ?? baseWidth), 0),
    [cols, baseWidth],
  );

  return (
    <div dir="rtl" className="admin-sheet">
      <div className="flex items-center justify-start gap-2 px-4 pb-[0.2cm] md:px-6">
        <button
          type="button"
          onClick={addColumn}
          className="inline-flex flex-row-reverse items-center gap-1.5 rounded-md bg-[#1d4ed8] px-2.5 py-1 text-[13px] font-bold text-white shadow hover:brightness-110"
        >
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/25">
            <Plus className="h-3 w-3" />
          </span>
          اضافة
        </button>
        <button
          type="button"
          onClick={handleDeleteClick}
          className={`inline-flex flex-row-reverse items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px] font-bold text-white shadow hover:brightness-110 ${
            deleteMode ? "bg-[#b91c1c]" : "bg-[#1d4ed8]"
          }`}
        >
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/25">
            <Trash2 className="h-3 w-3" />
          </span>
          حذف
        </button>
        {deleteMode && (
          <button
            type="button"
            onClick={deleteAll}
            className="inline-flex flex-row-reverse items-center gap-1.5 rounded-md bg-[#7f1d1d] px-2.5 py-1 text-[13px] font-bold text-white shadow hover:brightness-110"
          >
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/25">
              <Trash2 className="h-3 w-3" />
            </span>
            حذف الكل
          </button>
        )}
      </div>

      {loading ? (
        <div className="min-h-[40vh]" />
      ) : cols.length === 0 ? (
        <div className="flex min-h-[30vh] items-center justify-center border border-white/10 text-sm text-muted-foreground">
          اضغط «اضافة +» لإضافة أول عمود
        </div>
      ) : (
        <div ref={surfaceRef} className="admin-sheet-surface">
          {deleteMode && (
            <div className="flex px-0 pb-1" style={{ width: totalWidth, minWidth: "100%" }}>
              {cols.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-none items-center justify-center"
                  style={{ width: c.width ?? baseWidth }}
                >
                  <input
                    type="checkbox"
                    checked={!!selected[c.id]}
                    onChange={(e) =>
                      setSelected((prev) => ({ ...prev, [c.id]: e.target.checked }))
                    }
                    data-no-autosave
                    className="h-3.5 w-3.5 cursor-pointer accent-[#1636e6]"
                  />
                </div>
              ))}
            </div>
          )}
          <table
            className="data-table admin-sheet-table admin-sheet-fixed"
            style={{ width: totalWidth, minWidth: "100%", tableLayout: "fixed" }}
          >
            <colgroup>
              {cols.map((c) => (
                <col key={c.id} style={{ width: c.width ?? baseWidth }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {cols.map((c) => (
                  <th key={c.id} className="p-0">
                    <div className="relative">
                      <input
                        value={c.name}
                        onChange={(e) => renameColumn(c.id, e.target.value)}
                        placeholder=""
                        data-no-autosave
                        className="h-full w-full border-0 bg-transparent px-3 text-center text-xs font-extrabold text-white outline-none placeholder:text-white/60"
                      />
                      <span
                        onPointerDown={(e) => startResize(e, c)}
                        className="absolute inset-y-0 left-0 w-2 cursor-col-resize"
                        aria-hidden
                      />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {cols.map((c) => (
                    <td key={c.id} className="p-0 align-top">
                      <AutoCell
                        value={row[c.id] ?? ""}
                        onChange={(v) => setCell(rowIndex, c.id, v)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
