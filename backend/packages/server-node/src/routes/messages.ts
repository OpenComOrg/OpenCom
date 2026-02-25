import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ulidLike } from "@ods/shared/ids.js";
import { q } from "../db.js";
import { requireGuildMember } from "../auth/requireGuildMember.js";
import { resolveChannelPermissions } from "../permissions/resolve.js";
import { Perm, has } from "../permissions/bits.js";

type Mention = { userId: string; display: string };

type MentionMeta = { mentionEveryone: boolean; mentions: Mention[] };

type MessageEmbed = {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  image?: { url: string };
  thumbnail?: { url: string };
  footer?: { text: string };
};

const EmbedSchema = z.object({
  title: z.string().max(256).optional(),
  description: z.string().max(4096).optional(),
  url: z.string().url().optional(),
  color: z.number().int().min(0).max(16777215).optional(),
  image: z.object({ url: z.string().url() }).optional(),
  thumbnail: z.object({ url: z.string().url() }).optional(),
  footer: z.object({ text: z.string().max(256) }).optional()
});

function normalizeMentionToken(value: string) {
  return value.trim().toLowerCase();
}

async function loadGuildMentionDirectory(guildId: string) {
  const rows = await q<{ user_id: string; nick: string | null }>(
    `SELECT user_id,nick FROM guild_members WHERE guild_id=:guildId`,
    { guildId }
  );

  const byToken = new Map<string, { userId: string; display: string }>();
  for (const row of rows) {
    const userId = row.user_id;
    const nick = (row.nick || "").trim();
    byToken.set(normalizeMentionToken(userId), { userId, display: nick || userId });
    if (nick) byToken.set(normalizeMentionToken(nick), { userId, display: nick });
  }

  return byToken;
}

function resolveMessageMentions(content: string, directory: Map<string, { userId: string; display: string }>): MentionMeta {
  const mentionEveryone = /@everyone\b/i.test(content);
  const mentions = new Map<string, Mention>();

  const braceRegex = /@\{([^}\n]{1,64})\}/g;
  for (const match of content.matchAll(braceRegex)) {
    const raw = (match[1] || "").trim();
    if (!raw) continue;
    const resolved = directory.get(normalizeMentionToken(raw));
    if (!resolved) continue;
    mentions.set(resolved.userId, { userId: resolved.userId, display: resolved.display });
  }

  const plainRegex = /(?:^|\s)@([a-zA-Z0-9_.-]{2,64})/g;
  for (const match of content.matchAll(plainRegex)) {
    const raw = (match[1] || "").trim();
    if (!raw || raw.toLowerCase() === "everyone") continue;
    const resolved = directory.get(normalizeMentionToken(raw));
    if (!resolved) continue;
    mentions.set(resolved.userId, { userId: resolved.userId, display: resolved.display });
  }

  return { mentionEveryone, mentions: Array.from(mentions.values()) };
}

