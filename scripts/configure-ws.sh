#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_ENV="$ROOT_DIR/backend/.env"
FRONTEND_ENV="$ROOT_DIR/frontend/.env"
WS_DOMAIN="ws.opencom.online"
WS_IP=""
WS_PORT="9443"
FORCE_INSECURE="0"
DIRECT_IP="0"
AUTO_FALLBACK_IP="1"
GENERATE_SELF_SIGNED_CERT="0"
CERT_DIR="/etc/opencom/ws-certs"
CERT_DAYS="365"
FORCE_CERT_OVERWRITE="0"
GENERATE_LETSENCRYPT_CERT="0"
LETSENCRYPT_EMAIL=""
LETSENCRYPT_STAGING="0"
LETSENCRYPT_MODE="standalone"
LETSENCRYPT_WEBROOT_PATH=""
SKIP_ACME_PROBE="0"

usage() {
  cat <<USAGE
Usage: ./scripts/configure-ws.sh [options]

Configures OpenCom env files for direct websocket hosting (frontend via nginx, WS direct).

Options:
  --domain <host>         Websocket domain host (default: ws.opencom.online)
  --ip <ip>               Direct websocket IP fallback (e.g. 37.114.58.186)
  --port <port>           Websocket port (default: 9443)
  --insecure              Force plain ws:// (sets VITE_GATEWAY_WS_INSECURE=1)
  --direct-ip             Set VITE_GATEWAY_WS_URL directly to the provided --ip endpoint
  --no-auto-fallback-ip   Disable automatic fallback to --ip if domain is unreachable
  --generate-self-signed-cert
                           Generate self-signed TLS cert/key for WS host (wss helper)
  --cert-dir <path>        Cert output directory (default: /etc/opencom/ws-certs)
  --cert-days <days>       Self-signed cert validity in days (default: 365)
  --force-cert-overwrite   Overwrite existing cert files in --cert-dir
  --generate-letsencrypt-cert
                           Obtain a trusted cert via certbot and wire backend TLS envs
  --letsencrypt-email <email>
                           Email for Let's Encrypt registration (required with --generate-letsencrypt-cert)
  --letsencrypt-staging    Use Let's Encrypt staging endpoint (testing only)
  --letsencrypt-webroot <path>
                           Use webroot challenge mode (recommended when nginx uses :80)
  --skip-acme-probe        Skip local HTTP challenge probe before certbot webroot run
  --backend-env <path>    Backend env file (default: backend/.env)
  --frontend-env <path>   Frontend env file (default: frontend/.env)
  -h, --help              Show this help

Examples:
  ./scripts/configure-ws.sh --domain ws.opencom.online --ip 37.114.58.186
  ./scripts/configure-ws.sh --ip 37.114.58.186 --direct-ip --insecure
  ./scripts/configure-ws.sh --domain ws.opencom.online --ip 37.114.58.186 --generate-self-signed-cert
  ./scripts/configure-ws.sh --domain ws.opencom.online --generate-letsencrypt-cert --letsencrypt-email admin@opencom.online
  ./scripts/configure-ws.sh --domain ws.opencom.online --generate-letsencrypt-cert --letsencrypt-email admin@opencom.online --letsencrypt-webroot /var/www/certbot
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain)
      WS_DOMAIN="${2:-}"; shift 2 ;;
    --ip)
      WS_IP="${2:-}"; shift 2 ;;
    --port)
      WS_PORT="${2:-}"; shift 2 ;;
    --insecure)
      FORCE_INSECURE="1"; shift ;;
    --direct-ip)
      DIRECT_IP="1"; shift ;;
    --no-auto-fallback-ip)
      AUTO_FALLBACK_IP="0"; shift ;;
    --generate-self-signed-cert)
      GENERATE_SELF_SIGNED_CERT="1"; shift ;;
    --cert-dir)
      CERT_DIR="${2:-}"; shift 2 ;;
    --cert-days)
      CERT_DAYS="${2:-}"; shift 2 ;;
    --force-cert-overwrite)
      FORCE_CERT_OVERWRITE="1"; shift ;;
    --generate-letsencrypt-cert)
      GENERATE_LETSENCRYPT_CERT="1"; shift ;;
    --letsencrypt-email)
      LETSENCRYPT_EMAIL="${2:-}"; shift 2 ;;
    --letsencrypt-staging)
      LETSENCRYPT_STAGING="1"; shift ;;
    --letsencrypt-webroot)
      LETSENCRYPT_MODE="webroot"; LETSENCRYPT_WEBROOT_PATH="${2:-}"; shift 2 ;;
    --skip-acme-probe)
      SKIP_ACME_PROBE="1"; shift ;;
    --backend-env)
      BACKEND_ENV="${2:-}"; shift 2 ;;
    --frontend-env)
      FRONTEND_ENV="${2:-}"; shift 2 ;;
    -h|--help)
      usage; exit 0 ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1 ;;
  esac
