#!/usr/bin/env bash
# backup_db.sh — Automated PostgreSQL backup for SquatSense / FreeForm Fitness
#
# Usage:
#   ./scripts/backup_db.sh                          # backup with default settings
#   PGHOST=db.railway.app PGPORT=5432 ./scripts/backup_db.sh  # remote backup
#
# Requires: pg_dump (PostgreSQL client tools), gzip
# Retention: keeps last 30 backups by default (override with BACKUP_RETENTION)

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_RETENTION="${BACKUP_RETENTION:-30}"
DB_NAME="${PGDATABASE:-squatsense}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "[backup] Starting backup of ${DB_NAME} at $(date)"

pg_dump \
  --format=custom \
  --compress=6 \
  --verbose \
  --no-owner \
  --no-privileges \
  "$DB_NAME" > "${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.dump" 2>/dev/null

FILESIZE=$(du -h "${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.dump" | cut -f1)
echo "[backup] Backup complete: ${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.dump (${FILESIZE})"

# Rotate old backups
BACKUP_COUNT=$(find "$BACKUP_DIR" -name "${DB_NAME}_*.dump" -type f | wc -l | tr -d ' ')
if [ "$BACKUP_COUNT" -gt "$BACKUP_RETENTION" ]; then
  REMOVE_COUNT=$((BACKUP_COUNT - BACKUP_RETENTION))
  echo "[backup] Rotating: removing ${REMOVE_COUNT} old backup(s)"
  find "$BACKUP_DIR" -name "${DB_NAME}_*.dump" -type f | sort | head -n "$REMOVE_COUNT" | xargs rm -f
fi

echo "[backup] Done. ${BACKUP_COUNT} backup(s) on disk, retention=${BACKUP_RETENTION}"
