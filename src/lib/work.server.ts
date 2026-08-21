/**
 * «جدول بيانات الشغل» — server layer.
 *
 * This module ONLY reads the original transaction data (public.bybit_ledger) and
 * writes to its own tables (work_shifts / work_txn_assignments / face enroll /
 * webauthn credentials). It never modifies a transaction's original fields.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type DB = SupabaseClient<any, any, any>;

async function admin(): Promise<DB> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
}

const P2P_KINDS = ["p2p_buy", "p2p_sell"];

/* ------------------------------ helpers ------------------------------ */

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const fromB64url = (s: string) => {
  const b = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b.length % 4 ? "=".repeat(4 - (b.length % 4)) : "";
  const raw = atob(b + pad);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};

/** Day key in Cairo time, so the daily/weekly report matches the working day. */
export function dayKey(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

/** Saturday-based week start (matches the weekly report example). */
export function weekKey(ms: number): string {
  const d = new Date(`${dayKey(ms)}T00:00:00Z`);
  const shift = (d.getUTCDay() + 1) % 7; // Sat = 0
  d.setUTCDate(d.getUTCDate() - shift);
  return d.toISOString().slice(0, 10);
}

async function namesFor(db: DB, ids: string[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return new Map();
  const { data } = await db.from("profiles").select("id,full_name,email").in("id", uniq);
  return new Map((data ?? []).map((p: any) => [p.id, p.full_name || p.email || "موظف"]));
}

/* --------------------------- shifts / current --------------------------- */

export async function currentShift() {
  const db = await admin();
  const { data } = await db
    .from("work_shifts")
    .select("*")
    .is("ended_at", null)
    .maybeSingle();
  if (!data) return null;
  const names = await namesFor(db, [data.user_id]);
  const { count } = await db
    .from("work_txn_assignments")
    .select("id", { count: "exact", head: true })
    .eq("shift_id", data.id);
  return {
    id: data.id as string,
    userId: data.user_id as string,
    name: names.get(data.user_id) ?? "موظف",
    startedAt: new Date(data.started_at).getTime(),
    endedAt: null as number | null,
    txns: Number(count ?? 0),
  };
}

export async function listShifts(limit = 60) {
  const db = await admin();
  const { data } = await db
    .from("work_shifts")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));
  const rows = data ?? [];
  const names = await namesFor(db, rows.map((r: any) => r.user_id));

  const ids = rows.map((r: any) => r.id);
  const tally = new Map<string, number>();
  if (ids.length) {
    const { data: asg } = await db.from("work_txn_assignments").select("shift_id").in("shift_id", ids);
    for (const a of asg ?? []) tally.set(a.shift_id, (tally.get(a.shift_id) ?? 0) + 1);
  }

  return rows.map((r: any) => ({
    id: r.id as string,
    userId: r.user_id as string,
    name: names.get(r.user_id) ?? "موظف",
    startedAt: new Date(r.started_at).getTime(),
    endedAt: r.ended_at ? new Date(r.ended_at).getTime() : null,
    endedReason: r.ended_reason ?? null,
    txns: tally.get(r.id) ?? 0,
  }));
}

/* ------------------------------ productivity ------------------------------ */

/**
 * Real productivity: every number is the count of actual assignment rows, so a
 * number can always be expanded into the transactions it is made of and older
 * days are never reset.
 */
