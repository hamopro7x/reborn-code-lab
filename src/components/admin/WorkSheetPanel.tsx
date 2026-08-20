/**
 * «جدول بيانات الشغل» — an independent layer on top of the existing
 * transactions. It never changes original transaction data; it only shows who
 * held the work, when, and which real transactions belong to each shift.
 */
import { Fragment, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ChevronDown, Loader2, ShieldCheck, Link2, Camera, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import {
  getWorkCurrent,
  getWorkShifts,
  getWorkTable,
  getWorkProductivity,
  getWorkP2PPending,
  getWorkAuthChallenge,
  registerWorkDevice,
  claimWorkShift,
  assignWorkTxn,
  saveEmployeeFace,
  listEmployeeFaces,
} from "@/lib/work.functions";
import { adminListEmployees } from "@/lib/courses.functions";
import { EmployeeWorkView } from "@/components/admin/EmployeeWorkView";
import { biometricSupported, registerBiometric, assertBiometric, captureFace } from "@/lib/work-client";

type TabKey = "now" | "shifts" | "table" | "productivity" | "p2p" | "faces";

/** All management tabs are admin-only. Employees get a dedicated work view. */
const TABS: { key: TabKey; label: string }[] = [
  { key: "now", label: "الشغل الآن" },
  { key: "shifts", label: "الشفتات" },
  { key: "table", label: "جدول المعاملات" },
  { key: "productivity", label: "الإنتاجية" },
  { key: "p2p", label: "ربط P2P بالشفت" },
  { key: "faces", label: "تسجيل الوجه" },
];

function Chip({ active, children, onClick }: { active?: boolean; children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
        active ? "border-primary bg-primary/15 text-primary" : "border-border/60 bg-card/60 text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="text-2xl font-black">{value}</div>
      {hint ? <div className="text-[11px] text-muted-foreground mt-1">{hint}</div> : null}
    </div>
  );
}

const dur = (from: number, to: number) => {
  const m = Math.max(Math.round((to - from) / 60000), 0);
  return `${Math.floor(m / 60)}س ${m % 60}د`;
};

export function WorkSheetPanel({ isAdmin }: { isAdmin: boolean }) {
  const [tab, setTab] = useState<TabKey>("now");

  // Employee = execution view only. No shifts history, no productivity,
  // no full work table, no other employees' data.
  if (!isAdmin) return <EmployeeWorkView />;


  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <Chip key={t.key} active={tab === t.key} onClick={() => setTab(t.key)}>
            {t.label}
          </Chip>
        ))}
      </div>

      {tab === "now" && <NowTab />}
      {tab === "shifts" && <ShiftsTab />}
      {tab === "table" && <TableTab />}
      {tab === "productivity" && <ProductivityTab />}
      {tab === "p2p" && <P2PTab />}
      {tab === "faces" && <FacesTab />}
    </div>
  );
}

/* ------------------------------- الشغل الآن ------------------------------- */

