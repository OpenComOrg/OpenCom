#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
ENV_SCRIPT="$ROOT_DIR/scripts/init-env.sh"

print_usage() {
  cat <<USAGE
Usage: ./scripts/setup-database.sh [options]

Fully configures backend database schema by optionally generating env files,
optionally provisioning local MariaDB databases/users (via sudo), and running all
core + server-node migrations.

Options:
  --init-env                Generate backend/.env + frontend/.env before setup.
  --with-docker             Start backend docker compose infrastructure first.
  --provision-local-db      Create databases/users from .env DB URLs using sudo mysql.
  --mariadb-root-user=USER  MariaDB admin user for provisioning (default: root).
  -h, --help                Show this help message.

Examples:
  ./scripts/setup-database.sh --init-env --with-docker
  ./scripts/setup-database.sh --init-env --provision-local-db
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

init_env_if_requested() {
  local init_env="$1"

  if [[ "$init_env" != "true" ]]; then
    return
  fi

  if [[ ! -x "$ENV_SCRIPT" ]]; then
    echo "[ERROR] Env generator script not found or not executable: $ENV_SCRIPT"
    exit 1
  fi

  echo "[db-setup] Generating env files"
  "$ENV_SCRIPT"
}

load_backend_env() {
  local env_file="$BACKEND_DIR/.env"

  if [[ ! -f "$env_file" ]]; then
    echo "[ERROR] backend/.env not found. Run ./scripts/init-env.sh first, or use --init-env."
    exit 1
  fi

  echo "[db-setup] Loading backend/.env"
  set -a
  # shellcheck disable=SC1090
  source "$env_file"
  set +a
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

provision_local_db_if_requested() {
  local provision_local_db="$1"
  local mariadb_root_user="$2"

  if [[ "$provision_local_db" != "true" ]]; then
    return
  fi

  require_cmd node
  require_cmd sudo
  require_cmd mysql

  if [[ -z "${CORE_DATABASE_URL:-}" || -z "${NODE_DATABASE_URL:-}" ]]; then
    echo "[ERROR] CORE_DATABASE_URL and NODE_DATABASE_URL must be set in backend/.env"
    exit 1
  fi

  echo "[db-setup] Provisioning local MariaDB databases/users from backend/.env (using sudo)"

  local sql
  sql="$(
    CORE_DATABASE_URL="$CORE_DATABASE_URL" \
    NODE_DATABASE_URL="$NODE_DATABASE_URL" \
    node <<'NODE'
const urls = [
  process.env.CORE_DATABASE_URL,
  process.env.NODE_DATABASE_URL
].filter(Boolean);

if (!urls.length) {
  console.error("No database URLs provided.");
  process.exit(1);
}

const statements = [];
for (const raw of urls) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    console.error(`Invalid database URL: ${raw}`);
    process.exit(1);
  }

  if (u.protocol !== "mysql:") {
    console.error(`Only mysql:// URLs are supported for provisioning. Got: ${raw}`);
    process.exit(1);
  }

  const dbName = decodeURIComponent(u.pathname.replace(/^\//, ""));
  const user = decodeURIComponent(u.username || "");
  const pass = decodeURIComponent(u.password || "");

  if (!dbName || !user) {
    console.error(`Database name and username are required in URL: ${raw}`);
    process.exit(1);
  }

  const esc = (s) => s.replace(/'/g, "''");
  statements.push(`CREATE DATABASE IF NOT EXISTS \`${dbName.replace(/`/g, "``")}\`;`);
  statements.push(`CREATE USER IF NOT EXISTS '${esc(user)}'@'localhost' IDENTIFIED BY '${esc(pass)}';`);
  statements.push(`GRANT ALL PRIVILEGES ON \`${dbName.replace(/`/g, "``")}\`.* TO '${esc(user)}'@'localhost';`);
}
statements.push("FLUSH PRIVILEGES;");
process.stdout.write(statements.join("\n") + "\n");
NODE
  )"

  printf '%s\n' "$sql" | sudo mysql -u "$mariadb_root_user"
}

run_migrations() {
  echo "[db-setup] Running database migrations"
  pushd "$BACKEND_DIR" >/dev/null
  npm run migrate:core
  npm run migrate:node
  popd >/dev/null
  echo "[db-setup] Database setup complete"
}

main() {
  local with_docker="false"
  local init_env="false"
  local provision_local_db="false"
  local mariadb_root_user="root"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --with-docker)
        with_docker="true"
        shift
        ;;
      --init-env)
        init_env="true"
        shift
        ;;
      --provision-local-db)
        provision_local_db="true"
        shift
        ;;
      --mariadb-root-user=*)
        mariadb_root_user="${1#*=}"
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

  init_env_if_requested "$init_env"
  load_backend_env
  start_docker_if_requested "$with_docker"
  provision_local_db_if_requested "$provision_local_db" "$mariadb_root_user"
  run_migrations
}

main "$@"