export async function productivity(sinceMs: number) {
  const db = await admin();
  const { data } = await db
    .from("work_txn_assignments")
    .select("user_id,occurred_at")
    .gte("occurred_at", new Date(sinceMs).toISOString())
    .limit(100_000);
  const rows = data ?? [];
  const names = await namesFor(db, rows.map((r: any) => r.user_id));

  const byUser = new Map<string, { days: Map<string, number>; weeks: Map<string, number>; total: number }>();
  for (const r of rows) {
    const t = new Date(r.occurred_at).getTime();
    let e = byUser.get(r.user_id);
    if (!e) byUser.set(r.user_id, (e = { days: new Map(), weeks: new Map(), total: 0 }));
    const d = dayKey(t);
    const w = weekKey(t);
    e.days.set(d, (e.days.get(d) ?? 0) + 1);
    e.weeks.set(w, (e.weeks.get(w) ?? 0) + 1);
    e.total += 1;
  }

  return [...byUser.entries()]
    .map(([userId, e]) => ({
      userId,
      name: names.get(userId) ?? "موظف",
      total: e.total,
      days: [...e.days.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([day, count]) => ({ day, count })),
      weeks: [...e.weeks.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([week, count]) => ({ week, count })),
    }))
    .sort((a, b) => b.total - a.total);
}

/* ------------------------------ work table ------------------------------ */

export type WorkRow = {
  assignmentId: string;
  ledgerId: string;
  userId: string;
  name: string;
  shiftId: string | null;
  assignMode: string;
  assignedAt: number;
  kind: string;
  direction: "in" | "out";
  refId: string;
  title: string;
  amount: number;
  currency: string;
  fee: number;
  status: string;
  time: number;
  accountId: string | null;
  detail: Record<string, string | number | boolean | null>;
};

export async function workTable(opts: {
  userId?: string;
  shiftId?: string;
  day?: string;
  week?: string;
  page?: number;
  pageSize?: number;
}) {
  const db = await admin();
  const pageSize = Math.min(Math.max(opts.pageSize ?? 50, 10), 200);
  const page = Math.max(opts.page ?? 1, 1);
  const from = (page - 1) * pageSize;

  let q: any = db
    .from("work_txn_assignments")
    .select("*, bybit_ledger(*)", { count: "exact" })
    .order("occurred_at", { ascending: false });

  if (opts.userId) q = q.eq("user_id", opts.userId);
  if (opts.shiftId) q = q.eq("shift_id", opts.shiftId);
  if (opts.day) {
    // Cairo day boundaries (UTC+3, no DST changes applied by Bybit data).
    q = q.gte("occurred_at", `${opts.day}T00:00:00+03:00`).lt("occurred_at", `${opts.day}T23:59:59.999+03:00`);
  }
  if (opts.week) {
    const start = new Date(`${opts.week}T00:00:00+03:00`);
    const end = new Date(start.getTime() + 7 * 86400_000);
    q = q.gte("occurred_at", start.toISOString()).lt("occurred_at", end.toISOString());
  }

  const { data, error, count } = await q.range(from, from + pageSize - 1);
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const names = await namesFor(db, rows.map((r: any) => r.user_id));

  const accounts = await accountNames(db);

  return {
    page,
    pageSize,
    total: Number(count ?? rows.length),
    rows: rows.map((r: any): WorkRow & { accountName: string } => {
      const l = r.bybit_ledger ?? {};
      return {
        assignmentId: r.id,
        ledgerId: r.ledger_id,
        userId: r.user_id,
        name: names.get(r.user_id) ?? "موظف",
        shiftId: r.shift_id ?? null,
        assignMode: r.assign_mode,
        assignedAt: new Date(r.assigned_at).getTime(),
        kind: l.kind ?? r.kind,
        direction: l.direction === "in" ? "in" : "out",
        refId: l.ref_id ?? "",
        title: l.title ?? "—",
        amount: Number(l.amount ?? 0),
        currency: l.currency ?? "USD",
        fee: Number(l.fee ?? 0),
        status: l.status ?? "",
        time: l.occurred_at ? new Date(l.occurred_at).getTime() : new Date(r.occurred_at).getTime(),
        accountId: l.account_id ?? null,
        accountName: accounts.get(l.account_id) ?? "—",
        detail: (l.detail ?? {}) as Record<string, string | number | boolean | null>,
      };
    }),
  };
}

