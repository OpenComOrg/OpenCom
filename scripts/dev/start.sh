#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TARGET="${1:-all}"

print_usage() {
  cat <<USAGE
Usage: ./scripts/dev/start.sh [core|node|frontend|panel|admin|backend|all]

Starts one or more OpenCom services for local development.
USAGE
}

load_backend_env() {
  local env_file="$ROOT_DIR/backend/.env"
  if [[ ! -f "$env_file" ]]; then
    echo "[warn] backend/.env not found. Run ./scripts/dev/init-env.sh first if services fail due to missing env vars."
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

CORE_PID=""
NODE_PID=""
FE_PID=""
PANEL_PID=""

cleanup() {
  local pids=()
  [[ -n "$CORE_PID" ]] && pids+=("$CORE_PID")
  [[ -n "$NODE_PID" ]] && pids+=("$NODE_PID")
  [[ -n "$FE_PID" ]] && pids+=("$FE_PID")
  [[ -n "$PANEL_PID" ]] && pids+=("$PANEL_PID")
  if ((${#pids[@]})); then
    kill "${pids[@]}" 2>/dev/null || true
  fi
}

wait_for_core_health() {
  if ! command -v curl >/dev/null 2>&1; then
    echo "[warn] curl not found; starting node without waiting for core health."
    return 0
  fi

  local core_base_url="${CORE_BASE_URL:-http://127.0.0.1:3001}"
  local health_url="${core_base_url%/}/health"
  local attempt=0
  local max_attempts=120

  echo "[wait] Waiting for core API at $health_url"
  until curl -fsS --max-time 2 "$health_url" >/dev/null 2>&1; do
    attempt=$((attempt + 1))
    if [[ -n "$CORE_PID" ]] && ! kill -0 "$CORE_PID" 2>/dev/null; then
      echo "[warn] Core process exited before becoming healthy."
      return 0
    fi
    if ((attempt >= max_attempts)); then
      echo "[warn] Core health check timed out; starting node anyway."
      return 0
    fi
    sleep 0.5
  done
  echo "[ready] Core API is responding."
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
  pushd "$ROOT_DIR/frontend" >/dev/null
  npm run dev -- --host 127.0.0.1
}

start_panel() {
  echo "[start] Admin Panel"
  echo "[info] Panel: http://localhost:5175"
  pushd "$ROOT_DIR/panel" >/dev/null
  npm run dev -- --host 127.0.0.1
}

if [[ "$TARGET" != "-h" && "$TARGET" != "--help" && "$TARGET" != "help" ]]; then
  load_backend_env
fi

case "$TARGET" in
  core)
    start_core
    ;;
  node)
    start_node
    ;;
  frontend)
    start_frontend
    ;;
  panel|admin)
    start_panel
    ;;
  backend)
    echo "[start] Launching backend services in parallel"
    pushd "$ROOT_DIR/backend" >/dev/null
    npm run dev:core &
    CORE_PID=$!
    trap cleanup EXIT INT TERM
    wait_for_core_health
    npm run dev:node &
    NODE_PID=$!
    wait
    ;;
  all)
    echo "[start] Launching core + node + frontend + panel in parallel"
    echo "[info] App: http://localhost:5173 (via reverse proxy)"
    echo "[info] Panel: http://localhost:5175"
    pushd "$ROOT_DIR/backend" >/dev/null
    npm run dev:core &
    CORE_PID=$!
    popd >/dev/null

    pushd "$ROOT_DIR/frontend" >/dev/null
    npm run dev -- --host 127.0.0.1 &
    FE_PID=$!
    popd >/dev/null

    pushd "$ROOT_DIR/panel" >/dev/null
    npm run dev -- --host 127.0.0.1 &
    PANEL_PID=$!
    popd >/dev/null

    trap cleanup EXIT INT TERM
    wait_for_core_health

    pushd "$ROOT_DIR/backend" >/dev/null
    npm run dev:node &
    NODE_PID=$!
    popd >/dev/null

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
