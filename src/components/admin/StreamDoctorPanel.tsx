import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bot, ShieldCheck, ShieldOff } from "lucide-react";
import {
  getDoctorEvents,
  isDoctorEnabled,
  setDoctorEnabled,
  setDoctorTargets,
  subscribeDoctor,
  type DoctorTarget,
} from "@/lib/screen-doctor";

/** لوحة روبوت الإصلاح التلقائي لبث شاشات الموظفين */
export function StreamDoctorPanel({ targets }: { targets: DoctorTarget[] }) {
  const [, force] = useState(0);

  useEffect(() => {
    const unsub = subscribeDoctor(() => force((n) => n + 1));
    return () => {
      unsub();
    };
  }, []);
  useEffect(() => {
    setDoctorTargets(targets);
  }, [targets]);

  const on = isDoctorEnabled();
  const events = getDoctorEvents();

  return (
    <div className="rounded-xl border border-border/60 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Bot className="size-4 text-primary" />
          <span className="text-sm font-bold">روبوت إصلاح البث</span>
          <Badge variant={on ? "default" : "secondary"} className="text-[10px]">
            {on ? "يعمل" : "متوقف"}
          </Badge>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setDoctorEnabled(!on);
          }}
        >
          {on ? <ShieldOff className="size-4 ml-1" /> : <ShieldCheck className="size-4 ml-1" />}
          {on ? "إيقاف" : "تشغيل"}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        يراقب كل شاشة، وإذا تأخّر البث أكثر من 3 ثوانٍ يكتشف سبب المشكلة ويصلحها: يحدّث صفحة برنامج
        الموظف تلقائياً، يجدّد التقاط الشاشة، أو ينزّل آخر إصدار للبرنامج لو كانت التحديثات متراكمة
        بسبب انقطاع النت.
      </p>

      {events.length === 0 ? (
        <p className="text-xs text-muted-foreground">لا توجد مشاكل مسجّلة — كل الشاشات سليمة.</p>
      ) : (
        <div className="space-y-1.5 max-h-56 overflow-y-auto">
          {events.map((e) => (
            <div key={e.id} className="rounded-lg bg-muted/40 px-2.5 py-1.5 text-xs space-y-0.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold truncate">{e.deviceName}</span>
                <span className="text-[10px] text-muted-foreground" dir="ltr">
                  {new Date(e.at).toLocaleTimeString("ar-EG")}
                </span>
              </div>
              <p className="text-muted-foreground">السبب: {e.cause}</p>
              <p className={e.level === "fix" ? "text-primary" : "text-muted-foreground"}>
                الإجراء: {e.action}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
