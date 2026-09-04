#!/usr/bin/env bash
# مزامنة Bybit من سيرفرك (بديل pg_cron داخل السحابة)
# مثال crontab (كل 5 دقائق):
#   */5 * * * * /opt/mag-pro1/selfhost/bybit-sync.sh >> /var/log/bybit-sync.log 2>&1
set -euo pipefail

APP_URL="${APP_URL:-http://127.0.0.1:3000}"
HOOK_SECRET="${SYNC_HOOK_SECRET:-}"
API_KEY="${VITE_SUPABASE_PUBLISHABLE_KEY:-}"

if [ -n "$HOOK_SECRET" ]; then
  AUTH_HEADER="x-sync-secret: $HOOK_SECRET"
else
  AUTH_HEADER="apikey: $API_KEY"
fi

curl -sS -X POST \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d '{}' \
  "$APP_URL/api/public/hooks/bybit-ledger-sync"

echo ""
echo "[$(date -u +%FT%TZ)] bybit sync done"