async function accountNames(db: DB): Promise<Map<string, string>> {
  const { data } = await db.from("bybit_accounts").select("id,name,sort_order").order("sort_order");
  return new Map(
    (data ?? []).map((a: any, i: number) => [a.id, `${a.name} (فيزا ${a.sort_order || i + 1})`]),
  );
}

/* ------------------------- P2P: manual linking ------------------------- */

/** Completed P2P orders that are not linked to any shift yet. */
export async function pendingP2P(limit = 100) {
  const db = await admin();
  const { data: assigned } = await db.from("work_txn_assignments").select("ledger_id").in("kind", P2P_KINDS);
  const taken = new Set((assigned ?? []).map((a: any) => a.ledger_id));

  const { data } = await db
    .from("bybit_ledger")
    .select("*")
    .in("kind", P2P_KINDS)
    .order("occurred_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 300));

  const accounts = await accountNames(db);
  return (data ?? [])
    .filter((r: any) => !taken.has(r.id))
    .map((r: any) => ({
      ledgerId: r.id as string,
      kind: r.kind as string,
      refId: r.ref_id as string,
      title: r.title as string,
      amount: Number(r.amount ?? 0),
      currency: r.currency ?? "USDT",
      status: String(r.status ?? ""),
      time: new Date(r.occurred_at).getTime(),
      accountName: accounts.get(r.account_id) ?? "—",
      detail: (r.detail ?? {}) as Record<string, string | number | boolean | null>,
    }));
}

/**
 * Completed P2P orders of ALL Bybit accounts — shared with every employee.
 * Read-only: no shift/assignment filter, so any newly completed order shows up
 * for everybody in «طلبات P2P».
 */
export async function completedP2P(limit = 200) {
  const db = await admin();

  // Only orders that happened after the admin reset point are shown to employees.
  const { data: setting } = await db
    .from("site_settings")
    .select("value")
    .eq("key", "p2p_orders_cutoff")
    .maybeSingle();
  const cutoff = typeof (setting as any)?.value === "string" ? String((setting as any).value) : null;

  let q = db
    .from("bybit_ledger")
    .select("*")
    .in("kind", P2P_KINDS)
    .eq("status", "اكتملت");
  if (cutoff) q = q.gt("occurred_at", cutoff);

  const { data } = await q
    .order("occurred_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 500));

  // Already linked to an employee/shift → no longer offered for linking.
  const { data: assigned } = await db
    .from("work_txn_assignments")
    .select("ledger_id")
    .in("kind", P2P_KINDS);
  const taken = new Set((assigned ?? []).map((a: any) => a.ledger_id));

  const accounts = await accountNames(db);
  return (data ?? [])
    .filter((r: any) => !taken.has(r.id))
    .map((r: any) => ({
      ledgerId: r.id as string,
      kind: r.kind as string,
      refId: r.ref_id as string,
      title: r.title as string,
      amount: Number(r.amount ?? 0),
      currency: r.currency ?? "USDT",
      status: String(r.status ?? ""),
      time: new Date(r.occurred_at).getTime(),
      accountName: accounts.get(r.account_id) ?? "—",
      detail: (r.detail ?? {}) as Record<string, string | number | boolean | null>,
    }));
}

/** Real staff list (admins + employees) used by the P2P «ربط» picker. */
export async function staffList() {
  const db = await admin();
  const { data: roles } = await db.from("user_roles").select("user_id,role").in("role", ["admin", "employee"]);
  const ids = [...new Set((roles ?? []).map((r: any) => r.user_id))];
  const names = await namesFor(db, ids);
  return ids
    .map((id) => ({ userId: id as string, name: names.get(id as string) ?? "موظف" }))
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));
}

/** Shifts that belong to ONE employee only. */
export async function shiftsOfUser(userId: string, limit = 40) {
  const db = await admin();
  const { data } = await db
    .from("work_shifts")
    .select("id,user_id,started_at,ended_at")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));
  return (data ?? []).map((r: any) => ({
    id: r.id as string,
    userId: r.user_id as string,
    startedAt: new Date(r.started_at).getTime(),
    endedAt: r.ended_at ? new Date(r.ended_at).getTime() : null,
  }));
}

