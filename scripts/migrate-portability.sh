#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_ENV="$ROOT_DIR/backend/.env"
NODE_ENV="$ROOT_DIR/backend/packages/server-node/.env"

load_env() {
  if [[ -f "$BACKEND_ENV" ]]; then
    set -a
    # shellcheck source=/dev/null
    source "$BACKEND_ENV"
    set +a
  fi
  if [[ -f "$NODE_ENV" ]]; then
    set -a
    # shellcheck source=/dev/null
    source "$NODE_ENV"
    set +a
  fi
}

require_tools() {
  command -v mysqldump >/dev/null 2>&1 || { echo "mysqldump is required"; exit 1; }
  command -v mysql >/dev/null 2>&1 || { echo "mysql client is required"; exit 1; }
  command -v tar >/dev/null 2>&1 || { echo "tar is required"; exit 1; }
  command -v python3 >/dev/null 2>&1 || { echo "python3 is required"; exit 1; }
}

# Prints key=value lines that can be safely read by mapfile.
parse_mysql_url() {
  local db_url="$1"
  python3 - "$db_url" <<'PY'
import sys
from urllib.parse import urlparse, unquote

raw = sys.argv[1]
p = urlparse(raw)
if p.scheme not in ("mysql", "mariadb"):
    raise SystemExit(f"Unsupported DB URL scheme: {p.scheme}")

dbname = p.path.lstrip("/")
if not dbname:
    raise SystemExit("Database name missing in URL path")

user = unquote(p.username or "")
password = unquote(p.password or "")
host = p.hostname or "127.0.0.1"
port = str(p.port or 3306)

print(f"USER={user}")
print(f"PASSWORD={password}")
print(f"HOST={host}")
print(f"PORT={port}")
print(f"DB={dbname}")
PY
}

run_mysqldump() {
  local db_url="$1"
  local out_file="$2"

  local lines
  mapfile -t lines < <(parse_mysql_url "$db_url")

  local user="" password="" host="" port="" dbname=""
  for kv in "${lines[@]}"; do
    case "$kv" in
      USER=*) user="${kv#USER=}" ;;
      PASSWORD=*) password="${kv#PASSWORD=}" ;;
      HOST=*) host="${kv#HOST=}" ;;
      PORT=*) port="${kv#PORT=}" ;;
      DB=*) dbname="${kv#DB=}" ;;
    esac
  done

  local args=(--single-transaction --routines --events --protocol=TCP --host="$host" --port="$port")
  [[ -n "$user" ]] && args+=(--user="$user")
  [[ -n "$password" ]] && args+=(--password="$password")
  args+=("$dbname")

  if ! mysqldump "${args[@]}" > "$out_file"; then
    if [[ "$host" == "localhost" && "$port" != "3306" ]]; then
      echo "[warn] Primary dump connection failed for ${host}:${port}; retrying 127.0.0.1:3306"
      args=(--single-transaction --routines --events --protocol=TCP --host="127.0.0.1" --port="3306")
      [[ -n "$user" ]] && args+=(--user="$user")
      [[ -n "$password" ]] && args+=(--password="$password")
      args+=("$dbname")
      mysqldump "${args[@]}" > "$out_file"
      return
    fi
    return 1
  fi
}

run_mysql_import() {
  local db_url="$1"
  local in_file="$2"

  local lines
  mapfile -t lines < <(parse_mysql_url "$db_url")

  local user="" password="" host="" port="" dbname=""
  for kv in "${lines[@]}"; do
    case "$kv" in
      USER=*) user="${kv#USER=}" ;;
      PASSWORD=*) password="${kv#PASSWORD=}" ;;
      HOST=*) host="${kv#HOST=}" ;;
      PORT=*) port="${kv#PORT=}" ;;
      DB=*) dbname="${kv#DB=}" ;;
    esac
  done

  local args=(--protocol=TCP --host="$host" --port="$port")
  [[ -n "$user" ]] && args+=(--user="$user")
  [[ -n "$password" ]] && args+=(--password="$password")
  args+=("$dbname")

  if ! mysql "${args[@]}" < "$in_file"; then
    if [[ "$host" == "localhost" && "$port" != "3306" ]]; then
      echo "[warn] Primary import connection failed for ${host}:${port}; retrying 127.0.0.1:3306"
      args=(--protocol=TCP --host="127.0.0.1" --port="3306")
      [[ -n "$user" ]] && args+=(--user="$user")
      [[ -n "$password" ]] && args+=(--password="$password")
      args+=("$dbname")
      mysql "${args[@]}" < "$in_file"
      return
    fi
    return 1
  fi
}

