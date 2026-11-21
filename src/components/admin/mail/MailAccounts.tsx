import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Mail, RefreshCw, Pause, Play, Plus, Trash2, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmt } from "@/components/admin/mail/MailFormatting";
import { livePoll } from "@/lib/live-poll";
import {
  listMailAccounts, startMailLink, setMailAccountPaused, deleteMailAccount, syncMailNow,
} from "@/lib/mail.functions";

const STATUS: Record<string, string> = { active: "متصل", paused: "موقوف", error: "خطأ مؤقت", reauth_required: "يحتاج إعادة ربط" };

export function MailAccounts({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listMailAccounts);
  const linkFn = useServerFn(startMailLink);
  const pauseFn = useServerFn(setMailAccountPaused);
  const delFn = useServerFn(deleteMailAccount);
  const syncFn = useServerFn(syncMailNow);
  const q = useQuery({ queryKey: ["mail-accounts"], queryFn: () => listFn(), refetchInterval: livePoll(30000) });
  const [busy, setBusy] = useState<string | null>(null);
  const popupRef = useRef<Window | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["mail-accounts"] });

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== popupRef.current || e.data?.type !== "mgpro-mail-oauth") return;
      popupRef.current = null;
      e.data.ok ? toast.success(e.data.message) : toast.error(e.data.message);
      refresh();
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  });

  const link = async () => {
    const popup = window.open("", "mgpro-mail-oauth", "width=520,height=680");
    popupRef.current = popup;
    if (!popup) return toast.error("افتح السماح بالنوافذ المنبثقة");
    try {
      const { url } = await linkFn();
      popup.location.href = url;
    } catch (e: any) {
      popup.close();
      toast.error(e?.message ?? "تعذر بدء الربط");
    }
  };
  const run = async (id: string, f: () => Promise<any>, ok: string) => {
    setBusy(id);
    try { await f(); toast.success(ok); refresh(); qc.invalidateQueries({ queryKey: ["mail-msgs"] }); }
    catch (e: any) { toast.error(e?.message ?? "حدث خطأ"); }
    finally { setBusy(null); }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="font-bold">حسابات Gmail</h3>
        {isAdmin && <Button size="sm" onClick={link}><Plus className="ms-1 h-4 w-4" />إضافة جيميل</Button>}
      </div>
      {q.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : q.error ? (
        <p className="text-sm text-destructive">{(q.error as Error).message}</p>
      ) : !q.data?.length ? (
        <p className="text-sm text-muted-foreground">لا يوجد حسابات مربوطة بعد.</p>
      ) : (
        <ul className="space-y-2">
          {q.data.map((a: any) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2 text-sm">
              <Mail className="h-4 w-4 text-primary" />
              <span className="font-medium" dir="ltr">{a.email}</span>
              <span className={`rounded px-2 py-0.5 text-xs ${a.status === "active" ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"}`}>{STATUS[a.status] ?? a.status}</span>
              <span className="text-xs text-muted-foreground">آخر مزامنة: {fmt(a.last_sync_at)}</span>
              {a.last_error && a.status !== "active" && <span className="text-xs text-destructive">{a.last_error}</span>}
              {isAdmin && (
                <div className="ms-auto flex gap-1">
                  {busy === a.id && <Loader2 className="h-4 w-4 animate-spin" />}
                  <Button size="icon" variant="ghost" title="مزامنة الآن" onClick={() => run(a.id, () => syncFn({ data: { accountId: a.id } }), "تمت المزامنة")}><RefreshCw className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" title="إعادة ربط" onClick={link}><Link2 className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" title={a.status === "paused" ? "تشغيل" : "إيقاف"} onClick={() => run(a.id, () => pauseFn({ data: { id: a.id, paused: a.status !== "paused" } }), "تم")}>
                    {a.status === "paused" ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                  </Button>
                  <Button size="icon" variant="ghost" title="حذف" onClick={() => {
                    if (confirm(`حذف ${a.email}؟ سيتم مسح كل رسائله ومسوداته من الموقع فقط، ولن يتغير شيء في Gmail.`)) run(a.id, () => delFn({ data: { id: a.id } }), "تم حذف الحساب");
                  }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
