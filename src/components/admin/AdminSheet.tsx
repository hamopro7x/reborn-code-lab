import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Table2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const SETTINGS_KEY = "admin_sheet";
const MIN_ROWS = 12;

type SheetData = {
  columns: { id: string; name: string }[];
  rows: Record<string, string>[];
};

const uid = () => Math.random().toString(36).slice(2, 10);

const emptySheet = (): SheetData => ({
  columns: Array.from({ length: 4 }, () => ({ id: uid(), name: "" })),
  rows: Array.from({ length: MIN_ROWS }, () => ({})),
});

/**
 * جدول بيانات حر (Spreadsheet) خاص بالأدمن فقط.
 * أعمدة يضيفها الأدمن بنفسه + خلايا حرة، ويُحفظ في قاعدة البيانات.
 */
export function AdminSheet() {
  const [data, setData] = useState<SheetData>(() => emptySheet());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const timer = useRef<number | null>(null);

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
        setData({
          columns: v.columns.filter((c) => c && typeof c.id === "string"),
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
      setSaving(true);
      const { error } = await supabase
        .from("site_settings")
        .upsert({ key: SETTINGS_KEY, value: next as never, updated_at: new Date().toISOString() });
      setSaving(false);
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
    update((prev) => ({ ...prev, columns: [...prev.columns, { id: uid(), name: "" }] }));

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

  const cols = useMemo(() => data.columns, [data.columns]);

  return (
    <div dir="rtl" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-foreground">
          <Table2 className="h-4 w-4 text-primary" />
          جدول بيانات
        </div>
        <div className="flex items-center gap-2">
          {saving && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
          <button
            type="button"
            onClick={addColumn}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow hover:opacity-90"
          >
            اضافة
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : cols.length === 0 ? (
        <div className="flex min-h-[30vh] items-center justify-center rounded-md border border-white/10 text-sm text-muted-foreground">
          اضغط «اضافة +» لإضافة أول عمود
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-max border-collapse">
            <thead>
              <tr>
                {cols.map((c) => (
                  <th key={c.id} className="p-0.5 align-bottom">
                    <input
                      value={c.name}
                      onChange={(e) => renameColumn(c.id, e.target.value)}
                      placeholder=""
                      data-no-autosave
                      className="data-table-head h-11 w-[200px] rounded-md border-0 bg-transparent px-3 text-center text-sm font-extrabold text-white outline-none placeholder:text-white/60"
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {cols.map((c) => (
                    <td key={c.id} className="border border-white/15 p-0">
                      <input
                        value={row[c.id] ?? ""}
                        onChange={(e) => setCell(rowIndex, c.id, e.target.value)}
                        data-no-autosave
                        className="h-[54px] w-[200px] bg-transparent px-3 text-center text-sm text-foreground outline-none focus:bg-white/5"
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
