import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAccess, assertAdmin } from "./bybit-access";
import { assertShiftView } from "./work-access";

/* ------------------- admin: view ONE employee's work sheet -------------------
 * Same data source and shapes used by the employee view; only the resolved
 * user id differs (chosen employee instead of the caller). Read-only. */

const empSchema = z.object({ userId: z.string().uuid() });

export const getEmployeeWorkState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => empSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const mod = await import("./work.server");
    return mod.adminEmployeeWorkState(data.userId);
  });

export const getEmployeeShiftTxns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    empSchema.extend({ page: z.number().int().min(1).max(10_000).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    if ((data.page ?? 1) === 1) await (await import("./bybit.server")).pullFromBybit();
    const mod = await import("./work.server");
    return mod.adminEmployeeShiftRows(data.userId, data.page ?? 1, 50);
  });

export const getEmployeeManualTxns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => empSchema.extend(manualReadSchema.shape).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const mod = await import("./work.server");
    // الأدمن يرى كل السجلات اليدوية للموظف (كل الشفتات + الصفوف بلا شفت).
    // كان العرض مقيدًا بالشفت المفتوح فقط، فتختفي السجلات عند الأدمن بمجرد
    // إغلاق الشفت أو تسجيلها بدون شفت.
    return mod.listManualTxns(data.userId, null, data);
  });

/* ------------------ admin: ONE employee + ONE shift (history) ------------------
 * نفس دوال ومصادر بيانات الموظف، لكن مفلترة بمعرّف الشفت الحقيقي.
 * قراءة فقط: لا تُعدّل ولا تُحذف أي بيانات. */

const shiftSchema = z.object({ shiftId: z.string().uuid() });

export const getEmployeeShiftList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => empSchema.extend({ archivedOnly: z.boolean().optional() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const mod = await import("./work.server");
    return mod.shiftHistory(data.userId, 100, data.archivedOnly ?? false);
  });

/** علامة مراجعة الشفت — تُحفظ في قاعدة البيانات فلا تختفي نهائيًا. */
export const markShiftReviewed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => shiftSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const mod = await import("./work.server");
    return mod.markShiftReviewed(data.shiftId, context.userId);
  });

/** أرشفة شفتات محددة (المدير فقط) — تختفي من القوائم بدون حذف أي سجل. */
export const archiveEmployeeShifts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ shiftIds: z.array(z.string().uuid()).min(1).max(200) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const mod = await import("./work.server");
    return mod.archiveShifts(data.shiftIds);
  });

export const getShiftTxns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    shiftSchema.extend({ page: z.number().int().min(1).max(10_000).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertShiftView(context.supabase, context.userId, data.shiftId);
    const mod = await import("./work.server");
    return mod.shiftRows(data.shiftId, data.page ?? 1, 50);
  });

export const getWorkSheetSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    shiftId: z.string().uuid().optional(), userId: z.string().uuid().optional(),
  }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const mod = await import("./work.server");
    if (data.shiftId) {
      await assertShiftView(context.supabase, context.userId, data.shiftId);
      return mod.workSheetSummary(data.shiftId);
    }
    if (data.userId) await assertAdmin(context.supabase, context.userId);
    const state = data.userId
      ? await mod.adminEmployeeWorkState(data.userId)
      : await mod.myWorkState(context.userId);
    return state.holding ? mod.workSheetSummary(state.shiftId) : { count: 0, amount: 0, egp: 0, entered: 0, externalNotes: 0 };
  });

export const getShiftManualTxns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => shiftSchema.extend(manualReadSchema.shape).parse(input))
  .handler(async ({ data, context }) => {
    await assertShiftView(context.supabase, context.userId, data.shiftId);
    const mod = await import("./work.server");
    return mod.shiftManualTxns(data.shiftId, data);
  });

export const getShiftTransfers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    shiftSchema.extend({ scope: z.enum(["external", "internal"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertShiftView(context.supabase, context.userId, data.shiftId);
    const mod = await import("./work.server");
    return mod.shiftTransfers(data.shiftId, data.scope);
  });

export const getShiftP2P = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => shiftSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertShiftView(context.supabase, context.userId, data.shiftId);
    const role = await assertAccess(context.supabase, context.userId);
    const mod = await import("./work.server");
    return mod.shiftP2P(data.shiftId, role === "admin" ? undefined : context.userId);
  });

/** Link details are owner-scoped even when the central order itself is shared. */
export const getP2POrderLinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ ledgerId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const role = await assertAccess(context.supabase, context.userId);
    const mod = await import("./work.server");
    return mod.p2pOrderLinks(data.ledgerId, role === "admin" ? undefined : context.userId);
  });

