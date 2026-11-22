import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { enforcePublicOrderRateLimit } from "./public-order-rate-limit.server";

const proofExtension = z.enum(["jpg", "jpeg", "png", "webp"]);

const attachSchema = z.object({
  order_code: z.string().min(4).max(40),
  screenshot_path: z.string().min(1).max(500),
});

export const attachOrderScreenshot = createServerFn({ method: "POST" })
  .inputValidator((data) => attachSchema.parse(data))
  .handler(async ({ data }) => {
    await enforcePublicOrderRateLimit("attach-proof", 8, 600);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Only accept the exact random object path issued by signScreenshotUpload.
    const match = data.screenshot_path.match(/^([^/]+)\/([0-9a-f-]{36})\.(jpg|jpeg|png|webp)$/i);
    if (!match || match[1] !== data.order_code) throw new Error("Invalid screenshot path");

    // A caller cannot advance an order by inventing a storage path: confirm the
    // uploaded object exists before changing the payment state.
    const { data: files, error: listError } = await supabaseAdmin.storage
      .from("payment-screenshots")
      .list(data.order_code, { search: match[2] + "." + match[3], limit: 2 });
    if (listError) throw new Error("Failed to verify payment proof upload");
    const uploadedFile = (files ?? []).find((file: any) => file.name === match[2] + "." + match[3]) as any;
    if (!uploadedFile) throw new Error("Payment proof file was not uploaded");

    // Do not trust the client-provided extension: verify Storage's persisted metadata.
    const expectedMime: Record<string, string> = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
    };
    const actualMime = String(uploadedFile.metadata?.mimetype ?? "").toLowerCase();
    const actualSize = Number(uploadedFile.metadata?.size ?? uploadedFile.metadata?.contentLength);
    if (actualMime !== expectedMime[match[3].toLowerCase()]) {
      throw new Error("Payment proof must be a valid JPG, PNG, or WebP image");
    }
    if (!Number.isFinite(actualSize) || actualSize <= 0 || actualSize > 5 * 1024 * 1024) {
      throw new Error("Payment proof must be smaller than 5 MB");
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
    await enforcePublicOrderRateLimit("sign-proof", 8, 600);
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
