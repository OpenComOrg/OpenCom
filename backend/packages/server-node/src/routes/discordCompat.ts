import { FastifyInstance } from "fastify";
import { z } from "zod";

type ChannelRow = {
  id: string;
  guild_id: string;
  name: string;
  type: "text" | "voice" | "category";
  position: number;
  parent_id: string | null;
};

type MessageRow = {
  id: string;
  author_id?: string;
  authorId?: string;
  content: string;
  created_at?: string;
  createdAt?: string;
};

const DiscordChannelCreate = z.object({
  name: z.string().min(1).max(64),
  type: z.union([z.number().int(), z.string()]).optional(),
  parent_id: z.string().min(3).nullable().optional(),
  position: z.number().int().optional()
});

const DiscordChannelPatch = z.object({
  name: z.string().min(1).max(64).optional(),
  parent_id: z.string().min(3).nullable().optional(),
  position: z.number().int().optional()
});

const DiscordMessageCreate = z.object({
  content: z.string().min(1).max(4000)
});

function parseMaybeJson(payload: string | undefined): any {
  if (!payload) return null;
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

function toDiscordChannelType(type: ChannelRow["type"]): number {
  if (type === "voice") return 2;
  if (type === "category") return 4;
  return 0;
}

function fromDiscordChannelType(type: number | string | undefined): "text" | "voice" | "category" {
  if (type === 2 || type === "2" || type === "voice") return "voice";
  if (type === 4 || type === "4" || type === "category") return "category";
  return "text";
}

function mapDiscordChannel(channel: ChannelRow) {
  return {
    id: channel.id,
    type: toDiscordChannelType(channel.type),
    guild_id: channel.guild_id,
    name: channel.name,
    position: channel.position,
    parent_id: channel.parent_id,
    nsfw: false
  };
}

function mapDiscordMessage(message: MessageRow, channelId: string) {
  const authorId = message.author_id || message.authorId || "unknown";
  return {
    id: message.id,
    channel_id: channelId,
    content: message.content,
    timestamp: message.created_at || message.createdAt || new Date().toISOString(),
    edited_timestamp: null,
    tts: false,
    mention_everyone: false,
    mentions: [],
    mention_roles: [],
    attachments: [],
    embeds: [],
    pinned: false,
    type: 0,
    author: {
      id: authorId,
      username: authorId,
      discriminator: "0000",
      avatar: null
    }
  };
}

async function forward(app: FastifyInstance, req: any, url: string, method: "GET" | "POST" | "PATCH" | "DELETE", body?: any) {
  const res = await app.inject({
    method,
    url,
    headers: req.headers,
    payload: body
  });

  const data = parseMaybeJson(res.body);
  return { statusCode: res.statusCode, data };
}

export async function discordCompatRoutes(app: FastifyInstance) {
  app.get("/api/v9/users/@me/guilds", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const { statusCode, data } = await forward(app, req, "/v1/me/guilds", "GET");
    if (statusCode >= 400) return rep.code(statusCode).send(data || { message: "Request failed" });

    const guilds = Array.isArray(data?.guilds) ? data.guilds : [];
    return guilds.map((guild: any) => ({
      id: guild.id,
      name: guild.name,
      owner_id: guild.owner_user_id,
      owner: guild.owner_user_id === req.auth.userId,
      permissions: "0",
      features: []
    }));
  });

  app.get("/api/v9/guilds/:guildId/channels", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const { guildId } = z.object({ guildId: z.string().min(3) }).parse(req.params);
    const { statusCode, data } = await forward(app, req, `/v1/guilds/${guildId}/channels`, "GET");
    if (statusCode >= 400) return rep.code(statusCode).send(data || { message: "Request failed" });

    const channels = Array.isArray(data?.channels) ? data.channels : [];
    return channels.map((channel: ChannelRow) => mapDiscordChannel(channel));
  });

  app.post("/api/v9/guilds/:guildId/channels", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const { guildId } = z.object({ guildId: z.string().min(3) }).parse(req.params);
    const body = DiscordChannelCreate.parse(req.body);

    const { statusCode, data } = await forward(app, req, `/v1/guilds/${guildId}/channels`, "POST", {
      name: body.name,
      type: fromDiscordChannelType(body.type),
      parentId: body.parent_id,
      position: body.position
    });

    if (statusCode >= 400) return rep.code(statusCode).send(data || { message: "Request failed" });

    return {
      id: data?.channelId || null,
      guild_id: guildId,
      name: body.name,
      type: toDiscordChannelType(fromDiscordChannelType(body.type)),
      parent_id: body.parent_id ?? null,
      position: body.position ?? 0
    };
  });

  app.patch("/api/v9/channels/:channelId", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const { channelId } = z.object({ channelId: z.string().min(3) }).parse(req.params);
    const body = DiscordChannelPatch.parse(req.body);

    const { statusCode, data } = await forward(app, req, `/v1/channels/${channelId}`, "PATCH", {
      name: body.name,
      parentId: body.parent_id,
      position: body.position
    });

    if (statusCode >= 400) return rep.code(statusCode).send(data || { message: "Request failed" });
    return { id: channelId, ...body };
  });

  app.delete("/api/v9/channels/:channelId", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const { channelId } = z.object({ channelId: z.string().min(3) }).parse(req.params);
    const { statusCode, data } = await forward(app, req, `/v1/channels/${channelId}`, "DELETE");
    if (statusCode >= 400) return rep.code(statusCode).send(data || { message: "Request failed" });
    return { id: channelId, deleted: true };
  });

  app.get("/api/v9/channels/:channelId/messages", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const { channelId } = z.object({ channelId: z.string().min(3) }).parse(req.params);
    const query = z.object({
      limit: z.coerce.number().min(1).max(100).optional(),
      before: z.string().datetime().optional()
    }).parse(req.query);

    const qs = new URLSearchParams();
    if (query.limit) qs.set("limit", String(query.limit));
    if (query.before) qs.set("before", query.before);

    const { statusCode, data } = await forward(
      app,
      req,
      `/v1/channels/${channelId}/messages${qs.toString() ? `?${qs}` : ""}`,
      "GET"
    );

    if (statusCode >= 400) return rep.code(statusCode).send(data || { message: "Request failed" });
    const messages = Array.isArray(data?.messages) ? data.messages : [];
    return messages.map((message: MessageRow) => mapDiscordMessage(message, channelId));
  });

  app.post("/api/v9/channels/:channelId/messages", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const { channelId } = z.object({ channelId: z.string().min(3) }).parse(req.params);
    const body = DiscordMessageCreate.parse(req.body);

    const createRes = await forward(app, req, `/v1/channels/${channelId}/messages`, "POST", {
      content: body.content
    });

    if (createRes.statusCode >= 400) return rep.code(createRes.statusCode).send(createRes.data || { message: "Request failed" });

    const listRes = await forward(app, req, `/v1/channels/${channelId}/messages?limit=1`, "GET");
    if (listRes.statusCode >= 400) return rep.code(listRes.statusCode).send(listRes.data || { message: "Request failed" });

    const latest = Array.isArray(listRes.data?.messages) && listRes.data.messages.length
      ? listRes.data.messages[0]
      : { id: createRes.data?.messageId, content: body.content, authorId: req.auth.userId, createdAt: createRes.data?.createdAt };

    return mapDiscordMessage(latest, channelId);
  });
}
