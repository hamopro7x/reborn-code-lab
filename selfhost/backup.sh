#!/usr/bin/env bash
# نسخة احتياطية يومية لقاعدة البيانات. ضعها في crontab على الـVPS:
#   0 3 * * * cd /opt/mag-pro1 && DB_URL="..." ./selfhost/backup.sh >> /var/log/mag-backup.log 2>&1
set -euo pipefail

DEST="${BACKUP_DIR:-/opt/backups/mag-pro1}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date -u +%Y%m%d-%H%M%S)"

if [ -z "${DB_URL:-}" ]; then
  echo "FATAL: set DB_URL"
  exit 1
fi

mkdir -p "$DEST"
pg_dump "$DB_URL" --no-owner --no-privileges | gzip -9 > "$DEST/db-$STAMP.sql.gz"
find "$DEST" -name 'db-*.sql.gz' -mtime "+$KEEP_DAYS" -delete

echo "backup ok: $DEST/db-$STAMP.sql.gz"
