#!/usr/bin/env bash
# مزامنة Bybit من سيرفرك بدون Docker (بديل خدمة bybit-cron)
# مثال crontab (كل 5 دقائق):
#   */5 * * * * set -a; . /opt/mag-pro1/selfhost/.env; set +a; /opt/mag-pro1/selfhost/bybit-sync.sh >> /var/log/bybit-sync.log 2>&1
set -euo pipefail

APP_URL="${APP_URL:-http://127.0.0.1:3000}"
HOOK_SECRET="${SYNC_HOOK_SECRET:-}"
TIMEOUT="${SYNC_TIMEOUT_SECONDS:-120}"
LOCK_FILE="${SYNC_LOCK_FILE:-/tmp/bybit-sync.lock}"

if [ -z "$HOOK_SECRET" ]; then
  echo "FATAL: SYNC_HOOK_SECRET is required (generate with: openssl rand -hex 32)" >&2
  exit 1
fi

# قفل يمنع تشغيل أكثر من نسخة في نفس الوقت لو تأخرت دورة
if command -v flock >/dev/null 2>&1 && [ "${SYNC_LOCKED:-0}" != "1" ]; then
  export SYNC_LOCKED=1
  exec flock -n "$LOCK_FILE" "$0" "$@"
fi

code=$(curl -sS -o /tmp/bybit-sync-out -w '%{http_code}' \
  --max-time "$TIMEOUT" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "x-sync-secret: $HOOK_SECRET" \
  -d '{}' \
  "$APP_URL/api/public/hooks/bybit-ledger-sync" || echo 000)

echo "[$(date -u +%FT%TZ)] bybit sync http=$code $(cat /tmp/bybit-sync-out 2>/dev/null || true)"
case "$code" in
  2*) exit 0 ;;
  *) exit 1 ;;
esac
