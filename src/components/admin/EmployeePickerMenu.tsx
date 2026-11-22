import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { listEmployees } from "@/lib/admin.functions";

export type Employee = {
  user_id: string;
  role: string;
  email: string;
  full_name: string;
  avatar_signed_url?: string | null;
};

/** لوحة اختيار الموظف — بنفس أسلوب شريط «ربط طلبات P2P» (Popover فوق الواجهة). */
export function EmployeePickerMenu({
  open,
  onOpenChange,
  selectedId,
  onSelect,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  selectedId: string | null;
  onSelect: (emp: Employee) => void;
  children: React.ReactNode;
}) {
  const list = useServerFn(listEmployees);
  const q = useQuery({
    queryKey: ["admin-employees"],
    queryFn: () => list() as Promise<Employee[]>,
    enabled: open,
    // قائمة الموظفين تتغيّر نادراً: بدون هذا كانت تُجلب من جديد مع كل فتح.
    staleTime: 15_000,
  });

  const employees = (q.data ?? []).filter((e) => e.role === "employee");

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        dir="rtl"
        align="center"
        className="w-auto max-w-[92vw] border-0 bg-transparent p-0 shadow-none"
      >
        <div className="w-[330px] overflow-hidden rounded-xl border border-border/50 bg-[oklch(0.135_0_0)] shadow-2xl">
          <div className="data-table-head truncate px-3 py-1.5 text-center text-[11px] font-bold">
            اختر الموظف
          </div>
          <div className="max-h-60 overflow-y-auto p-2">
            {q.isLoading ? (
              <Loader2 className="mx-auto my-4 size-4 animate-spin text-muted-foreground" />
            ) : employees.length === 0 ? (
              <p className="p-3 text-center text-xs text-white/60">لا يوجد موظفين</p>
            ) : (
              <ul className="space-y-1">
                {employees.map((emp) => {
                  const active = emp.user_id === selectedId;
                  return (
                    <li key={emp.user_id}>
                      <button
                        type="button"
                        onClick={() => onSelect(emp)}
                        className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-right text-xs font-bold transition ${
                          active
                            ? "bg-[#1a1a1a] text-blue-300 ring-1 ring-blue-500/40"
                            : "bg-[#111] text-white/85 hover:bg-[#181818]"
                        }`}
                      >
                        <span className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-full bg-white/10 text-[10px] text-white/60">
                          {emp.avatar_signed_url ? (
                            <img
                              src={emp.avatar_signed_url}
                              alt={emp.full_name || emp.email}
                              className="size-full object-cover"
                            />
                          ) : (
                            (emp.full_name || emp.email || "?").slice(0, 1)
                          )}
                        </span>
                        <span className="truncate">{emp.full_name || emp.email}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

