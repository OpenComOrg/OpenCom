import { FastifyInstance } from "fastify";
import { z } from "zod";
import { q } from "../db.js";
import { requireGuildMember } from "../auth/requireGuildMember.js";

export async function guildStateRoutes(app: FastifyInstance) {
  app.get("/v1/guilds/:guildId/state", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const { guildId } = z.object({ guildId: z.string().min(3) }).parse(req.params);
    const userId = req.auth.userId as string;

    try {
      await requireGuildMember(guildId, userId, req.auth.roles);
    } catch {
      return rep.code(403).send({ error: "NOT_GUILD_MEMBER" });
    }

    const guild = (await q<any>(`SELECT id,name,owner_user_id,created_at FROM guilds WHERE id=:guildId`, { guildId }))[0];
    if (!guild) return rep.code(404).send({ error: "GUILD_NOT_FOUND" });

    const channels = await q<any>(
      `SELECT id,guild_id,name,type,position,parent_id,created_at
       FROM channels WHERE guild_id=:guildId
       ORDER BY position ASC, created_at ASC`,
      { guildId }
    );

    const roles = await q<any>(
      `SELECT id,guild_id,name,color,position,permissions,is_everyone,created_at
       FROM roles WHERE guild_id=:guildId
       ORDER BY position DESC`,
      { guildId }
    );

    const overwrites = await q<any>(
      `SELECT channel_id,target_type,target_id,allow,deny
       FROM channel_overwrites
       WHERE channel_id IN (SELECT id FROM channels WHERE guild_id=:guildId)`,
      { guildId }
    );

    const myRoleIds = await q<{ role_id: string }>(
      `SELECT role_id FROM member_roles WHERE guild_id=:guildId AND user_id=:userId`,
      { guildId, userId }
    );

    const members = await q<{ user_id: string; nick: string | null }>(
      `SELECT gm.user_id, gm.nick
       FROM guild_members gm
       WHERE gm.guild_id=:guildId
       ORDER BY gm.joined_at ASC`,
      { guildId }
    );

    const memberRoleRows = await q<{ user_id: string; role_id: string }>(
      `SELECT user_id, role_id FROM member_roles WHERE guild_id=:guildId`,
      { guildId }
    );
    const roleIdsByUser = new Map<string, string[]>();
    for (const row of memberRoleRows) {
      if (!roleIdsByUser.has(row.user_id)) roleIdsByUser.set(row.user_id, []);
      roleIdsByUser.get(row.user_id)!.push(row.role_id);
    }

    return rep.send({
      guild,
      channels,
      roles,
      overwrites,
      members: members.map((member) => ({
        id: member.user_id,
        username: member.nick || member.user_id,
        pfp_url: null,
        status: "online",
        roleIds: roleIdsByUser.get(member.user_id) || []
      })),
      me: { userId, roleIds: myRoleIds.map(r => r.role_id) }
    });
  });
}
