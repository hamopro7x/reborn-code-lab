import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ImagePlus, Download, Trash2, Loader2, FileImage } from "lucide-react";

const BUCKET = "bybit-docs";

export function useBybitDocsUpload(accountId?: string) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const folder = accountId ? `${accountId}/` : "";

  async function onPick(files: FileList | null) {
    const picked = Array.from(files ?? []);
    if (!picked.length) return;
    setBusy(true);
    try {
      const results = await Promise.all(
        picked.map(async (file) => {
          const ext = file.name.split(".").pop()?.toLowerCase() || "png";
          const path = `${folder}${crypto.randomUUID()}.${ext}`;
          const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
            contentType: file.type || "image/png",
            upsert: false,
          });
          return error ? error.message : null;
        }),
      );
      const failed = results.filter(Boolean);
      if (failed.length) toast.error(failed[0] as string);
      const ok = results.length - failed.length;
      if (ok > 0) toast.success(`تم رفع ${ok} صورة`);
      qc.invalidateQueries({ queryKey: ["bybit-docs", accountId ?? null] });
    } catch (e: any) {
      toast.error(e?.message ?? "فشل رفع الصور");
    } finally {
      setBusy(false);
    }
  }

  const trigger = () => inputRef.current?.click();

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      multiple
      className="hidden"
      onChange={(e) => {
        void onPick(e.target.files);
        e.target.value = "";
      }}
    />
  );

  return { trigger, input, busy };
}

export function BybitDocsButton({ onClick, busy }: { onClick: () => void; busy: boolean }) {
  return (
    <Button variant="outline" size="sm" className="rounded-xl" onClick={onClick} disabled={busy}>
      {busy ? <Loader2 className="size-4 ml-1 animate-spin" /> : <ImagePlus className="size-4 ml-1" />}
      إضافة صورة
    </Button>
  );
}

export function BybitDocsList({ isAdmin, accountId }: { isAdmin: boolean; accountId?: string }) {
  const qc = useQueryClient();
  const [preview, setPreview] = useState<string | null>(null);
  const folder = accountId ?? "";
  const q = useQuery({
    queryKey: ["bybit-docs", accountId ?? null],
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .list(folder, { limit: 100, sortBy: { column: "created_at", order: "desc" } });
      if (error) throw error;
      const files = (data ?? []).filter((f) => f.id);
      const signed = await Promise.all(
        files.map(async (f) => {
          const path = folder ? `${folder}/${f.name}` : f.name;
          const { data: s } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
          return { name: f.name, path, url: s?.signedUrl ?? "" };
        }),
      );
      return signed;
    },
  });

  async function download(name: string, url: string) {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      toast.error("تعذّر التنزيل");
    }
  }

  async function remove(path: string) {
    const { error } = await supabase.storage.from(BUCKET).remove([path]);
    if (error) return toast.error(error.message);
    toast.success("تم الحذف");
    qc.invalidateQueries({ queryKey: ["bybit-docs", accountId ?? null] });
  }

  const list = q.data ?? [];
  if (q.isLoading) {
    return (
      <div className="flex justify-center p-6">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }
  if (!list.length) {
    return <div className="py-4 text-center text-xs text-muted-foreground">لا توجد صور بعد</div>;
  }

  return (
    <div className="grid gap-3 grid-cols-2">
      {list.map((f, i) => (
        <div
          key={f.name}
          className="rounded-2xl border border-border/60 bg-background/60 p-3 flex items-center gap-2"
        >
          {f.url ? (
            <button
              type="button"
              onClick={() => setPreview(f.url)}
              className="size-24 shrink-0 overflow-hidden rounded-xl border border-border/60"
            >
              <img src={f.url} alt={`صورة ${list.length - i}`} className="h-full w-full object-cover" />
            </button>
          ) : (
            <FileImage className="size-5 shrink-0 text-muted-foreground" />
          )}
          <span className="flex-1 text-sm truncate">صورة {list.length - i}</span>
          <Button size="sm" variant="outline" className="rounded-xl" onClick={() => download(f.name, f.url)}>
            <Download className="size-4 ml-1" /> تحميل
          </Button>
          {isAdmin && (
            <Button size="sm" variant="ghost" className="rounded-xl text-destructive" onClick={() => remove(f.path)}>
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
      ))}
      <Dialog open={Boolean(preview)} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl p-2">
          {preview && <img src={preview} alt="معاينة الصورة" className="w-full rounded-xl object-contain" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function BybitDocsCard({ isAdmin, accountId }: { isAdmin: boolean; accountId?: string }) {
  const docs = useBybitDocsUpload(accountId);
  return (
    <div className="rounded-3xl border border-border/60 bg-card/70 p-4" dir="rtl">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold">الصور والملفات</h2>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <BybitDocsButton onClick={docs.trigger} busy={docs.busy} />
            {docs.input}
          </div>
        )}
      </div>
      <BybitDocsList isAdmin={isAdmin} accountId={accountId} />
    </div>
  );
}
