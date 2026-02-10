import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ulidLike } from "@ods/shared/ids.js";
import { q } from "../db.js";
import { requireGuildMember } from "../auth/requireGuildMember.js";
import { resolveChannelPermissions } from "../permissions/resolve.js";
import { Perm, has } from "../permissions/bits.js";

export async function messageRoutes(
  app: FastifyInstance,
  broadcastToChannel: (channelId: string, event: any) => void
) {
  // Fetch messages (requires VIEW_CHANNEL)
  app.get("/v1/channels/:channelId/messages", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const { channelId } = z.object({ channelId: z.string().min(3) }).parse(req.params);
    const userId = req.auth.userId as string;

    const qs = z.object({
      limit: z.coerce.number().min(1).max(100).default(50),
      before: z.string().datetime().optional()
    }).parse(req.query);

    const ch = await q<{ id: string; guild_id: string }>(
      `SELECT id,guild_id FROM channels WHERE id=:channelId`,
      { channelId }
    );
    if (!ch.length) return rep.code(404).send({ error: "CHANNEL_NOT_FOUND" });

    const guildId = ch[0].guild_id;

    try { await requireGuildMember(guildId, userId, req.auth.roles); }
    catch { return rep.code(403).send({ error: "NOT_GUILD_MEMBER" }); }

    const perms = await resolveChannelPermissions({ guildId, channelId, userId, roles: req.auth.roles });
    if (!has(perms, Perm.VIEW_CHANNEL)) return rep.code(403).send({ error: "MISSING_PERMS" });

    let rows: any[];
    if (qs.before) {
      rows = await q<any>(
        `SELECT id,author_id,content,created_at
         FROM messages
         WHERE channel_id=:channelId AND created_at < :before
         ORDER BY created_at DESC
         LIMIT :limit`,
        { channelId, before: qs.before, limit: qs.limit }
      );
    } else {
      rows = await q<any>(
        `SELECT id,author_id,content,created_at
         FROM messages
         WHERE channel_id=:channelId
         ORDER BY created_at DESC
         LIMIT :limit`,
        { channelId, limit: qs.limit }
      );
    }

    // Attachments for returned messages
    if (rows.length) {
      const ids = rows.map(r => r.id);
      const params: Record<string, any> = {};
      const inList = ids.map((id, i) => (params[`m${i}`] = id, `:m${i}`)).join(",");
      const atts = await q<any>(
        `SELECT id,message_id,file_name,content_type,size_bytes,expires_at
         FROM attachments
         WHERE message_id IN (${inList})`,
        params
      );
      const byMsg = new Map<string, any[]>();
      for (const a of atts) {
        if (!byMsg.has(a.message_id)) byMsg.set(a.message_id, []);
        byMsg.get(a.message_id)!.push({
          id: a.id,
          fileName: a.file_name,
          contentType: a.content_type,
          sizeBytes: a.size_bytes,
          expiresAt: new Date(a.expires_at).toISOString(),
          url: `/v1/attachments/${a.id}`
        });
      }
      for (const r of rows) r.attachments = byMsg.get(r.id) ?? [];
    }

    return { messages: rows };
  });

  // Send message (requires VIEW_CHANNEL + SEND_MESSAGES)
  // optional attachmentIds links uploads to this message
  app.post("/v1/channels/:channelId/messages", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const { channelId } = z.object({ channelId: z.string().min(3) }).parse(req.params);
    const authorId = req.auth.userId as string;

    const body = z.object({
      content: z.string().min(1).max(4000),
      attachmentIds: z.array(z.string().min(3)).max(10).optional()
    }).parse(req.body);

    const ch = await q<{ id: string; guild_id: string }>(
      `SELECT id,guild_id FROM channels WHERE id=:channelId`,
      { channelId }
    );
    if (!ch.length) return rep.code(404).send({ error: "CHANNEL_NOT_FOUND" });
    const guildId = ch[0].guild_id;

    try { await requireGuildMember(guildId, authorId, req.auth.roles); }
    catch { return rep.code(403).send({ error: "NOT_GUILD_MEMBER" }); }

    const perms = await resolveChannelPermissions({ guildId, channelId, userId: authorId, roles: req.auth.roles });
    if (!has(perms, Perm.VIEW_CHANNEL) || !has(perms, Perm.SEND_MESSAGES)) {
      return rep.code(403).send({ error: "MISSING_PERMS" });
    }

    // Validate attachments (must belong to same guild/channel, uploaded by author, not expired, and not already linked)
    const attachmentIds = body.attachmentIds ?? [];
    if (attachmentIds.length) {
      const params: Record<string, any> = {};
      const inList = attachmentIds.map((id, i) => (params[`a${i}`] = id, `:a${i}`)).join(",");

      const rows = await q<any>(
        `SELECT id,guild_id,channel_id,uploader_id,expires_at,message_id
         FROM attachments
         WHERE id IN (${inList})`,
        params
      );

      if (rows.length !== attachmentIds.length) return rep.code(400).send({ error: "BAD_ATTACHMENT" });

      for (const a of rows) {
        if (a.guild_id !== guildId || a.channel_id !== channelId) return rep.code(400).send({ error: "BAD_ATTACHMENT_SCOPE" });
        if (a.uploader_id !== authorId) return rep.code(403).send({ error: "BAD_ATTACHMENT_OWNER" });
        if (a.message_id) return rep.code(400).send({ error: "ATTACHMENT_ALREADY_LINKED" });
        if (new Date(a.expires_at).getTime() < Date.now()) return rep.code(410).send({ error: "ATTACHMENT_EXPIRED" });
      }
    }

    const id = ulidLike();
    const createdAt = new Date().toISOString();

    await q(
      `INSERT INTO messages (id,channel_id,author_id,content,created_at)
       VALUES (:id,:channelId,:authorId,:content,:createdAt)`,
      { id, channelId, authorId: authorId, content: body.content, createdAt: createdAt.slice(0, 19).replace("T", " ") }
    );

    // Link attachments to message
    for (const attId of attachmentIds) {
      await q(
        `UPDATE attachments SET message_id=:messageId
         WHERE id=:attId`,
        { messageId: id, attId }
      );
    }

    const payload = {
      channelId,
      message: {
        id,
        authorId,
        content: body.content,
        createdAt,
        attachments: attachmentIds.map(aid => ({ id: aid, url: `/v1/attachments/${aid}` }))
      }
    };

    broadcastToChannel(channelId, payload);
    return rep.send({ messageId: id, createdAt });
  });
}
