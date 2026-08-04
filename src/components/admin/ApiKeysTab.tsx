import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listApiKeys, createApiKey, revokeApiKey, deleteApiKey } from "@/lib/api-keys.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, KeyRound, Plus, Copy, Trash2, Ban, ShieldCheck } from "lucide-react";

type KeyRow = {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  last_used_at: string | null;
  revoked_at: string | null;
  expires_at: string | null;
  created_at: string;
};

const when = (v: string | null) => (v ? new Date(v).toLocaleString("ar-EG") : "—");

export function ApiKeysTab() {
  const qc = useQueryClient();
  const fetchKeys = useServerFn(listApiKeys);
  const create = useServerFn(createApiKey);
  const revoke = useServerFn(revokeApiKey);
  const remove = useServerFn(deleteApiKey);

  const [name, setName] = useState("");
  const [canWrite, setCanWrite] = useState(false);
  const [days, setDays] = useState("0");
  const [freshKey, setFreshKey] = useState<string | null>(null);

  const { data, isLoading } = useQuery<KeyRow[]>({
    queryKey: ["api-keys"],
    queryFn: () => fetchKeys() as Promise<KeyRow[]>,
  });

  const createMut = useMutation({
    mutationFn: () =>
      create({
        data: {
          name: name.trim(),
          scopes: canWrite ? ["read", "write"] : ["read"],
          expires_in_days: Number(days) || 0,
        },
      }),
    onSuccess: (res: any) => {
      setFreshKey(res.key);
      setName("");
      setCanWrite(false);
      setDays("0");
      qc.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success("تم إنشاء المفتاح — انسخه الآن، مش هيظهر تاني");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeMut = useMutation({
    mutationFn: (id: string) => revoke({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success("تم إلغاء المفتاح");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success("تم حذف المفتاح");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const copy = async (v: string) => {
    await navigator.clipboard.writeText(v);
    toast.success("تم النسخ");
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-card p-4">
        <h3 className="mb-4 flex items-center gap-2 font-semibold">
          <Plus className="h-4 w-4" /> إنشاء مفتاح جديد
        </h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>اسم المفتاح</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: تطبيق الموبايل" />
          </div>
          <div className="space-y-1.5">
            <Label>ينتهي بعد (أيام) — 0 = بدون انتهاء</Label>
            <Input type="number" min={0} value={days} onChange={(e) => setDays(e.target.value)} />
          </div>
          <div className="flex items-end gap-2">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={canWrite} onCheckedChange={(v) => setCanWrite(Boolean(v))} />
              صلاحية الكتابة
            </label>
          </div>
        </div>
        <Button
          className="mt-4"
          disabled={name.trim().length < 2 || createMut.isPending}
          onClick={() => createMut.mutate()}
        >
          {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          إنشاء المفتاح
        </Button>

        {freshKey && (
          <div className="mt-4 space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck className="h-4 w-4" /> المفتاح الكامل (يظهر مرة واحدة فقط)
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <code className="flex-1 break-all rounded bg-muted px-2 py-1 text-xs">{freshKey}</code>
              <Button size="sm" variant="outline" onClick={() => copy(freshKey)}>
                <Copy className="h-4 w-4" /> نسخ
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setFreshKey(null)}>
                إخفاء
              </Button>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-card p-4">
        <h3 className="mb-3 font-semibold">المفاتيح الحالية</h3>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد مفاتيح بعد.</p>
        ) : (
          <div className="space-y-2">
            {data!.map((k) => {
              const expired = k.expires_at && new Date(k.expires_at).getTime() < Date.now();
              const dead = Boolean(k.revoked_at || expired);
              return (
                <div key={k.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="font-semibold">{k.name}</div>
                    <code className="text-xs text-muted-foreground">{k.key_prefix}••••••••</code>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {k.scopes.map((s) => (
                      <Badge key={s} variant="secondary">{s === "write" ? "كتابة" : "قراءة"}</Badge>
                    ))}
                    <Badge variant={dead ? "destructive" : "default"}>
                      {k.revoked_at ? "ملغي" : expired ? "منتهي" : "نشط"}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    آخر استخدام: {when(k.last_used_at)} · انتهاء: {when(k.expires_at)}
                  </div>
                  <div className="flex gap-2">
                    {!dead && (
                      <Button size="sm" variant="outline" onClick={() => revokeMut.mutate(k.id)}>
                        <Ban className="h-4 w-4" /> إلغاء
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => deleteMut.mutate(k.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-card p-4 text-sm space-y-2">
        <h3 className="font-semibold">طريقة الاستخدام</h3>
        <p className="text-muted-foreground">ابعت المفتاح في هيدر الطلب على أي endpoint عام:</p>
        <code className="block break-all rounded bg-muted p-2 text-xs">
          curl -H "Authorization: Bearer YOUR_KEY" {typeof window !== "undefined" ? window.location.origin : ""}/api/public/v1/products
        </code>
      </section>
    </div>
  );
}
