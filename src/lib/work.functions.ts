import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAccess, assertAdmin } from "./bybit-access";

/* --------------------- admin-only management reads --------------------- */
/**
 * Role-Based Access Control lives here, NOT in the UI: every management read
 * (shifts, full work table, productivity, P2P linking) requires admin. An
 * employee calling these endpoints directly gets "Forbidden" and no data.
 */

export const getWorkCurrent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const mod = await import("./work.server");
    return { current: await mod.currentShift(), me: context.userId };
  });

export const getWorkShifts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { limit?: number } | undefined) => ({
    limit: Math.min(Math.max(Number(input?.limit ?? 60) || 60, 1), 200),
  }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const mod = await import("./work.server");
    return mod.listShifts(data.limit);
  });

export const getWorkProductivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { days?: number } | undefined) => ({
    days: Math.min(Math.max(Number(input?.days ?? 30) || 30, 1), 400),
  }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const mod = await import("./work.server");
    return mod.productivity(Date.now() - data.days * 86400_000);
  });

const tableSchema = z.object({
  userId: z.string().uuid().optional(),
  shiftId: z.string().uuid().optional(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  week: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.number().int().min(1).max(10_000).optional(),
  pageSize: z.number().int().min(10).max(200).optional(),
});

export const getWorkTable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => tableSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const mod = await import("./work.server");
    return mod.workTable(data);
  });

export const getWorkP2PPending = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const mod = await import("./work.server");
    const [orders, shifts] = await Promise.all([mod.pendingP2P(120), mod.shiftOptions(40)]);
    return { orders, shifts };
  });

/** Completed P2P orders of ALL accounts — readable by any employee. */
export const getWorkP2PCompleted = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAccess(context.supabase, context.userId);
    const mod = await import("./work.server");
    return mod.completedP2P(200);
  });

/**
 * Read-only filter over the SAME central ledger: external (on-chain) or
 * internal deposits & withdrawals. No new records are created.
 */
export const getWorkTransfers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ scope: z.enum(["external", "internal"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const mod = await import("./work.server");
    return mod.transfersLedger(data.scope, 200);
  });

/** حفظ خانة «تحويل الي» في قسم السحب الداخلي (نافذة تعديل 10 دقائق). */
export const saveTransferNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ ledgerId: z.string().uuid(), note: z.string().min(1).max(200) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const mod = await import("./work.server");
    return mod.saveTransferNote(context.userId, data.ledgerId, data.note);
  });


/** Real staff names for the «ربط» picker. */
export const getWorkStaffList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAccess(context.supabase, context.userId);
    const mod = await import("./work.server");
    return mod.staffList();
  });

/** Shifts of ONE chosen employee. */
export const getStaffShifts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const mod = await import("./work.server");
    return mod.shiftsOfUser(data.userId);
  });

/** The caller's OWN shifts only — resolved from the authenticated session. */
export const getMyShiftsForLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAccess(context.supabase, context.userId);
    const mod = await import("./work.server");
    return mod.myShiftsForLink(context.userId);
  });

/** Employee-side P2P linking: order → employee → shift. */
export const linkP2POrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ ledgerId: z.string().uuid(), shiftId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const mod = await import("./work.server");
    return mod.linkP2P(data.ledgerId, data.shiftId, context.userId);
  });



/* ------------------------- employee-scoped reads ------------------------- */

/** Only the caller's own open shift: no other employee's data is returned. */
export const getMyWorkState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAccess(context.supabase, context.userId);
    const mod = await import("./work.server");
    return mod.myWorkState(context.userId);
  });

/** Transactions of the caller's own open shift only. */
export const getMyShiftTxns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { page?: number } | undefined) => ({
    page: Math.min(Math.max(Number(input?.page ?? 1) || 1, 1), 10_000),
  }))
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const mod = await import("./work.server");
    return mod.myShiftRows(context.userId, data.page, 50);
  });

/**
 * Employee-entered «جنيه» / «الكمية» for one transaction of his own open shift.
 * Write-once: the server refuses to overwrite a value that already exists.
 */
export const saveMyTxnEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        ledgerId: z.string().uuid(),
        field: z.enum(["egp", "quantity"]),
        value: z.number().finite().min(0).max(1_000_000_000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const mod = await import("./work.server");
    return mod.saveEntryField(context.userId, data.ledgerId, data.field, data.value);
  });

/* ------------------------------- claiming ------------------------------- */

