import { q } from "../db.js";
import { resolveChannelPermissions } from "./resolve.js";
import { Perm, has } from "./bits.js";

function toBig(x: any): bigint {
  return BigInt(x);
}

export async function isGuildOwner(guildId: string, userId: string): Promise<boolean> {
  const rows = await q<{ owner_user_id: string }>(
    `SELECT owner_user_id FROM guilds WHERE id=:guildId`,
    { guildId }
  );
  return rows.length ? rows[0].owner_user_id === userId : false;
}

export async function memberTopRolePosition(guildId: string, userId: string): Promise<number> {
  const rows = await q<{ position: number }>(
    `SELECT COALESCE(MAX(r.position), 0) AS position
     FROM member_roles mr
     JOIN roles r ON r.id=mr.role_id
     WHERE mr.guild_id=:guildId AND mr.user_id=:userId`,
    { guildId, userId }
  );
  return rows.length ? Number(rows[0].position) : 0;
}

export async function rolePosition(roleId: string): Promise<{ guildId: string; position: number; isEveryone: boolean }> {
  const rows = await q<{ guild_id: string; position: any; is_everyone: any }>(
    `SELECT guild_id, position, is_everyone FROM roles WHERE id=:roleId`,
    { roleId }
  );
  if (!rows.length) throw new Error("ROLE_NOT_FOUND");
  return {
    guildId: rows[0].guild_id,
    position: Number(rows[0].position),
    isEveryone: !!rows[0].is_everyone
  };
}

export async function guildAdminByAnyChannel(guildId: string, userId: string): Promise<boolean> {
  // Admin is global; easiest MVP check: compute perms against any channel in guild (or first channel).
  const ch = await q<{ id: string }>(
    `SELECT id FROM channels WHERE guild_id=:guildId ORDER BY created_at ASC LIMIT 1`,
    { guildId }
  );
  if (!ch.length) return false;
  const perms = await resolveChannelPermissions({ guildId, channelId: ch[0].id, userId });
  return has(perms, Perm.ADMINISTRATOR);
}

export async function requireManageRoles(opts: { guildId: string; channelIdForPerms: string; actorId: string; actorRoles?: string[] }) {
  const perms = await resolveChannelPermissions({
    guildId: opts.guildId,
    channelId: opts.channelIdForPerms,
    userId: opts.actorId,
    roles: opts.actorRoles ?? []
  });
  if (!has(perms, Perm.MANAGE_ROLES) && !has(perms, Perm.ADMINISTRATOR)) throw new Error("MISSING_PERMS");
}

export async function requireManageChannels(opts: { guildId: string; channelIdForPerms: string; actorId: string; actorRoles?: string[] }) {
  const perms = await resolveChannelPermissions({
    guildId: opts.guildId,
    channelId: opts.channelIdForPerms,
    userId: opts.actorId,
    roles: opts.actorRoles ?? []
  });
  if (!has(perms, Perm.MANAGE_CHANNELS) && !has(perms, Perm.ADMINISTRATOR)) throw new Error("MISSING_PERMS");
}

export async function canEditRole(guildId: string, actorId: string, targetRolePosition: number): Promise<boolean> {
  // Discord-like rule: cannot manage roles >= your top role (unless owner/admin)
  const owner = await isGuildOwner(guildId, actorId);
  if (owner) return true;
  const admin = await guildAdminByAnyChannel(guildId, actorId);
  if (admin) return true;
  const top = await memberTopRolePosition(guildId, actorId);
  return top > targetRolePosition;
}
