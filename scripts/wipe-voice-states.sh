#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  cat <<USAGE
Usage:
  ./scripts/wipe-voice-states.sh [--server-id <id> | --guild-id <id>] [--yes]

Description:
  Clears voice connection state rows from server-node database.
  - No filter: removes all users from all voice channels.
  - --server-id: removes users in guilds tied to a specific server_id.
  - --guild-id: removes users in one guild.

Environment:
  Reads NODE_DATABASE_URL from backend/.env or current environment.
USAGE
}

SERVER_ID=""
GUILD_ID=""
CONFIRM="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --server-id) SERVER_ID="${2:-}"; shift 2 ;;
    --guild-id) GUILD_ID="${2:-}"; shift 2 ;;
    --yes) CONFIRM="true"; shift ;;
    -h|--help|help) usage; exit 0 ;;
    *) echo "[error] Unknown argument: $1"; usage; exit 1 ;;
  esac
done

if [[ -n "$SERVER_ID" && -n "$GUILD_ID" ]]; then
  echo "[error] Use either --server-id or --guild-id, not both."
  exit 1
fi

if [[ -f "$ROOT_DIR/backend/.env" ]]; then
  set -a; source "$ROOT_DIR/backend/.env"; set +a
fi

if [[ -z "${NODE_DATABASE_URL:-}" ]]; then
  echo "[error] NODE_DATABASE_URL is not set."
  exit 1
fi

if [[ "$CONFIRM" != "true" ]]; then
  echo "This will remove voice_states rows and force users out of VC status."
  echo "Re-run with --yes to execute."
  exit 1
fi

cd "$ROOT_DIR/backend"

node --input-type=module - "$SERVER_ID" "$GUILD_ID" <<'NODE'
import mysql from "mysql2/promise";

const [, , serverId, guildId] = process.argv;
const connection = await mysql.createConnection(process.env.NODE_DATABASE_URL);

try {
  let sql = "DELETE FROM voice_states";
  const params = [];

  if (guildId) {
    sql += " WHERE guild_id = ?";
    params.push(guildId);
  } else if (serverId) {
    sql += " WHERE guild_id IN (SELECT id FROM guilds WHERE server_id = ?)";
    params.push(serverId);
  }

  const [result] = await connection.execute(sql, params);
  console.log(JSON.stringify({ ok: true, deleted: result.affectedRows, serverId: serverId || null, guildId: guildId || null }, null, 2));
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
} finally {
  await connection.end();
}
NODE
