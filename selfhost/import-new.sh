#!/usr/bin/env bash
# استيراد ما صدّرناه بـexport-cloud.sh إلى القاعدة الجديدة التي تملكها.
#
# الاستخدام:
#   NEW_DB_URL="postgresql://postgres:PASS@HOST:5432/postgres" ./selfhost/import-new.sh
#
# ترتيب التنفيذ:
#   1) migrations (بنية المشروع الرسمية)  أو  schema.sql إن فضّلت النسخة المصدّرة
#   2) auth.sql   (المستخدمون أولًا حتى تعمل المفاتيح الأجنبية)
#   3) data.sql   (بيانات التطبيق)
set -euo pipefail

IN="${IN_DIR:-./cloud-export}"
USE_SCHEMA_DUMP="${USE_SCHEMA_DUMP:-0}"

if [ -z "${NEW_DB_URL:-}" ]; then
  echo "FATAL: set NEW_DB_URL"
  exit 1
fi

if [ "$USE_SCHEMA_DUMP" = "1" ]; then
  echo "==> schema (from dump)"
  psql "$NEW_DB_URL" -v ON_ERROR_STOP=1 -f "$IN/schema.sql"
else
  echo "==> schema (from migrations)"
  NEW_DB_URL="$NEW_DB_URL" "$(dirname "$0")/migrate-db.sh"
fi

if [ -f "$IN/auth.sql" ]; then
  echo "==> auth users"
  psql "$NEW_DB_URL" -f "$IN/auth.sql"
fi

if [ -f "$IN/data.sql" ]; then
  echo "==> app data"
  psql "$NEW_DB_URL" -f "$IN/data.sql"
fi

if [ -f "$IN/storage-meta.sql" ]; then
  echo "==> storage metadata"
  psql "$NEW_DB_URL" -f "$IN/storage-meta.sql" || true
fi

echo "done."
