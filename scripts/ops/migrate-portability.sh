#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND_ENV="$ROOT_DIR/backend/.env"
NODE_ENV="$ROOT_DIR/backend/packages/server-node/.env"

DB_URL_USER=""
DB_URL_PASSWORD=""
DB_URL_HOST=""
DB_URL_PORT=""
DB_URL_NAME=""
TMP_DIRS=()

cleanup_tmp_dirs() {
  local dir
  for dir in "${TMP_DIRS[@]}"; do
    [[ -d "$dir" ]] && rm -rf "$dir"
  done
}
trap cleanup_tmp_dirs EXIT

register_tmp_dir() {
  TMP_DIRS+=("$1")
}

load_env_file() {
  local env_file="$1"
  [[ -f "$env_file" ]] || return 0
  set -a
  # shellcheck source=/dev/null
  source "$env_file"
  set +a
}

load_env() {
  load_env_file "$BACKEND_ENV"
  load_env_file "$NODE_ENV"
}

load_env_from_bundle() {
  local bundle_dir="$1"
  load_env_file "$bundle_dir/config/backend.env"
  load_env_file "$bundle_dir/config/server-node.env"
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

parse_mysql_url_to_globals() {
  local db_url="$1"
  local lines kv
  mapfile -t lines < <(parse_mysql_url "$db_url")

  DB_URL_USER=""
  DB_URL_PASSWORD=""
  DB_URL_HOST=""
  DB_URL_PORT=""
  DB_URL_NAME=""

  for kv in "${lines[@]}"; do
    case "$kv" in
      USER=*) DB_URL_USER="${kv#USER=}" ;;
      PASSWORD=*) DB_URL_PASSWORD="${kv#PASSWORD=}" ;;
      HOST=*) DB_URL_HOST="${kv#HOST=}" ;;
      PORT=*) DB_URL_PORT="${kv#PORT=}" ;;
      DB=*) DB_URL_NAME="${kv#DB=}" ;;
    esac
  done
}

sanitize_filename() {
  local input="$1"
  local lowered="${input,,}"
  # shellcheck disable=SC2001
  echo "$lowered" | sed 's/[^a-z0-9._-]/_/g'
}

escape_mysql_identifier() {
  local input="$1"
  printf '%s' "${input//\`/\`\`}"
}

collect_database_vars() {
  local var_name value env_file
  local found=0
  declare -A seen_vars=()

  for env_file in "$BACKEND_ENV" "$NODE_ENV"; do
    [[ -f "$env_file" ]] || continue
    while IFS= read -r var_name; do
      [[ -n "$var_name" ]] || continue
      [[ -n "${seen_vars[$var_name]:-}" ]] && continue
      seen_vars["$var_name"]=1

      if [[ "$var_name" == *_DATABASE_URL || "$var_name" == DATABASE_URL ]]; then
        value="${!var_name:-}"
        [[ -z "$value" ]] && continue
        case "$value" in
          mysql://*|mariadb://*)
            echo "$var_name"
            found=1
            ;;
        esac
      fi
    done < <(sed -nE 's/^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)=.*/\1/p' "$env_file")
  done

  # Fallback: if env files are absent or had no DB URLs, inspect current shell env.
  if [[ "$found" -eq 0 ]]; then
    while IFS= read -r var_name; do
      [[ -n "${seen_vars[$var_name]:-}" ]] && continue
      seen_vars["$var_name"]=1

      if [[ "$var_name" == *_DATABASE_URL || "$var_name" == DATABASE_URL ]]; then
        value="${!var_name:-}"
        [[ -z "$value" ]] && continue
        case "$value" in
          mysql://*|mariadb://*)
            echo "$var_name"
            found=1
            ;;
        esac
      fi
    done < <(compgen -v | LC_ALL=C sort)
  fi

  [[ "$found" -eq 1 ]]
}

run_mysqldump() {
  local db_url="$1"
  local out_file="$2"

  parse_mysql_url_to_globals "$db_url"

  local args=(
    --protocol=TCP
    --host="$DB_URL_HOST"
    --port="$DB_URL_PORT"
    --single-transaction
    --quick
    --routines
    --events
    --triggers
    --default-character-set=utf8mb4
  )
  [[ -n "$DB_URL_USER" ]] && args+=(--user="$DB_URL_USER")
  [[ -n "$DB_URL_PASSWORD" ]] && args+=(--password="$DB_URL_PASSWORD")
  args+=("$DB_URL_NAME")

  mysqldump "${args[@]}" > "$out_file"
}

