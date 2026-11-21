import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatLocaleDateTime } from "@/lib/format";
import { DateTimeInput } from "@/components/ui/date-time-input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Edit, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

function TimersTab() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-timers"], queryFn: async () => (await supabase.from("countdown_timers").select("*").order("created_at", { ascending: false })).data ?? [] });
  const [editing, setEditing] = useState<any>(null);
  const [open, setOpen] = useState(false);

  async function save() {
    const op = editing.id ? supabase.from("countdown_timers").update({ ...editing, id: undefined }).eq("id", editing.id) : supabase.from("countdown_timers").insert(editing);
    const { error } = await op;
    if (error) toast.error(error.message); else { toast.success("محفوظ"); setOpen(false); qc.invalidateQueries({ queryKey: ["admin-timers"] }); }
  }
  async function del(id: string) { await supabase.from("countdown_timers").delete().eq("id", id); qc.invalidateQueries({ queryKey: ["admin-timers"] }); }

  return (
    <div>
      <div className="flex justify-between mb-4">
        <h2 className="text-xl font-bold">مؤقتات العروض</h2>
        <Button onClick={() => { setEditing({ title: "", subtitle: "", ends_at: new Date(Date.now() + 86400000).toISOString(), active: true }); setOpen(true); }} className="gradient-primary text-white gap-1"><Plus className="size-4" />جديد</Button>
      </div>
      <div className="space-y-3">
        {(q.data ?? []).map((t: any) => (
          <div key={t.id} className="card-surface rounded-2xl p-4 flex items-center justify-between">
            <div><div className="font-bold">{t.title}</div><div className="text-xs text-muted-foreground">{formatLocaleDateTime(t.ends_at, "ar-EG")}</div></div>
            <div className="flex gap-1">
              {t.active ? <Badge>نشط</Badge> : <Badge variant="secondary">متوقف</Badge>}
              <Button size="icon" variant="ghost" onClick={() => { setEditing(t); setOpen(true); }}><Edit className="size-4" /></Button>
              <Button size="icon" variant="ghost" onClick={() => del(t.id)}><Trash2 className="size-4 text-destructive" /></Button>
            </div>
          </div>
        ))}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>مؤقت عرض</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>العنوان</Label><Input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></div>
              <div><Label>وصف</Label><Input value={editing.subtitle ?? ""} onChange={(e) => setEditing({ ...editing, subtitle: e.target.value })} /></div>
              <div><Label>ينتهي في</Label><DateTimeInput label="ينتهي في" value={editing.ends_at} onChange={(ends_at) => setEditing({ ...editing, ends_at })} /></div>
              <label className="flex items-center gap-2"><Switch checked={editing.active} onCheckedChange={(v) => setEditing({ ...editing, active: v })} /> نشط</label>
            </div>
          )}
          <DialogFooter><Button onClick={save} className="gradient-primary text-white">حفظ</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
