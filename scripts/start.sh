#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-all}"

print_usage() {
  cat <<USAGE
Usage: ./scripts/start.sh [core|node|frontend|admin|backend|all]

Starts one or more OpenCom services for local development.
USAGE
}

load_backend_env() {
  local env_file="$ROOT_DIR/backend/.env"
  if [[ ! -f "$env_file" ]]; then
    echo "[warn] backend/.env not found. Run ./scripts/init-env.sh first if services fail due to missing env vars."
    return
  fi

  set -a
  # shellcheck disable=SC1090
  source "$env_file"
  # Configure for reverse proxy (localhost only)
  export CORE_HOST="${CORE_HOST:-127.0.0.1}"
  export NODE_HOST="${NODE_HOST:-0.0.0.0}"
  set +a
}

start_core() {
  echo "[start] Core API"
  pushd "$ROOT_DIR/backend" >/dev/null
  npm run dev:core
}

start_node() {
  echo "[start] Server Node"
  pushd "$ROOT_DIR/backend" >/dev/null
  npm run dev:node
}

start_frontend() {
  echo "[start] Frontend"
  echo "[info] App: http://localhost:5173 (via reverse proxy)"
  echo "[info] Admin dashboard: http://localhost:5173/admin.html (via reverse proxy)"
  pushd "$ROOT_DIR/frontend" >/dev/null
  npm run dev -- --host 127.0.0.1
}

load_backend_env

case "$TARGET" in
  core)
    start_core
    ;;
  node)
    start_node
    ;;
  frontend|admin)
    start_frontend
    ;;
  backend)
    echo "[start] Launching backend services in parallel"
    pushd "$ROOT_DIR/backend" >/dev/null
    npm run dev:core &
    CORE_PID=$!
    npm run dev:node &
    NODE_PID=$!
    trap 'kill $CORE_PID $NODE_PID 2>/dev/null || true' EXIT INT TERM
    wait
    ;;
  all)
    echo "[start] Launching core + node + frontend in parallel"
    echo "[info] App: http://localhost:5173 (via reverse proxy)"
    echo "[info] Admin dashboard: http://localhost:5173/admin.html (via reverse proxy)"
    pushd "$ROOT_DIR/backend" >/dev/null
    npm run dev:core &
    CORE_PID=$!
    npm run dev:node &
    NODE_PID=$!
    popd >/dev/null

    pushd "$ROOT_DIR/frontend" >/dev/null
    npm run dev -- --host 127.0.0.1 &
    FE_PID=$!
    popd >/dev/null

    trap 'kill $CORE_PID $NODE_PID $FE_PID 2>/dev/null || true' EXIT INT TERM
    wait
    ;;
  -h|--help|help)
    print_usage
    ;;
  *)
    echo "Unknown target: $TARGET"
    print_usage
    exit 1
    ;;
esac
