#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
JOB_MARKER="# opencom-auto-backup"
BACKUP_DIR="$ROOT_DIR/backups/auto"
KEEP_COUNT=56
MINUTE=0
LOG_FILE="$ROOT_DIR/backups/auto-backup.log"

print_usage() {
  cat <<'USAGE'
Usage:
  ./scripts/ops/backup-cron.sh install [--backup-dir <path>] [--keep <count>] [--minute <0-59>] [--log-file <path>]
  ./scripts/ops/backup-cron.sh uninstall
  ./scripts/ops/backup-cron.sh status
  ./scripts/ops/backup-cron.sh run-now [--backup-dir <path>] [--keep <count>]

Commands:
  install    install/update cron job to run every 6 hours (minute */6)
  uninstall  remove installed backup cron job
  status     show configured backup cron job
  run-now    run an immediate backup using auto-backup.sh
USAGE
}

parse_common_options() {
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
      --minute)
        [[ $# -ge 2 ]] || { echo "Missing value for --minute"; exit 1; }
        MINUTE="$2"
        shift
        ;;
      --log-file)
        [[ $# -ge 2 ]] || { echo "Missing value for --log-file"; exit 1; }
        LOG_FILE="$2"
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
}

validate_options() {
  [[ "$KEEP_COUNT" =~ ^[0-9]+$ ]] || { echo "--keep must be a non-negative integer"; exit 1; }
  [[ "$MINUTE" =~ ^[0-9]+$ ]] || { echo "--minute must be an integer"; exit 1; }
  (( MINUTE >= 0 && MINUTE <= 59 )) || { echo "--minute must be in 0..59"; exit 1; }
}

get_current_crontab() {
  crontab -l 2>/dev/null || true
}

remove_existing_job() {
  local content="$1"
  printf '%s\n' "$content" | grep -Fv "$JOB_MARKER" || true
}

build_cron_line() {
  local q_root q_runner q_backup q_log
  printf -v q_root '%q' "$ROOT_DIR"
  printf -v q_runner '%q' "$ROOT_DIR/scripts/ops/auto-backup.sh"
  printf -v q_backup '%q' "$BACKUP_DIR"
  printf -v q_log '%q' "$LOG_FILE"

  printf '%s */6 * * * cd %s && %s --backup-dir %s --keep %s >> %s 2>&1 %s\n' \
    "$MINUTE" "$q_root" "$q_runner" "$q_backup" "$KEEP_COUNT" "$q_log" "$JOB_MARKER"
}

install_cron_job() {
  validate_options
  mkdir -p "$BACKUP_DIR"
  mkdir -p "$(dirname "$LOG_FILE")"

  local current cleaned line
  current="$(get_current_crontab)"
  cleaned="$(remove_existing_job "$current")"
  line="$(build_cron_line)"

  {
    [[ -n "$cleaned" ]] && printf '%s\n' "$cleaned"
    printf '%s\n' "$line"
  } | crontab -

  echo "Installed backup cron job:"
  echo "$line"
}

uninstall_cron_job() {
  local current cleaned
  current="$(get_current_crontab)"
  cleaned="$(remove_existing_job "$current")"

  printf '%s\n' "$cleaned" | crontab -
  echo "Removed backup cron job (if it existed)."
}

show_status() {
  local current
  current="$(get_current_crontab)"
  if printf '%s\n' "$current" | grep -Fq "$JOB_MARKER"; then
    printf '%s\n' "$current" | grep -F "$JOB_MARKER"
  else
    echo "No OpenCom auto-backup cron job found."
  fi
}

run_now() {
  validate_options
  "$ROOT_DIR/scripts/ops/auto-backup.sh" --backup-dir "$BACKUP_DIR" --keep "$KEEP_COUNT"
}

main() {
  local command="${1:-}"
  if [[ -z "$command" ]]; then
    print_usage
    exit 1
  fi
  shift || true

  case "$command" in
    install)
      parse_common_options "$@"
      install_cron_job
      ;;
    uninstall)
      parse_common_options "$@"
      uninstall_cron_job
      ;;
    status)
      parse_common_options "$@"
      show_status
      ;;
    run-now)
      parse_common_options "$@"
      run_now
      ;;
    -h|--help|help)
      print_usage
      ;;
    *)
      echo "Unknown command: $command"
      print_usage
      exit 1
      ;;
  esac
}

main "$@"