function extractLinkEmbeds(content: string) {
  const regex = /(https?:\/\/[^\s<>"'`]+)/gi;
  const links = new Set<string>();
  let match = regex.exec(content || "");
  while (match) {
    links.add(match[1]);
    match = regex.exec(content || "");
  }

  return Array.from(links).slice(0, 5).map((urlValue) => {
    try {
      const parsed = new URL(urlValue);
      return {
        type: "link",
        url: urlValue,
        title: parsed.hostname,
        description: parsed.pathname && parsed.pathname !== "/" ? parsed.pathname : undefined
      };
    } catch {
      return { type: "link", url: urlValue, title: "Link" };
    }
  });
}

export async function messageRoutes(
  app: FastifyInstance,
  broadcastToChannel: (channelId: string, event: any) => void,
  broadcastMention: (userIds: string[], payload: any) => void
) {
  app.get("/v1/channels/:channelId/pins", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const { channelId } = z.object({ channelId: z.string().min(3) }).parse(req.params);
    const userId = req.auth.userId as string;

    const ch = await q<{ id: string; guild_id: string }>(
      `SELECT id,guild_id FROM channels WHERE id=:channelId`,
      { channelId }
    );
    if (!ch.length) return rep.code(404).send({ error: "CHANNEL_NOT_FOUND" });
    const guildId = ch[0].guild_id;

    try { await requireGuildMember(guildId, userId, req.auth.roles, req.auth.coreServerId); }
    catch { return rep.code(403).send({ error: "NOT_GUILD_MEMBER" }); }

    const perms = await resolveChannelPermissions({ guildId, channelId, userId, roles: req.auth.roles || [] });
    if (!has(perms, Perm.VIEW_CHANNEL)) return rep.code(403).send({ error: "MISSING_PERMS" });

    const rows = await q<any>(
      `SELECT p.message_id, p.pinned_by, p.pinned_at, m.author_id, m.author_name, m.content, m.created_at
       FROM channel_pins p
       JOIN messages m ON m.id = p.message_id
       WHERE p.channel_id=:channelId
       ORDER BY p.pinned_at DESC
       LIMIT 50`,
      { channelId }
    );

    return rep.send({
      pins: rows.map((row) => ({
        id: row.message_id,
        author: row.author_name || row.author_id,
        content: row.content,
        pinnedBy: row.pinned_by,
        pinnedAt: row.pinned_at,
        createdAt: row.created_at
      }))
    });
  });

  app.put("/v1/channels/:channelId/pins/:messageId", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const { channelId, messageId } = z.object({ channelId: z.string().min(3), messageId: z.string().min(3) }).parse(req.params);
    const userId = req.auth.userId as string;

    const ch = await q<{ guild_id: string }>(
      `SELECT guild_id FROM channels WHERE id=:channelId`,
      { channelId }
    );
    if (!ch.length) return rep.code(404).send({ error: "CHANNEL_NOT_FOUND" });
    const guildId = ch[0].guild_id;

    try { await requireGuildMember(guildId, userId, req.auth.roles, req.auth.coreServerId); }
    catch { return rep.code(403).send({ error: "NOT_GUILD_MEMBER" }); }

    const perms = await resolveChannelPermissions({ guildId, channelId, userId, roles: req.auth.roles || [] });
    if (!has(perms, Perm.VIEW_CHANNEL)) return rep.code(403).send({ error: "MISSING_PERMS" });

    const message = await q<{ id: string }>(
      `SELECT id FROM messages WHERE id=:messageId AND channel_id=:channelId LIMIT 1`,
      { messageId, channelId }
    );
    if (!message.length) return rep.code(404).send({ error: "MESSAGE_NOT_FOUND" });

    await q(
      `INSERT INTO channel_pins (channel_id,message_id,pinned_by,pinned_at)
       VALUES (:channelId,:messageId,:pinnedBy,NOW())
       ON DUPLICATE KEY UPDATE pinned_by=:pinnedBy, pinned_at=NOW()`,
      { channelId, messageId, pinnedBy: userId }
    );

    return rep.send({ ok: true });
  });

  app.delete("/v1/channels/:channelId/pins/:messageId", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const { channelId, messageId } = z.object({ channelId: z.string().min(3), messageId: z.string().min(3) }).parse(req.params);
    const userId = req.auth.userId as string;

    const ch = await q<{ guild_id: string }>(
      `SELECT guild_id FROM channels WHERE id=:channelId`,
      { channelId }
    );
    if (!ch.length) return rep.code(404).send({ error: "CHANNEL_NOT_FOUND" });
    const guildId = ch[0].guild_id;

    try { await requireGuildMember(guildId, userId, req.auth.roles, req.auth.coreServerId); }
    catch { return rep.code(403).send({ error: "NOT_GUILD_MEMBER" }); }

    const perms = await resolveChannelPermissions({ guildId, channelId, userId, roles: req.auth.roles || [] });
    if (!has(perms, Perm.VIEW_CHANNEL)) return rep.code(403).send({ error: "MISSING_PERMS" });

    await q(
      `DELETE FROM channel_pins WHERE channel_id=:channelId AND message_id=:messageId`,
      { channelId, messageId }
    );

    return rep.send({ ok: true });
  });

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

    try { await requireGuildMember(guildId, userId, req.auth.roles, req.auth.coreServerId); }
    catch { return rep.code(403).send({ error: "NOT_GUILD_MEMBER" }); }

    const perms = await resolveChannelPermissions({ guildId, channelId, userId, roles: req.auth.roles });
    if (!has(perms, Perm.VIEW_CHANNEL)) return rep.code(403).send({ error: "MISSING_PERMS" });

    const mentionDirectory = await loadGuildMentionDirectory(guildId);

    let rows: any[];
    if (qs.before) {
      rows = await q<any>(
        `SELECT m.id, m.author_id, m.author_name, m.author_avatar_url, m.content, m.embeds_json, m.created_at
         FROM messages m
         WHERE m.channel_id=:channelId AND m.created_at < :before
         ORDER BY m.created_at DESC
         LIMIT :limit`,
        { channelId, before: qs.before, limit: qs.limit }
      );
    } else {
      rows = await q<any>(
        `SELECT m.id, m.author_id, m.author_name, m.author_avatar_url, m.content, m.embeds_json, m.created_at
         FROM messages m
         WHERE m.channel_id=:channelId
         ORDER BY m.created_at DESC
         LIMIT :limit`,
        { channelId, limit: qs.limit }
      );
    }
    const hasMore = rows.length >= qs.limit;
    rows = rows.map((r: any) => {
      const mentionMeta = resolveMessageMentions(r.content || "", mentionDirectory);
      let embeds: any[] = [];
      try {
        embeds = Array.isArray(r.embeds_json) ? r.embeds_json : JSON.parse(r.embeds_json || "[]");
      } catch {
        embeds = [];
      }
      return {
        ...r,
        username: r.author_name || r.author_id,
        pfp_url: r.author_avatar_url || null,
        embeds: Array.isArray(embeds) ? embeds : [],
        linkEmbeds: extractLinkEmbeds(r.content || ""),
        ...mentionMeta
      };
    });

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

    return { messages: rows, hasMore };
  });

  // Send message (requires VIEW_CHANNEL + SEND_MESSAGES)
  // optional attachmentIds links uploads to this message
  app.post("/v1/channels/:channelId/messages", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const { channelId } = z.object({ channelId: z.string().min(3) }).parse(req.params);
    const authorId = req.auth.userId as string;

    const body = z.object({
      content: z.string().min(1).max(4000),
      attachmentIds: z.array(z.string().min(3)).max(10).optional(),
      embeds: z.array(EmbedSchema).max(5).optional()
    }).parse(req.body);

    const ch = await q<{ id: string; guild_id: string }>(
      `SELECT id,guild_id FROM channels WHERE id=:channelId`,
      { channelId }
    );
    if (!ch.length) return rep.code(404).send({ error: "CHANNEL_NOT_FOUND" });
    const guildId = ch[0].guild_id;

    try { await requireGuildMember(guildId, authorId, req.auth.roles, req.auth.coreServerId); }
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
    const mentionDirectory = await loadGuildMentionDirectory(guildId);
    const mentionMeta = resolveMessageMentions(body.content || "", mentionDirectory);
    const embeds = (body.embeds || []) as MessageEmbed[];

    await q(
      `INSERT INTO messages (id,channel_id,author_id,author_name,author_avatar_url,content,embeds_json,created_at)
       VALUES (:id,:channelId,:authorId,:authorName,:authorAvatarUrl,:content,:embedsJson,:createdAt)`,
      {
        id,
        channelId,
        authorId: authorId,
        authorName: null,
        authorAvatarUrl: null,
        content: body.content,
        embedsJson: JSON.stringify(embeds),
        createdAt: createdAt.slice(0, 19).replace("T", " ")
      }
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
        username: authorId,
        pfp_url: null,
        content: body.content,
        embeds,
        linkEmbeds: extractLinkEmbeds(body.content || ""),
        createdAt,
        attachments: attachmentIds.map(aid => ({ id: aid, url: `/v1/attachments/${aid}` })),
        mentionEveryone: mentionMeta.mentionEveryone,
        mentions: mentionMeta.mentions
      }
    };

    broadcastToChannel(channelId, payload);

    const mentionedUserIds = mentionMeta.mentions.map((m) => m.userId).filter((uid) => uid !== authorId);
    if (mentionMeta.mentionEveryone) {
      const allMemberIds = Array.from(mentionDirectory.values()).map((item) => item.userId);
      for (const userId of allMemberIds) {
        if (userId === authorId || mentionedUserIds.includes(userId)) continue;
        mentionedUserIds.push(userId);
      }
    }

    if (mentionedUserIds.length) {
      broadcastMention(mentionedUserIds, {
        guildId,
        channelId,
        messageId: id,
        authorId,
        mentionEveryone: mentionMeta.mentionEveryone,
        mentions: mentionMeta.mentions
      });
    }

    return rep.send({ messageId: id, createdAt, mentionEveryone: mentionMeta.mentionEveryone, mentions: mentionMeta.mentions });
  });
  app.delete("/v1/channels/:channelId/messages/:messageId", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const { channelId, messageId } = z.object({ channelId: z.string().min(3), messageId: z.string().min(3) }).parse(req.params);
    const userId = req.auth.userId as string;

    const ch = await q<{ guild_id: string }>(`SELECT guild_id FROM channels WHERE id=:channelId`, { channelId });
    if (!ch.length) return rep.code(404).send({ error: "CHANNEL_NOT_FOUND" });
    const guildId = ch[0].guild_id;

    try { await requireGuildMember(guildId, userId, req.auth.roles, req.auth.coreServerId); }
    catch { return rep.code(403).send({ error: "NOT_GUILD_MEMBER" }); }

    const perms = await resolveChannelPermissions({ guildId, channelId, userId, roles: req.auth.roles || [] });
    if (!has(perms, Perm.VIEW_CHANNEL)) return rep.code(403).send({ error: "MISSING_PERMS" });

    const rows = await q<{ id: string; author_id: string }>(
      `SELECT id,author_id FROM messages WHERE id=:messageId AND channel_id=:channelId LIMIT 1`,
      { messageId, channelId }
    );
    if (!rows.length) return rep.code(404).send({ error: "MESSAGE_NOT_FOUND" });
    const canModerateMessages = has(perms, Perm.ADMINISTRATOR) || has(perms, Perm.MANAGE_CHANNELS);
    if (rows[0].author_id !== userId && !canModerateMessages) return rep.code(403).send({ error: "MISSING_PERMS" });

    await q(`DELETE FROM messages WHERE id=:messageId`, { messageId });
    broadcastToChannel(channelId, { channelId, messageDelete: { id: messageId } });
    return rep.send({ ok: true });
  });

}
