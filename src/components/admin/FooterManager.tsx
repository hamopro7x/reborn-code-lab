import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, ArrowLeft, ChevronDown, ChevronUp, Loader2, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  DEFAULT_FOOTER,
  FOOTER_KEY,
  FOOTER_QUERY_KEY,
  normalizeFooter,
  type FooterConfig,
} from "@/lib/footer-config";

export function FooterManager() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["footer-config-admin"],
    queryFn: async () => {
      const { data } = await supabase.from("site_settings").select("value").eq("key", FOOTER_KEY).maybeSingle();
      return normalizeFooter(data?.value);
    },
  });
  const [cfg, setCfg] = useState<FooterConfig>(DEFAULT_FOOTER);
  useEffect(() => {
    if (q.data) setCfg(q.data);
  }, [q.data]);

  const save = useMutation({
    mutationFn: async (next: FooterConfig) => {
      const { error } = await supabase
        .from("site_settings")
        .upsert({ key: FOOTER_KEY, value: next as any, updated_at: new Date().toISOString() });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("تم حفظ الفوتر");
      qc.invalidateQueries({ queryKey: FOOTER_QUERY_KEY });
      qc.invalidateQueries({ queryKey: ["footer-config-admin"] });
    },
    onError: (e: any) => toast.error(e?.message || "تعذّر الحفظ"),
  });

  const patchColumn = (ci: number, patch: Partial<FooterConfig["columns"][number]>) =>
    setCfg((c) => ({ ...c, columns: c.columns.map((col, i) => (i === ci ? { ...col, ...patch } : col)) }));

  const moveColumn = (ci: number, dir: -1 | 1) =>
    setCfg((c) => {
      const next = [...c.columns];
      const to = ci + dir;
      if (to < 0 || to >= next.length) return c;
      [next[ci], next[to]] = [next[to], next[ci]];
      return { ...c, columns: next };
    });

  const moveLink = (ci: number, li: number, dir: -1 | 1) =>
    setCfg((c) => ({
      ...c,
      columns: c.columns.map((col, i) => {
        if (i !== ci) return col;
        const links = [...col.links];
        const to = li + dir;
        if (to < 0 || to >= links.length) return col;
        [links[li], links[to]] = [links[to], links[li]];
        return { ...col, links };
      }),
    }));

  return (
    <div dir="rtl" className="text-right">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold">أقسام الفوتر</h2>
          <p className="text-xs text-muted-foreground">تحكم في أعمدة أسفل الموقع وعناوينها وروابطها.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1" onClick={() => setCfg(DEFAULT_FOOTER)}>
            <RotateCcw className="size-4" />
            إرجاع الافتراضي
          </Button>
          <Button size="sm" className="gap-1" onClick={() => save.mutate(cfg)} disabled={save.isPending}>
            {save.isPending && <Loader2 className="size-4 animate-spin" />}
            حفظ
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {cfg.columns.map((col, ci) => (
          <div key={ci} className="card-surface rounded-2xl border border-border/60 p-4">
            <div className="mb-3 flex items-end gap-2">
              <div className="flex-1">
                <Label>عنوان العمود</Label>
                <Input value={col.title} onChange={(e) => patchColumn(ci, { title: e.target.value })} />
              </div>
              <Button variant="outline" size="icon" aria-label="تحريك يمينًا" onClick={() => moveColumn(ci, -1)}>
                <ArrowRight className="size-4" />
              </Button>
              <Button variant="outline" size="icon" aria-label="تحريك يسارًا" onClick={() => moveColumn(ci, 1)}>
                <ArrowLeft className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label="حذف العمود"
                onClick={() => setCfg((c) => ({ ...c, columns: c.columns.filter((_, i) => i !== ci) }))}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>

            <div className="space-y-2">
              {col.links.map((l, li) => (
                <div key={li} className="flex flex-wrap items-end gap-2 rounded-xl border border-border/60 p-2">
                  <div className="min-w-[140px] flex-1">
                    <Label className="text-[11px]">النص</Label>
                    <Input
                      value={l.label}
                      onChange={(e) =>
                        patchColumn(ci, {
                          links: col.links.map((x, i) => (i === li ? { ...x, label: e.target.value } : x)),
                        })
                      }
                    />
                  </div>
                  <div className="min-w-[180px] flex-1">
                    <Label className="text-[11px]">الرابط (اختياري)</Label>
                    <Input
                      dir="ltr"
                      placeholder="/shop أو https://..."
                      value={l.href ?? ""}
                      onChange={(e) =>
                        patchColumn(ci, {
                          links: col.links.map((x, i) =>
                            i === li ? { ...x, href: e.target.value || undefined } : x,
                          ),
                        })
                      }
                    />
                  </div>
                  <Button variant="outline" size="icon" aria-label="أعلى" onClick={() => moveLink(ci, li, -1)}>
                    <ChevronUp className="size-4" />
                  </Button>
                  <Button variant="outline" size="icon" aria-label="أسفل" onClick={() => moveLink(ci, li, 1)}>
                    <ChevronDown className="size-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="حذف العنصر"
                    onClick={() => patchColumn(ci, { links: col.links.filter((_, i) => i !== li) })}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}

              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => patchColumn(ci, { links: [...col.links, { label: "عنصر جديد" }] })}
              >
                <Plus className="size-4" />
                إضافة عنصر
              </Button>
            </div>
          </div>
        ))}

        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() => setCfg((c) => ({ ...c, columns: [...c.columns, { title: "عمود جديد", links: [] }] }))}
        >
          <Plus className="size-4" />
          إضافة عمود
        </Button>

        <div className="card-surface rounded-2xl border border-border/60 p-4">
          <Label>نص أسفل الفوتر</Label>
          <Input value={cfg.bottom_text} onChange={(e) => setCfg((c) => ({ ...c, bottom_text: e.target.value }))} />
          <p className="mt-1 text-[11px] text-muted-foreground">يظهر بعد سنة النشر تلقائيًا.</p>
        </div>
      </div>
    </div>
  );
}
