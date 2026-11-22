import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const proofExtension = z.enum(["jpg", "jpeg", "png", "webp"]);

const attachSchema = z.object({
  order_code: z.string().min(4).max(40),
  screenshot_path: z.string().min(1).max(500),
});

export const attachOrderScreenshot = createServerFn({ method: "POST" })
  .inputValidator((data) => attachSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const prefix = `${data.order_code}/`;
    if (!data.screenshot_path.startsWith(prefix) || data.screenshot_path.includes("..")) {
      throw new Error("Invalid screenshot path");
    }
    const ext = data.screenshot_path.split(".").pop()?.toLowerCase();
    if (!ext || !["jpg", "jpeg", "png", "webp"].includes(ext)) {
      throw new Error("Invalid screenshot type");
    }

    // The status predicate makes attaching the proof a single-use transition.
    const { data: updated, error } = await supabaseAdmin
      .from("orders")
      .update({
        payment_screenshot: data.screenshot_path,
        status: "awaiting_confirmation",
      })
      .eq("order_code", data.order_code)
      .eq("status", "pending_payment")
      .select("id")
      .maybeSingle();
    if (error) throw new Error("Failed to attach screenshot");
    if (!updated) throw new Error("Order is not awaiting payment proof");
    return { ok: true };
  });

const signSchema = z.object({
  order_code: z.string().min(4).max(40),
  ext: proofExtension,
});

export const signScreenshotUpload = createServerFn({ method: "POST" })
  .inputValidator((data) => signSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select("id, status")
      .eq("order_code", data.order_code)
      .maybeSingle();
    if (error || !order) throw new Error("Order not found");
    if (order.status !== "pending_payment") {
      throw new Error("Order is not awaiting payment proof");
    }
    const path = `${data.order_code}/${crypto.randomUUID()}.${data.ext}`;
    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from("payment-screenshots")
      .createSignedUploadUrl(path);
    if (sErr || !signed) throw new Error("Failed to create upload URL");
    return { path, token: signed.token, signedUrl: signed.signedUrl };
  });
