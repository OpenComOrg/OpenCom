#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_ID="${1:-default-server}"

print_usage() {
  cat <<USAGE
Usage: ./scripts/start-server.sh [server-id]

Starts a single OpenCom server instance (Node service).
If no server-id is provided, defaults to 'default-server'.

Examples:
  ./scripts/start-server.sh                    # Start default server
  ./scripts/start-server.sh my-gaming-server   # Start specific server
USAGE
}

load_backend_env() {
  local env_file="$ROOT_DIR/backend/.env"
  if [[ ! -f "$env_file" ]]; then
    echo "[err] backend/.env not found. Run ./scripts/init-env.sh first."
    exit 1
  fi

  set -a
  # shellcheck disable=SC1090
  source "$env_file"
  # Configure for reverse proxy (localhost only)
  export NODE_HOST="${NODE_HOST:-127.0.0.1}"
  export NODE_ID="$SERVER_ID"
  set +a
}

start_server() {
  echo "[start] Server Node: $SERVER_ID"
  pushd "$ROOT_DIR/backend" >/dev/null
  npm run dev:node
}

case "${1:-}" in
  -h|--help|help)
    print_usage
    ;;
  *)
    load_backend_env
    start_server
    ;;
esac
