#!/bin/sh
# حلقة مزامنة Bybit داخل حاوية الكرون (تُستخدم من docker-compose.yml)
# - السر يأتي من environment فقط (SYNC_HOOK_SECRET)، ولا يوجد أي مفتاح داخل الكود
# - لا تكرار: السيرفر نفسه يستخدم single-flight lease في bybit_sync_state
# - لا فقدان معاملات: كل محاولة فاشلة تُعاد بـbackoff قصير قبل الدورة التالية
set -eu

SYNC_URL="${SYNC_URL:-http://app:3000/api/public/hooks/bybit-ledger-sync}"
SYNC_INTERVAL_SECONDS="${SYNC_INTERVAL_SECONDS:-300}"
SYNC_TIMEOUT_SECONDS="${SYNC_TIMEOUT_SECONDS:-120}"
SYNC_HOOK_SECRET="${SYNC_HOOK_SECRET:-}"

if [ -z "$SYNC_HOOK_SECRET" ]; then
  echo "FATAL: SYNC_HOOK_SECRET is required in selfhost/.env (generate with: openssl rand -hex 32)"
  exit 1
fi

log() { echo "[$(date -u +%FT%TZ)] $*"; }

run_once() {
  code=$(curl -s -o /tmp/sync-out -w '%{http_code}' \
    --max-time "$SYNC_TIMEOUT_SECONDS" \
    -X POST \
    -H 'Content-Type: application/json' \
    -H "x-sync-secret: $SYNC_HOOK_SECRET" \
    -d '{}' \
    "$SYNC_URL" || echo 000)
  body=$(cat /tmp/sync-out 2>/dev/null || true)
  log "bybit sync http=$code $body"
  case "$code" in
    2*) return 0 ;;
    401|403) log "unauthorized: SYNC_HOOK_SECRET لا يطابق السر على التطبيق"; return 1 ;;
    *) return 1 ;;
  esac
}

log "starting bybit sync loop interval=${SYNC_INTERVAL_SECONDS}s url=$SYNC_URL"

while true; do
  attempt=1
  while [ "$attempt" -le 3 ]; do
    if run_once; then break; fi
    if [ "$attempt" -lt 3 ]; then
      backoff=$((attempt * 15))
      log "retry $attempt failed, sleeping ${backoff}s"
      sleep "$backoff"
    fi
    attempt=$((attempt + 1))
  done
  sleep "$SYNC_INTERVAL_SECONDS"
done
