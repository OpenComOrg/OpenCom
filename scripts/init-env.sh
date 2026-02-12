#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

print_usage() {
  cat <<USAGE
Usage: ./scripts/init-env.sh [options]

Generates backend/.env and frontend/.env with secure defaults.
Pass-through options are forwarded to scripts/generate-env.mjs.

Common options:
  --frontend-url=<url>   Frontend public URL
  --core-url=<url>       Core API URL
  -h, --help             Show this help and exit

Example:
  ./scripts/init-env.sh --frontend-url=https://opencom.example --core-url=https://openapi.example
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || "${1:-}" == "help" ]]; then
  print_usage
  exit 0
fi

cat <<MSG
[env-init] Generating backend/.env and frontend/.env with secure defaults.
[env-init] You can override values via flags, e.g.:
  ./scripts/init-env.sh --frontend-url=https://opencom.donskyblock.xyz --core-url=https://openapi.donskyblock.xyz
MSG

node "$ROOT_DIR/scripts/generate-env.mjs" "$@"

echo "[env-init] Done"
