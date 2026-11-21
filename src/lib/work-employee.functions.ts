import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAccess, assertAdmin } from "./bybit-access";

/* ------------------------- employee-scoped reads ------------------------- */
const manualReadSchema = z.object({ card: z.enum(["wrong", "employee", "receive", "transfer"]).optional(), page: z.number().int().min(1).max(100_000).optional() });

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
    if (data.page === 1) await (await import("./bybit.server")).pullFromBybit();
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

/** Has this employee already created a 6-digit PIN? */
export const getMyPinStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAccess(context.supabase, context.userId);
    const mod = await import("./work.server");
    return { hasPin: await mod.pinIsSet(context.userId) };
  });

const pin = z.string().regex(/^\d{6}$/, "الرمز يجب أن يكون 6 أرقام");

/** First-time PIN creation by the employee (only when none exists yet). */
export const setMyPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ pin }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const mod = await import("./work.server");
    if (await mod.pinIsSet(context.userId)) {
      return { ok: false as const, error: "لديك رمز بالفعل — تواصل مع الإدارة لتغييره" };
    }
    return mod.savePin(context.userId, data.pin, context.userId, true);
  });

/** PIN verification, then shift handover. */
export const claimWorkShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ pin }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const mod = await import("./work.server");

    const check = await mod.verifyPin(context.userId, data.pin);
    if (!check.ok) {
      if (check.reason === "NO_PIN") return { ok: false as const, error: "NO_PIN" };
      return { ok: false as const, error: check.reason ?? "الرمز غير صحيح" };
    }

    // PIN verified above; only the server may claim the shift.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: shift, error } = await (supabaseAdmin as any).rpc("work_claim_shift_for", {
      p_user: context.userId,
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

/* ------------- manual rows: «المعاملات الغلط» / «خاص بالموظف» ------------- */

export const getMyManualTxns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => manualReadSchema.parse(input ?? {}))
  .handler(async ({ context, data }) => {
    await assertAccess(context.supabase, context.userId);
    const mod = await import("./work.server");
    // بيانات الشفت الحالي فقط — الشفتات المنتهية تبقى محفوظة كسجل تاريخي.
    return mod.listMyManualTxns(context.userId, data);
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

/* ---------------- «معاملة يدوية» في قسم المعاملات (الموظف فقط) ----------------
 * الشفت يُستنتج من السيرفر: بدون شفت مفتوح لا يمكن الإنشاء إطلاقًا،
 * والتعديل مسموح 10 دقائق من created_at فقط. لا يوجد endpoint للحذف. */

export const getMyManualCardTxns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAccess(context.supabase, context.userId);
    const mod = await import("./work.server");
    return mod.listMyManualCardTxns(context.userId);
  });

export const addMyManualCardTxn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        merchant: z.string().max(200).default(""),
        amount: z.string().max(40).default(""),
        egp: z.string().max(40).default(""),
        quantity: z.string().max(40).default(""),
        // خانة حرة: أرقام/حروف/رموز/مسافات — بدون أي تقييد على 4 أرقام.
        pan4: z.string().max(60).default(""),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const mod = await import("./work.server");
    return mod.addMyManualCardTxn(context.userId, data);
  });

export const saveMyManualCardTxn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        field: z.enum(["merchant", "amount", "egp", "quantity", "pan4"]),
        value: z.string().max(200),

      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const mod = await import("./work.server");
    return mod.saveMyManualCardTxn(context.userId, data.id, data.field, data.value);
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
