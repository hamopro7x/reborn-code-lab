import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

export type BybitVisibility = {
  enabled: boolean;
  balance: boolean;
  spend: boolean;
  txns: boolean;
  onchain: boolean;
  internal: boolean;
  cards: boolean;
  account: boolean;
  docs: boolean;
};

export const DEFAULT_VISIBILITY: BybitVisibility = {
  enabled: false,
  balance: true,
  spend: true,
  txns: true,
  onchain: true,
  internal: true,
  cards: true,
  account: true,
  docs: true,
};

export const VIS_KEY = ["bybit-visibility"];

export function useBybitVisibility() {
  const q = useQuery({
    queryKey: VIS_KEY,
    queryFn: async () => {
      const { data } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", "bybit_visibility")
        .maybeSingle();
      return { ...DEFAULT_VISIBILITY, ...((data?.value as any) ?? {}) } as BybitVisibility;
    },
  });
  return { vis: q.data ?? DEFAULT_VISIBILITY, isLoading: q.isLoading };
}

const PARTS: { key: keyof BybitVisibility; label: string }[] = [
  { key: "balance", label: "إجمالي الرصيد" },
  { key: "spend", label: "إحصائيات الإنفاق" },
  { key: "txns", label: "المعاملات" },
  { key: "onchain", label: "السحب والإيداع الخارجي" },
  { key: "internal", label: "السحب والإيداع الداخلي" },
  { key: "cards", label: "البطاقات" },
  { key: "account", label: "بيانات الحساب" },
  { key: "docs", label: "الصور والملفات" },
];

export function BybitVisibilityButton() {
  const qc = useQueryClient();
  const { vis } = useBybitVisibility();
  const [open, setOpen] = useState(false);

  const save = useMutation({
    mutationFn: async (next: BybitVisibility) => {
      const { error } = await supabase
        .from("site_settings")
        .upsert({ key: "bybit_visibility", value: next as any, updated_at: new Date().toISOString() });
      if (error) throw new Error(error.message);
      return next;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: VIS_KEY });
      toast.success("تم حفظ إعدادات الظهور");
    },
    onError: (e: any) => toast.error(e?.message || "تعذّر الحفظ"),
  });

  const set = (patch: Partial<BybitVisibility>) => save.mutate({ ...vis, ...patch });

  return (
    <>
      <Button
        variant={vis.enabled ? "default" : "outline"}
        size="sm"
        className="rounded-xl gap-1"
        onClick={() => setOpen(true)}
      >
        {vis.enabled ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
        <span className="text-xs">{vis.enabled ? "ظاهر للموظف" : "مخفي عن الموظف"}</span>
        {save.isPending && <Loader2 className="size-3 animate-spin" />}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="text-right sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-right">ظهور القسم عند الموظف</DialogTitle>
          </DialogHeader>

          <div className="flex items-center justify-between rounded-xl border border-border/60 p-3">
            <div>
              <div className="text-sm font-bold">تفعيل القسم للموظف</div>
              <div className="text-[11px] text-muted-foreground">الموظف يشاهد البيانات قراءة فقط</div>
            </div>
            <Switch checked={vis.enabled} onCheckedChange={(v) => set({ enabled: v })} />
          </div>

          <div className={`space-y-2 ${vis.enabled ? "" : "opacity-50 pointer-events-none"}`}>
            <div className="text-xs text-muted-foreground">اختر ما يظهر للموظف</div>
            {PARTS.map((p) => (
              <div key={p.key} className="flex items-center justify-between rounded-xl border border-border/60 px-3 py-2">
                <span className="text-sm">{p.label}</span>
                <Switch checked={Boolean(vis[p.key])} onCheckedChange={(v) => set({ [p.key]: v } as any)} />
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
