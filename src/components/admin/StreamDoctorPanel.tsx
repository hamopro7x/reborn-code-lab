import { useEffect } from "react";
import { Bot } from "lucide-react";
import { setDoctorEnabled, setDoctorTargets, type DoctorTarget } from "@/lib/screen-doctor";

/** مؤشّر صغير لروبوت إصلاح البث — يعمل دائماً بدون أي تحكم أو نصوص */
export function StreamDoctorPanel({ targets }: { targets: DoctorTarget[] }) {
  useEffect(() => {
    setDoctorEnabled(true);
  }, []);
  useEffect(() => {
    setDoctorTargets(targets);
  }, [targets]);

  return (
    <span title="روبوت إصلاح البث — يعمل دائماً" className="inline-flex items-center">
      <Bot className="size-4 text-primary" />
    </span>
  );
}
