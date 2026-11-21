import { useEffect, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getBybitAccountInfo, saveBybitAccountInfo } from "@/lib/bybit.functions";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

export function AccountInfoCard({ isAdmin, accountId }: { isAdmin: boolean; accountId?: string }) {
  const load = useServerFn(getBybitAccountInfo);
  const save = useServerFn(saveBybitAccountInfo);
  const qc = useQueryClient();
  const info = useQuery({
    queryKey: ["bybit-account-info", accountId ?? null],
    queryFn: () => load({ data: { accountId } } as any),
    enabled: isAdmin,
  });
  const row = (info.data as any)?.info ?? null;
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({ email: "", phone: "", password: "", bonus: "", mfa_code: "" });

  useEffect(() => {
    setForm({
      email: row?.email ?? "", phone: row?.phone ?? "", password: row?.password ?? "",
      bonus: row?.bonus ?? "", mfa_code: row?.mfa_code ?? "",
    });
  }, [row]);

  const m = useMutation({
    mutationFn: () => save({ data: { id: row?.id, accountId, ...form } } as any),
    onSuccess: () => {
      toast.success("تم الحفظ");
      setEdit(false);
      qc.invalidateQueries({ queryKey: ["bybit-account-info", accountId ?? null] });
    },
    onError: (e: any) => toast.error(String(e?.message ?? e)),
  });

  const fields: Array<{ key: keyof typeof form; label: string }> = [
    { key: "email", label: "البريد" },
    { key: "phone", label: "رقم التلفون" },
    { key: "password", label: "الباسورد" },
    { key: "bonus", label: "المكافأة" },
    { key: "mfa_code", label: "رمز المصادقة" },
  ];

  return (
    <div className="rounded-3xl border border-border/60 bg-card/70 p-4">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold">بيانات الحساب</h3>
        {!isAdmin ? null : edit ? (
          <div className="flex gap-2">
            <Button size="sm" className="rounded-xl" onClick={() => m.mutate()} disabled={m.isPending}>
              {m.isPending ? <Loader2 className="size-4 animate-spin" /> : "حفظ"}
            </Button>
            <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setEdit(false)}>إلغاء</Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setEdit(true)}>تعديل</Button>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map((f) => (
          <div key={f.key} className="flex flex-col gap-1.5 rounded-2xl border border-border/60 bg-background/40 p-3">
            <span className="text-xs text-muted-foreground">{f.label}</span>
            {edit ? (
              <Input
                value={form[f.key]}
                onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                className="h-9 rounded-xl border-border/60 bg-background/60 text-right"
              />
            ) : (
              <span className="truncate text-sm font-semibold">{form[f.key] || "—"}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