/** Caller's own shifts + his display name — the P2P «ربط» picker source. */
export async function myShiftsForLink(userId: string, limit = 40) {
  const db = await admin();
  const [shifts, names] = await Promise.all([
    shiftsOfUser(userId, limit),
    namesFor(db, [userId]),
  ]);
  return { name: names.get(userId) ?? "موظف", shifts };
}

/**
 * Links one P2P ledger row to an employee + one of his shifts.
 * The original ledger row is never touched. Double linking is impossible: the
 * unique (ledger_id) constraint makes the second concurrent insert fail.
 */
export async function linkP2P(ledgerId: string, shiftId: string, actorId: string) {
  const db = await admin();

  const { data: led } = await db
    .from("bybit_ledger")
    .select("id,kind,occurred_at")
    .eq("id", ledgerId)
    .maybeSingle();
  if (!led || !P2P_KINDS.includes(String((led as any).kind))) {
    return { ok: false as const, error: "هذا الطلب غير متاح للربط." };
  }

  const { data: shift } = await db
    .from("work_shifts")
    .select("id,user_id")
    .eq("id", shiftId)
    .maybeSingle();
  if (!shift) return { ok: false as const, error: "الشفت غير موجود." };

  const { error } = await db.from("work_txn_assignments").insert({
    ledger_id: ledgerId,
    shift_id: (shift as any).id,
    user_id: (shift as any).user_id,
    occurred_at: (led as any).occurred_at,
    kind: (led as any).kind,
    assign_mode: "manual",
    assigned_by: actorId,
  });
  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      return { ok: false as const, error: "هذا الطلب تم ربطه بالفعل." };
    }
    return { ok: false as const, error: error.message };
  }
  return { ok: true as const };
}

/** Shift options offered by the "ربط بالشفت" button. */
export async function shiftOptions(limit = 40) {
  const shifts = await listShifts(limit);
  return shifts.map((s) => ({
    id: s.id,
    userId: s.userId,
    name: s.name,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
  }));
}


/* --------------------------- face enrollment --------------------------- */

const FACE_BUCKET = "employee-faces";

