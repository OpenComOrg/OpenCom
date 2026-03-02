#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SESSION_NAME="OpenCom"
WINDOW_NAME="app"
START_CMD="./scripts/dev/start.sh all"

DO_PULL=1
DO_BACKUP=0
SKIP_BUILD=0
SKIP_UPDATE=0
NO_RESTART=0
HARD_RESTART=0
DO_ATTACH=1

print_usage() {
  cat <<'USAGE'
Usage: ./scripts/ops/tmux-fast-update.sh [options]

Updates OpenCom, then performs a fast tmux cutover for session "OpenCom".
By default:
  1) Pull latest code
  2) Run update-opencom (Docker rolling update: build/migrate/restart)
  3) Fast restart the app pane in tmux
  4) Attach to the tmux session

Options:
  --session <name>       tmux session name (default: OpenCom)
  --window <name>        tmux window name to run app in (default: app)
  --start-cmd <command>  command used to start app (default: ./scripts/dev/start.sh all)
  --no-pull              do not run git pull during update
  --backup               create backup before update
  --skip-build           pass --skip-build to update-opencom
  --skip-update          skip update-opencom entirely (restart/attach only)
  --no-restart           run update only; leave running app untouched
  --hard-restart         kill/recreate tmux session instead of pane respawn
  --no-attach            do not attach/switch to the session after completion
  --attach               force attach/switch to session (default)
  -h, --help             show this help
USAGE
}

tmux_has_session() {
  tmux has-session -t "$SESSION_NAME" 2>/dev/null
}

tmux_has_window() {
  tmux list-windows -t "$SESSION_NAME" -F '#{window_name}' 2>/dev/null | grep -Fxq "$WINDOW_NAME"
}

build_launch_cmd() {
  printf 'cd %q && %s' "$ROOT_DIR" "$START_CMD"
}

restart_or_create_session() {
  local launch_cmd
  launch_cmd="$(build_launch_cmd)"

  if [[ "$HARD_RESTART" -eq 1 ]]; then
    if tmux_has_session; then
      echo "[tmux] Killing session: $SESSION_NAME"
      tmux kill-session -t "$SESSION_NAME"
    fi

    echo "[tmux] Creating session: $SESSION_NAME (window: $WINDOW_NAME)"
    tmux new-session -d -s "$SESSION_NAME" -n "$WINDOW_NAME" "$launch_cmd"
    return
  fi

  if ! tmux_has_session; then
    echo "[tmux] Session missing, creating: $SESSION_NAME"
    tmux new-session -d -s "$SESSION_NAME" -n "$WINDOW_NAME" "$launch_cmd"
    return
  fi

  if ! tmux_has_window; then
    echo "[tmux] Window missing, creating: $SESSION_NAME:$WINDOW_NAME"
    tmux new-window -d -t "$SESSION_NAME" -n "$WINDOW_NAME" "$launch_cmd"
    return
  fi

  echo "[tmux] Fast restarting pane: $SESSION_NAME:$WINDOW_NAME.0"
  tmux respawn-pane -k -t "$SESSION_NAME:$WINDOW_NAME.0" "$launch_cmd"
}

attach_or_switch() {
  [[ "$DO_ATTACH" -eq 1 ]] || return 0

  if ! tmux_has_session; then
    echo "[tmux] Cannot attach; session does not exist: $SESSION_NAME"
    return 1
  fi

  if [[ -n "${TMUX:-}" ]]; then
    tmux switch-client -t "$SESSION_NAME"
  elif [[ -t 1 ]]; then
    tmux attach-session -t "$SESSION_NAME"
  else
    echo "[tmux] Non-interactive shell; skipping attach."
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --session)
      [[ $# -ge 2 ]] || { echo "Missing value for --session"; exit 1; }
      SESSION_NAME="$2"
      shift
      ;;
    --window)
      [[ $# -ge 2 ]] || { echo "Missing value for --window"; exit 1; }
      WINDOW_NAME="$2"
      shift
      ;;
    --start-cmd)
      [[ $# -ge 2 ]] || { echo "Missing value for --start-cmd"; exit 1; }
      START_CMD="$2"
      shift
      ;;
    --no-pull)
      DO_PULL=0
      ;;
    --backup)
      DO_BACKUP=1
      ;;
    --skip-build)
      SKIP_BUILD=1
      ;;
    --skip-update)
      SKIP_UPDATE=1
      ;;
    --no-restart)
      NO_RESTART=1
      ;;
    --hard-restart)
      HARD_RESTART=1
      ;;
    --no-attach)
      DO_ATTACH=0
      ;;
    --attach)
      DO_ATTACH=1
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
  shift
done

if [[ "$NO_RESTART" -eq 0 || "$DO_ATTACH" -eq 1 ]]; then
  if ! command -v tmux >/dev/null 2>&1; then
    echo "[err] tmux is not installed."
    exit 1
  fi
fi

if [[ "$SKIP_UPDATE" -eq 0 ]]; then
  update_args=()
  [[ "$DO_PULL" -eq 1 ]] && update_args+=("--pull")
  [[ "$DO_BACKUP" -eq 1 ]] && update_args+=("--backup")
  [[ "$SKIP_BUILD" -eq 1 ]] && update_args+=("--skip-build")

  echo "[update] Running update-opencom.sh ${update_args[*]:-}"
  "$ROOT_DIR/scripts/ops/update-opencom.sh" "${update_args[@]}"
else
  echo "[update] Skipped (--skip-update)"
fi

if [[ "$NO_RESTART" -eq 1 ]]; then
  echo "[tmux] Restart skipped (--no-restart)."
  attach_or_switch
  exit 0
fi

restart_or_create_session
attach_or_switch
