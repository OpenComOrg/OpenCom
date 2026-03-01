#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKUP_DIR="$ROOT_DIR/backups/auto"
KEEP_COUNT=56

print_usage() {
  cat <<'USAGE'
Usage: ./scripts/ops/auto-backup.sh [options]

Creates a timestamped OpenCom backup bundle and optionally prunes old backups.

Options:
  --backup-dir <path>  output directory (default: ./backups/auto)
  --keep <count>       number of latest backups to keep (default: 56)
  -h, --help           show this help
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --backup-dir)
      [[ $# -ge 2 ]] || { echo "Missing value for --backup-dir"; exit 1; }
      BACKUP_DIR="$2"
      shift
      ;;
    --keep)
      [[ $# -ge 2 ]] || { echo "Missing value for --keep"; exit 1; }
      KEEP_COUNT="$2"
      shift
      ;;
    -h|--help|help)
      print_usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      print_usage
      exit 1
      ;;
  esac
  shift
done

[[ "$KEEP_COUNT" =~ ^[0-9]+$ ]] || { echo "--keep must be a non-negative integer"; exit 1; }

mkdir -p "$BACKUP_DIR"

timestamp="$(date +%Y%m%d-%H%M%S)"
backup_file="$BACKUP_DIR/opencom-${timestamp}.tar.gz"

"$ROOT_DIR/scripts/ops/migrate-portability.sh" export "$backup_file"

if [[ "$KEEP_COUNT" -gt 0 ]]; then
  shopt -s nullglob
  backups=( "$BACKUP_DIR"/opencom-*.tar.gz )
  shopt -u nullglob

  if (( ${#backups[@]} > KEEP_COUNT )); then
    IFS=$'\n' read -r -d '' -a sorted_backups < <(printf '%s\n' "${backups[@]}" | sort && printf '\0')
    delete_count=$(( ${#sorted_backups[@]} - KEEP_COUNT ))
    for ((i = 0; i < delete_count; i++)); do
      rm -f "${sorted_backups[$i]}"
    done
  fi
fi

echo "Auto backup completed: $backup_file"
