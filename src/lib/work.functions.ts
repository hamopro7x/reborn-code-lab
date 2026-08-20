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

export const getWorkAuthChallenge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { purpose?: string } | undefined) => ({
    purpose: input?.purpose === "register" ? ("register" as const) : ("auth" as const),
  }))
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const mod = await import("./work.server");
    const [{ challenge }, credentials] = await Promise.all([
      mod.newChallenge(context.userId, data.purpose),
      mod.listCredentials(context.userId),
    ]);
    return { challenge, credentials, userId: context.userId };
  });

const regSchema = z.object({
  credentialId: z.string().min(8).max(500),
  publicKey: z.string().min(20).max(2000),
  label: z.string().trim().max(80).optional(),
});

export const registerWorkDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => regSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const mod = await import("./work.server");
    return mod.registerCredential(context.userId, data);
  });

const claimSchema = z.object({
  faceImage: z.string().min(100).max(4_000_000),
  credentialId: z.string().min(8).max(500),
  clientDataJSON: z.string().min(10).max(10_000),
  authenticatorData: z.string().min(10).max(10_000),
  signature: z.string().min(10).max(10_000),
});

/** Face verification + device biometric, then the shift handover. */
export const claimWorkShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => claimSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const mod = await import("./work.server");

    const device = await mod.verifyDeviceAssertion(context.userId, {
      credentialId: data.credentialId,
      clientDataJSON: data.clientDataJSON,
      authenticatorData: data.authenticatorData,
      signature: data.signature,
    });
    if (!device.ok) return { ok: false as const, error: device.reason ?? "فشلت مصادقة الجهاز" };

    const face = await mod.verifyFace(context.userId, data.faceImage);
    if (!face.ok) return { ok: false as const, error: face.reason ?? "فشل تحقق الوجه" };

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
  .inputValidator((input: unknown) => z.object({ card: z.enum(["wrong", "employee"]) }).parse(input))
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
  .inputValidator((input: unknown) => z.object({ card: z.enum(["wrong", "employee"]) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const mod = await import("./work.server");
    return mod.clearManualTxns(context.userId, data.card);
  });
