import { useEffect, useState, useRef } from "react";
import { usePersistentState } from "@/lib/persistent-state";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { syncAllBybitCardTxns, listBybitAccounts, addBybitAccount, removeBybitAccount, updateBybitAccount } from "@/lib/bybit.functions";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { FintechBackdrop } from "@/components/admin/FintechBackdrop";
import { useAdminBack } from "@/components/admin/back-nav";
import { BybitLedgerPanel } from "@/components/admin/BybitLedgerPanel";
import { Loader2, Wallet } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BybitAccountView } from "@/components/admin/bybit/BybitAccountView";
import type { BybitAccountRow } from "@/components/admin/bybit/types";
import { AccountSummaryCard } from "@/components/admin/bybit/AccountSummaryCard";
import { FreezeDialog, AddAccountDialog, EditAccountDialog } from "@/components/admin/bybit/BybitAccountManagement";




export function BybitTab({ isAdmin }: { isAdmin: boolean }) {

  const qc = useQueryClient();
  const listFn = useServerFn(listBybitAccounts);
  const addFn = useServerFn(addBybitAccount);
  const removeFn = useServerFn(removeBybitAccount);
  const updateFn = useServerFn(updateBybitAccount);
  const [selected, setSelected] = usePersistentState<string | null>("bybit_selected_account", null);
  // القسم يفتح على المنظرة المركزية أولاً، وبعدها يفتح المستخدم باقي الحسابات.
  const [listOpen, setListOpen] = usePersistentState<boolean>("bybit_list_open", false);

  // كل مرة يُفتح فيها قسم معاملات الفيزا يبدأ من المنظرة المركزية، لا من حساب محدد.
  useEffect(() => {
    setSelected(null);
    setListOpen(false);
  }, []);

  const [addOpen, setAddOpen] = useState(false);
  const [addError, setAddError] = useState<{ message: string; serverIp?: string | null } | null>(null);
  const [editAccount, setEditAccount] = useState<BybitAccountRow | null>(null);

  const accounts = useQuery({ queryKey: ["bybit-accounts"], queryFn: () => listFn() });
  const list = (((accounts.data as any)?.accounts ?? []) as BybitAccountRow[])
    .slice()
    .sort((a, b) => {
      const ao = a.sortOrder && a.sortOrder > 0 ? a.sortOrder : Number.MAX_SAFE_INTEGER;
      const bo = b.sortOrder && b.sortOrder > 0 ? b.sortOrder : Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;
      return a.name.localeCompare(b.name, "ar");
    });


  // مزامنة معاملات كل الحسابات في الخلفية (مش الحساب المفتوح بس)
  const syncAllFn = useServerFn(syncAllBybitCardTxns);
  const syncedRef = useRef(false);
  useEffect(() => {
    if (syncedRef.current || list.length === 0) return;
    syncedRef.current = true;
    const t = setTimeout(() => {
      void syncAllFn().then(() => {
        qc.invalidateQueries({ queryKey: ["bybit-card"] });
        qc.invalidateQueries({ queryKey: ["bybit-overview"] });
      });
    }, 800);
    return () => clearTimeout(t);
  }, [list.length, qc, syncAllFn]);

  const addAccount = useMutation({
    mutationFn: (data: { apiKey: string; apiSecret: string; name: string; force?: boolean }) => addFn({ data }),
    onSuccess: (res: any) => {
      if (res?.ok === false) {
        setAddError({ message: res.error || "تعذر ربط الحساب", serverIp: res.serverIp ?? null });
        return;
      }
      setAddError(null);
      toast.success("تمت إضافة الحساب");
      setAddOpen(false);
      qc.invalidateQueries({ queryKey: ["bybit-accounts"] });
    },
    onError: (e: any) => setAddError({ message: e?.message || "تعذر ربط الحساب" }),
  });
  const removeAccount = useMutation({
    mutationFn: (data: { id: string }) => removeFn({ data }),
    onSuccess: () => {
      toast.success("تم حذف الحساب");
      qc.invalidateQueries({ queryKey: ["bybit-accounts"] });
    },
    onError: (e: any) => toast.error(e?.message || "فشل حذف الحساب"),
  });
  const saveAccount = useMutation({
    mutationFn: (data: { id: string; name: string; monthlyCashback: number; sortOrder: number }) => updateFn({ data }),
    onSuccess: () => {
      toast.success("تم حفظ بيانات الحساب");
      setEditAccount(null);
      qc.invalidateQueries({ queryKey: ["bybit-accounts"] });
    },
    onError: (e: any) => toast.error(e?.message || "فشل حفظ البيانات"),
  });
  const [freezeTarget, setFreezeTarget] = useState<any>(null);
  const freezeAccount = useMutation({
    mutationFn: (data: { id: string; frozen: boolean; frozenUntil?: string | null }) => updateFn({ data }),
    onSuccess: (_r, v) => {
      toast.success(v.frozen ? "تم تجميد الحساب" : "تم فك التجميد");
      setFreezeTarget(null);
      qc.invalidateQueries({ queryKey: ["bybit-accounts"] });
    },
    onError: (e: any) =>
      toast.error(/frozen/i.test(e?.message ?? "") ? "شغل كود تجميد الحسابات في قاعدة البيانات الأول" : e?.message || "فشل التجميد"),
  });


  const current = list.find((a) => a.id === selected) ?? null;

  useAdminBack(!current && listOpen ? () => setListOpen(false) : null, [!!current, listOpen]);

  if (current) {
    return (
      <BybitAccountView
        isAdmin={isAdmin}
        accountId={current.id}
        accountName={current.name}
        onBack={() => setSelected(null)}
      />
    );
  }

  if (!listOpen) {
    return (
      <div className="space-y-4 text-right" dir="rtl">
        <button
          type="button"
          onClick={() => setListOpen(true)}
          className="w-full rounded-2xl border border-border/60 bg-card/60 p-5 text-right transition hover:border-primary/60 hover:bg-card"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="size-10 rounded-xl bg-blue-500/15 text-blue-400 grid place-items-center">
                <Wallet className="size-5" />
              </span>
              <div>
                <div className="text-[11px] text-muted-foreground">
                  {accounts.isLoading ? "جاري التحميل…" : `${list.length} حساب مرتبط`}
                </div>
              </div>
            </div>
            <span className="text-xs text-muted-foreground">فتح ›</span>
          </div>
        </button>
        <BybitLedgerPanel />
      </div>
    );
  }


  return (
    <div className="relative space-y-4 text-right" dir="rtl">
      <FintechBackdrop fullscreen />
      {accounts.isLoading ? (
        <div className="relative z-10 flex justify-center p-10"><Loader2 className="size-6 animate-spin" /></div>
      ) : !list.length ? (
        <div className="relative z-10 rounded-3xl border border-border/60 bg-card/60 p-8 text-center text-sm text-muted-foreground">
          لا توجد حسابات مربوطة بعد{isAdmin ? " — أضف حسابا بمفتاح API (قراءة فقط)." : "."}
        </div>
      ) : (
        <div className="relative z-10 grid auto-rows-auto grid-cols-1 items-start gap-4 xl:grid-cols-2">
          {list.map((a, i) => (
            <AccountSummaryCard
              key={a.id}
              account={a}
              index={i}
              isAdmin={isAdmin}
              onOpen={() => setSelected(a.id)}
              onDelete={() => removeAccount.mutate({ id: a.id })}
              onEdit={() => setEditAccount(a)}
              onToggleFreeze={() => (a.frozen ? freezeAccount.mutate({ id: a.id, frozen: false }) : setFreezeTarget(a))}
              onFreezeExpired={() => qc.invalidateQueries({ queryKey: ["bybit-accounts"] })}
              freezePending={freezeAccount.isPending && freezeAccount.variables?.id === a.id}
            />
          ))}
        </div>
      )}




      <FreezeDialog
        account={freezeTarget}
        pending={freezeAccount.isPending}
        onClose={() => setFreezeTarget(null)}
        onConfirm={(frozenUntil) => freezeTarget && freezeAccount.mutate({ id: freezeTarget.id, frozen: true, frozenUntil })}
      />
      <AddAccountDialog
        open={addOpen}
        busy={addAccount.isPending}
        error={addError}
        onClose={() => { setAddOpen(false); setAddError(null); }}
        onSubmit={(d) => addAccount.mutate(d)}
      />

      <EditAccountDialog
        account={editAccount}
        busy={saveAccount.isPending}
        onClose={() => setEditAccount(null)}
        onSubmit={(d) => saveAccount.mutate(d)}
      />

    </div>
  );
}

