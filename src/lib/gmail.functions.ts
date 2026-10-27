import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

/** Inbox is visible to admins and employees only. */
async function assertStaff(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const ok = (data ?? []).some((r: any) => r.role === "admin" || r.role === "employee");
  if (!ok) throw new Error("Forbidden");
}

async function gmail(path: string, init?: RequestInit) {
  const lk = process.env["LOVABLE_API_KEY"];
  const gk = process.env["GOOGLE_MAIL_API_KEY"];
  if (!lk || !gk) throw new Error("Gmail غير مربوط");
  const res = await fetch(`${GATEWAY}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${lk}`, "X-Connection-Api-Key": gk, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`Gmail [${res.status}]: ${body}`);
    throw new Error(`Gmail error [${res.status}]`);
  }
  return res.json();
}

const hdr = (m: any, name: string) =>
  (m.payload?.headers ?? []).find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";

function decode(data: string) {
  const b = atob(data.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(b, (c) => c.charCodeAt(0)));
}
function findBody(part: any, mime: string): string | null {
  if (part?.mimeType === mime && part.body?.data) return decode(part.body.data);
  for (const p of part?.parts ?? []) {
    const r = findBody(p, mime);
    if (r) return r;
  }
  return null;
}

export const listInbox = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const list = await gmail(`/users/me/messages?maxResults=20&labelIds=INBOX`);
    const ids: string[] = (list.messages ?? []).map((m: any) => m.id);
    const items = await Promise.all(
      ids.map((id) =>
        gmail(`/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`),
      ),
    );
    return items.map((m: any) => ({
      id: m.id as string,
      threadId: m.threadId as string,
      from: hdr(m, "From"),
      subject: hdr(m, "Subject"),
      date: Number(m.internalDate),
      snippet: (m.snippet ?? "") as string,
      unread: (m.labelIds ?? []).includes("UNREAD"),
    }));
  });

export const getMessage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1).max(64) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const m = await gmail(`/users/me/messages/${data.id}?format=full`);
    if ((m.labelIds ?? []).includes("UNREAD")) {
      await gmail(`/users/me/messages/${data.id}/modify`, { method: "POST", body: JSON.stringify({ removeLabelIds: ["UNREAD"] }) }).catch(() => {});
    }
    const text = findBody(m.payload, "text/plain") ?? (findBody(m.payload, "text/html") ?? "").replace(/<[^>]+>/g, " ");
    return {
      id: m.id as string,
      threadId: m.threadId as string,
      from: hdr(m, "From"),
      subject: hdr(m, "Subject"),
      messageId: hdr(m, "Message-ID"),
      body: text.trim().slice(0, 20000),
    };
  });

const b64 = (s: string) => btoa(Array.from(new TextEncoder().encode(s), (b) => String.fromCharCode(b)).join(""));
const mimeHeader = (v: string) => (/^[\x00-\x7F]*$/.test(v) ? v : `=?UTF-8?B?${b64(v)}?=`);

export const replyMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1).max(64), text: z.string().trim().min(1).max(10000) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const m = await gmail(`/users/me/messages/${data.id}?format=metadata&metadataHeaders=From&metadataHeaders=Reply-To&metadataHeaders=Subject&metadataHeaders=Message-ID`);
    const to = hdr(m, "Reply-To") || hdr(m, "From");
    const subj = hdr(m, "Subject");
    const mid = hdr(m, "Message-ID");
    const raw = [
      `To: ${to.replace(/[\r\n]/g, "")}`,
      `Subject: ${mimeHeader(/^re:/i.test(subj) ? subj : `Re: ${subj}`)}`,
      ...(mid ? [`In-Reply-To: ${mid}`, `References: ${mid}`] : []),
      "MIME-Version: 1.0",
      'Content-Type: text/plain; charset="UTF-8"',
      "",
      data.text,
    ].join("\r\n");
    await gmail(`/users/me/messages/send`, {
      method: "POST",
      body: JSON.stringify({ raw: b64(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""), threadId: m.threadId }),
    });
    return { ok: true };
  });
