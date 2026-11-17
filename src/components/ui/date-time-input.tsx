import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { dateTimeFields, dateTimeValue, type DateTimeFields } from "@/lib/date-time-input";

export function DateTimeInput({ value, onChange, label }: { value?: string | null; onChange: (value: string | null) => void; label: string }) {
  const [fields, setFields] = useState(() => dateTimeFields(value));
  useEffect(() => { setFields(dateTimeFields(value)); }, [value]);
  const change = (next: Partial<DateTimeFields>) => {
    const updated = { ...fields, ...next };
    setFields(updated);
    onChange(dateTimeValue(updated));
  };
  return <div className="flex flex-wrap items-center gap-2" dir="ltr">
    <Input className="min-w-36 flex-1" type="date" aria-label={`${label} — التاريخ`} value={fields.date} onChange={(e) => change({ date: e.target.value })} />
    <div className="flex shrink-0 items-center gap-1">
      <Select value={fields.hour} onValueChange={(hour) => change({ hour })}>
        <SelectTrigger className="w-16" aria-label={`${label} — الساعة`}><SelectValue /></SelectTrigger>
        <SelectContent>{Array.from({ length: 12 }, (_, i) => String(i + 1)).map((hour) => <SelectItem key={hour} value={hour}>{hour.padStart(2, "0")}</SelectItem>)}</SelectContent>
      </Select>
      <span aria-hidden="true">:</span>
      <Select value={fields.minute} onValueChange={(minute) => change({ minute })}>
        <SelectTrigger className="w-16" aria-label={`${label} — الدقيقة`}><SelectValue /></SelectTrigger>
        <SelectContent>{Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0")).map((minute) => <SelectItem key={minute} value={minute}>{minute}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={fields.period} onValueChange={(period) => change({ period: period === "pm" ? "pm" : "am" })}>
        <SelectTrigger className="w-24" aria-label={`${label} — صباحًا أو مساءً`}><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="am">صباحًا</SelectItem><SelectItem value="pm">مساءً</SelectItem></SelectContent>
      </Select>
    </div>
  </div>;
}