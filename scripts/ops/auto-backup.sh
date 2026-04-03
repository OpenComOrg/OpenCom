#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="$ROOT_DIR/backups/.env"

# Load env
[[ -f "$ENV_FILE" ]] && source "$ENV_FILE"

BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups/auto}"
KEEP_COUNT="${BACKUP_KEEP:-56}"

require_tools() {
  command -v aws >/dev/null || { echo "aws CLI required"; exit 1; }
  command -v tar >/dev/null || { echo "tar required"; exit 1; }
}

require_tools

mkdir -p "$BACKUP_DIR"

timestamp="$(date +%Y%m%d-%H%M%S)"
backup_file="$BACKUP_DIR/opencom-${timestamp}.tar.gz"

echo "[backup] Creating database bundle..."
"$ROOT_DIR/scripts/ops/migrate-portability.sh" export "$backup_file"

echo "[backup] Uploading to S3..."
aws s3 cp "$backup_file" "s3://$S3_BUCKET/$S3_PREFIX/$(basename "$backup_file")"

# -----------------------
# Local retention
# -----------------------
if [[ "$KEEP_COUNT" -gt 0 ]]; then
  mapfile -t local_files < <(ls -1 "$BACKUP_DIR"/opencom-*.tar.gz 2>/dev/null | sort)

  if (( ${#local_files[@]} > KEEP_COUNT )); then
    delete_count=$(( ${#local_files[@]} - KEEP_COUNT ))
    for ((i=0; i<delete_count; i++)); do
      rm -f "${local_files[$i]}"
    done
  fi
fi

# -----------------------
# S3 retention
# -----------------------
echo "[backup] Pruning S3 backups..."

mapfile -t s3_files < <(
  aws s3 ls "s3://$S3_BUCKET/$S3_PREFIX/" | awk '{print $4}' | sort
)

if (( ${#s3_files[@]} > KEEP_COUNT )); then
  delete_count=$(( ${#s3_files[@]} - KEEP_COUNT ))
  for ((i=0; i<delete_count; i++)); do
    aws s3 rm "s3://$S3_BUCKET/$S3_PREFIX/${s3_files[$i]}"
  done
fi

echo "[backup] Completed: $backup_file"