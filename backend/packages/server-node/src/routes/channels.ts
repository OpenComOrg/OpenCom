import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ulidLike } from "@ods/shared/ids.js";
import { q } from "../db.js";
import { requireGuildMember } from "../auth/requireGuildMember.js";
import { requireManageChannels } from "../permissions/hierarchy.js";

export async function channelRoutes(
  app: FastifyInstance,
  broadcastGuild: (guildId: string, t: string, d: any) => void
) {
  // List channels for a guild (requires membership)
  app.get("/v1/guilds/:guildId/channels", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const { guildId } = z.object({ guildId: z.string().min(3) }).parse(req.params);
    const userId = req.auth.userId as string;

    try {
      await requireGuildMember(guildId, userId, req.auth.roles, req.auth.coreServerId);
    } catch {
      return rep.code(403).send({ error: "NOT_GUILD_MEMBER" });
    }

    const channels = await q<any>(
      `SELECT id,guild_id,name,type,position,parent_id,created_at
       FROM channels
       WHERE guild_id=:guildId
       ORDER BY position ASC, created_at ASC`,
      { guildId }
    );

    return { channels };
  });

  // Create channel (requires MANAGE_CHANNELS)
  app.post("/v1/guilds/:guildId/channels", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const { guildId } = z.object({ guildId: z.string().min(3) }).parse(req.params);
    const userId = req.auth.userId as string;

    const body = z.object({
      name: z.string().min(1).max(64),
      type: z.enum(["text", "voice", "category"]).default("text"),
      parentId: z.string().min(3).nullable().optional(),
      position: z.number().int().optional()
    }).parse(req.body);

    try {
      await requireGuildMember(guildId, userId, req.auth.roles, req.auth.coreServerId);
    } catch {
      return rep.code(403).send({ error: "NOT_GUILD_MEMBER" });
    }

    // For perms check, use any existing channel in guild; if none, allow bootstrap only if user is owner
    const anyChannel = await q<{ id: string }>(
      `SELECT id FROM channels WHERE guild_id=:guildId ORDER BY created_at ASC LIMIT 1`,
      { guildId }
    );

    if (anyChannel.length) {
      try {
        await requireManageChannels({ guildId, channelIdForPerms: anyChannel[0].id, actorId: userId, actorRoles: req.auth.roles });
      } catch {
        return rep.code(403).send({ error: "MISSING_PERMS" });
      }
    } else {
      // no channels yet; only guild owner can create the first one
      const g = await q<{ owner_user_id: string }>(`SELECT owner_user_id FROM guilds WHERE id=:guildId`, { guildId });
      if (!g.length) return rep.code(404).send({ error: "GUILD_NOT_FOUND" });
      if (g[0].owner_user_id !== userId) return rep.code(403).send({ error: "MISSING_PERMS" });
    }

    if (body.parentId) {
      const parent = await q<{ id: string; type: string }>(
        `SELECT id,type FROM channels WHERE id=:parentId AND guild_id=:guildId`,
        { parentId: body.parentId, guildId }
      );
      if (!parent.length || parent[0].type !== "category") return rep.code(400).send({ error: "INVALID_PARENT" });
    }

    const id = ulidLike();
    const pos = body.position ?? ((await q<{ p: number }>(
      `SELECT COALESCE(MAX(position),0)+1 AS p FROM channels WHERE guild_id=:guildId`,
      { guildId }
    ))[0]?.p ?? 1);

    await q(
      `INSERT INTO channels (id,guild_id,name,type,position,parent_id)
       VALUES (:id,:guildId,:name,:type,:position,:parentId)`,
      { id, guildId, name: body.name, type: body.type, position: pos, parentId: body.parentId ?? null }
    );

    const channel = (await q<any>(
      `SELECT id,guild_id,name,type,position,parent_id,created_at FROM channels WHERE id=:id`,
      { id }
    ))[0];

    broadcastGuild(guildId, "CHANNEL_CREATE", { channel });
    return rep.send({ channelId: id });
  });

  // Update channel (requires MANAGE_CHANNELS)
  app.patch("/v1/channels/:channelId", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const { channelId } = z.object({ channelId: z.string().min(3) }).parse(req.params);
    const userId = req.auth.userId as string;

    const body = z.object({
      name: z.string().min(1).max(64).optional(),
      parentId: z.string().min(3).nullable().optional(),
      position: z.number().int().optional()
    }).parse(req.body);

    const ch = await q<{ guild_id: string }>(`SELECT guild_id FROM channels WHERE id=:channelId`, { channelId });
    if (!ch.length) return rep.code(404).send({ error: "CHANNEL_NOT_FOUND" });
    const guildId = ch[0].guild_id;

    try { await requireGuildMember(guildId, userId, req.auth.roles, req.auth.coreServerId); }
    catch { return rep.code(403).send({ error: "NOT_GUILD_MEMBER" }); }

    try {
      await requireManageChannels({ guildId, channelIdForPerms: channelId, actorId: userId, actorRoles: req.auth.roles });
    } catch {
      return rep.code(403).send({ error: "MISSING_PERMS" });
    }

    if (body.parentId !== undefined && body.parentId !== null) {
      const parent = await q<{ id: string; type: string }>(
        `SELECT id,type FROM channels WHERE id=:parentId AND guild_id=:guildId`,
        { parentId: body.parentId, guildId }
      );
      if (!parent.length || parent[0].type !== "category") return rep.code(400).send({ error: "INVALID_PARENT" });
    }

    await q(
      `UPDATE channels SET
        name = COALESCE(:name, name),
        parent_id = CASE WHEN :parentSet=1 THEN :parentId ELSE parent_id END,
        position = COALESCE(:position, position)
       WHERE id=:channelId`,
      {
        channelId,
        name: body.name ?? null,
        parentSet: body.parentId !== undefined ? 1 : 0,
        parentId: body.parentId ?? null,
        position: body.position ?? null
      }
    );

    const channel = (await q<any>(
      `SELECT id,guild_id,name,type,position,parent_id,created_at FROM channels WHERE id=:channelId`,
      { channelId }
    ))[0];

    broadcastGuild(guildId, "CHANNEL_UPDATE", { channel });
    return rep.send({ ok: true });
  });

  // Delete channel (requires MANAGE_CHANNELS)
  app.delete("/v1/channels/:channelId", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const { channelId } = z.object({ channelId: z.string().min(3) }).parse(req.params);
    const userId = req.auth.userId as string;

    const ch = await q<{ guild_id: string; type: string }>(
      `SELECT guild_id,type FROM channels WHERE id=:channelId`,
      { channelId }
    );
    if (!ch.length) return rep.code(404).send({ error: "CHANNEL_NOT_FOUND" });
    const guildId = ch[0].guild_id;

    try { await requireGuildMember(guildId, userId, req.auth.roles, req.auth.coreServerId); }
    catch { return rep.code(403).send({ error: "NOT_GUILD_MEMBER" }); }

    try {
      await requireManageChannels({ guildId, channelIdForPerms: channelId, actorId: userId, actorRoles: req.auth.roles });
    } catch {
      return rep.code(403).send({ error: "MISSING_PERMS" });
    }

    await q(`DELETE FROM channels WHERE id=:channelId`, { channelId });
    broadcastGuild(guildId, "CHANNEL_DELETE", { channelId });
    return rep.send({ ok: true });
  });

  // Join voice channel
  app.post("/v1/channels/:channelId/voice/join", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const { channelId } = z.object({ channelId: z.string().min(3) }).parse(req.params);
    const userId = req.auth.userId as string;

    const ch = await q<{ guild_id: string; type: string }>(
      `SELECT guild_id, type FROM channels WHERE id=:channelId`,
      { channelId }
    );
    if (!ch.length) return rep.code(404).send({ error: "CHANNEL_NOT_FOUND" });
    if (ch[0].type !== "voice") return rep.code(400).send({ error: "NOT_VOICE_CHANNEL" });

    const guildId = ch[0].guild_id;

    // Leave any other voice channels in this guild first
    await q(
      `DELETE FROM voice_states WHERE user_id=:userId AND guild_id=:guildId`,
      { userId, guildId }
    );

    // Join this one
    await q(
      `INSERT INTO voice_states (guild_id, channel_id, user_id) VALUES (:guildId,:channelId,:userId)
       ON DUPLICATE KEY UPDATE channel_id=:channelId, updated_at=NOW()`,
      { guildId, channelId, userId }
    );

    broadcastGuild(guildId, "VOICE_STATE_UPDATE", { userId, channelId, muted: false, deafened: false });
    return rep.send({ ok: true });
  });

  // Leave voice channel
  app.post("/v1/channels/:channelId/voice/leave", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const { channelId } = z.object({ channelId: z.string().min(3) }).parse(req.params);
    const userId = req.auth.userId as string;

    const ch = await q<{ guild_id: string }>(
      `SELECT guild_id FROM channels WHERE id=:channelId`,
      { channelId }
    );
    if (!ch.length) return rep.code(404).send({ error: "CHANNEL_NOT_FOUND" });
    const guildId = ch[0].guild_id;

    await q(
      `DELETE FROM voice_states WHERE user_id=:userId AND channel_id=:channelId`,
      { userId, channelId }
    );

    broadcastGuild(guildId, "VOICE_STATE_REMOVE", { userId, channelId });
    return rep.send({ ok: true });
  });

  // Toggle mute/deafen
  app.patch("/v1/channels/:channelId/voice/state", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const { channelId } = z.object({ channelId: z.string().min(3) }).parse(req.params);
    const userId = req.auth.userId as string;
    const body = z.object({
      muted: z.boolean().optional(),
      deafened: z.boolean().optional()
    }).parse(req.body);

    const vs = await q<{ guild_id: string }>(
      `SELECT guild_id FROM voice_states WHERE user_id=:userId AND channel_id=:channelId`,
      { userId, channelId }
    );
    if (!vs.length) return rep.code(404).send({ error: "NOT_IN_VOICE" });
    const guildId = vs[0].guild_id;

    await q(
      `UPDATE voice_states SET
        muted = COALESCE(:muted, muted),
        deafened = COALESCE(:deafened, deafened),
        updated_at = NOW()
       WHERE user_id=:userId AND channel_id=:channelId`,
      { userId, channelId, muted: body.muted, deafened: body.deafened }
    );

    const updated = (await q<any>(
      `SELECT muted, deafened FROM voice_states WHERE user_id=:userId AND channel_id=:channelId`,
      { userId, channelId }
    ))[0];

    broadcastGuild(guildId, "VOICE_STATE_UPDATE", { userId, channelId, ...updated });
    return rep.send({ ok: true });
  });
}
