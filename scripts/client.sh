#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

BUILD=0

usage() {
  cat <<'EOF'
Usage: ./scripts/client.sh [--build]

Default:
  Runs the desktop client on Linux.

Options:
  --build   Build Linux client artifacts, then run the client.
  -h, --help  Show this help text.
EOF
}

for arg in "$@"; do
  case "$arg" in
    --build) BUILD=1 ;;
    -h|--help) usage; exit 0 ;;
    *)
      echo "Unknown argument: $arg" >&2
      usage
      exit 1
      ;;
  esac
done

cd "$ROOT_DIR"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required but was not found in PATH." >&2
  exit 1
fi

if [[ ! -d frontend/node_modules ]]; then
  echo "[client] Installing frontend dependencies..."
  npm --prefix frontend install
fi

if [[ ! -d client/node_modules ]]; then
  echo "[client] Installing client dependencies..."
  npm --prefix client install
fi

if [[ "$BUILD" -eq 1 ]]; then
  echo "[client] Building Linux artifacts..."
  npm --prefix client run build:linux
else
  echo "[client] Building frontend for desktop shell..."
  npm --prefix frontend run build
fi

echo "[client] Starting desktop client..."
npm --prefix client run start
