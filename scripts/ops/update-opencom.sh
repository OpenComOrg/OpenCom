#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DO_PULL=0
DO_BACKUP=0
SKIP_BUILD=0

COMPOSE_CMD=()

print_usage() {
  cat <<'USAGE'
Usage: ./scripts/ops/update-opencom.sh [--pull] [--backup] [--skip-build]

Docker rolling update flow:
  1) optionally pull latest code
  2) optionally create portability backup
  3) ensure infrastructure services are up
  4) build app images (unless --skip-build)
  5) run migrations in containers
  6) restart core -> node -> frontend with health checks
USAGE
}

pick_compose() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD=(docker compose)
    return 0
  fi
  if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD=(docker-compose)
    return 0
  fi
  echo "[ERROR] Docker Compose is required (neither 'docker compose' nor 'docker-compose' found)."
  exit 1
}

run_compose() {
  "${COMPOSE_CMD[@]}" "$@"
}

require_file() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    echo "[ERROR] Required file missing: $file"
    exit 1
  fi
}

wait_for_service() {
  local service="$1"
  local timeout="${2:-180}"
  local deadline=$((SECONDS + timeout))
  local container_id status

  container_id="$(run_compose ps -q "$service" | head -n 1)"
  if [[ -z "$container_id" ]]; then
    echo "[ERROR] Could not find container id for service '$service'"
    exit 1
  fi

  while (( SECONDS < deadline )); do
    status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id" 2>/dev/null || true)"
    case "$status" in
      healthy|running)
        echo "[ok] $service is $status"
        return 0
        ;;
      unhealthy|exited|dead)
        echo "[ERROR] $service is $status"
        run_compose logs --tail 80 "$service" || true
        exit 1
        ;;
    esac
    sleep 2
  done

  echo "[ERROR] Timed out waiting for $service to become healthy/running"
  run_compose logs --tail 80 "$service" || true
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --pull) DO_PULL=1 ;;
    --backup) DO_BACKUP=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
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
  shift
done

pick_compose

require_file "$ROOT_DIR/docker-compose.yml"
require_file "$ROOT_DIR/backend/.env"
require_file "$ROOT_DIR/backend/.env.docker"
require_file "$ROOT_DIR/frontend/.env"
require_file "$ROOT_DIR/frontend/.env.docker"

if [[ $DO_PULL -eq 1 ]]; then
  echo "Pulling latest code..."
  git -C "$ROOT_DIR" pull --rebase
fi

if [[ $DO_BACKUP -eq 1 ]]; then
  backup_path="$ROOT_DIR/backups/opencom-$(date +%Y%m%d-%H%M%S).tar.gz"
  echo "Creating backup at $backup_path"
  "$ROOT_DIR/scripts/ops/migrate-portability.sh" export "$backup_path"
fi

pushd "$ROOT_DIR" >/dev/null

echo "Starting/ensuring infrastructure services..."
run_compose up -d mariadb-core mariadb-node redis minio
wait_for_service mariadb-core 180
wait_for_service mariadb-node 180
wait_for_service redis 90

if [[ $SKIP_BUILD -eq 0 ]]; then
  echo "Building application images..."
  run_compose build core node frontend
else
  echo "Skipping image builds (--skip-build)."
fi

echo "Running database migrations in containers..."
run_compose run --rm --no-deps core npm run migrate:core
run_compose run --rm --no-deps node npm run migrate:node

echo "Rolling restart: core"
run_compose up -d --no-deps core
wait_for_service core 180

echo "Rolling restart: node"
run_compose up -d --no-deps node
wait_for_service node 180

echo "Rolling restart: frontend"
run_compose up -d --no-deps frontend
wait_for_service frontend 180

echo "Current service status:"
run_compose ps

popd >/dev/null

echo "Update complete."
