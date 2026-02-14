import { FastifyInstance } from "fastify";
import { z } from "zod";
import { q } from "../db.js";
import { requireGuildMember } from "../auth/requireGuildMember.js";
import { requireManageChannels } from "../permissions/hierarchy.js";

export async function overwriteRoutes(
  app: FastifyInstance,
  broadcastGuild: (guildId: string, t: string, d: any) => void
) {
  app.put("/v1/channels/:channelId/overwrites", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const { channelId } = z.object({ channelId: z.string().min(3) }).parse(req.params);
    const userId = req.auth.userId as string;

    const body = z.object({
      targetType: z.enum(["role", "member"]),
      targetId: z.string().min(3),
      allow: z.string().regex(/^\d+$/).default("0"),
      deny: z.string().regex(/^\d+$/).default("0")
    }).parse(req.body);

    const ch = await q<{ guild_id: string }>(`SELECT guild_id FROM channels WHERE id=:channelId`, { channelId });
    if (!ch.length) return rep.code(404).send({ error: "CHANNEL_NOT_FOUND" });
    const guildId = ch[0].guild_id;

    try { await requireGuildMember(guildId, userId, req.auth.roles, req.auth.coreServerId); } catch { return rep.code(403).send({ error: "NOT_GUILD_MEMBER" }); }

    try {
      await requireManageChannels({ guildId, channelIdForPerms: channelId, actorId: userId, actorRoles: req.auth.roles });
    } catch {
      return rep.code(403).send({ error: "MISSING_PERMS" });
    }

    await q(
      `INSERT INTO channel_overwrites (channel_id,target_type,target_id,allow,deny)
       VALUES (:channelId,:targetType,:targetId,:allow,:deny)
       ON DUPLICATE KEY UPDATE allow=VALUES(allow), deny=VALUES(deny)`,
      { channelId, targetType: body.targetType, targetId: body.targetId, allow: body.allow, deny: body.deny }
    );

    broadcastGuild(guildId, "CHANNEL_OVERWRITE_UPDATE", { channelId, overwrite: body });
    return rep.send({ ok: true });
  });

  app.delete("/v1/channels/:channelId/overwrites", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const { channelId } = z.object({ channelId: z.string().min(3) }).parse(req.params);
    const userId = req.auth.userId as string;

    const body = z.object({
      targetType: z.enum(["role", "member"]),
      targetId: z.string().min(3)
    }).parse(req.body);

    const ch = await q<{ guild_id: string }>(`SELECT guild_id FROM channels WHERE id=:channelId`, { channelId });
    if (!ch.length) return rep.code(404).send({ error: "CHANNEL_NOT_FOUND" });
    const guildId = ch[0].guild_id;

    try { await requireGuildMember(guildId, userId, req.auth.roles, req.auth.coreServerId); } catch { return rep.code(403).send({ error: "NOT_GUILD_MEMBER" }); }

    try {
      await requireManageChannels({ guildId, channelIdForPerms: channelId, actorId: userId, actorRoles: req.auth.roles });
    } catch {
      return rep.code(403).send({ error: "MISSING_PERMS" });
    }

    await q(
      `DELETE FROM channel_overwrites
       WHERE channel_id=:channelId AND target_type=:targetType AND target_id=:targetId`,
      { channelId, targetType: body.targetType, targetId: body.targetId }
    );

    broadcastGuild(guildId, "CHANNEL_OVERWRITE_DELETE", { channelId, ...body });
    return rep.send({ ok: true });
  });

  app.post("/v1/channels/:channelId/sync-permissions", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const { channelId } = z.object({ channelId: z.string().min(3) }).parse(req.params);
    const userId = req.auth.userId as string;

    const ch = await q<{ guild_id: string; parent_id: string | null }>(
      `SELECT guild_id,parent_id FROM channels WHERE id=:channelId`,
      { channelId }
    );
    if (!ch.length) return rep.code(404).send({ error: "CHANNEL_NOT_FOUND" });

    const guildId = ch[0].guild_id;
    const parentId = ch[0].parent_id;
    if (!parentId) return rep.code(400).send({ error: "NO_PARENT_CATEGORY" });

    try { await requireGuildMember(guildId, userId, req.auth.roles, req.auth.coreServerId); } catch { return rep.code(403).send({ error: "NOT_GUILD_MEMBER" }); }

    const parent = await q<{ id: string; type: string }>(
      `SELECT id,type FROM channels WHERE id=:parentId AND guild_id=:guildId`,
      { parentId, guildId }
    );
    if (!parent.length || parent[0].type !== "category") return rep.code(400).send({ error: "PARENT_NOT_CATEGORY" });

    try {
      await requireManageChannels({ guildId, channelIdForPerms: channelId, actorId: userId, actorRoles: req.auth.roles });
    } catch {
      return rep.code(403).send({ error: "MISSING_PERMS" });
    }

    await q(`DELETE FROM channel_overwrites WHERE channel_id=:channelId`, { channelId });

    const pov = await q<any>(
      `SELECT target_type,target_id,allow,deny FROM channel_overwrites WHERE channel_id=:parentId`,
      { parentId }
    );

    for (const o of pov) {
      await q(
        `INSERT INTO channel_overwrites (channel_id,target_type,target_id,allow,deny)
         VALUES (:channelId,:targetType,:targetId,:allow,:deny)`,
        { channelId, targetType: o.target_type, targetId: o.target_id, allow: String(o.allow), deny: String(o.deny) }
      );
    }

    broadcastGuild(guildId, "CHANNEL_SYNC_PERMISSIONS", { channelId, parentId });
    return rep.send({ ok: true, copied: pov.length });
  });
}
