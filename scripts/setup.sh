#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:-all}"

print_usage() {
  cat <<USAGE
Usage: ./scripts/setup.sh [backend|frontend|all]

Installs dependencies and prepares local development environment.
USAGE
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[ERROR] Missing required command: $1"
    exit 1
  fi
}

setup_backend() {
  echo "[setup] Backend dependencies"
  require_cmd npm
  pushd "$ROOT_DIR/backend" >/dev/null
  npm install
  popd >/dev/null

  if command -v docker >/dev/null 2>&1 && command -v docker compose >/dev/null 2>&1; then
    echo "[setup] Starting backend infrastructure with docker compose"
    pushd "$ROOT_DIR/backend" >/dev/null
    docker compose up -d
    popd >/dev/null
  else
    echo "[warn] Docker compose not found, skipping infrastructure startup"
  fi
}

setup_frontend() {
  echo "[setup] Frontend dependencies"
  require_cmd npm
  pushd "$ROOT_DIR/frontend" >/dev/null
  npm install
  popd >/dev/null
}

case "$MODE" in
  backend)
    setup_backend
    ;;
  frontend)
    setup_frontend
    ;;
  all)
    setup_backend
    setup_frontend
    ;;
  -h|--help|help)
    print_usage
    exit 0
    ;;
  *)
    echo "Unknown mode: $MODE"
    print_usage
    exit 1
    ;;
esac

echo "[setup] Completed"