/** Shared claim card (face + device biometric). Contains no management data. */
function ClaimCard({ adminHint, onClaimed }: { adminHint?: boolean; onClaimed: () => void }) {
  const challengeFn = useServerFn(getWorkAuthChallenge);
  const registerFn = useServerFn(registerWorkDevice);
  const claimFn = useServerFn(claimWorkShift);
  const [busy, setBusy] = useState<string | null>(null);

  const enrollDevice = async () => {
    if (!biometricSupported()) return toast.error("هذا الجهاز/المتصفح لا يدعم المصادقة البيومترية");
    setBusy("device");
    try {
      const { challenge, userId } = await challengeFn({ data: { purpose: "register" } });
      const cred = await registerBiometric({ challenge, userId, name: "Mag Pro" });
      await registerFn({ data: { ...cred, label: navigator.platform || "device" } });
      toast.success("تم تسجيل مصادقة هذا الجهاز");
    } catch (e) {
      toast.error((e as Error).message || "فشل تسجيل الجهاز");
    } finally {
      setBusy(null);
    }
  };

  const claim = async () => {
    setBusy("claim");
    try {
      const { challenge, credentials } = await challengeFn({ data: { purpose: "auth" } });
      if (!credentials.length) {
        toast.error("سجّل مصادقة الجهاز أولاً");
        return;
      }
      const face = await captureFace();
      const sig = await assertBiometric({ challenge, credentialIds: credentials.map((c) => c.id) });
      const res = await claimFn({ data: { faceImage: face, ...sig } });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("تم استلام الشغل");
      onClaimed();
    } catch (e) {
      toast.error((e as Error).message || "فشل استلام الشغل");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-card/70 p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-black">
        <ShieldCheck className="size-4 text-primary" />
        استلام الشغل (تحقق الوجه + مصادقة الجهاز)
      </div>
      <p className="text-xs leading-6 text-muted-foreground">
        استلام الشغل يحتاج تحقق الوجه بالكاميرا ثم مصادقة الجهاز (Face ID / Touch ID / بصمة أندرويد).
        بعد النجاح ينتهي الشفت السابق تلقائيًا ويبدأ شفتك في نفس اللحظة. لا يتم تخزين أي بصمة.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void claim()} disabled={busy !== null}>
          {busy === "claim" ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
          استلام الشغل
        </Button>
        <Button variant="outline" onClick={() => void enrollDevice()} disabled={busy !== null}>
          {busy === "device" ? <Loader2 className="size-4 animate-spin" /> : null}
          تسجيل مصادقة هذا الجهاز
        </Button>
      </div>
      {adminHint ? (
        <p className="text-[11px] text-muted-foreground">
          لا بد من تسجيل صورة الوجه المرجعية للموظف من تبويب «تسجيل الوجه» قبل أول استلام.
        </p>
      ) : null}
    </div>
  );
}

/** Admin-only overview of who is holding the work now. */
function NowTab() {
  const qc = useQueryClient();
  const currentFn = useServerFn(getWorkCurrent);

  const q = useQuery({
    queryKey: ["work-current"],
    queryFn: () => currentFn({ data: undefined as any }),
    refetchInterval: 20_000,
  });
  const cur = q.data?.current ?? null;
  const me = q.data?.me;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/60 bg-card/70 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-black">
          <UserCheck className="size-4 text-primary" />
          الموظف المستلم للشغل حاليًا
        </div>
        {q.isLoading ? (
          <Loader2 className="size-5 animate-spin text-primary" />
        ) : cur ? (
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="الموظف" value={cur.name} hint={cur.userId === me ? "أنت" : undefined} />
            <Stat label="بداية الشفت" value={formatDateTime(cur.startedAt)} />
            <Stat label="مدة الشفت" value={dur(cur.startedAt, Date.now())} />
            <Stat label="عدد المعاملات" value={String(cur.txns)} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">لا يوجد موظف مستلم للشغل حاليًا.</p>
        )}
      </div>

      <ClaimCard
        adminHint
        onClaimed={() => {
          qc.invalidateQueries({ queryKey: ["work-current"] });
          qc.invalidateQueries({ queryKey: ["work-shifts"] });
        }}
      />
    </div>
  );
}

/* -------------------------------- الشفتات -------------------------------- */