/** طلبات P2P المرتبطة بالشفت المفتوح للموظف الحالي. */
export const getMyShiftP2P = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAccess(context.supabase, context.userId);
    const mod = await import("./work.server");
    return mod.myShiftP2P(context.userId);
  });

/** طلبات P2P المرتبطة بآخر شفت منتهي للموظف المختار (للأدمن). */
export const getEmployeeShiftP2P = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => empSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const mod = await import("./work.server");
    return mod.adminEmployeeShiftP2P(data.userId);
  });

/** رابط موقّع لصورة الموظف الحالي (bucket خاص). */
export const getMyAvatarUrl = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name, email, avatar_url")
      .eq("id", context.userId)
      .maybeSingle();
    let url: string | null = null;
    if (profile?.avatar_url && profile.avatar_url.startsWith(`${context.userId}/`) && !profile.avatar_url.includes("..")) {
      const { data: signed } = await supabaseAdmin.storage
        .from("avatars")
        .createSignedUrl(profile.avatar_url, 60 * 60 * 24);
      url = signed?.signedUrl ?? null;
    }
    return {
      name: profile?.full_name || profile?.email || "موظف",
      avatar: url,
    };
  });

/**
 * «ملخص الشفت» (أدمن فقط): أرشيف كامل لكل شفتات الموظف المحدد، مقسّمًا على
 * نفس الأقسام السبعة ومرتّبًا زمنيًا من الأقدم إلى الأحدث. قراءة فقط.
 */
export const getEmployeeArchive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        card: z.enum(["wrong", "employee", "receive", "transfer"]).optional(),
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(10).max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const mod = await import("./work.server");
    const paging =
      data.page !== undefined || data.pageSize !== undefined || data.card
        ? { card: data.card ?? null, page: data.page, pageSize: data.pageSize }
        : undefined;
    return mod.employeeArchive(data.userId, paging);
  });

/** حذف شفت لأي موظف (أدمن فقط). */
export const deleteEmployeeShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ shiftId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const mod = await import("./work.server");
    return mod.deleteShift(data.shiftId);
  });

/** حذف صف يدوي (خاص بالموظف / المعاملات الغلط) — أدمن فقط. */
export const deleteEmployeeManualTxn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const mod = await import("./work.server");
    return mod.deleteManualTxnRow(data.id);
  });

/** المعاملات اليدوية لشفت محدد (أدمن — قراءة فقط). */
export const getShiftManualCardTxns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ shiftId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertShiftView(context.supabase, context.userId, data.shiftId);
    const mod = await import("./work.server");
    return mod.shiftManualCardTxns(data.shiftId);
  });

/** المعاملات اليدوية لآخر شفت لموظف محدد (أدمن — قراءة فقط). */
export const getEmployeeManualCardTxns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const mod = await import("./work.server");
    return mod.employeeManualCardTxns(data.userId);
  });

/* --------------------------- employee PIN (admin) --------------------------- */

const adminPin = z.string().regex(/^\d{6}$/, "الرمز يجب أن يكون 6 أرقام");

/** Does this employee have a PIN? (admin view) */
export const getEmployeePinStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const mod = await import("./work.server");
    return { hasPin: await mod.pinIsSet(data.userId) };
  });

/** Admin sets or replaces an employee's 6-digit PIN. */
export const setEmployeePin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid(), pin: adminPin }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const mod = await import("./work.server");
    return mod.savePin(data.userId, data.pin, context.userId);
  });

/** Admin clears the PIN so the employee creates a new one on next handover. */
export const clearEmployeePin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const mod = await import("./work.server");
    return mod.clearPin(data.userId);
  });

/* ---------------- مشاركة شفت معيّن مع الموظف (قراءة فقط) ---------------- */

export const getSharedShiftId = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => empSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const mod = await import("./work.server");
    return { shiftId: await mod.getSharedShiftFor(data.userId) };
  });

export const setSharedShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    empSchema.extend({ shiftId: z.string().uuid().nullable() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const mod = await import("./work.server");
    await mod.setSharedShiftFor(data.userId, data.shiftId);
    return { ok: true };
  });

export const getMySharedShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const mod = await import("./work.server");
    const id = await mod.getSharedShiftFor(context.userId);
    if (!id) return null;
    const list = await mod.shiftHistory(context.userId);
    const idx = list.findIndex((s: any) => s.id === id);
    if (idx < 0) return null;
    return { ...list[idx], label: `شفت رقم ${list.length - idx}` };
  });
