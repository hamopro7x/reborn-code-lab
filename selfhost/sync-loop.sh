#!/bin/sh
# حلقة مزامنة Bybit داخل حاوية الكرون (تُستخدم من docker-compose.yml)
set -eu

SYNC_URL="${SYNC_URL:-http://app:3000/api/public/hooks/bybit-ledger-sync}"
SYNC_INTERVAL_SECONDS="${SYNC_INTERVAL_SECONDS:-300}"
SYNC_HOOK_SECRET="${SYNC_HOOK_SECRET:-}"
FALLBACK_KEY="${VITE_SUPABASE_PUBLISHABLE_KEY:-}"

if [ -z "$SYNC_HOOK_SECRET" ] && [ -z "$FALLBACK_KEY" ]; then
  echo "FATAL: set SYNC_HOOK_SECRET (or VITE_SUPABASE_PUBLISHABLE_KEY) in selfhost/.env"
  exit 1
fi

if [ -n "$SYNC_HOOK_SECRET" ]; then
  AUTH_HEADER="x-sync-secret: $SYNC_HOOK_SECRET"
else
  AUTH_HEADER="apikey: $FALLBACK_KEY"
fi

while true; do
  code=$(curl -s -o /tmp/sync-out -w '%{http_code}' \
    -X POST \
    -H 'Content-Type: application/json' \
    -H "$AUTH_HEADER" \
    -d '{}' \
    "$SYNC_URL" || echo 000)
  echo "[$(date -u +%FT%TZ)] bybit sync http=$code $(cat /tmp/sync-out 2>/dev/null || true)"
  sleep "$SYNC_INTERVAL_SECONDS"
done
