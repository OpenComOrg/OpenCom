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
Requires Node.js >=22 for backend tooling.

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

require_node_major() {
  local min_major="$1"
  require_cmd node
  local node_major
  node_major="$(node -p 'Number(process.versions.node.split(".")[0])')"
  if [[ "$node_major" -lt "$min_major" ]]; then
    echo "[ERROR] Node.js >= ${min_major} is required. Current: $(node -v)"
    echo "[hint] Backend dependencies (including mediasoup) require Node 22+ on this project."
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

normalize_db_urls_for_local_mariadb_if_needed() {
  local with_docker="$1"
  local provision_local_db="$2"

  if [[ "$provision_local_db" != "true" || "$with_docker" == "true" ]]; then
    return
  fi

  local result
  result="$(CORE_DATABASE_URL="$CORE_DATABASE_URL" NODE_DATABASE_URL="$NODE_DATABASE_URL" node <<'NODE'
function normalize(raw) {
  const u = new URL(raw);
  const host = u.hostname.toLowerCase();
  const port = u.port || "3306";
  if ((host === "localhost" || host === "127.0.0.1") && (port === "3307" || port === "3308")) {
    u.hostname = "127.0.0.1";
    u.port = "3306";
    return { changed: true, value: u.toString() };
  }
  return { changed: false, value: raw };
}

const core = normalize(process.env.CORE_DATABASE_URL);
const node = normalize(process.env.NODE_DATABASE_URL);
console.log(`CORE=${core.value}`);
console.log(`NODE=${node.value}`);
console.log(`CHANGED=${core.changed || node.changed ? "1" : "0"}`);
NODE
)"

  local core_url="" node_url="" changed="0"
  while IFS='=' read -r key value; do
    case "$key" in
      CORE) core_url="$value" ;;
      NODE) node_url="$value" ;;
      CHANGED) changed="$value" ;;
    esac
  done <<< "$result"

  if [[ "$changed" == "1" ]]; then
    echo "[db-setup] Detected docker-style DB ports (3307/3308) without --with-docker."
    echo "[db-setup] Falling back to local MariaDB defaults on 127.0.0.1:3306 for migrations."
    CORE_DATABASE_URL="$core_url"
    NODE_DATABASE_URL="$node_url"
    export CORE_DATABASE_URL NODE_DATABASE_URL

    local env_file="$BACKEND_DIR/.env"
    if [[ -f "$env_file" ]]; then
      sed -i "s|^CORE_DATABASE_URL=.*$|CORE_DATABASE_URL=$CORE_DATABASE_URL|" "$env_file"
      sed -i "s|^NODE_DATABASE_URL=.*$|NODE_DATABASE_URL=$NODE_DATABASE_URL|" "$env_file"
    fi
  fi
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

ensure_backend_deps() {
  pushd "$BACKEND_DIR" >/dev/null
  if [[ ! -x "node_modules/.bin/tsx" ]]; then
    echo "[db-setup] Installing backend dependencies (tsx not found)"
    npm install
  fi
  popd >/dev/null
}

run_migrations() {
  echo "[db-setup] Running database migrations"
  pushd "$BACKEND_DIR" >/dev/null

  local core_log node_log
  core_log="$(mktemp)"
  node_log="$(mktemp)"

  set +e
  npm run migrate:core >"$core_log" 2>&1
  local core_rc=$?
  npm run migrate:node >"$node_log" 2>&1
  local node_rc=$?
  set -e

  cat "$core_log"
  cat "$node_log"

  if [[ $core_rc -ne 0 || $node_rc -ne 0 ]]; then
    if grep -E "ECONNREFUSED|Can't connect to server on 'localhost'" "$core_log" "$node_log" >/dev/null 2>&1; then
      echo "[db-setup] Hint: database connection was refused."
      echo "[db-setup] - If using local MariaDB, ensure it's running on 127.0.0.1:3306."
      echo "[db-setup] - If using Docker ports 3307/3308, run with --with-docker."
      echo "[db-setup] - Current CORE_DATABASE_URL=$CORE_DATABASE_URL"
      echo "[db-setup] - Current NODE_DATABASE_URL=$NODE_DATABASE_URL"
    fi
    rm -f "$core_log" "$node_log"
    popd >/dev/null
    return 1
  fi

  rm -f "$core_log" "$node_log"
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
  require_node_major 22

  if [[ ! -d "$BACKEND_DIR" ]]; then
    echo "[ERROR] Backend directory not found at $BACKEND_DIR"
    exit 1
  fi

  init_env_if_requested "$init_env"
  load_backend_env
  normalize_db_urls_for_local_mariadb_if_needed "$with_docker" "$provision_local_db"
  start_docker_if_requested "$with_docker"
  provision_local_db_if_requested "$provision_local_db" "$mariadb_root_user"
  ensure_backend_deps
  run_migrations
}

main "$@"