done

if [[ "$DIRECT_IP" == "1" && -z "$WS_IP" ]]; then
  echo "--direct-ip requires --ip <address>" >&2
  exit 1
fi

if ! [[ "$CERT_DAYS" =~ ^[0-9]+$ ]] || [[ "$CERT_DAYS" -lt 1 ]]; then
  echo "--cert-days must be a positive integer" >&2
  exit 1
fi

if [[ "$GENERATE_LETSENCRYPT_CERT" == "1" && -z "$LETSENCRYPT_EMAIL" ]]; then
  echo "--generate-letsencrypt-cert requires --letsencrypt-email <email>" >&2
  exit 1
fi

if [[ "$GENERATE_LETSENCRYPT_CERT" == "1" && "$FORCE_INSECURE" == "1" ]]; then
  echo "--generate-letsencrypt-cert cannot be combined with --insecure" >&2
  exit 1
fi

if [[ "$GENERATE_LETSENCRYPT_CERT" == "1" && "$LETSENCRYPT_MODE" == "webroot" && -z "$LETSENCRYPT_WEBROOT_PATH" ]]; then
  echo "--letsencrypt-webroot requires a non-empty path" >&2
  exit 1
fi

if [[ "$GENERATE_LETSENCRYPT_CERT" == "1" && "$GENERATE_SELF_SIGNED_CERT" == "1" ]]; then
  echo "Choose only one of --generate-letsencrypt-cert or --generate-self-signed-cert" >&2
  exit 1
fi

mkdir -p "$(dirname "$BACKEND_ENV")" "$(dirname "$FRONTEND_ENV")"
touch "$BACKEND_ENV" "$FRONTEND_ENV"

upsert_env() {
  local file="$1"
  local key="$2"
  local value="$3"

  if grep -qE "^${key}=" "$file"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}

SCHEME="wss"
if [[ "$FORCE_INSECURE" == "1" ]]; then
  SCHEME="ws"
fi

WS_HOST="$WS_DOMAIN"
if [[ "$DIRECT_IP" == "1" ]]; then
  WS_HOST="$WS_IP"
fi

WS_URL="${SCHEME}://${WS_HOST}:${WS_PORT}/gateway"

