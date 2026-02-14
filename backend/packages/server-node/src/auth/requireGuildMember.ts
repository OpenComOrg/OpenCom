import { q } from "../db.js";

export async function requireGuildMember(guildId: string, userId: string, roles: string[] = [], coreServerId?: string) {
  if (coreServerId) {
    // Backward compatibility: legacy guilds may not have tenant set yet.
    await q(
      `UPDATE guilds
       SET server_id = :coreServerId
       WHERE id = :guildId AND (server_id = '' OR server_id IS NULL)`,
      { guildId, coreServerId }
    );

    const guild = await q<{ id: string }>(`SELECT id FROM guilds WHERE id=:guildId AND server_id=:coreServerId`, { guildId, coreServerId });
    if (!guild.length) throw new Error("NOT_GUILD_MEMBER");
  }

  const isPlatformStaff = roles.includes("platform_admin") || roles.includes("platform_owner");
  if (isPlatformStaff) return;

  const rows = await q<{ guild_id: string }>(
    `SELECT guild_id FROM guild_members WHERE guild_id=:guildId AND user_id=:userId`,
    { guildId, userId }
  );
  if (rows.length) return;

  // Membership assumed for guild owners (legacy rows may be missing guild_members entry).
  const ownerRow = await q<{ owner_user_id: string }>(
    `SELECT owner_user_id FROM guilds WHERE id=:guildId`,
    { guildId }
  );
  if (ownerRow.length && ownerRow[0].owner_user_id === userId) {
    await q(
      `INSERT INTO guild_members (guild_id,user_id) VALUES (:guildId,:userId)
       ON DUPLICATE KEY UPDATE guild_id=guild_id`,
      { guildId, userId }
    );
    return;
  }

  throw new Error("NOT_GUILD_MEMBER");
}
