#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"

print_usage() {
  cat <<USAGE
Usage: ./scripts/setup-database.sh [--with-docker]

Configures backend database schema by running all core and server-node migrations.

Options:
  --with-docker   Start backend Docker infrastructure before migrations.
  -h, --help      Show this help message.
USAGE
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[ERROR] Missing required command: $1"
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

start_docker_if_requested() {
  local with_docker="$1"

  if [[ "$with_docker" != "true" ]]; then
    return
  fi

  if ! COMPOSE_CMD="$(pick_compose)"; then
    echo "[ERROR] --with-docker was provided, but Docker Compose is not available."
    exit 1
  fi

  echo "[db-setup] Starting backend infrastructure with ${COMPOSE_CMD}"
  pushd "$BACKEND_DIR" >/dev/null
  # shellcheck disable=SC2086
  ${COMPOSE_CMD} up -d
  popd >/dev/null
}

main() {
  local with_docker="false"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --with-docker)
        with_docker="true"
        shift
        ;;
      -h|--help|help)
        print_usage
        exit 0
        ;;
      *)
        echo "Unknown option: $1"
        print_usage
        exit 1
        ;;
    esac
  done

  require_cmd npm

  if [[ ! -d "$BACKEND_DIR" ]]; then
    echo "[ERROR] Backend directory not found at $BACKEND_DIR"
    exit 1
  fi

  if [[ ! -f "$BACKEND_DIR/.env" ]]; then
    echo "[warn] backend/.env is missing. Copy backend/.env.example to backend/.env and set required values."
  fi

  start_docker_if_requested "$with_docker"

  echo "[db-setup] Running database migrations"
  pushd "$BACKEND_DIR" >/dev/null
  npm run migrate:core
  npm run migrate:node
  popd >/dev/null

  echo "[db-setup] Database setup complete"
}

main "$@"