function ShiftsTab() {
  const fn = useServerFn(getWorkShifts);
  const [openId, setOpenId] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["work-shifts"], queryFn: () => fn({ data: { limit: 60 } }) });

  return (
    <div className="data-surface">
      <table className="data-table text-right">
        <thead>
          <tr>
            <th className="p-3">الموظف</th>
            <th className="p-3">بداية الشفت</th>
            <th className="p-3">نهاية الشفت</th>
            <th className="p-3">المدة</th>
            <th className="p-3">عدد المعاملات</th>
            <th className="p-3" />
          </tr>
        </thead>
        <tbody>
          {(q.data ?? []).map((s) => (
            <Fragment key={s.id}>
              <tr>
                <td className="p-3 font-bold">{s.name}</td>
                <td className="p-3">{formatDateTime(s.startedAt)}</td>
                <td className="p-3">{s.endedAt ? formatDateTime(s.endedAt) : <Badge variant="outline">مفتوح</Badge>}</td>
                <td className="p-3">{dur(s.startedAt, s.endedAt ?? Date.now())}</td>
                <td className="p-3">
                  <button className="font-black text-primary underline" onClick={() => setOpenId(openId === s.id ? null : s.id)}>
                    {s.txns}
                  </button>
                </td>
                <td className="p-3">
                  <ChevronDown
                    className={`size-4 cursor-pointer transition ${openId === s.id ? "rotate-180" : ""}`}
                    onClick={() => setOpenId(openId === s.id ? null : s.id)}
                  />
                </td>
              </tr>
              {openId === s.id ? (
                <tr>
                  <td colSpan={6} className="p-3">
                    <WorkRows filters={{ shiftId: s.id }} />
                  </td>
                </tr>
              ) : null}
            </Fragment>
          ))}
          {!q.isLoading && !(q.data ?? []).length ? (
            <tr>
              <td colSpan={6} className="p-6 text-center text-muted-foreground">
                لا توجد شفتات بعد.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------ جدول المعاملات ------------------------------ */

function TableTab() {
  const shiftsFn = useServerFn(getWorkShifts);
  const shifts = useQuery({ queryKey: ["work-shifts"], queryFn: () => shiftsFn({ data: { limit: 60 } }) });
  const [userId, setUserId] = useState<string | undefined>(undefined);

  const employees = new Map<string, string>();
  for (const s of shifts.data ?? []) employees.set(s.userId, s.name);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Chip active={!userId} onClick={() => setUserId(undefined)}>
          كل الموظفين
        </Chip>
        {[...employees.entries()].map(([id, name]) => (
          <Chip key={id} active={userId === id} onClick={() => setUserId(id)}>
            {name}
          </Chip>
        ))}
      </div>
      <WorkRows filters={userId ? { userId } : {}} />
    </div>
  );
}

/** Shared work table with the original transaction data + shift/employee columns. */
function WorkRows({ filters }: { filters: { userId?: string; shiftId?: string; day?: string; week?: string } }) {
  const fn = useServerFn(getWorkTable);
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["work-table", filters, page],
    queryFn: () => fn({ data: { ...filters, page, pageSize: 50 } }),
  });
  const rows: any[] = (q.data as any)?.rows ?? [];
  const pages = Math.max(Math.ceil(Number((q.data as any)?.total ?? 0) / 50), 1);

  return (
    <div className="space-y-2">
      <div className="data-surface overflow-x-auto">
        <table className="data-table min-w-[820px] text-right">
          <thead>
            <tr>
              <th className="p-3">الموظف</th>
              <th className="p-3">النوع</th>
              <th className="p-3">البيان</th>
              <th className="p-3">المبلغ</th>
              <th className="p-3">العملة</th>
              <th className="p-3">الرسوم</th>
              <th className="p-3">الحالة</th>
              <th className="p-3">التاريخ والوقت</th>
              <th className="p-3">الربط</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Fragment key={r.assignmentId}>
                <tr>
                  <td className="p-3 font-bold">{r.name}</td>
                  <td className="p-3">{r.kind}</td>
                  <td className="p-3 max-w-[240px] truncate">{r.title}</td>
                  <td className={`p-3 font-black ${r.direction === "in" ? "text-emerald-400" : ""}`}>
                    {r.amount.toFixed(2)}
                  </td>
                  <td className="p-3">{r.currency}</td>
                  <td className="p-3">{r.fee ? r.fee.toFixed(2) : "—"}</td>
                  <td className="p-3">{r.status || "—"}</td>
                  <td className="p-3">{formatDateTime(r.time)}</td>
                  <td className="p-3">
                    <Badge variant="outline">{r.assignMode === "manual" ? "يدوي" : "تلقائي"}</Badge>
                  </td>
                  <td className="p-3">
                    <ChevronDown
                      className={`size-4 cursor-pointer transition ${openId === r.assignmentId ? "rotate-180" : ""}`}
                      onClick={() => setOpenId(openId === r.assignmentId ? null : r.assignmentId)}
                    />
                  </td>
                </tr>
                {openId === r.assignmentId ? (
                  <tr>
                    <td colSpan={10} className="p-4">
                      <div className="mb-2 text-xs font-black">ملخص المعاملة</div>
                      <div className="grid gap-2 text-[11px] sm:grid-cols-2 lg:grid-cols-3">
                        <Field label="Transaction ID" value={r.refId} />
                        <Field label="النوع" value={r.kind} />
                        <Field label="الحساب / الفيزا" value={r.accountName} />
                        <Field label="المبلغ" value={`${r.amount.toFixed(2)} ${r.currency}`} />
                        <Field label="الرسوم" value={r.fee ? r.fee.toFixed(2) : "—"} />
                        <Field label="الحالة" value={r.status || "—"} />
                        <Field label="التاريخ والوقت" value={formatDateTime(r.time)} />
                        <Field label="الموظف" value={r.name} />
                        <Field label="الشفت" value={r.shiftId ?? "—"} />
                        <Field label="طريقة الربط" value={r.assignMode === "manual" ? "يدوي" : "تلقائي"} />
                        <Field label="وقت الربط" value={formatDateTime(r.assignedAt)} />
                        {Object.entries(r.detail ?? {}).map(([k, v]) =>
                          v === null || v === "" ? null : <Field key={k} label={k} value={String(v)} />,
                        )}
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
            {!q.isLoading && !rows.length ? (
              <tr>
                <td colSpan={10} className="p-6 text-center text-muted-foreground">
                  لا توجد معاملات مرتبطة.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {pages > 1 ? (
        <div className="flex items-center justify-center gap-2 text-xs">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            السابق
          </Button>
          <span className="text-muted-foreground">
            {page} / {pages}
          </span>
          <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            التالي
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/60 p-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="break-all font-bold">{value}</div>
    </div>
  );
}

/* ------------------------------- الإنتاجية ------------------------------- */

function ProductivityTab() {
  const fn = useServerFn(getWorkProductivity);
  const q = useQuery({ queryKey: ["work-productivity"], queryFn: () => fn({ data: { days: 60 } }) });
  const [open, setOpen] = useState<{ userId: string; day?: string; week?: string } | null>(null);

  return (
    <div className="space-y-4">
      {(q.data ?? []).map((emp) => (
        <div key={emp.userId} className="rounded-2xl border border-border/60 bg-card/70 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-black">{emp.name}</div>
            <Badge variant="outline">الإجمالي: {emp.total}</Badge>
          </div>

          <div>
            <div className="mb-1 text-[11px] text-muted-foreground">الأسابيع</div>
            <div className="flex flex-wrap gap-2">
              {emp.weeks.map((w) => (
                <button
                  key={w.week}
                  className="rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-xs"
                  onClick={() =>
                    setOpen(open?.userId === emp.userId && open?.week === w.week ? null : { userId: emp.userId, week: w.week })
                  }
                >
                  أسبوع {w.week} — <span className="font-black text-primary">{w.count}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1 text-[11px] text-muted-foreground">الأيام</div>
            <div className="flex flex-wrap gap-2">
              {emp.days.map((d) => (
                <button
                  key={d.day}
                  className="rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-xs"
                  onClick={() =>
                    setOpen(open?.userId === emp.userId && open?.day === d.day ? null : { userId: emp.userId, day: d.day })
                  }
                >
                  {d.day} — <span className="font-black text-primary">{d.count}</span>
                </button>
              ))}
            </div>
          </div>

          {open?.userId === emp.userId ? (
            <WorkRows filters={{ userId: emp.userId, day: open.day, week: open.week }} />
          ) : null}
        </div>
      ))}
      {!q.isLoading && !(q.data ?? []).length ? (
        <p className="text-sm text-muted-foreground">لا توجد معاملات مرتبطة بموظفين بعد.</p>
      ) : null}
    </div>
  );
}

/* ------------------------------- ربط P2P ------------------------------- */

function P2PTab() {
  const qc = useQueryClient();
  const fn = useServerFn(getWorkP2PPending);
  const assign = useServerFn(assignWorkTxn);
  const q = useQuery({ queryKey: ["work-p2p"], queryFn: () => fn({ data: undefined as any }) });
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const link = async (ledgerId: string, shiftId: string) => {
    setBusy(ledgerId);
    const res = await assign({ data: { ledgerId, shiftId } });
    setBusy(null);
    if (!res.ok) return toast.error(res.error === "already assigned" ? "هذه المعاملة مرتبطة بالفعل" : res.error);
    toast.success("تم ربط المعاملة بالشفت");
    setPick(null);
    qc.invalidateQueries({ queryKey: ["work-p2p"] });
    qc.invalidateQueries({ queryKey: ["work-productivity"] });
    qc.invalidateQueries({ queryKey: ["work-shifts"] });
  };

  const shifts = q.data?.shifts ?? [];

  return (
    <div className="space-y-3">
      <p className="text-xs leading-6 text-muted-foreground">
        طلبات P2P تظل ظاهرة لجميع الموظفين في قسمها الأصلي. من هنا يربطها المدير بشفت الموظف الصحيح — مرة واحدة فقط،
        وبعد الربط لا يظهر الطلب هنا ولا يمكن ربطه مرة أخرى.
      </p>
      <div className="data-surface overflow-x-auto">
        <table className="data-table min-w-[760px] text-right">
          <thead>
            <tr>
              <th className="p-3">الطلب</th>
              <th className="p-3">الحساب</th>
              <th className="p-3">الكمية</th>
              <th className="p-3">الحالة</th>
              <th className="p-3">التاريخ والوقت</th>
              <th className="p-3">ربط بالشفت</th>
            </tr>
          </thead>
          <tbody>
            {(q.data?.orders ?? []).map((o) => (
              <Fragment key={o.ledgerId}>
                <tr>
                  <td className="p-3 max-w-[240px] truncate font-bold">{o.title}</td>
                  <td className="p-3">{o.accountName}</td>
                  <td className="p-3 font-black">
                    {o.amount.toFixed(2)} {o.currency}
                  </td>
                  <td className="p-3">{o.status || "—"}</td>
                  <td className="p-3">{formatDateTime(o.time)}</td>
                  <td className="p-3">
                    <Button size="sm" variant="outline" onClick={() => setPick(pick === o.ledgerId ? null : o.ledgerId)}>
                      <Link2 className="size-3" /> ربط بالشفت
                    </Button>
                  </td>
                </tr>
                {pick === o.ledgerId ? (
                  <tr>
                    <td colSpan={6} className="p-3">
                      <div className="mb-2 text-[11px] text-muted-foreground">اختر الموظف / الشفت:</div>
                      <div className="flex flex-wrap gap-2">
                        {shifts.map((s) => (
                          <Button
                            key={s.id}
                            size="sm"
                            variant="outline"
                            disabled={busy === o.ledgerId}
                            onClick={() => void link(o.ledgerId, s.id)}
                          >
                            {busy === o.ledgerId ? <Loader2 className="size-3 animate-spin" /> : null}
                            {s.name} — {formatDateTime(s.startedAt)}
                            {s.endedAt ? ` ← ${formatDateTime(s.endedAt)}` : " (مفتوح)"}
                          </Button>
                        ))}
                        {!shifts.length ? <span className="text-xs text-muted-foreground">لا توجد شفتات بعد.</span> : null}
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
            {!q.isLoading && !(q.data?.orders ?? []).length ? (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted-foreground">
                  لا توجد طلبات P2P بحاجة إلى ربط.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* --------------------------- تسجيل الوجه (المدير) --------------------------- */

function FacesTab() {
  const qc = useQueryClient();
  const empFn = useServerFn(adminListEmployees);
  const facesFn = useServerFn(listEmployeeFaces);
  const saveFn = useServerFn(saveEmployeeFace);
  const [busy, setBusy] = useState<string | null>(null);

  const employees = useQuery({ queryKey: ["work-employees"], queryFn: () => empFn() as Promise<any[]> });
  const faces = useQuery({ queryKey: ["work-faces"], queryFn: () => facesFn({ data: undefined as any }) });
  const enrolled = new Map((faces.data ?? []).map((f) => [f.userId, f.updatedAt]));

  const enroll = async (userId: string, image: string) => {
    setBusy(userId);
    try {
      await saveFn({ data: { userId, image } });
      toast.success("تم حفظ صورة الوجه المرجعية");
      qc.invalidateQueries({ queryKey: ["work-faces"] });
    } catch (e) {
      toast.error((e as Error).message || "فشل الحفظ");
    } finally {
      setBusy(null);
    }
  };

  const pickFile = (userId: string) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => void enroll(userId, String(reader.result));
      reader.readAsDataURL(file);
    };
    input.click();
  };

  return (
    <div className="space-y-3">
      <p className="text-xs leading-6 text-muted-foreground">
        صورة الوجه المرجعية تُستخدم فقط لمقارنة الوجه لحظة استلام الشغل، ونتيجة المقارنة نجاح/فشل فقط.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(employees.data ?? []).map((u: any) => (
          <div key={u.id} className="rounded-2xl border border-border/60 bg-card/70 p-4 space-y-2">
            <div className="text-sm font-black">{u.full_name || u.email}</div>
            <div className="text-[11px] text-muted-foreground">
              {enrolled.has(u.id) ? `مسجّل — ${formatDateTime(enrolled.get(u.id)!)}` : "غير مسجّل"}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={busy === u.id} onClick={() => pickFile(u.id)}>
                {busy === u.id ? <Loader2 className="size-3 animate-spin" /> : null} رفع صورة
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy === u.id}
                onClick={async () => {
                  try {
                    const img = await captureFace();
                    await enroll(u.id, img);
                  } catch (e) {
                    toast.error((e as Error).message || "تعذّر تشغيل الكاميرا");
                  }
                }}
              >
                <Camera className="size-3" /> تصوير الآن
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
