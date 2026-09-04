#!/usr/bin/env node
/**
 * نقل ملفات الـStorage من مشروع Supabase قديم إلى مشروعك الجديد.
 *
 * الاستخدام:
 *   OLD_SUPABASE_URL=... OLD_SERVICE_ROLE_KEY=... \
 *   NEW_SUPABASE_URL=... NEW_SERVICE_ROLE_KEY=... \
 *   node selfhost/migrate-storage.mjs
 *
 * خيارات:
 *   BUCKETS="product-images,site-assets"   نقل buckets محددة فقط
 *   DRY_RUN=1                              عرض ما سيُنقل بدون كتابة
 *
 * السكربت لا يحذف أي شيء من المشروع القديم أبدًا.
 */
import { createClient } from "@supabase/supabase-js";

const OLD_URL = process.env.OLD_SUPABASE_URL;
const OLD_KEY = process.env.OLD_SERVICE_ROLE_KEY;
const NEW_URL = process.env.NEW_SUPABASE_URL;
const NEW_KEY = process.env.NEW_SERVICE_ROLE_KEY;
const DRY_RUN = process.env.DRY_RUN === "1";

if (!OLD_URL || !OLD_KEY || !NEW_URL || !NEW_KEY) {
  console.error(
    "Missing env: OLD_SUPABASE_URL, OLD_SERVICE_ROLE_KEY, NEW_SUPABASE_URL, NEW_SERVICE_ROLE_KEY",
  );
  process.exit(1);
}

const DEFAULT_BUCKETS = [
  { name: "product-images", public: false },
  { name: "course-videos", public: false },
  { name: "employee-faces", public: false },
  { name: "payment-screenshots", public: false },
  { name: "site-assets", public: false },
  { name: "avatars", public: false },
];

const only = (process.env.BUCKETS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const oldDb = createClient(OLD_URL, OLD_KEY, opts);
const newDb = createClient(NEW_URL, NEW_KEY, opts);

async function listAll(client, bucket, prefix = "") {
  const out = [];
  const pageSize = 100;
  let offset = 0;
  for (;;) {
    const { data, error } = await client.storage
      .from(bucket)
      .list(prefix, { limit: pageSize, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) out.push(...(await listAll(client, bucket, path)));
      else out.push(path);
    }
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return out;
}

let totalCopied = 0;
let totalSkipped = 0;
let totalFailed = 0;

for (const bucket of DEFAULT_BUCKETS) {
  if (only.length && !only.includes(bucket.name)) continue;

  if (!DRY_RUN) {
    const { error: createErr } = await newDb.storage.createBucket(bucket.name, {
      public: bucket.public,
    });
    if (createErr && !/exists/i.test(createErr.message)) {
      console.error(`! bucket ${bucket.name}: ${createErr.message}`);
    }
  }

  let files;
  try {
    files = await listAll(oldDb, bucket.name);
  } catch (e) {
    console.error(`! ${bucket.name}: ${e.message}`);
    continue;
  }
  console.log(`\n== ${bucket.name}: ${files.length} file(s)`);

  const existing = new Set(DRY_RUN ? [] : await listAll(newDb, bucket.name).catch(() => []));

  for (const path of files) {
    if (existing.has(path)) {
      totalSkipped++;
      continue;
    }
    if (DRY_RUN) {
      console.log(`  would copy ${path}`);
      continue;
    }
    const { data: blob, error: dlErr } = await oldDb.storage.from(bucket.name).download(path);
    if (dlErr || !blob) {
      totalFailed++;
      console.error(`  x download ${path}: ${dlErr?.message}`);
      continue;
    }
    const buf = Buffer.from(await blob.arrayBuffer());
    const { error: upErr } = await newDb.storage
      .from(bucket.name)
      .upload(path, buf, { contentType: blob.type || "application/octet-stream", upsert: true });
    if (upErr) {
      totalFailed++;
      console.error(`  x upload ${path}: ${upErr.message}`);
      continue;
    }
    totalCopied++;
    if (totalCopied % 25 === 0) console.log(`  ... ${totalCopied} copied`);
  }
}

console.log(
  `\nDone. copied=${totalCopied} skipped(existing)=${totalSkipped} failed=${totalFailed}${DRY_RUN ? " (dry run)" : ""}`,
);
if (totalFailed > 0) process.exit(1);
