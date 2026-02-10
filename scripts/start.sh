#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-all}"

print_usage() {
  cat <<USAGE
Usage: ./scripts/start.sh [core|node|frontend|backend|all]

Starts one or more OpenCom services for local development.
USAGE
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
  pushd "$ROOT_DIR/frontend" >/dev/null
  npm run dev -- --host 0.0.0.0
}

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
    pushd "$ROOT_DIR/backend" >/dev/null
    npm run dev:core &
    CORE_PID=$!
    npm run dev:node &
    NODE_PID=$!
    popd >/dev/null

    pushd "$ROOT_DIR/frontend" >/dev/null
    npm run dev -- --host 0.0.0.0 &
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
