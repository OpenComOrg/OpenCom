#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

print_usage() {
  cat <<'USAGE'
Usage:
  ./scripts/ops/status-incident.sh add "<title>" "<message>" [impact] [status]
  ./scripts/ops/status-incident.sh update <id> "<message>" [status]
  ./scripts/ops/status-incident.sh resolve <id> [message]
  ./scripts/ops/status-incident.sh list

Examples:
  ./scripts/ops/status-incident.sh add "API outage" "Investigating elevated 5xx rates." major investigating
  ./scripts/ops/status-incident.sh update inc_abcd1234 "Mitigation deployed." monitoring
  ./scripts/ops/status-incident.sh resolve inc_abcd1234 "Service restored."
USAGE
}

COMMAND="${1:-}"
if [[ -z "$COMMAND" ]]; then
  print_usage
  exit 1
fi
shift || true

case "$COMMAND" in
  add)
    TITLE="${1:-}"
    MESSAGE="${2:-}"
    IMPACT="${3:-major}"
    STATUS="${4:-investigating}"
    [[ -n "$TITLE" && -n "$MESSAGE" ]] || { print_usage; exit 1; }
    exec node "$ROOT_DIR/scripts/status-webapp/incident.mjs" add --title "$TITLE" --message "$MESSAGE" --impact "$IMPACT" --status "$STATUS"
    ;;
  update)
    ID="${1:-}"
    MESSAGE="${2:-}"
    STATUS="${3:-monitoring}"
    [[ -n "$ID" && -n "$MESSAGE" ]] || { print_usage; exit 1; }
    exec node "$ROOT_DIR/scripts/status-webapp/incident.mjs" update --id "$ID" --message "$MESSAGE" --status "$STATUS"
    ;;
  resolve)
    ID="${1:-}"
    MESSAGE="${2:-Incident resolved.}"
    [[ -n "$ID" ]] || { print_usage; exit 1; }
    exec node "$ROOT_DIR/scripts/status-webapp/incident.mjs" resolve --id "$ID" --message "$MESSAGE"
    ;;
  list)
    exec node "$ROOT_DIR/scripts/status-webapp/incident.mjs" list
    ;;
  *)
    print_usage
    exit 1
    ;;
esac
