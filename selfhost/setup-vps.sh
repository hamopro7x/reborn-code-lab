#!/usr/bin/env bash
# تشغيل أول مرة على VPS Ubuntu (Docker + Compose مثبتان مسبقًا).
# يشغّل التطبيق وكرون Bybit بعد أن تكون ملأت selfhost/.env
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"

if [ ! -f .env ]; then
  echo "FATAL: selfhost/.env غير موجود. انسخ .env.example إلى .env واملأ القيم."
  exit 1
fi

missing=0
for k in VITE_SUPABASE_URL VITE_SUPABASE_PUBLISHABLE_KEY SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY SYNC_HOOK_SECRET; do
  v="$(grep -E "^${k}=" .env | cut -d= -f2- || true)"
  if [ -z "$v" ]; then
    echo "ناقص في .env: $k"
    missing=1
  fi
done
[ "$missing" = "1" ] && exit 1

docker compose up -d --build
docker compose ps
echo
echo "تابع السجلات:  docker compose logs -f app"
echo "تابع المزامنة: docker compose logs -f bybit-cron"
