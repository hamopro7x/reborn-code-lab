#!/usr/bin/env bash
# تصدير كامل من قاعدة البيانات الحالية (السحابة) إلى ملفات محلية.
# لا يعدّل أي شيء في القاعدة — قراءة فقط.
#
# الاستخدام:
#   OLD_DB_URL="postgresql://postgres:PASS@HOST:5432/postgres" ./selfhost/export-cloud.sh
#
# الناتج داخل مجلد ./cloud-export/
#   schema.sql      : الهيكل الكامل (جداول، دوال، triggers، indexes، policies)
#   data.sql        : بيانات مخططات التطبيق
#   auth.sql        : جدول المستخدمين والهويات (يحافظ على UUID وكلمات المرور المشفرة)
#   roles.sql       : أدوار قاعدة البيانات (اختياري)
set -euo pipefail

OUT="${OUT_DIR:-./cloud-export}"
mkdir -p "$OUT"

if [ -z "${OLD_DB_URL:-}" ]; then
  echo "FATAL: set OLD_DB_URL"
  exit 1
fi

echo "==> schema"
pg_dump "$OLD_DB_URL" --schema-only --no-owner --no-privileges \
  --schema=public --schema=private --schema=storage --schema=auth \
  -f "$OUT/schema.sql"

echo "==> data (public + private)"
pg_dump "$OLD_DB_URL" --data-only --no-owner --no-privileges \
  --schema=public --schema=private \
  -f "$OUT/data.sql"

echo "==> auth (users, identities)"
pg_dump "$OLD_DB_URL" --data-only --no-owner --no-privileges \
  --table=auth.users --table=auth.identities \
  -f "$OUT/auth.sql"

echo "==> storage metadata"
pg_dump "$OLD_DB_URL" --data-only --no-owner --no-privileges \
  --table=storage.buckets --table=storage.objects \
  -f "$OUT/storage-meta.sql" || echo "skip storage meta"

echo "done -> $OUT"
ls -lh "$OUT"
