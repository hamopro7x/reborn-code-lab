import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAccess, assertAdmin } from "./bybit-access";
import { assertShiftView } from "./work-access";

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
    const role = await assertAccess(context.supabase, context.userId);
    const mod = await import("./work.server");
    return mod.completedP2P(200, context.userId, role === "admin");
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
    return mod.myShiftTransfers(context.userId, data.scope);
  });

export const getWorkTransferPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    scope: z.enum(["external", "internal"]), direction: z.enum(["in", "out"]),
    page: z.number().int().min(1).max(100_000), shiftId: z.string().uuid().optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    if (data.shiftId) await assertShiftView(context.supabase, context.userId, data.shiftId);
    const mod = await import("./work.server");
    return mod.workTransferPage(context.userId, data.scope, data.direction, data.page, data.shiftId);
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
  .inputValidator((input: unknown) => z.object({ hiddenOnly: z.literal(false).optional() }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const mod = await import("./work.server");
    return mod.myShiftsForLink(context.userId, data.hiddenOnly ?? false);
  });

/** Employee-side P2P linking: order → employee → shift. */
export const linkP2POrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        ledgerId: z.string().uuid(),
        shiftIds: z.array(z.string().uuid()).min(1).max(100).optional(),
        // Compatibility for callers using the prior API; no shift consumption.
        shiftId: z.string().uuid().optional(),
        usedShiftIds: z.array(z.string().uuid()).max(100).optional(),
      })
      .refine((v) => !!v.shiftIds?.length || !!v.shiftId, "اختار شفتًا واحدًا على الأقل")
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const mod = await import("./work.server");
    const ids = data.shiftIds ?? (data.shiftId ? [data.shiftId, ...(data.usedShiftIds ?? [])] : []);
    return mod.linkP2P(data.ledgerId, ids, context.userId);
  });

export const setMyP2PShiftHidden = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ shiftId: z.string().uuid(), hidden: z.literal(true) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const mod = await import("./work.server");
    return mod.setP2PShiftHidden(context.userId, data.shiftId, data.hidden);
  });
