import { FastifyInstance } from "fastify";
import { z } from "zod";
import { q } from "../db.js";
import { requireGuildMember } from "../auth/requireGuildMember.js";
import { canEditRole, isGuildOwner, requireManageRoles, rolePosition } from "../permissions/hierarchy.js";

export async function memberRoutes(
  app: FastifyInstance,
  broadcastGuild: (guildId: string, t: string, d: any) => void
) {
  app.put("/v1/guilds/:guildId/members/:memberId/roles/:roleId", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const { guildId, memberId, roleId } = z.object({
      guildId: z.string().min(3),
      memberId: z.string().min(3),
      roleId: z.string().min(3)
    }).parse(req.params);

    const userId = req.auth.userId as string;

    try { await requireGuildMember(guildId, userId, req.auth.roles, req.auth.coreServerId); } catch { return rep.code(403).send({ error: "NOT_GUILD_MEMBER" }); }

    const anyChannel = await q<{ id: string }>(`SELECT id FROM channels WHERE guild_id=:guildId ORDER BY created_at ASC LIMIT 1`, { guildId });
    if (!anyChannel.length) return rep.code(400).send({ error: "GUILD_HAS_NO_CHANNELS" });

    const guildOwner = await isGuildOwner(guildId, userId);
    if (!guildOwner) {
      try { await requireManageRoles({ guildId, channelIdForPerms: anyChannel[0].id, actorId: userId, actorRoles: req.auth.roles || [] }); }
      catch { return rep.code(403).send({ error: "MISSING_PERMS" }); }
    }

    const rp = await rolePosition(roleId).catch(() => null);
    if (!rp || rp.guildId !== guildId) return rep.code(404).send({ error: "ROLE_NOT_FOUND" });
    if (rp.isEveryone) return rep.code(400).send({ error: "CANNOT_ASSIGN_EVERYONE" });

    if (!(await canEditRole(guildId, userId, rp.position))) return rep.code(403).send({ error: "ROLE_HIERARCHY" });

    await q(
      `INSERT INTO guild_members (guild_id,user_id) VALUES (:guildId,:memberId)
       ON DUPLICATE KEY UPDATE guild_id=guild_id`,
      { guildId, memberId }
    );

    await q(
      `INSERT INTO member_roles (guild_id,user_id,role_id)
       VALUES (:guildId,:memberId,:roleId)
       ON DUPLICATE KEY UPDATE role_id=role_id`,
      { guildId, memberId, roleId }
    );

    broadcastGuild(guildId, "GUILD_MEMBER_UPDATE", { userId: memberId, addedRoleId: roleId });
    return rep.send({ ok: true });
  });

  app.delete("/v1/guilds/:guildId/members/:memberId/roles/:roleId", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const { guildId, memberId, roleId } = z.object({
      guildId: z.string().min(3),
      memberId: z.string().min(3),
      roleId: z.string().min(3)
    }).parse(req.params);

    const userId = req.auth.userId as string;

    try { await requireGuildMember(guildId, userId, req.auth.roles, req.auth.coreServerId); } catch { return rep.code(403).send({ error: "NOT_GUILD_MEMBER" }); }

    const anyChannel = await q<{ id: string }>(`SELECT id FROM channels WHERE guild_id=:guildId ORDER BY created_at ASC LIMIT 1`, { guildId });
    if (!anyChannel.length) return rep.code(400).send({ error: "GUILD_HAS_NO_CHANNELS" });

    const guildOwner = await isGuildOwner(guildId, userId);
    if (!guildOwner) {
      try { await requireManageRoles({ guildId, channelIdForPerms: anyChannel[0].id, actorId: userId, actorRoles: req.auth.roles || [] }); }
      catch { return rep.code(403).send({ error: "MISSING_PERMS" }); }
    }

    const rp = await rolePosition(roleId).catch(() => null);
    if (!rp || rp.guildId !== guildId) return rep.code(404).send({ error: "ROLE_NOT_FOUND" });
    if (rp.isEveryone) return rep.code(400).send({ error: "CANNOT_REMOVE_EVERYONE" });

    if (!(await canEditRole(guildId, userId, rp.position))) return rep.code(403).send({ error: "ROLE_HIERARCHY" });

    await q(
      `DELETE FROM member_roles WHERE guild_id=:guildId AND user_id=:memberId AND role_id=:roleId`,
      { guildId, memberId, roleId }
    );

    broadcastGuild(guildId, "GUILD_MEMBER_UPDATE", { userId: memberId, removedRoleId: roleId });
    return rep.send({ ok: true });
  });
}