run_mysql_import() {
  local db_url="$1"
  local in_file="$2"

  parse_mysql_url_to_globals "$db_url"

  local args=(
    --protocol=TCP
    --host="$DB_URL_HOST"
    --port="$DB_URL_PORT"
  )
  [[ -n "$DB_URL_USER" ]] && args+=(--user="$DB_URL_USER")
  [[ -n "$DB_URL_PASSWORD" ]] && args+=(--password="$DB_URL_PASSWORD")
  args+=("$DB_URL_NAME")

  # Keep import collation consistent with current migrations.
  sed \
    -e 's/DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci/DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci/g' \
    -e 's/CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci/CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci/g' \
    "$in_file" | mysql "${args[@]}"
}

drop_and_recreate_database() {
  local db_url="$1"
  parse_mysql_url_to_globals "$db_url"

  local args=(
    --protocol=TCP
    --host="$DB_URL_HOST"
    --port="$DB_URL_PORT"
  )
  [[ -n "$DB_URL_USER" ]] && args+=(--user="$DB_URL_USER")
  [[ -n "$DB_URL_PASSWORD" ]] && args+=(--password="$DB_URL_PASSWORD")

  local escaped_db
  escaped_db="$(escape_mysql_identifier "$DB_URL_NAME")"

  mysql "${args[@]}" <<SQL
DROP DATABASE IF EXISTS \`${escaped_db}\`;
CREATE DATABASE \`${escaped_db}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci;
SQL
}

write_manifest() {
  local tmp_dir="$1"
  local index_file="$tmp_dir/databases/index.tsv"
  local manifest_file="$tmp_dir/manifest.json"

  python3 - "$index_file" "$manifest_file" <<'PY'
import datetime
import json
import pathlib
import sys

index_path = pathlib.Path(sys.argv[1])
manifest_path = pathlib.Path(sys.argv[2])

db_entries = []
for raw in index_path.read_text(encoding="utf-8").splitlines():
    if not raw.strip():
        continue
    env_var, dump_file, db_name = raw.split("\t")
    db_entries.append(
        {"envVar": env_var, "dumpFile": dump_file, "database": db_name}
    )

manifest = {
    "createdAt": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "version": 2,
    "project": "OpenCom",
    "databases": db_entries,
}

manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
PY
}

export_bundle() {
  local out_file="$1"
  local tmp_dir
  tmp_dir="$(mktemp -d)"
  register_tmp_dir "$tmp_dir"

  mkdir -p "$tmp_dir/config" "$tmp_dir/databases"

  local db_vars=()
  if ! mapfile -t db_vars < <(collect_database_vars); then
    echo "No MySQL/MariaDB *_DATABASE_URL values were found in loaded env files."
    exit 1
  fi

  declare -A seen_urls=()
  declare -A used_files=()
  local var_name db_url file_base file_rel output_path dedupe_key

  for var_name in "${db_vars[@]}"; do
    db_url="${!var_name:-}"
    [[ -n "$db_url" ]] || continue

    # Prevent duplicate dumps when multiple env vars point to the same DB URL.
    dedupe_key="$db_url"
    if [[ -n "${seen_urls[$dedupe_key]:-}" ]]; then
      echo "Skipping duplicate database URL in $var_name (already exported via ${seen_urls[$dedupe_key]})."
      continue
    fi

    parse_mysql_url_to_globals "$db_url"
    file_base="$(sanitize_filename "$var_name")"
    file_rel="databases/${file_base}.sql"

    if [[ -n "${used_files[$file_rel]:-}" ]]; then
      file_rel="databases/${file_base}_${DB_URL_NAME}.sql"
    fi

    output_path="$tmp_dir/$file_rel"
    echo "Exporting $var_name ($DB_URL_NAME) ..."
    run_mysqldump "$db_url" "$output_path"
    printf '%s\t%s\t%s\n' "$var_name" "$file_rel" "$DB_URL_NAME" >> "$tmp_dir/databases/index.tsv"

    seen_urls["$dedupe_key"]="$var_name"
    used_files["$file_rel"]=1
  done

  [[ -s "$tmp_dir/databases/index.tsv" ]] || { echo "No database dumps were generated."; exit 1; }

  [[ -f "$BACKEND_ENV" ]] && cp "$BACKEND_ENV" "$tmp_dir/config/backend.env"
  [[ -f "$NODE_ENV" ]] && cp "$NODE_ENV" "$tmp_dir/config/server-node.env"
  [[ -f "$ROOT_DIR/frontend/.env" ]] && cp "$ROOT_DIR/frontend/.env" "$tmp_dir/config/frontend.env"

  write_manifest "$tmp_dir"

  mkdir -p "$(dirname "$out_file")"
  tar -czf "$out_file" -C "$tmp_dir" .
  echo "Backup exported to $out_file"
}

restore_env_files() {
  local tmp_dir="$1"
  [[ -f "$tmp_dir/config/backend.env" ]] && cp "$tmp_dir/config/backend.env" "$BACKEND_ENV"
  [[ -f "$tmp_dir/config/server-node.env" ]] && cp "$tmp_dir/config/server-node.env" "$NODE_ENV"
  [[ -f "$tmp_dir/config/frontend.env" ]] && cp "$tmp_dir/config/frontend.env" "$ROOT_DIR/frontend/.env"
}

import_index_bundle() {
  local tmp_dir="$1"
  local index_file="$tmp_dir/databases/index.tsv"
  [[ -s "$index_file" ]] || { echo "databases/index.tsv missing from bundle"; exit 1; }

  load_env_from_bundle "$tmp_dir"

  local var_name dump_file _db_name db_url dump_path
  while IFS=$'\t' read -r var_name dump_file _db_name; do
    [[ -n "${var_name:-}" ]] || continue
    db_url="${!var_name:-}"
    [[ -n "$db_url" ]] || { echo "$var_name is not set for import"; exit 1; }

    dump_path="$tmp_dir/$dump_file"
    [[ -f "$dump_path" ]] || { echo "Dump file missing from bundle: $dump_file"; exit 1; }

    parse_mysql_url_to_globals "$db_url"
    echo "Dropping and recreating database for $var_name ($DB_URL_NAME) ..."
    drop_and_recreate_database "$db_url"

    echo "Importing $var_name ($DB_URL_NAME) ..."
    run_mysql_import "$db_url" "$dump_path"
  done < "$index_file"
}

import_legacy_bundle() {
  local tmp_dir="$1"
  load_env_from_bundle "$tmp_dir"

  [[ -n "${CORE_DATABASE_URL:-}" ]] || { echo "CORE_DATABASE_URL is not set"; exit 1; }
  [[ -n "${NODE_DATABASE_URL:-}" ]] || { echo "NODE_DATABASE_URL is not set"; exit 1; }
  [[ -f "$tmp_dir/core.sql" ]] || { echo "core.sql missing from bundle"; exit 1; }
  [[ -f "$tmp_dir/node.sql" ]] || { echo "node.sql missing from bundle"; exit 1; }

  echo "Dropping and recreating core database ..."
  drop_and_recreate_database "$CORE_DATABASE_URL"
  echo "Dropping and recreating node database ..."
  drop_and_recreate_database "$NODE_DATABASE_URL"

  echo "Importing core database ..."
  run_mysql_import "$CORE_DATABASE_URL" "$tmp_dir/core.sql"
  echo "Importing node database ..."
  run_mysql_import "$NODE_DATABASE_URL" "$tmp_dir/node.sql"
}

import_bundle() {
  local in_file="$1"
  [[ -f "$in_file" ]] || { echo "Backup file not found: $in_file"; exit 1; }

  local tmp_dir
  tmp_dir="$(mktemp -d)"
  register_tmp_dir "$tmp_dir"
  tar -xzf "$in_file" -C "$tmp_dir"

  if [[ -f "$tmp_dir/databases/index.tsv" ]]; then
    import_index_bundle "$tmp_dir"
  else
    import_legacy_bundle "$tmp_dir"
  fi

  restore_env_files "$tmp_dir"
  echo "Import completed from $in_file"
}

print_usage() {
  cat <<'USAGE'
Usage: ./scripts/ops/migrate-portability.sh export <backup.tar.gz>
   or: ./scripts/ops/migrate-portability.sh import <backup.tar.gz> --force

Export/imports all loaded MySQL/MariaDB DATABASE_URL variables:
- backend/.env
- backend/packages/server-node/.env

Warning: `import` drops and recreates every configured database before restoring.
USAGE
}

main() {
  if [[ $# -lt 1 ]]; then
    print_usage
    exit 1
  fi

  local mode="$1"
  shift

  local file=""
  local force_import=0

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --force)
        force_import=1
        ;;
      -h|--help|help)
        print_usage
        exit 0
        ;;
      -*)
        echo "Unknown option: $1"
        print_usage
        exit 1
        ;;
      *)
        if [[ -z "$file" ]]; then
          file="$1"
        else
          echo "Unexpected argument: $1"
          print_usage
          exit 1
        fi
        ;;
    esac
    shift
  done

  case "$mode" in
    -h|--help|help)
      print_usage
      ;;
    export|import)
      [[ -n "$file" ]] || { print_usage; exit 1; }
      load_env
      require_tools
      if [[ "$mode" == "export" ]]; then
        export_bundle "$file"
      else
        if [[ "$force_import" -ne 1 ]]; then
          echo "Refusing to import without --force because this operation drops and recreates the configured databases."
          exit 1
        fi
        import_bundle "$file"
      fi
      ;;
    *)
      echo "Unknown mode: $mode"
      print_usage
      exit 1
      ;;
  esac
}

main "$@"
