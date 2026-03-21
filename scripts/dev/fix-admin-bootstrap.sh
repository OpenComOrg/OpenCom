#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND_ENV="$ROOT_DIR/backend/.env"

ANNOUNCED_ADDRESS=""
SKIP_PRIVATE_CALLS=0
SKIP_ADMIN_CREATE=0
ADMIN_CREATE_ARGS=()

print_usage() {
  cat <<'USAGE'
Usage: ./scripts/dev/fix-admin-bootstrap.sh [options] [-- admin-create-args]

Fixes common local admin bootstrap issues:
  - Loads backend/.env into the current shell before running admin:create
  - Optionally sets MEDIASOUP_ANNOUNCED_ADDRESS
  - Optionally bootstraps PRIVATE_CALLS_GUILD_ID if missing

Options:
  --announced-address=<host>  Force MEDIASOUP_ANNOUNCED_ADDRESS in backend/.env
  --skip-private-calls        Skip PRIVATE_CALLS_GUILD_ID bootstrap
  --skip-admin-create         Only apply env fixes; do not run admin:create
  -h, --help                  Show this help

Examples:
  ./scripts/dev/fix-admin-bootstrap.sh
  ./scripts/dev/fix-admin-bootstrap.sh --announced-address=203.0.113.20
  ./scripts/dev/fix-admin-bootstrap.sh -- --email=owner@example.com --username=owner --role=owner
USAGE
}

load_backend_env() {
  set -a
  # shellcheck disable=SC1090
  source "$BACKEND_ENV"
  set +a
}

upsert_env_value() {
  local key="$1"
  local value="$2"
  local escaped
  escaped="$(printf '%s' "$value" | sed -e 's/[\/&]/\\&/g')"

  if grep -qE "^${key}=" "$BACKEND_ENV"; then
    sed -i "s/^${key}=.*/${key}=${escaped}/" "$BACKEND_ENV"
  else
    printf '\n%s=%s\n' "$key" "$value" >> "$BACKEND_ENV"
  fi
}

normalize_host() {
  local host="${1:-}"
  host="${host#[}"
  host="${host%]}"
  printf '%s' "${host,,}"
}

is_local_host() {
  local host
  host="$(normalize_host "${1:-}")"

  [[ -z "$host" \
    || "$host" == "localhost" \
    || "$host" == "::1" \
    || "$host" == "0:0:0:0:0:0:0:1" \
    || "$host" == "0.0.0.0" \
    || "$host" == "::" \
    || "$host" == 127.* ]]
}

url_host() {
  local raw="${1:-}"
  if [[ -z "$raw" ]]; then
    return
  fi

  node -e 'try { console.log(new URL(process.argv[1]).hostname || ""); } catch { process.exit(0); }' "$raw" 2>/dev/null || true
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --announced-address=*)
      ANNOUNCED_ADDRESS="${1#*=}"
      shift
      ;;
    --skip-private-calls)
      SKIP_PRIVATE_CALLS=1
      shift
      ;;
    --skip-admin-create)
      SKIP_ADMIN_CREATE=1
      shift
      ;;
    -h|--help|help)
      print_usage
      exit 0
      ;;
    --)
      shift
      while [[ $# -gt 0 ]]; do
        ADMIN_CREATE_ARGS+=("$1")
        shift
      done
      ;;
    *)
      ADMIN_CREATE_ARGS+=("$1")
      shift
      ;;
  esac
done

if [[ ! -f "$BACKEND_ENV" ]]; then
  echo "[admin-fix] backend/.env is missing. Generating defaults first."
  "$ROOT_DIR/scripts/dev/init-env.sh"
fi

load_backend_env

if [[ -n "$ANNOUNCED_ADDRESS" ]]; then
  upsert_env_value "MEDIASOUP_ANNOUNCED_ADDRESS" "$ANNOUNCED_ADDRESS"
  load_backend_env
  echo "[admin-fix] Set MEDIASOUP_ANNOUNCED_ADDRESS=$ANNOUNCED_ADDRESS"
elif [[ -z "${MEDIASOUP_ANNOUNCED_ADDRESS:-}" ]]; then
  inferred_host="$(url_host "${PUBLIC_BASE_URL:-}")"
  if [[ -n "$inferred_host" ]] && ! is_local_host "$inferred_host"; then
    upsert_env_value "MEDIASOUP_ANNOUNCED_ADDRESS" "$inferred_host"
    load_backend_env
    echo "[admin-fix] Inferred MEDIASOUP_ANNOUNCED_ADDRESS=$inferred_host from PUBLIC_BASE_URL"
  else
    echo "[admin-fix] MEDIASOUP_ANNOUNCED_ADDRESS remains unset (safe for local-only voice)."
  fi
fi

if [[ "$SKIP_PRIVATE_CALLS" -eq 0 ]] && [[ -z "${PRIVATE_CALLS_GUILD_ID:-}" ]]; then
  echo "[admin-fix] PRIVATE_CALLS_GUILD_ID is empty. Trying bootstrap script..."
  if (cd "$ROOT_DIR" && ENV_FILE=backend/.env node scripts/create-private-calls-guild.mjs); then
    load_backend_env
    echo "[admin-fix] PRIVATE_CALLS_GUILD_ID configured."
  else
    echo "[admin-fix] Could not auto-create PRIVATE_CALLS_GUILD_ID (core/node must be running)."
    echo "[admin-fix] You can rerun later or run: ENV_FILE=backend/.env node scripts/create-private-calls-guild.mjs"
  fi
fi

required_vars=(
  CORE_DATABASE_URL
  CORE_JWT_ACCESS_SECRET
  CORE_JWT_REFRESH_SECRET
  CORE_MEMBERSHIP_PRIVATE_JWK
  CORE_MEMBERSHIP_PUBLIC_JWK
  CORE_ISSUER
  ADMIN_PANEL_PASSWORD
  REDIS_URL
)

missing_vars=()
for key in "${required_vars[@]}"; do
  if [[ -z "${!key:-}" ]]; then
    missing_vars+=("$key")
  fi
done

if [[ "${#missing_vars[@]}" -gt 0 ]]; then
  echo "[admin-fix] Missing required backend env keys:"
  for key in "${missing_vars[@]}"; do
    echo "  - $key"
  done
  echo "[admin-fix] Recreate env with: ./scripts/dev/init-env.sh"
  exit 1
fi

if [[ "$SKIP_ADMIN_CREATE" -eq 1 ]]; then
  echo "[admin-fix] Env checks complete. Skipping admin:create."
  exit 0
fi

echo "[admin-fix] Running admin:create with backend/.env loaded..."
if [[ "${#ADMIN_CREATE_ARGS[@]}" -gt 0 ]]; then
  (cd "$ROOT_DIR/backend" && npm run admin:create -- "${ADMIN_CREATE_ARGS[@]}")
else
  (cd "$ROOT_DIR/backend" && npm run admin:create)
fi

echo "[admin-fix] Done."