if [[ "$GENERATE_LETSENCRYPT_CERT" == "1" ]]; then
  if ! command -v certbot >/dev/null 2>&1; then
    echo "[ws-config] ERROR: certbot is required for --generate-letsencrypt-cert" >&2
    echo "[ws-config] Install certbot, then re-run this command." >&2
    exit 1
  fi

  if [[ "$WS_DOMAIN" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "[ws-config] ERROR: --domain must be a DNS hostname for Let's Encrypt (not a raw IP)." >&2
    exit 1
  fi

  CERTBOT_ARGS=(certonly --non-interactive --agree-tos --email "$LETSENCRYPT_EMAIL" -d "$WS_DOMAIN")
  if [[ "$LETSENCRYPT_MODE" == "webroot" ]]; then
    mkdir -p "$LETSENCRYPT_WEBROOT_PATH"
    CERTBOT_ARGS+=(--webroot -w "$LETSENCRYPT_WEBROOT_PATH")
    echo "[ws-config] Requesting Let's Encrypt certificate for ${WS_DOMAIN} using webroot: ${LETSENCRYPT_WEBROOT_PATH}"

    if [[ "$SKIP_ACME_PROBE" != "1" ]]; then
      if ! command -v curl >/dev/null 2>&1; then
        echo "[ws-config] WARN: curl not found; skipping webroot challenge probe." >&2
      else
        PROBE_DIR="$LETSENCRYPT_WEBROOT_PATH/.well-known/acme-challenge"
        PROBE_TOKEN="opencom-acme-probe-$$"
        PROBE_FILE="$PROBE_DIR/$PROBE_TOKEN"
        PROBE_URL="http://${WS_DOMAIN}/.well-known/acme-challenge/${PROBE_TOKEN}"
        mkdir -p "$PROBE_DIR"
        printf '%s\n' "$PROBE_TOKEN" > "$PROBE_FILE"
        PROBE_BODY="$(curl -fsS --max-time 6 "$PROBE_URL" 2>/dev/null || true)"
        rm -f "$PROBE_FILE"
        if [[ "$PROBE_BODY" != "$PROBE_TOKEN" ]]; then
          echo "[ws-config] ERROR: Webroot probe failed for ${PROBE_URL}." >&2
          echo "[ws-config] Ensure nginx serves ${LETSENCRYPT_WEBROOT_PATH}/.well-known/acme-challenge/ for host ${WS_DOMAIN}." >&2
          echo "[ws-config] Example nginx block:" >&2
          echo "[ws-config]   location ^~ /.well-known/acme-challenge/ { root ${LETSENCRYPT_WEBROOT_PATH}; default_type text/plain; }" >&2
          echo "[ws-config] After nginx reload, re-run this script or pass --skip-acme-probe to bypass this check." >&2
          exit 1
        fi
        echo "[ws-config] OK: webroot challenge probe succeeded (${PROBE_URL})"
      fi
    fi
  else
    CERTBOT_ARGS+=(--standalone)
    echo "[ws-config] Requesting Let's Encrypt certificate for ${WS_DOMAIN} using standalone mode"
  fi
  if [[ "$LETSENCRYPT_STAGING" == "1" ]]; then
    CERTBOT_ARGS+=(--staging)
  fi

  if ! certbot "${CERTBOT_ARGS[@]}"; then
    if [[ "$LETSENCRYPT_MODE" == "standalone" ]]; then
      echo "[ws-config] HINT: standalone mode needs a free :80. If nginx/apache already binds 80, re-run with --letsencrypt-webroot <path>." >&2
    fi
    exit 1
  fi

  LE_CERT_DIR="/etc/letsencrypt/live/${WS_DOMAIN}"
  LE_CERT_FILE="${LE_CERT_DIR}/fullchain.pem"
  LE_KEY_FILE="${LE_CERT_DIR}/privkey.pem"
  if [[ ! -f "$LE_CERT_FILE" || ! -f "$LE_KEY_FILE" ]]; then
    echo "[ws-config] ERROR: certbot completed but cert files not found under ${LE_CERT_DIR}" >&2
    exit 1
  fi

  upsert_env "$BACKEND_ENV" "CORE_GATEWAY_TLS_CERT_FILE" "$LE_CERT_FILE"
  upsert_env "$BACKEND_ENV" "CORE_GATEWAY_TLS_KEY_FILE" "$LE_KEY_FILE"
  echo "[ws-config] Using trusted cert files from Let's Encrypt: $LE_CERT_FILE"
fi

if [[ "$GENERATE_SELF_SIGNED_CERT" == "1" ]]; then
  if ! command -v openssl >/dev/null 2>&1; then
    echo "[ws-config] ERROR: openssl is required for --generate-self-signed-cert" >&2
    exit 1
  fi

  mkdir -p "$CERT_DIR"
  CERT_FILE="$CERT_DIR/fullchain.pem"
  KEY_FILE="$CERT_DIR/privkey.pem"

  if [[ "$FORCE_CERT_OVERWRITE" != "1" && ( -f "$CERT_FILE" || -f "$KEY_FILE" ) ]]; then
    echo "[ws-config] ERROR: cert files already exist in $CERT_DIR. Re-run with --force-cert-overwrite to replace them." >&2
    exit 1
  fi

  SAN="DNS:${WS_DOMAIN}"
  if [[ -n "$WS_IP" ]]; then
    SAN+=" ,IP:${WS_IP}"
  fi

  openssl req \
    -x509 -nodes -newkey rsa:2048 \
    -keyout "$KEY_FILE" \
    -out "$CERT_FILE" \
    -days "$CERT_DAYS" \
    -subj "/CN=${WS_DOMAIN}" \
    -addext "subjectAltName = ${SAN// ,/,}" >/dev/null 2>&1

  chmod 600 "$KEY_FILE"
  chmod 644 "$CERT_FILE"
  echo "[ws-config] Generated self-signed certificate: $CERT_FILE"
  echo "[ws-config] Generated private key: $KEY_FILE"
  echo "[ws-config] NOTE: self-signed certs are not trusted by browsers by default; use ACME/Let's Encrypt for production."
fi

# Backend: make WS listener reachable externally.
upsert_env "$BACKEND_ENV" "CORE_GATEWAY_HOST" "0.0.0.0"
upsert_env "$BACKEND_ENV" "CORE_GATEWAY_PORT" "$WS_PORT"
upsert_env "$BACKEND_ENV" "NODE_HOST" "0.0.0.0"

if [[ "$GENERATE_SELF_SIGNED_CERT" == "1" ]]; then
  upsert_env "$BACKEND_ENV" "CORE_GATEWAY_TLS_CERT_FILE" "$CERT_FILE"
  upsert_env "$BACKEND_ENV" "CORE_GATEWAY_TLS_KEY_FILE" "$KEY_FILE"
fi

# Frontend: point gateway directly, keep host + fallback IP hints.
upsert_env "$FRONTEND_ENV" "VITE_GATEWAY_WS_URL" "$WS_URL"
upsert_env "$FRONTEND_ENV" "VITE_GATEWAY_WS_HOST" "$WS_DOMAIN"
upsert_env "$FRONTEND_ENV" "VITE_GATEWAY_WS_INSECURE" "$FORCE_INSECURE"
if [[ -n "$WS_IP" ]]; then
  upsert_env "$FRONTEND_ENV" "VITE_GATEWAY_WS_IP" "$WS_IP"
fi

echo "[ws-config] Updated: $BACKEND_ENV"
echo "[ws-config] Updated: $FRONTEND_ENV"
echo "[ws-config] Gateway URL: $WS_URL"

if [[ "$BACKEND_ENV" == /tmp/* || "$FRONTEND_ENV" == /tmp/* ]]; then
  echo "[ws-config] NOTE: You targeted temp files. Run without --backend-env/--frontend-env to apply live config."
fi

# Basic reachability hint (best effort only).
if command -v nc >/dev/null 2>&1; then
  echo "[ws-config] Checking TCP reachability..."
  DOMAIN_OK="0"
  IP_OK="0"
  if nc -z -w 2 "$WS_HOST" "$WS_PORT" >/dev/null 2>&1; then
    echo "[ws-config] OK: ${WS_HOST}:${WS_PORT} reachable"
    DOMAIN_OK="1"
  else
    echo "[ws-config] WARN: ${WS_HOST}:${WS_PORT} not reachable from this machine"
  fi

  if [[ -n "$WS_IP" && "$WS_IP" != "$WS_HOST" ]]; then
    if nc -z -w 2 "$WS_IP" "$WS_PORT" >/dev/null 2>&1; then
      echo "[ws-config] OK: ${WS_IP}:${WS_PORT} reachable"
      IP_OK="1"
    else
      echo "[ws-config] WARN: ${WS_IP}:${WS_PORT} not reachable from this machine"
    fi
  fi

  if [[ "$AUTO_FALLBACK_IP" == "1" && "$DIRECT_IP" == "0" && -n "$WS_IP" && "$DOMAIN_OK" == "0" && "$IP_OK" == "1" ]]; then
    FALLBACK_URL="${SCHEME}://${WS_IP}:${WS_PORT}/gateway"
    upsert_env "$FRONTEND_ENV" "VITE_GATEWAY_WS_URL" "$FALLBACK_URL"
    echo "[ws-config] Applied fallback: VITE_GATEWAY_WS_URL=${FALLBACK_URL}"
  fi
fi

echo "[ws-config] Done. Restart backend/frontend after env changes."
