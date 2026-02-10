import { q } from "../db.js";
import { Perm, has } from "./bits.js";

type Overwrite = { target_type: "role" | "member"; target_id: string; allow: string; deny: string };
type RoleRow = { id: string; permissions: string; is_everyone: number };

function toBig(x: any): bigint {
  return BigInt(x);
}

function allPerms(): bigint {
  let all = 0n;
  for (const v of Object.values(Perm)) all |= v as unknown as bigint;
  return all;
}

export async function resolveChannelPermissions(params: {
  guildId: string;
  channelId: string;
  userId: string;
  roles?: string[];
}): Promise<bigint> {
  const { guildId, channelId, userId, roles = [] } = params;

  if (roles.includes("platform_admin") || roles.includes("platform_owner")) {
    return allPerms();
  }

  const rolesInGuild = await q<RoleRow>(
    `SELECT r.id, r.permissions, r.is_everyone
     FROM roles r
     WHERE r.guild_id=:guildId`,
    { guildId }
  );

  const everyone = rolesInGuild.find(r => r.is_everyone === 1);
  const everyonePerms = everyone ? toBig(everyone.permissions) : 0n;

  const memberRoles = await q<{ role_id: string }>(
    `SELECT role_id FROM member_roles WHERE guild_id=:guildId AND user_id=:userId`,
    { guildId, userId }
  );

  let perms = everyonePerms;
  for (const mr of memberRoles) {
    const role = rolesInGuild.find(r => r.id === mr.role_id);
    if (role) perms |= toBig(role.permissions);
  }

  if (has(perms, Perm.ADMINISTRATOR)) {
    return allPerms();
  }

  const overwrites = await q<Overwrite>(
    `SELECT target_type, target_id, allow, deny
     FROM channel_overwrites
     WHERE channel_id=:channelId`,
    { channelId }
  );

  const apply = (base: bigint, allow: bigint, deny: bigint) => (base & ~deny) | allow;

  if (everyone) {
    const ov = overwrites.find(o => o.target_type === "role" && o.target_id === everyone.id);
    if (ov) perms = apply(perms, toBig(ov.allow), toBig(ov.deny));
  }

  let roleAllow = 0n;
  let roleDeny = 0n;
  for (const mr of memberRoles) {
    const ov = overwrites.find(o => o.target_type === "role" && o.target_id === mr.role_id);
    if (!ov) continue;
    roleAllow |= toBig(ov.allow);
    roleDeny |= toBig(ov.deny);
  }
  perms = apply(perms, roleAllow, roleDeny);

  const mov = overwrites.find(o => o.target_type === "member" && o.target_id === userId);
  if (mov) perms = apply(perms, toBig(mov.allow), toBig(mov.deny));

  return perms;
}
