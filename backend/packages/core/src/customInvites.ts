import { q } from "./db.js";

export const CUSTOM_INVITE_COOLDOWN_HOURS = 72;
export const CUSTOM_INVITE_COOLDOWN_MS = CUSTOM_INVITE_COOLDOWN_HOURS * 60 * 60 * 1000;

export type CustomInviteLockReason = "invite_deleted" | "invite_replaced" | "owner_lost_boost";

export type ActiveCustomInviteRow = {
  code: string;
  server_id: string;
  created_by: string;
  max_uses: number | null;
  uses: number;
  expires_at: string | null;
  created_at: string;
  is_custom: number;
  is_permanent: number;
};

export type InviteCodeReservation = {
  code: string;
  reservedServerId: string;
  ownerUserId: string;
  lockedUntil: string;
  reason: string;
  createdAt: string;
  updatedAt: string;
};

function toMySqlDateTime(value: Date) {
  return value.toISOString().slice(0, 19).replace("T", " ");
}

function mapReservation(row: {
  code: string;
  reserved_server_id: string;
  owner_user_id: string;
  locked_until: string;
  reason: string;
  created_at: string;
  updated_at: string;
}): InviteCodeReservation {
  return {
    code: row.code,
    reservedServerId: row.reserved_server_id,
    ownerUserId: row.owner_user_id,
    lockedUntil: row.locked_until,
    reason: row.reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function clearInviteCodeReservation(code: string): Promise<void> {
  await q(`DELETE FROM invite_code_reservations WHERE code=:code`, { code });
}

export async function getActiveInviteCodeReservation(code: string): Promise<InviteCodeReservation | null> {
  const rows = await q<{
    code: string;
    reserved_server_id: string;
    owner_user_id: string;
    locked_until: string;
    reason: string;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT code,reserved_server_id,owner_user_id,locked_until,reason,created_at,updated_at
     FROM invite_code_reservations
     WHERE code=:code
     LIMIT 1`,
    { code }
  );

  if (!rows.length) return null;

  const row = rows[0];
  if (new Date(row.locked_until).getTime() <= Date.now()) {
    await clearInviteCodeReservation(code);
    return null;
  }

  return mapReservation(row);
}

export async function reserveInviteCode(input: {
  code: string;
  serverId: string;
  ownerUserId: string;
  reason: CustomInviteLockReason;
  lockedUntil?: Date;
}): Promise<string> {
  const existing = await getActiveInviteCodeReservation(input.code);
  if (existing) {
    return new Date(existing.lockedUntil).toISOString();
  }

  const lockedUntil = input.lockedUntil ?? new Date(Date.now() + CUSTOM_INVITE_COOLDOWN_MS);
  const lockedUntilSql = toMySqlDateTime(lockedUntil);
  await q(
    `INSERT INTO invite_code_reservations (code,reserved_server_id,owner_user_id,locked_until,reason)
     VALUES (:code,:serverId,:ownerUserId,:lockedUntil,:reason)
     ON DUPLICATE KEY UPDATE
       reserved_server_id=VALUES(reserved_server_id),
       owner_user_id=VALUES(owner_user_id),
       locked_until=VALUES(locked_until),
       reason=VALUES(reason)`,
    {
      code: input.code,
      serverId: input.serverId,
      ownerUserId: input.ownerUserId,
      lockedUntil: lockedUntilSql,
      reason: input.reason
    }
  );
  return lockedUntil.toISOString();
}

export async function getServerCustomInvites(serverId: string): Promise<ActiveCustomInviteRow[]> {
  return q<ActiveCustomInviteRow>(
    `SELECT code,server_id,created_by,max_uses,uses,expires_at,created_at,is_custom,is_permanent
     FROM invites
     WHERE server_id=:serverId
       AND is_custom=1
     ORDER BY created_at DESC`,
    { serverId }
  );
}

export async function revokeCustomInvitesForServer(input: {
  serverId: string;
  ownerUserId: string;
  reason: CustomInviteLockReason;
}): Promise<Array<{ code: string; lockedUntil: string }>> {
  const invites = await getServerCustomInvites(input.serverId);
  if (!invites.length) return [];

  const released: Array<{ code: string; lockedUntil: string }> = [];
  for (const invite of invites) {
    const lockedUntil = await reserveInviteCode({
      code: invite.code,
      serverId: input.serverId,
      ownerUserId: input.ownerUserId,
      reason: input.reason
    });
    released.push({ code: invite.code, lockedUntil });
  }

  for (const invite of invites) {
    await q(`DELETE FROM invites WHERE code=:code`, { code: invite.code });
  }

  return released;
}

export async function revokeCustomInvitesForOwnerLossOfBoost(ownerUserId: string): Promise<Array<{ code: string; lockedUntil: string }>> {
  const servers = await q<{ id: string }>(
    `SELECT id FROM servers WHERE owner_user_id=:ownerUserId`,
    { ownerUserId }
  );

  const released: Array<{ code: string; lockedUntil: string }> = [];
  for (const server of servers) {
    const serverReleased = await revokeCustomInvitesForServer({
      serverId: server.id,
      ownerUserId,
      reason: "owner_lost_boost"
    });
    released.push(...serverReleased);
  }

  return released;
}
