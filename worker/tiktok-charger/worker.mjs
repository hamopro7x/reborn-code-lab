// MG Pro — TikTok coins charging worker (runs on the VPS, never inside the website).
// Env: MGPRO_URL, WORKER_TOKEN, CARD_NUMBER, CARD_EXP (MM/YY), CARD_CVV, CARD_NAME
// Run: npm i playwright && npx playwright install chromium && node worker.mjs
// Any unexpected page state => job goes to "manual" so staff finish it. A job is never retried automatically.
import { chromium } from "playwright";

const BASE = (process.env.MGPRO_URL || "https://mag-pro1.com").replace(/\/$/, "");
const TOKEN = process.env.WORKER_TOKEN || "";
const CARD = { number: process.env.CARD_NUMBER, exp: process.env.CARD_EXP, cvv: process.env.CARD_CVV, name: process.env.CARD_NAME };
const RECHARGE_URL = "https://www.tiktok.com/coin";
const QR_WAIT_MS = 5 * 60_000;
const PAY_WAIT_MS = 4 * 60_000; // includes time for Bybit card approval if asked

if (!TOKEN || !CARD.number || !CARD.exp || !CARD.cvv) { console.error("Missing env vars"); process.exit(1); }

async function api(body) {
  const r = await fetch(`${BASE}/api/public/tiktok-worker`, {
    method: "POST", headers: { "content-type": "application/json", "x-worker-token": TOKEN }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`api ${r.status}`);
  return r.json();
}
const update = (id, status, extra = {}) => api({ action: "update", id, status, ...extra }).catch((e) => console.error(e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runJob(job) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ locale: "en-US", viewport: { width: 1280, height: 900 } }); // fresh session per customer
  const page = await ctx.newPage();
  try {
    await page.goto(RECHARGE_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.getByRole("button", { name: /log in/i }).first().click({ timeout: 20_000 });
    await page.getByText(/use qr code/i).first().click({ timeout: 20_000 });
    const qr = page.locator("canvas, img[src*='qr' i]").first();
    await qr.waitFor({ timeout: 30_000 });
    let last = "";
    const deadline = Date.now() + QR_WAIT_MS;
    // Keep the customer's QR fresh until they scan and approve.
    while (Date.now() < deadline) {
      if (!(await qr.isVisible().catch(() => false))) break;
      const img = `data:image/png;base64,${(await qr.screenshot()).toString("base64")}`;
      if (img !== last) { await update(job.id, "qr_ready", { qr_image: img }); last = img; }
      await sleep(3000);
    }
    await update(job.id, "scanned");
    await page.waitForURL(/coin/i, { timeout: 60_000 }).catch(() => {});
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});

    await update(job.id, "charging");
    await page.getByText(/custom/i).first().click({ timeout: 20_000 });
    await page.locator("input[type='number'], input[inputmode='numeric']").first().fill(String(job.coins));
    await page.getByRole("button", { name: /recharge|buy now/i }).first().click({ timeout: 20_000 });
    const frame = page.frameLocator("iframe").first();
    await frame.locator("input[name*='card' i], input[autocomplete='cc-number']").first().fill(CARD.number, { timeout: 30_000 });
    await frame.locator("input[autocomplete='cc-exp'], input[name*='exp' i]").first().fill(CARD.exp);
    await frame.locator("input[autocomplete='cc-csc'], input[name*='cvv' i], input[name*='cvc' i]").first().fill(CARD.cvv);
    if (CARD.name) await frame.locator("input[autocomplete='cc-name'], input[name*='name' i]").first().fill(CARD.name).catch(() => {});
    await page.getByRole("button", { name: /pay|confirm/i }).last().click({ timeout: 20_000 });
    await page.getByText(/success|recharged|completed/i).first().waitFor({ timeout: PAY_WAIT_MS });
    await update(job.id, "done");
    console.log("done", job.id);
  } catch (e) {
    console.error("job failed", job.id, e.message);
    await page.screenshot({ path: `fail-${job.id}.png` }).catch(() => {});
    await update(job.id, "manual", { error: String(e.message).slice(0, 300) });
  } finally {
    await ctx.close().catch(() => {}); // wipe customer session
    await browser.close().catch(() => {});
  }
}

console.log("العامل شغال — بيتصل بـ", BASE);
let lastState = "";
const say = (s) => { if (s !== lastState) { console.log(new Date().toLocaleTimeString(), s); lastState = s; } };
for (;;) {
  try {
    const { job, reason } = await api({ action: "claim" });
    if (job) { say(`طلب جديد: ${job.coins} عملة`); await runJob(job); lastState = ""; }
    else { say(reason === "disabled" ? "متصل ✅ — الشحن الأوتوماتيك مقفول من لوحة الإدارة" : reason === "limit" ? "متصل ✅ — وصلنا للحد اليومي" : "متصل ✅ — مستني طلبات تيك توك"); await sleep(5000); }
  } catch (e) {
    const why = e?.cause?.code || e?.cause?.message || "";
    say(`مش قادر يوصل للموقع: ${e.message} ${why}`.trim());
    await sleep(10_000);
  }
}