export async function saveFaceEnroll(userId: string, dataUrl: string, byUserId: string) {
  const db = await admin();
  const bytes = dataUrlToBytes(dataUrl);
  const path = `${userId}.jpg`;
  const up = await db.storage.from(FACE_BUCKET).upload(path, bytes, { contentType: "image/jpeg", upsert: true });
  if (up.error) throw new Error(up.error.message);
  const { error } = await db
    .from("employee_face_enroll")
    .upsert({ user_id: userId, image_path: path, created_by: byUserId, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  return { ok: true as const };
}

export async function faceEnrollList() {
  const db = await admin();
  const { data } = await db.from("employee_face_enroll").select("user_id,updated_at");
  return (data ?? []).map((r: any) => ({ userId: r.user_id, updatedAt: new Date(r.updated_at).getTime() }));
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const b64 = dataUrl.includes(",") ? dataUrl.split(",")[1]! : dataUrl;
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const bytesToB64 = (bytes: Uint8Array) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};

/**
 * Face verification: compares the live camera frame against the reference photo
 * enrolled for this employee. Only a pass/fail result is kept.
 */
export async function verifyFace(userId: string, liveDataUrl: string): Promise<{ ok: boolean; reason?: string }> {
  const db = await admin();
  const { data: enroll } = await db
    .from("employee_face_enroll")
    .select("image_path")
    .eq("user_id", userId)
    .maybeSingle();
  if (!enroll?.image_path) return { ok: false, reason: "لا توجد صورة مرجعية مسجّلة لهذا الموظف" };

  const dl = await db.storage.from(FACE_BUCKET).download(enroll.image_path);
  if (dl.error || !dl.data) return { ok: false, reason: "تعذّر قراءة الصورة المرجعية" };
  const refB64 = bytesToB64(new Uint8Array(await dl.data.arrayBuffer()));

  const key = process.env["LOVABLE_API_KEY"];
  if (!key) return { ok: false, reason: "خدمة التحقق غير متاحة" };

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content:
            'You are a face verification service. Compare the two photos. Reply with strict JSON only: {"same":true|false,"confidence":0-1}. "same" is true only if both photos clearly show the same person and the second photo shows a real live face.',
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Photo 1 = enrolled reference. Photo 2 = live camera frame." },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${refB64}` } },
            { type: "image_url", image_url: { url: liveDataUrl } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) return { ok: false, reason: "فشل التحقق من الوجه" };
  const json: any = await res.json();
  const text = String(json?.choices?.[0]?.message?.content ?? "");
  const m = text.match(/\{[\s\S]*\}/);
  try {
    const parsed = m ? JSON.parse(m[0]) : null;
    const same = parsed?.same === true && Number(parsed?.confidence ?? 0) >= 0.6;
    return same ? { ok: true } : { ok: false, reason: "الوجه غير مطابق" };
  } catch {
    return { ok: false, reason: "تعذّر تحليل نتيجة التحقق" };
  }
}

/* ------------------- device biometric (WebAuthn) ------------------- */

export async function newChallenge(userId: string, purpose: "register" | "auth") {
  const db = await admin();
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const challenge = b64url(bytes);
  await db.from("work_auth_challenges").delete().eq("user_id", userId).eq("purpose", purpose);
  const { error } = await db.from("work_auth_challenges").insert({
    user_id: userId,
    purpose,
    challenge,
    expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
  });
  if (error) throw new Error(error.message);
  return { challenge };
}

export async function registerCredential(
  userId: string,
  input: { credentialId: string; publicKey: string; label?: string },
) {
  const db = await admin();
  const { error } = await db.from("webauthn_credentials").upsert(
    {
      user_id: userId,
      credential_id: input.credentialId,
      public_key: input.publicKey,
      label: input.label ?? null,
    },
    { onConflict: "credential_id" },
  );
  if (error) throw new Error(error.message);
  return { ok: true as const };
}

export async function listCredentials(userId: string) {
  const db = await admin();
  const { data } = await db.from("webauthn_credentials").select("credential_id,label,created_at").eq("user_id", userId);
  return (data ?? []).map((c: any) => ({ id: c.credential_id, label: c.label, createdAt: new Date(c.created_at).getTime() }));
}

/** ASN.1 DER (r,s) signature -> raw 64-byte form WebCrypto expects. */
function derToRaw(der: Uint8Array): Uint8Array {
  let i = 2;
  if (der[1]! & 0x80) i = 2 + (der[1]! & 0x7f);
  const readInt = () => {
    i++; // 0x02
    const len = der[i++]!;
    let v = der.slice(i, i + len);
    i += len;
    while (v.length > 32 && v[0] === 0) v = v.slice(1);
    const out = new Uint8Array(32);
    out.set(v, 32 - v.length);
    return out;
  };
  const r = readInt();
  const s = readInt();
  const raw = new Uint8Array(64);
  raw.set(r, 0);
  raw.set(s, 32);
  return raw;
}

/**
 * Verifies the device biometric assertion (Face ID / Touch ID / Android
 * Biometric). No biometric data is stored — only the device public key.
 */
export async function verifyDeviceAssertion(
  userId: string,
  input: { credentialId: string; clientDataJSON: string; authenticatorData: string; signature: string },
): Promise<{ ok: boolean; reason?: string }> {
  const db = await admin();

  const { data: cred } = await db
    .from("webauthn_credentials")
    .select("public_key,user_id")
    .eq("credential_id", input.credentialId)
    .maybeSingle();
  if (!cred || cred.user_id !== userId) return { ok: false, reason: "جهاز غير مسجّل لهذا الحساب" };

  const { data: ch } = await db
    .from("work_auth_challenges")
    .select("challenge,expires_at")
    .eq("user_id", userId)
    .eq("purpose", "auth")
    .maybeSingle();
  if (!ch || new Date(ch.expires_at).getTime() < Date.now()) return { ok: false, reason: "انتهت صلاحية طلب المصادقة" };

  let clientData: any;
  try {
    clientData = JSON.parse(new TextDecoder().decode(fromB64url(input.clientDataJSON)));
  } catch {
    return { ok: false, reason: "بيانات مصادقة غير صالحة" };
  }
  if (clientData?.type !== "webauthn.get" || clientData?.challenge !== ch.challenge) {
    return { ok: false, reason: "تحدي المصادقة غير مطابق" };
  }

  const authData = fromB64url(input.authenticatorData);
  const clientHash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", fromB64url(input.clientDataJSON) as unknown as ArrayBuffer),
  );
  const signed = new Uint8Array(authData.length + clientHash.length);
  signed.set(authData, 0);
  signed.set(clientHash, authData.length);

  let ok = false;
  try {
    const key = await crypto.subtle.importKey(
      "spki",
      fromB64url(cred.public_key) as unknown as ArrayBuffer,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    const sig = derToRaw(fromB64url(input.signature));
    ok = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      sig as unknown as ArrayBuffer,
      signed as unknown as ArrayBuffer,
    );
  } catch {
    ok = false;
  }

  if (ok) {
    await db.from("work_auth_challenges").delete().eq("user_id", userId).eq("purpose", "auth");
    await db
      .from("webauthn_credentials")
      .update({ last_used_at: new Date().toISOString() })
      .eq("credential_id", input.credentialId);
  }
  return ok ? { ok: true } : { ok: false, reason: "فشلت مصادقة الجهاز" };
}

/* ---------------------- employee-scoped (non-admin) ---------------------- */

/**
 * What an employee is allowed to know: only whether HE is currently holding the
 * work, and only for his own open shift. No other employee's name, shift
 * history, duration or productivity ever leaves the server for this call.
 */
export async function myWorkState(userId: string) {
  const db = await admin();
  const { data } = await db.from("work_shifts").select("id,user_id,started_at").is("ended_at", null).maybeSingle();
  if (!data || data.user_id !== userId) return { holding: false as const };
  const { count } = await db
    .from("work_txn_assignments")
    .select("id", { count: "exact", head: true })
    .eq("shift_id", data.id);
  return {
    holding: true as const,
    shiftId: data.id as string,
    startedAt: new Date(data.started_at).getTime(),
    txns: Number(count ?? 0),
  };
}

/** Transactions of the caller's own OPEN shift only. Empty when he holds none. */
export async function myShiftRows(userId: string, page = 1, pageSize = 50) {
  const state = await myWorkState(userId);
  if (!state.holding) return { page: 1, pageSize, total: 0, rows: [] as any[], holding: false as const };
  const res = await workTable({ userId, shiftId: state.shiftId, page, pageSize });
  const entries = await myEntries(res.rows.map((r: any) => r.ledgerId));
  const rows = res.rows.map((r: any) => {
    const e = entries.get(r.ledgerId);
    return { ...r, egp: e?.egp ?? null, quantity: e?.quantity ?? null };
  });
  return { ...res, rows, holding: true as const };
}

/* ------------------ employee-entered values (جنيه / الكمية) ------------------ */
/**
 * Employee-entered columns live in their own table (work_txn_entries) so the
 * original transaction row is never touched. Each field can be written exactly
 * once: a value that already exists is returned as-is (locked).
 */

export async function myEntries(ledgerIds: string[]) {
  if (!ledgerIds.length) return new Map<string, { egp: number | null; quantity: number | null }>();
  const db = await admin();
  const { data } = await db
    .from("work_txn_entries")
    .select("ledger_id,egp,quantity")
    .in("ledger_id", ledgerIds);
  const map = new Map<string, { egp: number | null; quantity: number | null }>();
  for (const r of data ?? []) {
    map.set(r.ledger_id as string, {
      egp: r.egp === null || r.egp === undefined ? null : Number(r.egp),
      quantity: r.quantity === null || r.quantity === undefined ? null : Number(r.quantity),
    });
  }
  return map;
}

export async function saveEntryField(
  userId: string,
  ledgerId: string,
  field: "egp" | "quantity",
  value: number,
) {
  const db = await admin();

  // The transaction must belong to an assignment of the caller's OWN open shift.
  const state = await myWorkState(userId);
  if (!state.holding) return { ok: false as const, error: "لست مستلمًا للشغل حاليًا" };
  const { data: asg } = await db
    .from("work_txn_assignments")
    .select("ledger_id")
    .eq("ledger_id", ledgerId)
    .eq("shift_id", state.shiftId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!asg) return { ok: false as const, error: "المعاملة ليست ضمن شفتك" };

  const { data: existing } = await db
    .from("work_txn_entries")
    .select("ledger_id,egp,quantity")
    .eq("ledger_id", ledgerId)
    .maybeSingle();

  if (existing) {
    if (existing[field] !== null && existing[field] !== undefined) {
      return { ok: false as const, error: "القيمة محفوظة بالفعل ولا يمكن تعديلها", locked: true as const };
    }
    const { error } = await db.from("work_txn_entries").update({ [field]: value }).eq("ledger_id", ledgerId);
    if (error) return { ok: false as const, error: error.message };
  } else {
    const { error } = await db
      .from("work_txn_entries")
      .insert({ ledger_id: ledgerId, user_id: userId, [field]: value });
    if (error) return { ok: false as const, error: error.message };
  }
  return { ok: true as const, field, value };
}

/* ---------------- manual rows: «المعاملات الغلط» / «خاص بالموظف» ---------------- */

export type ManualCard = "wrong" | "employee" | "receive" | "transfer";

export async function listManualTxns(userId: string) {
  const db = await admin();
  const { data } = await db
    .from("work_manual_txns")
    .select("id,card,amount,details,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return {
    rows: (data ?? []).map((r: any) => ({
      id: r.id as string,
      card: r.card as ManualCard,
      amount: r.amount === null ? "" : String(r.amount),
      details: r.details ?? "",
      createdAt: r.created_at as string,
    })),
  };
}

export async function addManualTxn(userId: string, card: ManualCard) {
  const db = await admin();
  const { data, error } = await db
    .from("work_manual_txns")
    .insert({ user_id: userId, card })
    .select("id")
    .maybeSingle();
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, id: data?.id as string };
}

export async function saveManualTxn(
  userId: string,
  id: string,
  field: "amount" | "details",
  value: string,
) {
  const db = await admin();
  let patch: Record<string, unknown>;
  if (field === "amount") {
    // Lenient parsing: Arabic-Indic digits, thousand separators, stray symbols.
    const norm = String(value)
      .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
      .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
      .replace(/[\u066b\u060c,]/g, ".")
      .replace(/[^\d.\-]/g, "")
      .trim();
    const n = Number(norm);
    patch = { amount: norm === "" || !Number.isFinite(n) ? null : n };
  } else {
    patch = { details: value };
  }

  const { error } = await db.from("work_manual_txns").update(patch).eq("id", id).eq("user_id", userId);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

/** Admin-only: delete every manual row in one card for a user. */
export async function clearManualTxns(userId: string, card: ManualCard) {
  const db = await admin();
  const { error } = await db.from("work_manual_txns").delete().eq("user_id", userId).eq("card", card);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}
