#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND_ENV="$ROOT_DIR/backend/.env"
FRONTEND_ENV="$ROOT_DIR/frontend/.env"
NODE_ENV="$ROOT_DIR/backend/packages/server-node/.env"

MODE="docker"
WITH_MINIO=0
RUN_INSTALL=1
ASSUME_YES=0
MARIADB_ROOT_USER="root"
INIT_ENV_ARGS=()
PRESERVED_KLIPY_API_KEY=""
PRESERVED_KLIPY_API_BASE_URL=""
PRESERVED_KLIPY_CLIENT_KEY=""

print_usage() {
  cat <<'USAGE'
Usage: ./scripts/dev/reconfigure.sh [options] [--init-env-arg=value ...]

Blows away generated local dev config/runtime state, then rebuilds it cleanly.

What it resets:
  - backend/.env
  - frontend/.env
  - backend/packages/server-node/.env (if present)
  - backend runtime state under ./logs, ./storage, ./data
  - Docker compose containers, networks, and named volumes for this repo (docker mode)

Options:
  --yes, -y                 Skip the destructive confirmation prompt
  --skip-install            Skip npm install in backend/frontend
  --with-minio              Recreate optional MinIO when using docker mode
  --local-db                Reconfigure against local MariaDB instead of docker compose
  --mariadb-root-user=USER  MariaDB admin user for --local-db provisioning (default: root)
  -h, --help                Show this help

All other --key=value arguments are forwarded to ./scripts/dev/init-env.sh.

Examples:
  ./scripts/dev/reconfigure.sh --yes
  ./scripts/dev/reconfigure.sh --yes --with-minio
  ./scripts/dev/reconfigure.sh --yes --frontend-url=https://opencom.local --core-url=https://api.opencom.local
  ./scripts/dev/reconfigure.sh --yes --klipy-api-key=your_test_key
  ./scripts/dev/reconfigure.sh --yes --local-db --mariadb-root-user=root
USAGE
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[ERROR] Missing required command: $1"
    exit 1
  fi
}

require_node_major() {
  local min_major="$1"
  require_cmd node
  local node_major
  node_major="$(node -p 'Number(process.versions.node.split(".")[0])')"
  if [[ "$node_major" -lt "$min_major" ]]; then
    echo "[ERROR] Node.js >= ${min_major} is required. Current: $(node -v)"
    exit 1
  fi
}

pick_compose() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    echo "docker compose"
    return 0
  fi

  if command -v docker-compose >/dev/null 2>&1; then
    echo "docker-compose"
    return 0
  fi

  return 1
}

has_init_env_arg() {
  local key="$1"
  local prefix="--${key}="
  local arg
  for arg in "${INIT_ENV_ARGS[@]}"; do
    if [[ "$arg" == "${prefix}"* ]]; then
      return 0
    fi
  done
  return 1
}

append_init_env_default() {
  local key="$1"
  local value="$2"
  if has_init_env_arg "$key"; then
    return
  fi
  INIT_ENV_ARGS+=("--${key}=${value}")
}

read_env_value_from_file() {
  local file="$1"
  local key="$2"
  if [[ ! -f "$file" ]]; then
    return
  fi
  local line
  line="$(rg -m1 "^${key}=" "$file" || true)"
  if [[ -z "$line" ]]; then
    return
  fi
  printf '%s' "${line#*=}"
}

capture_existing_env_defaults() {
  PRESERVED_KLIPY_API_KEY="$(read_env_value_from_file "$BACKEND_ENV" "KLIPY_API_KEY")"
  PRESERVED_KLIPY_API_BASE_URL="$(read_env_value_from_file "$BACKEND_ENV" "KLIPY_API_BASE_URL")"
  PRESERVED_KLIPY_CLIENT_KEY="$(read_env_value_from_file "$BACKEND_ENV" "KLIPY_CLIENT_KEY")"
}

confirm_destructive_action() {
  if [[ "$ASSUME_YES" -eq 1 ]]; then
    return
  fi

  cat <<'MSG'
[reconfigure] This is destructive.
[reconfigure] It removes generated env files, local backend runtime state,
[reconfigure] and docker compose volumes for this repo when using docker mode.
MSG
  printf "[reconfigure] Continue? [y/N] "

  local answer
  read -r answer
  case "${answer,,}" in
    y|yes)
      ;;
    *)
      echo "[reconfigure] Aborted."
      exit 1
      ;;
  esac
}

reset_docker_state() {
  if [[ "$MODE" != "docker" ]]; then
    return
  fi

  local compose_cmd
  if ! compose_cmd="$(pick_compose)"; then
    echo "[ERROR] Docker mode requires docker compose or docker-compose."
    exit 1
  fi

  echo "[reconfigure] Removing docker compose services and volumes"
  pushd "$ROOT_DIR" >/dev/null
  # shellcheck disable=SC2086
  ${compose_cmd} down -v --remove-orphans
  popd >/dev/null
}