/** Is the current employee's face already enrolled? */
export const getMyFaceStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAccess(context.supabase, context.userId);
    const mod = await import("./work.server");
    return { enrolled: await mod.faceEnrolled(context.userId) };
  });

const frame = z.string().min(100).max(4_000_000);
const enrollSchema = z.object({ faceImages: z.array(frame).min(1).max(4) });

/** First-time face enrollment from multiple frames, bound to this employee. */
export const enrollMyFace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => enrollSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const mod = await import("./work.server");
    return mod.enrollMyFace(context.userId, data.faceImages);
  });

/** Server-issued random movement challenge (direction order is NOT client-chosen). */
export const startFaceChallenge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAccess(context.supabase, context.userId);
    const mod = await import("./work.server");
    return mod.startFaceChallenge(context.userId);
  });

const claimSchema = z.object({
  faceImages: z.array(frame).min(1).max(3),
  steps: z
    .array(z.object({ dir: z.enum(["right", "left"]), image: frame }))
    .min(2)
    .max(4),
  faceBack: frame.optional(),
});

/** Face verification + open eyes + server-issued movement challenge, then handover. */
export const claimWorkShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => claimSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const mod = await import("./work.server");

    if (!(await mod.faceEnrolled(context.userId))) {
      return { ok: false as const, error: "NO_FACE_DATA" };
    }

    const chal = await mod.consumeFaceChallenge(
      context.userId,
      data.steps.map((s) => s.dir),
    );
    if (!chal.ok) return { ok: false as const, error: chal.reason ?? "فشل التحقق من الحركة" };

    const eyes = await mod.checkEyesOpen(data.faceImages);
    if (!eyes.ok) return { ok: false as const, error: eyes.reason ?? "افتح عينيك وانظر إلى الكاميرا" };

    const live = await mod.checkHeadTurnLiveness({
      center: data.faceImages[0]!,
      steps: data.steps,
      ...(data.faceBack ? { back: data.faceBack } : {}),
    });
    if (!live.ok) return { ok: false as const, error: live.reason ?? "فشل التحقق من حركة الوجه" };

    const face = await mod.verifyFace(context.userId, data.faceImages);
    if (!face.ok) {
      return {
        ok: false as const,
        error: face.reason ?? "تعذّر التحقق من الوجه، حاول مرة أخرى",
      };
    }

    const { data: shift, error } = await context.supabase.rpc("work_claim_shift", {
      p_face: true,
      p_device: true,
    });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, shift };
  });

/* --------------------------- manual P2P linking --------------------------- */

export const assignWorkTxn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ ledgerId: z.string().uuid(), shiftId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.rpc("work_assign_txn", {
      p_ledger_id: data.ledgerId,
      p_shift_id: data.shiftId,
    });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

/* ------------------------- face enrollment (admin) ------------------------- */

export const saveEmployeeFace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid(), image: z.string().min(100).max(4_000_000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const mod = await import("./work.server");
    return mod.saveFaceEnroll(data.userId, data.image, context.userId);
  });

export const listEmployeeFaces = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const mod = await import("./work.server");
    return mod.faceEnrollList();
  });

/* ------------- manual rows: «المعاملات الغلط» / «خاص بالموظف» ------------- */

export const getMyManualTxns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAccess(context.supabase, context.userId);
    const mod = await import("./work.server");
    return mod.listManualTxns(context.userId);
  });

export const addMyManualTxn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ card: z.enum(["wrong", "employee", "receive", "transfer"]) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const mod = await import("./work.server");
    return mod.addManualTxn(context.userId, data.card);
  });

export const saveMyManualTxn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        field: z.enum(["amount", "details"]),
        value: z.string().max(2000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const mod = await import("./work.server");
    return mod.saveManualTxn(context.userId, data.id, data.field, data.value);
  });

/** Admin-only: clear every manual row in one card for the current user. */
export const clearMyManualTxns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ card: z.enum(["wrong", "employee", "receive", "transfer"]) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const mod = await import("./work.server");
    return mod.clearManualTxns(context.userId, data.card);
  });

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
    const mod = await import("./work.server");
    return mod.adminEmployeeShiftRows(data.userId, data.page ?? 1, 50);
  });

export const getEmployeeManualTxns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => empSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const mod = await import("./work.server");
    const state = await mod.adminEmployeeWorkState(data.userId);
    // Nothing is exposed while the employee's shift is still running.
    if (!state.holding) return [];
    return mod.listManualTxns(data.userId);
  });
