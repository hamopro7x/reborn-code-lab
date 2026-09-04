#!/usr/bin/env bash
# تطبيق كل الـmigrations بالترتيب على قاعدة البيانات الجديدة (مشروعك الخاص أو self-hosted)
#
# الاستخدام:
#   NEW_DB_URL="postgresql://postgres:PASS@HOST:5432/postgres" ./selfhost/migrate-db.sh
#
# خيارات:
#   DRY_RUN=1   عرض الملفات بالترتيب فقط بدون تنفيذ
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)/supabase/migrations"
DRY_RUN="${DRY_RUN:-0}"

if [ -z "${NEW_DB_URL:-}" ]; then
  echo "FATAL: set NEW_DB_URL"
  exit 1
fi

count=0
for f in $(ls "$DIR"/*.sql | sort); do
  count=$((count + 1))
  if [ "$DRY_RUN" = "1" ]; then
    echo "would apply: $(basename "$f")"
    continue
  fi
  echo "==> $(basename "$f")"
  psql "$NEW_DB_URL" -v ON_ERROR_STOP=1 -f "$f"
done

echo "done. files=$count${DRY_RUN:+ (dry run)}"
