#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cat <<MSG
[env-init] Generating backend/.env and frontend/.env with secure defaults.
[env-init] You can override values via flags, e.g.:
  ./scripts/init-env.sh --frontend-url=https://opencom.donskyblock.xyz --core-url=https://openapi.donskyblock.xyz
MSG

node "$ROOT_DIR/scripts/generate-env.mjs" "$@"

echo "[env-init] Done"