reset_local_state() {
  echo "[reconfigure] Removing generated env files and backend runtime state"
  rm -f "$BACKEND_ENV" "$FRONTEND_ENV" "$NODE_ENV"
  rm -rf \
    "$ROOT_DIR/backend/logs" \
    "$ROOT_DIR/backend/storage" \
    "$ROOT_DIR/backend/data" \
    "$ROOT_DIR/backend/packages/server-node/logs"
}

install_dependencies() {
  if [[ "$RUN_INSTALL" -ne 1 ]]; then
    echo "[reconfigure] Skipping npm install"
    return
  fi

  echo "[reconfigure] Installing backend dependencies"
  pushd "$ROOT_DIR/backend" >/dev/null
  npm install
  popd >/dev/null

  echo "[reconfigure] Installing frontend dependencies"
  pushd "$ROOT_DIR/frontend" >/dev/null
  npm install
  popd >/dev/null
}

generate_env_files() {
  echo "[reconfigure] Regenerating env files"

  append_init_env_default "frontend-url" "http://localhost:5173"
  append_init_env_default "core-url" "http://localhost:3001"
  append_init_env_default "official-node-base-url" "http://localhost:3002"
  append_init_env_default "core-gateway-ws-url" "ws://localhost:9443/gateway"
  append_init_env_default "node-gateway-ws-url" "ws://localhost:3002/gateway"
  append_init_env_default "voice-gateway-url" "ws://localhost:3002/gateway"
  append_init_env_default "node-public-url" "http://localhost:3002"
  append_init_env_default "redis-url" "redis://localhost:6379"
  if [[ -n "$PRESERVED_KLIPY_API_KEY" ]]; then
    append_init_env_default "klipy-api-key" "$PRESERVED_KLIPY_API_KEY"
  fi
  if [[ -n "$PRESERVED_KLIPY_API_BASE_URL" ]]; then
    append_init_env_default "klipy-api-base-url" "$PRESERVED_KLIPY_API_BASE_URL"
  fi
  if [[ -n "$PRESERVED_KLIPY_CLIENT_KEY" ]]; then
    append_init_env_default "klipy-client-key" "$PRESERVED_KLIPY_CLIENT_KEY"
  fi

  if [[ "$MODE" == "docker" ]]; then
    append_init_env_default "core-db" "mysql://ods:ods@localhost:3307/ods_core"
    append_init_env_default "node-db" "mysql://ods:ods@localhost:3308/ods_node"
  else
    append_init_env_default "core-db" "mysql://ods:ods@localhost:3306/ods_core"
    append_init_env_default "node-db" "mysql://ods:ods@localhost:3306/ods_node"
  fi

  "$ROOT_DIR/scripts/dev/init-env.sh" "${INIT_ENV_ARGS[@]}"
  node "$ROOT_DIR/scripts/env/add-missing-env.mjs" --backend
}

rebuild_database_state() {
  echo "[reconfigure] Rebuilding database state"

  if [[ "$MODE" == "docker" ]]; then
    local db_args=("--with-docker")
    if [[ "$WITH_MINIO" -eq 1 ]]; then
      db_args+=("--with-minio")
    fi
    "$ROOT_DIR/scripts/dev/setup-database.sh" "${db_args[@]}"
    return
  fi

  "$ROOT_DIR/scripts/dev/setup-database.sh" \
    --provision-local-db \
    "--mariadb-root-user=${MARIADB_ROOT_USER}"
}

main() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --yes|-y)
        ASSUME_YES=1
        shift
        ;;
      --skip-install)
        RUN_INSTALL=0
        shift
        ;;
      --with-minio)
        WITH_MINIO=1
        shift
        ;;
      --local-db)
        MODE="local"
        shift
        ;;
      --mariadb-root-user=*)
        MARIADB_ROOT_USER="${1#*=}"
        shift
        ;;
      -h|--help|help)
        print_usage
        exit 0
        ;;
      --*=*)
        INIT_ENV_ARGS+=("$1")
        shift
        ;;
      *)
        echo "Unknown option: $1"
        print_usage
        exit 1
        ;;
    esac
  done

  require_cmd npm
  require_node_major 22

  confirm_destructive_action
  capture_existing_env_defaults
  reset_docker_state
  reset_local_state
  install_dependencies
  generate_env_files
  rebuild_database_state

  cat <<'DONE'
[reconfigure] Local dev config has been rebuilt.
[reconfigure] Next step:
  ./scripts/dev/start.sh all
DONE
}

main "$@"
