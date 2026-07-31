import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const orderItemSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().int().min(1).max(999),
});

const createOrderSchema = z.object({
  customer_name: z.string().trim().min(2).max(120),
  customer_email: z.string().trim().email().max(200),
  customer_phone: z.string().trim().min(3).max(30),
  customer_country: z.string().min(2).max(4),
  dial_code: z.string().min(1).max(10),
  currency_code: z.string().min(2).max(6),
  payment_method_id: z.string().uuid(),
  device_id: z.string().trim().min(4).max(128).optional(),
  items: z.array(orderItemSchema).min(1).max(50),
});

function convertFromEgp(amountEgp: number, rateFromEgp: number, currencyCode: string): number {
  const raw = amountEgp * rateFromEgp;
  if (currencyCode === "IQD") return Math.round(raw / 250) * 250;
  return Math.round(raw * 100) / 100;
}

export const createPublicOrder = createServerFn({ method: "POST" })
  .inputValidator((data) => createOrderSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Recompute all pricing server-side from trusted product & exchange-rate data.
    const productIds = Array.from(new Set(data.items.map((i) => i.product_id)));
    const { data: products, error: prodErr } = await supabaseAdmin
      .from("products")
      .select("id, name, base_price_egp, discount_percent, discount_ends_at, warranty_days, active")
      .in("id", productIds);
    if (prodErr || !products) throw new Error("Failed to load products");
    const productMap = new Map(products.map((p) => [p.id, p]));
    for (const item of data.items) {
      const p = productMap.get(item.product_id);
      if (!p || !p.active) throw new Error("Invalid product in cart");
    }

    // Currency + exchange rate (EGP is base rate 1).
    const currencyCode = data.currency_code.toUpperCase();
    let rate = 1;
    if (currencyCode !== "EGP") {
      const { data: rateRow, error: rateErr } = await supabaseAdmin
        .from("exchange_rates")
        .select("rate_from_egp")
        .eq("currency_code", currencyCode)
        .maybeSingle();
      if (rateErr || !rateRow) throw new Error("Invalid currency");
      rate = Number(rateRow.rate_from_egp);
    }

    // Validate payment method exists & is active.
    const { data: pm, error: pmErr } = await supabaseAdmin
      .from("payment_methods")
      .select("id, active")
      .eq("id", data.payment_method_id)
      .maybeSingle();
    if (pmErr || !pm || !pm.active) throw new Error("Invalid payment method");

    const now = Date.now();
    const computedItems = data.items.map((item) => {
      const p = productMap.get(item.product_id)!;
      const discountActive =
        p.discount_percent > 0 &&
        (!p.discount_ends_at || new Date(p.discount_ends_at).getTime() > now);
      const priceEgp = discountActive
        ? Number(p.base_price_egp) * (1 - Number(p.discount_percent) / 100)
        : Number(p.base_price_egp);
      const unit_price = convertFromEgp(priceEgp, rate, currencyCode);
      return {
        product_id: p.id,
        product_name: p.name,
        unit_price,
        quantity: item.quantity,
        warranty_days: p.warranty_days,
        line_total: unit_price * item.quantity,
      };
    });
    const subtotal = computedItems.reduce((s, i) => s + i.line_total, 0);
    const total = subtotal;

    const { data: codeData, error: codeErr } = await supabaseAdmin.rpc("gen_order_code");
    if (codeErr || !codeData) throw new Error("Failed to generate order code");
    const order_code = codeData as string;

    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .insert({
        order_code,
        customer_name: data.customer_name,
        customer_email: data.customer_email,
        customer_phone: data.customer_phone,
        customer_country: data.customer_country,
        dial_code: data.dial_code,
        currency_code: currencyCode,
        subtotal,
        total,
        payment_method_id: data.payment_method_id,
        status: "pending_payment",
        device_id: data.device_id ?? null,
      })
      .select("id, order_code")
      .single();
    if (orderErr || !order) throw new Error("Failed to create order");

    const rows = computedItems.map((i) => ({
      order_id: order.id,
      product_id: i.product_id,
      product_name: i.product_name,
      unit_price: i.unit_price,
      quantity: i.quantity,
      warranty_days: i.warranty_days,
    }));
    const { error: itemsErr } = await supabaseAdmin.from("order_items").insert(rows);
    if (itemsErr) {
      await supabaseAdmin.from("orders").delete().eq("id", order.id);
      throw new Error("Failed to create order items");
    }

    return { order_code: order.order_code, order_id: order.id };
  });

const attachSchema = z.object({
  order_code: z.string().min(4).max(40),
  screenshot_path: z.string().min(1).max(500),
});

export const attachOrderScreenshot = createServerFn({ method: "POST" })
  .inputValidator((data) => attachSchema.parse(data))
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
    const { error: upErr } = await supabaseAdmin
      .from("orders")
      .update({
        payment_screenshot: data.screenshot_path,
        status: "awaiting_confirmation",
      })
      .eq("id", order.id);
    if (upErr) throw new Error("Failed to attach screenshot");
    return { ok: true };
  });

const getSchema = z.object({ order_code: z.string().min(4).max(40) });

const signSchema = z.object({
  order_code: z.string().min(4).max(40),
  ext: z.string().regex(/^[a-z0-9]{1,8}$/),
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
    const path = `${data.order_code}/${Date.now()}.${data.ext}`;
    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from("payment-screenshots")
      .createSignedUploadUrl(path);
    if (sErr || !signed) throw new Error("Failed to create upload URL");
    return { path, token: signed.token, signedUrl: signed.signedUrl };
  });

export const getOrderByCode = createServerFn({ method: "GET" })
  .inputValidator((data) => getSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select(
        "id, order_code, status, customer_name, customer_email, customer_phone, dial_code, currency_code, subtotal, total, created_at, payment_method:payment_methods(name,account_number)"
      )
      .eq("order_code", data.order_code)
      .maybeSingle();
    if (error) throw new Error("Failed to load order");
    if (!order) return null;

    const { data: items } = await supabaseAdmin
      .from("order_items")
      .select("id, product_name, unit_price, quantity, warranty_days")
      .eq("order_id", order.id);

    return { ...order, items: items ?? [] };
  });

const deviceOrdersSchema = z.object({
  device_id: z.string().trim().min(4).max(128),
});

export const listOrdersByDevice = createServerFn({ method: "POST" })
  .inputValidator((data) => deviceOrdersSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: orders, error } = await supabaseAdmin
      .from("orders")
      .select("id, order_code, status, customer_name, total, currency_code, created_at")
      .eq("device_id", data.device_id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error("Failed to load orders");
    return orders ?? [];
  });