export_bundle() {
  local out_file="$1"
  local tmp_dir
  tmp_dir="$(mktemp -d)"
  mkdir -p "$tmp_dir/config"

  [[ -n "${CORE_DATABASE_URL:-}" ]] || { echo "CORE_DATABASE_URL is not set"; exit 1; }
  [[ -n "${NODE_DATABASE_URL:-}" ]] || { echo "NODE_DATABASE_URL is not set"; exit 1; }

  echo "Exporting core database..."
  run_mysqldump "$CORE_DATABASE_URL" "$tmp_dir/core.sql"

  echo "Exporting node database..."
  run_mysqldump "$NODE_DATABASE_URL" "$tmp_dir/node.sql"

  [[ -f "$BACKEND_ENV" ]] && cp "$BACKEND_ENV" "$tmp_dir/config/backend.env"
  [[ -f "$NODE_ENV" ]] && cp "$NODE_ENV" "$tmp_dir/config/server-node.env"
  [[ -f "$ROOT_DIR/frontend/.env" ]] && cp "$ROOT_DIR/frontend/.env" "$tmp_dir/config/frontend.env"

  cat > "$tmp_dir/manifest.json" <<JSON
{
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "version": 1,
  "project": "OpenCom"
}
JSON

  mkdir -p "$(dirname "$out_file")"
  tar -czf "$out_file" -C "$tmp_dir" .
  rm -rf "$tmp_dir"
  echo "Backup exported to $out_file"
}

import_bundle() {
  local in_file="$1"
  [[ -f "$in_file" ]] || { echo "Backup file not found: $in_file"; exit 1; }
  [[ -n "${CORE_DATABASE_URL:-}" ]] || { echo "CORE_DATABASE_URL is not set"; exit 1; }
  [[ -n "${NODE_DATABASE_URL:-}" ]] || { echo "NODE_DATABASE_URL is not set"; exit 1; }

  local tmp_dir
  tmp_dir="$(mktemp -d)"
  tar -xzf "$in_file" -C "$tmp_dir"

  [[ -f "$tmp_dir/core.sql" ]] || { echo "core.sql missing from bundle"; exit 1; }
  [[ -f "$tmp_dir/node.sql" ]] || { echo "node.sql missing from bundle"; exit 1; }

  echo "Importing core database..."
  run_mysql_import "$CORE_DATABASE_URL" "$tmp_dir/core.sql"

  echo "Importing node database..."
  run_mysql_import "$NODE_DATABASE_URL" "$tmp_dir/node.sql"

  if [[ -f "$tmp_dir/config/backend.env" ]]; then cp "$tmp_dir/config/backend.env" "$BACKEND_ENV"; fi
  if [[ -f "$tmp_dir/config/server-node.env" ]]; then cp "$tmp_dir/config/server-node.env" "$NODE_ENV"; fi
  if [[ -f "$tmp_dir/config/frontend.env" ]]; then cp "$tmp_dir/config/frontend.env" "$ROOT_DIR/frontend/.env"; fi

  rm -rf "$tmp_dir"
  echo "Import completed from $in_file"
}

main() {
  if [[ $# -lt 2 ]]; then
    echo "Usage: $0 export <backup.tar.gz> | import <backup.tar.gz>"
    exit 1
  fi

  local mode="$1"
  local file="$2"

  load_env
  require_tools

  case "$mode" in
    export) export_bundle "$file" ;;
    import) import_bundle "$file" ;;
    *)
      echo "Unknown mode: $mode"
      echo "Usage: $0 export <backup.tar.gz> | import <backup.tar.gz>"
      exit 1
      ;;
  esac
}

main "$@"
