#!/usr/bin/env bash
# استيراد البيانات المصدَّرة (ملفات CSV من ميزة "تصدير البيانات") إلى القاعدة الجديدة.
#
# قبل تشغيله: طبّق الهيكل أولًا
#   NEW_DB_URL="postgresql://..." ./selfhost/migrate-db.sh
#
# الاستخدام:
#   NEW_DB_URL="postgresql://postgres:PASS@HOST:5432/postgres" CSV_DIR=./cloud-export ./selfhost/import-csv.sh
#
# ملاحظات:
# - يستورد بالترتيب الصحيح حتى لا تفشل المفاتيح الأجنبية.
# - أي جدول ليس له ملف CSV يُتجاهل بهدوء.
# - جدول المستخدمين (auth.users) لا يُستورد من CSV؛ يُنقل من نسخة auth.sql أو يعاد إنشاء الحسابات.
set -euo pipefail

CSV_DIR="${CSV_DIR:-./cloud-export}"

if [ -z "${NEW_DB_URL:-}" ]; then
  echo "FATAL: set NEW_DB_URL"
  exit 1
fi

# الترتيب مهم: الجداول المرجعية أولًا ثم المعتمدة عليها
TABLES=(
  currencies
  countries
  exchange_rates
  categories
  products
  product_prices
  payment_methods
  profiles
  user_roles
  user_devices
  hero_banners
  countdown_timers
  site_settings
  courses
  course_lessons
  course_access
  course_progress
  reviews
  orders
  order_items
  admin_notifications
  api_keys
  bybit_accounts
  bybit_account_info
  bybit_cards
  bybit_ledger
  bybit_card_txns
  bybit_sync_state
  card_transactions
  agent_devices
  agent_enroll_codes
  agent_pairings
  remote_access
  screenshare_signals
  webauthn_credentials
  employee_face_enroll
  work_shifts
  work_manual_txns
  work_manual_card_txns
  work_txn_assignments
  work_txn_entries
  work_transfer_notes
)

imported=0
skipped=0

for t in "${TABLES[@]}"; do
  file=""
  for cand in "$CSV_DIR/$t.csv" "$CSV_DIR/public.$t.csv" "$CSV_DIR/public/$t.csv"; do
    [ -f "$cand" ] && file="$cand" && break
  done

  if [ -z "$file" ]; then
    echo "skip (no file): $t"
    skipped=$((skipped + 1))
    continue
  fi

  echo "==> $t  <-  $file"
  header="$(head -n 1 "$file" | tr -d '\r')"
  psql "$NEW_DB_URL" -v ON_ERROR_STOP=1 \
    -c "\\copy public.$t ($header) FROM '$file' WITH (FORMAT csv, HEADER true)"
  imported=$((imported + 1))
done

echo "==> إعادة ضبط التسلسلات إن وُجدت"
psql "$NEW_DB_URL" -c "
DO \$\$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname AS seq, t.relname AS tbl, a.attname AS col
    FROM pg_class c
    JOIN pg_depend d ON d.objid = c.oid AND c.relkind = 'S'
    JOIN pg_class t ON t.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
    JOIN pg_namespace n ON n.oid = t.relnamespace AND n.nspname = 'public'
  LOOP
    EXECUTE format('SELECT setval(%L, coalesce((SELECT max(%I) FROM public.%I), 1))', r.seq, r.col, r.tbl);
  END LOOP;
END \$\$;"

echo "done. imported=$imported skipped=$skipped"
