#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  cat <<USAGE
Usage:
  ./scripts/server-admin.sh search-users --query <text>
  ./scripts/server-admin.sh set-owner --server-id <id> --username <username>
  ./scripts/server-admin.sh set-admin --server-id <id> --username <username> --enabled <true|false>

Reads CORE_DATABASE_URL from backend/.env or current environment.
USAGE
}

if [[ $# -lt 1 ]]; then
  usage
  exit 1
fi

ACTION="$1"; shift
QUERY=""
SERVER_ID=""
USERNAME=""
ENABLED=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --query) QUERY="${2:-}"; shift 2 ;;
    --server-id) SERVER_ID="${2:-}"; shift 2 ;;
    --username) USERNAME="${2:-}"; shift 2 ;;
    --enabled) ENABLED="${2:-}"; shift 2 ;;
    -h|--help|help) usage; exit 0 ;;
    *) echo "[error] Unknown argument: $1"; usage; exit 1 ;;
  esac
done

if [[ -f "$ROOT_DIR/backend/.env" ]]; then
  set -a; source "$ROOT_DIR/backend/.env"; set +a
fi

if [[ -z "${CORE_DATABASE_URL:-}" ]]; then
  echo "[error] CORE_DATABASE_URL is not set."
  exit 1
fi

cd "$ROOT_DIR/backend"

node --input-type=module - "$ACTION" "$QUERY" "$SERVER_ID" "$USERNAME" "$ENABLED" <<'NODE'
import mysql from "mysql2/promise";

const [, , action, query, serverId, username, enabled] = process.argv;
const connection = await mysql.createConnection(process.env.CORE_DATABASE_URL);

try {
  if (action === "search-users") {
    if (!query) throw new Error("MISSING_QUERY");
    const [rows] = await connection.execute(
      `SELECT id,username,email,display_name,created_at FROM users
       WHERE username LIKE ? OR email LIKE ?
       ORDER BY created_at DESC
       LIMIT 50`,
      [`%${query}%`, `%${query}%`]
    );
    console.log(JSON.stringify(rows, null, 2));
  } else if (action === "set-owner") {
    if (!serverId || !username) throw new Error("MISSING_ARGS");
    await connection.beginTransaction();

    const [uRows] = await connection.execute(`SELECT id FROM users WHERE username=? LIMIT 1`, [username]);
    const userId = uRows?.[0]?.id;
    if (!userId) throw new Error("USER_NOT_FOUND");

    await connection.execute(`UPDATE servers SET owner_user_id=? WHERE id=?`, [userId, serverId]);
    await connection.execute(
      `INSERT INTO memberships (server_id,user_id,roles) VALUES (?,?,?)
       ON DUPLICATE KEY UPDATE roles=?`,
      [serverId, userId, JSON.stringify(["owner"]), JSON.stringify(["owner"])]
    );

    await connection.commit();
    console.log(JSON.stringify({ ok: true, serverId, ownerUsername: username }, null, 2));
  } else if (action === "set-admin") {
    if (!serverId || !username || !enabled) throw new Error("MISSING_ARGS");
    await connection.beginTransaction();

    const [uRows] = await connection.execute(`SELECT id FROM users WHERE username=? LIMIT 1`, [username]);
    const userId = uRows?.[0]?.id;
    if (!userId) throw new Error("USER_NOT_FOUND");

    const [mRows] = await connection.execute(`SELECT roles FROM memberships WHERE server_id=? AND user_id=? LIMIT 1`, [serverId, userId]);
    const roles = mRows.length ? JSON.parse(mRows[0].roles || "[]") : ["member"];

    const wantEnabled = enabled === "true" || enabled === "1";
    const nextRoles = Array.from(new Set(wantEnabled ? [...roles, "admin"] : roles.filter((role) => role !== "admin")));

    await connection.execute(
      `INSERT INTO memberships (server_id,user_id,roles) VALUES (?,?,?)
       ON DUPLICATE KEY UPDATE roles=?`,
      [serverId, userId, JSON.stringify(nextRoles), JSON.stringify(nextRoles)]
    );

    await connection.commit();
    console.log(JSON.stringify({ ok: true, serverId, username, admin: wantEnabled, roles: nextRoles }, null, 2));
  } else {
    throw new Error("UNKNOWN_ACTION");
  }
} catch (error) {
  await connection.rollback().catch(() => {});
  console.error(error.message || error);
  process.exit(1);
} finally {
  await connection.end();
}
NODE
