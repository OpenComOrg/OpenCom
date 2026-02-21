#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${1:-8088}"

if command -v python3 >/dev/null 2>&1; then
  cd "$SCRIPT_DIR/site"
  exec python3 -m http.server "$PORT"
fi

echo "python3 is required to run the local status webapp server."
exit 1
