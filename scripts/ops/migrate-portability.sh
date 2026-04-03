#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

BACKEND_ENV="$ROOT_DIR/backend/.env"
NODE_ENV="$ROOT_DIR/backend/packages/server-node/.env"
FRONTEND_ENV="$ROOT_DIR/frontend/.env"
BACKUP_ENV="$ROOT_DIR/backups/.env"

TMP_DIRS=()

log() { echo "[migrate] $*"; }
err() { echo "[error] $*" >&2; }

cleanup_tmp_dirs() {
  for dir in "${TMP_DIRS[@]:-}"; do
    [[ -d "$dir" ]] && rm -rf "$dir"
  done
}
trap cleanup_tmp_dirs EXIT

register_tmp_dir() {
  TMP_DIRS+=("$1")
}

# ------------------------
# ENV LOADING
# ------------------------

load_env_file() {
  local file="$1"
  [[ -f "$file" ]] || return 0
  set -a
  # shellcheck disable=SC1090
  source "$file"
  set +a
}

load_all_envs() {
  load_env_file "$BACKEND_ENV"
  load_env_file "$NODE_ENV"
  load_env_file "$BACKUP_ENV"
}

# ------------------------
# REQUIREMENTS
# ------------------------

require_tools() {
  for cmd in mysql mysqldump tar aws python3; do
    command -v "$cmd" >/dev/null || {
      err "$cmd is required"
      exit 1
    }
  done
}

# ------------------------
# MYSQL URL PARSER
# ------------------------

parse_mysql_url() {
  python3 - "$1" <<'PY'
import sys
from urllib.parse import urlparse, unquote

p = urlparse(sys.argv[1])
if p.scheme not in ("mysql", "mariadb"):
    raise SystemExit("Invalid DB scheme")

print(f"USER={unquote(p.username or '')}")
print(f"PASSWORD={unquote(p.password or '')}")
print(f"HOST={p.hostname or '127.0.0.1'}")
print(f"PORT={p.port or 3306}")
print(f"DB={p.path.lstrip('/')}")
PY
}

parse_mysql_url_to_globals() {
  local kv
  while read -r kv; do
    case "$kv" in
      USER=*) DB_USER="${kv#USER=}" ;;
      PASSWORD=*) DB_PASS="${kv#PASSWORD=}" ;;
      HOST=*) DB_HOST="${kv#HOST=}" ;;
      PORT=*) DB_PORT="${kv#PORT=}" ;;
      DB=*) DB_NAME="${kv#DB=}" ;;
    esac
  done < <(parse_mysql_url "$1")
}

# ------------------------
# S3 FETCH
# ------------------------

fetch_latest_from_s3() {
  [[ -f "$BACKUP_ENV" ]] || {
    err "Missing $BACKUP_ENV"
    exit 1
  }

  load_env_file "$BACKUP_ENV"

  log "Fetching latest backup from S3..."

  local latest
  latest=$(aws s3 ls "s3://$S3_BUCKET/$S3_PREFIX/" \
    | sort | tail -n 1 | awk '{print $4}')

  [[ -n "$latest" ]] || {
    err "No backups found in S3"
    exit 1
  }

  local tmp
  tmp="$(mktemp --suffix=.tar.gz)"
  register_tmp_dir "$(dirname "$tmp")"

  aws s3 cp "s3://$S3_BUCKET/$S3_PREFIX/$latest" "$tmp"

  echo "$tmp"
}

# ------------------------
# EXPORT
# ------------------------

run_mysqldump() {
  parse_mysql_url_to_globals "$1"

  mysqldump \
    --host="$DB_HOST" \
    --port="$DB_PORT" \
    --user="$DB_USER" \
    --password="$DB_PASS" \
    --single-transaction \
    --quick \
    --routines \
    --events \
    --triggers \
    "$DB_NAME"
}

export_bundle() {
  local out_file="$1"
  local tmp
  tmp="$(mktemp -d)"
  register_tmp_dir "$tmp"

  mkdir -p "$tmp/databases" "$tmp/config"

  local found=0

  for var in $(compgen -v | grep DATABASE_URL || true); do
    local url="${!var:-}"
    [[ "$url" == mysql* ]] || continue

    log "Exporting $var..."
    run_mysqldump "$url" > "$tmp/databases/${var}.sql"
    echo -e "$var\t${var}.sql" >> "$tmp/databases/index.tsv"
    found=1
  done

  [[ "$found" -eq 1 ]] || {
    err "No DATABASE_URL variables found"
    exit 1
  }

  cp "$BACKEND_ENV" "$tmp/config/backend.env" 2>/dev/null || true
  cp "$NODE_ENV" "$tmp/config/server-node.env" 2>/dev/null || true
  cp "$FRONTEND_ENV" "$tmp/config/frontend.env" 2>/dev/null || true

  tar -czf "$out_file" -C "$tmp" .
  log "Exported → $out_file"
}

# ------------------------
# IMPORT
# ------------------------

drop_and_create_db() {
  parse_mysql_url_to_globals "$1"

  mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" <<SQL
DROP DATABASE IF EXISTS \`$DB_NAME\`;
CREATE DATABASE \`$DB_NAME\`;
SQL
}

import_sql() {
  parse_mysql_url_to_globals "$1"

  mysql \
    -h "$DB_HOST" \
    -P "$DB_PORT" \
    -u "$DB_USER" \
    -p"$DB_PASS" \
    "$DB_NAME"
}

import_bundle() {
  local file="$1"

  [[ -f "$file" ]] || {
    err "Backup not found: $file"
    exit 1
  }

  local tmp
  tmp="$(mktemp -d)"
  register_tmp_dir "$tmp"

  tar -xzf "$file" -C "$tmp"

  local index="$tmp/databases/index.tsv"
  [[ -f "$index" ]] || {
    err "Invalid backup (missing index)"
    exit 1
  }

  load_env_file "$tmp/config/backend.env"
  load_env_file "$tmp/config/server-node.env"

  while IFS=$'\t' read -r var file; do
    local url="${!var:-}"
    [[ -n "$url" ]] || {
      err "$var not set"
      exit 1
    }

    log "Rebuilding DB for $var..."
    drop_and_create_db "$url"

    log "Importing $var..."
    import_sql "$url" < "$tmp/databases/$file"
  done < "$index"

  log "Restore complete"
}

# ------------------------
# MAIN
# ------------------------

print_usage() {
  cat <<EOF
Usage:
  export <file>
  import [file] --force

If no file is provided for import, latest backup is pulled from S3.
EOF
}

main() {
  [[ $# -ge 1 ]] || { print_usage; exit 1; }

  local mode="$1"
  shift

  local file=""
  local force=0

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --force) force=1 ;;
      *) file="$1" ;;
    esac
    shift
  done

  load_all_envs
  require_tools

  case "$mode" in
    export)
      [[ -n "$file" ]] || { err "Missing output file"; exit 1; }
      export_bundle "$file"
      ;;
    import)
      [[ "$force" -eq 1 ]] || {
        err "Use --force (this wipes databases)"
        exit 1
      }

      if [[ -z "$file" ]]; then
        file="$(fetch_latest_from_s3)"
      fi

      import_bundle "$file"
      ;;
    *)
      print_usage
      exit 1
      ;;
  esac
}

main "$@"