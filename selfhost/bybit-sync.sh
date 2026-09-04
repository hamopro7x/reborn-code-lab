#!/usr/bin/env bash
# مزامنة Bybit من سيرفرك (بديل pg_cron داخل السحابة)
# مثال crontab (كل 5 دقائق):
#   */5 * * * * /opt/mag-pro1/selfhost/bybit-sync.sh >> /var/log/bybit-sync.log 2>&1
set -euo pipefail

APP_URL="${APP_URL:-http://127.0.0.1:3000}"
API_KEY="${VITE_SUPABASE_PUBLISHABLE_KEY:-}"

curl -sS -X POST \
  -H "Content-Type: application/json" \
  ${API_KEY:+-H "apikey: $API_KEY"} \
  -d '{}' \
  "$APP_URL/api/public/hooks/bybit-ledger-sync"

echo ""
echo "[$(date -u +%FT%TZ)] bybit sync done"
