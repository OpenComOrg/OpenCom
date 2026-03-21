#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ACTION="${1:-restart}"
SESSION_NAME="${OPENCOM_TMUX_SESSION:-OpenCom}"
START_CMD="${OPENCOM_START_COMMAND:-./start.sh all}"

print_usage() {
  cat <<'USAGE'
Usage: ./scripts/ops/panel-runtime-control.sh [restart|update-and-restart|status]

restart:
  Uses tmux session "OpenCom", sends Ctrl+C three times, then starts ./start.sh all.

update-and-restart:
  Runs backend migrations (migrate:core + migrate:node), then performs restart flow.

status:
  Prints basic tmux/runtime status for the panel operations UI.
USAGE
}

tmux_has_session() {
  tmux has-session -t "$SESSION_NAME" 2>/dev/null
}

build_launch_cmd() {
  printf 'cd %q && %s' "$ROOT_DIR" "$START_CMD"
}

ensure_tmux() {
  if ! command -v tmux >/dev/null 2>&1; then
    echo "[err] tmux is not installed."
    exit 1
  fi
}

status_json() {
  local tmux_installed=0
  local session_exists=0
  local window_exists=0
  local window_name=""
  local pane_target="${SESSION_NAME}"

  if command -v tmux >/dev/null 2>&1; then
    tmux_installed=1
    if tmux_has_session; then
      session_exists=1
      window_exists=1
      window_name="$(tmux display-message -p -t "$SESSION_NAME" '#{window_name}' 2>/dev/null || true)"
    fi
  fi

  cat <<JSON
{"tmuxInstalled":${tmux_installed},"sessionName":"${SESSION_NAME}","windowName":"${window_name}","sessionExists":${session_exists},"windowExists":${window_exists},"paneTarget":"${pane_target}","startCommand":"${START_CMD}"}
JSON
}

restart_stack() {
  ensure_tmux
  local launch_cmd
  launch_cmd="$(build_launch_cmd)"

  if ! tmux_has_session; then
    echo "[tmux] Session missing; creating ${SESSION_NAME}"
    tmux new-session -d -s "$SESSION_NAME" "$launch_cmd"
    echo "[ok] Started new tmux session."
    return
  fi

  local pane_target="${SESSION_NAME}"
  for attempt in 1 2 3 4 5 6 7 8 9 10 11; do
    echo "[tmux] Sending Ctrl+C (${attempt}/3) to ${pane_target}"
    tmux send-keys -t "$pane_target" C-c
    sleep 0.2
  done
  sleep 0.35
  echo "[tmux] Running ${START_CMD}"
  tmux send-keys -t "$pane_target" "$launch_cmd" C-m
  echo "[ok] Restart command sent."
}

run_migrations() {
  echo "[update] Running backend migrations..."
  pushd "$ROOT_DIR/backend" >/dev/null
  npm run migrate:core
  npm run migrate:node
  popd >/dev/null
  echo "[ok] Migrations complete."
}

case "$ACTION" in
  restart)
    restart_stack
    ;;
  update-and-restart)
    run_migrations
    restart_stack
    ;;
  status)
    status_json
    ;;
  -h|--help|help)
    print_usage
    ;;
  *)
    echo "Unknown action: $ACTION"
    print_usage
    exit 1
    ;;
esac
