#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:-all}"

print_usage() {
  cat <<USAGE
Usage: ./scripts/setup.sh [backend|frontend|all]

Installs dependencies and prepares local development environment.
Requires Node.js >=22 for backend dependencies.
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
    echo "[hint] OpenCom backend dependencies (e.g. mediasoup) require modern Node runtimes."
    exit 1
  fi
}

# Picks the right compose command:
# - docker compose (Compose v2 plugin)
# - docker-compose (Compose v1 binary)
# Returns 0 if found, 1 otherwise.
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

setup_backend() {
  echo "[setup] Backend dependencies"
  require_cmd npm
  require_node_major 22
  pushd "$ROOT_DIR/backend" >/dev/null
  npm install
  popd >/dev/null

  if COMPOSE_CMD="$(pick_compose)"; then
    echo "[setup] Starting backend infrastructure with ${COMPOSE_CMD}"
    pushd "$ROOT_DIR/backend" >/dev/null
    # shellcheck disable=SC2086
    ${COMPOSE_CMD} up -d
    popd >/dev/null
  else
    echo "[warn] Docker Compose not found (neither 'docker compose' nor 'docker-compose'), skipping infrastructure startup"
  fi
}

setup_frontend() {
  echo "[setup] Frontend dependencies"
  require_cmd npm
  require_node_major 18
  pushd "$ROOT_DIR/frontend" >/dev/null
  npm install
  popd >/dev/null
}

case "$MODE" in
  backend)  setup_backend ;;
  frontend) setup_frontend ;;
  all)      setup_backend; setup_frontend ;;
  -h|--help|help) print_usage; exit 0 ;;
  *)
    echo "Unknown mode: $MODE"
    print_usage
    exit 1
    ;;
esac

echo "[setup] Completed"
