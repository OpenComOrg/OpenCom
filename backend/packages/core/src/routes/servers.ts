import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ulidLike } from "@ods/shared/ids.js";
import { q } from "../db.js";
import { env } from "../env.js";
import { signMembershipToken } from "../membershipToken.js";
import { parseBody } from "../validation.js";

const OFFICIAL_NODE_BASE_URL = env.OFFICIAL_NODE_BASE_URL;
const OFFICIAL_NODE_SERVER_ID = env.OFFICIAL_NODE_SERVER_ID;

const CreateServer = z.object({
  name: z.string().min(2).max(64),
  baseUrl: z.string().url()
});

const CreateOfficialServer = z.object({
  name: z.string().min(2).max(64)
});

async function getPlatformRole(userId: string): Promise<"user" | "admin" | "owner"> {
  const founder = await q<{ founder_user_id: string | null }>(`SELECT founder_user_id FROM platform_config WHERE id=1`);
  if (founder.length && founder[0].founder_user_id === userId) return "owner";

  const admin = await q<{ user_id: string }>(`SELECT user_id FROM platform_admins WHERE user_id=:userId`, { userId });
  if (admin.length) return "admin";

  return "user";
}

async function canOwnMoreServers(userId: string): Promise<boolean> {
  const owned = await q<{ count: number }>(`SELECT COUNT(*) as count FROM servers WHERE owner_user_id=:userId`, { userId });
  const totalOwned = Number(owned[0]?.count || 0);
  if (totalOwned < 1) return true;

  const boostBadge = await q<{ badge: string }>(
    `SELECT badge FROM user_badges WHERE user_id=:userId AND badge='boost' LIMIT 1`,
    { userId }
  );
  return boostBadge.length > 0;
}

async function ensureDefaultGuildOnServerNode(serverId: string, serverName: string, baseUrl: string, ownerUserId: string, tokenServerId?: string): Promise<string> {
  const platformRole = await getPlatformRole(ownerUserId);
  const ownerRoles = ["owner"];
  if (platformRole === "admin") ownerRoles.push("platform_admin");
  if (platformRole === "owner") ownerRoles.push("platform_admin", "platform_owner");

  // Use tokenServerId when calling the official node so the node accepts the token (it expects server_id === NODE_SERVER_ID)
  const idForToken = tokenServerId ?? serverId;
  const membershipToken = await signMembershipToken(idForToken, ownerUserId, ownerRoles, platformRole, serverId);

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/guilds`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${membershipToken}`
    },
    body: JSON.stringify({ name: serverName, createDefaultVoice: true })
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`DEFAULT_GUILD_CREATE_FAILED_${response.status}${errorBody ? `:${errorBody}` : ""}`);
  }

  const data = (await response.json()) as { guildId?: string };
  return data.guildId ?? "";
}

export async function serverRoutes(app: FastifyInstance) {
  // Create a server hosted on the platform's official node (no baseUrl needed).
  // Validate all config and quota before writing anything to DB.
  app.post("/v1/servers/official", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const userId = req.user.sub as string;
    const body = parseBody(CreateOfficialServer, req.body);

    if (!OFFICIAL_NODE_BASE_URL) {
      return rep.code(503).send({ error: "OFFICIAL_SERVER_UNAVAILABLE", message: "Official server node URL is not configured." });
    }
    if (!OFFICIAL_NODE_SERVER_ID) {
      app.log.warn("OFFICIAL_NODE_SERVER_ID is not set; set it to the same value as NODE_SERVER_ID on the official node");
      return rep.code(503).send({
        error: "OFFICIAL_SERVER_NOT_CONFIGURED",
        message: "Set OFFICIAL_NODE_SERVER_ID on the API server to the same value as NODE_SERVER_ID on your node."
      });
    }

    const platformRole = await getPlatformRole(userId);
    if (platformRole === "user") {
      const allowed = await canOwnMoreServers(userId);
      if (!allowed) {
        return rep.code(403).send({ error: "SERVER_LIMIT_REACHED" });
      }
    }

    const id = ulidLike();
    try {
      await q(`INSERT INTO servers (id,name,base_url,owner_user_id) VALUES (:id,:name,:baseUrl,:userId)`,
        { id, name: body.name, baseUrl: OFFICIAL_NODE_BASE_URL, userId }
      );
      await q(`INSERT INTO memberships (server_id,user_id,roles) VALUES (:id,:userId,:roles)`,
        { id, userId, roles: JSON.stringify(["owner"]) }
      );
      const defaultGuildId = await ensureDefaultGuildOnServerNode(id, body.name, OFFICIAL_NODE_BASE_URL, userId, OFFICIAL_NODE_SERVER_ID);
      if (defaultGuildId) {
        await q(`UPDATE servers SET default_guild_id = :defaultGuildId WHERE id = :id`, { id, defaultGuildId });
      }
    } catch (error: any) {
      if (error.message?.startsWith("DEFAULT_GUILD_CREATE_FAILED_")) {
        app.log.error({ err: error, serverId: id }, "Failed to create default guild on official node");
        await q(`DELETE FROM memberships WHERE server_id=:id`, { id }).catch(() => {});
        await q(`DELETE FROM servers WHERE id=:id`, { id }).catch(() => {});
        return rep.code(502).send({ error: "DEFAULT_GUILD_CREATE_FAILED" });
      }
      throw error;
    }

    return rep.send({ serverId: id });
  });

  app.post("/v1/servers", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const userId = req.user.sub as string;
    const body = parseBody(CreateServer, req.body);

    const platformRole = await getPlatformRole(userId);
    if (platformRole === "user") {
      const allowed = await canOwnMoreServers(userId);
      if (!allowed) return rep.code(403).send({ error: "SERVER_LIMIT_REACHED" });
    }

    const id = ulidLike();
    await q(`INSERT INTO servers (id,name,base_url,owner_user_id) VALUES (:id,:name,:baseUrl,:userId)`,
      { id, name: body.name, baseUrl: body.baseUrl, userId }
    );
    await q(`INSERT INTO memberships (server_id,user_id,roles) VALUES (:id,:userId,:roles)`,
      { id, userId, roles: JSON.stringify(["owner"]) }
    );

    try {
      const defaultGuildId = await ensureDefaultGuildOnServerNode(id, body.name, body.baseUrl, userId);
      if (defaultGuildId) {
        await q(`UPDATE servers SET default_guild_id = :defaultGuildId WHERE id = :id`, { id, defaultGuildId });
      }
    } catch (error: any) {
      app.log.error({ err: error, serverId: id, baseUrl: body.baseUrl }, "Failed to create default guild on server node");
      return rep.code(502).send({ error: "DEFAULT_GUILD_CREATE_FAILED" });
    }

    return rep.send({ serverId: id });
  });

  // Only return servers this user is a member of.
  app.get("/v1/servers", { preHandler: [app.authenticate] } as any, async (req: any) => {
    const userId = req.user.sub as string;
    const platformRole = await getPlatformRole(userId);

    const rows = await q<{ id: string; name: string; base_url: string; default_guild_id: string | null; owner_user_id: string; roles: string }>(
      `SELECT s.id, s.name, s.base_url, s.default_guild_id, s.owner_user_id, m.roles
       FROM memberships m
       JOIN servers s ON s.id = m.server_id
       WHERE m.user_id = :userId
       ORDER BY s.created_at DESC`,
      { userId }
    );

    const servers = await Promise.all(rows.map(async (r) => {
      let membershipRoles = Array.isArray(r.roles) ? r.roles : JSON.parse(r.roles || "[]");

      // If this server has only one member, that member is the owner (ensure DB is consistent)
      const memberCount = await q<{ c: number }>(
        `SELECT COUNT(*) as c FROM memberships WHERE server_id = :serverId`,
        { serverId: r.id }
      );
      const count = Number(memberCount[0]?.c ?? 0);
      let isServerOwner = r.owner_user_id === userId;
      if (count === 1) {
        await q(`UPDATE servers SET owner_user_id = :userId WHERE id = :serverId`, { userId, serverId: r.id });
        isServerOwner = true;
        if (!membershipRoles.includes("owner")) membershipRoles = [...membershipRoles, "owner"];
        await q(`UPDATE memberships SET roles = :roles WHERE server_id = :serverId AND user_id = :userId`, {
          serverId: r.id,
          userId,
          roles: JSON.stringify(membershipRoles)
        });
      }

      // Only include "owner" in returned roles if user is the actual server owner (or platform staff)
      const isPlatformStaff = platformRole === "admin" || platformRole === "owner";
      if (!isServerOwner && !isPlatformStaff && membershipRoles.includes("owner")) {
        membershipRoles = membershipRoles.filter((role: string) => role !== "owner");
      }

      if (platformRole === "admin" && !membershipRoles.includes("platform_admin")) membershipRoles.push("platform_admin");
      if (platformRole === "owner") {
        if (!membershipRoles.includes("platform_admin")) membershipRoles.push("platform_admin");
        if (!membershipRoles.includes("platform_owner")) membershipRoles.push("platform_owner");
      }

      // For official node, token must use OFFICIAL_NODE_SERVER_ID so the node accepts it
      const idForToken = (OFFICIAL_NODE_BASE_URL && OFFICIAL_NODE_SERVER_ID && r.base_url === OFFICIAL_NODE_BASE_URL)
        ? OFFICIAL_NODE_SERVER_ID
        : r.id;
      const membershipToken = await signMembershipToken(idForToken, userId, membershipRoles, platformRole, r.id);

      return {
        id: r.id,
        name: r.name,
        baseUrl: r.base_url,
        defaultGuildId: r.default_guild_id ?? undefined,
        roles: membershipRoles,
        membershipToken
      };
    }));

    return { servers };
  });

  // Leave server (remove membership; client should also call node POST /v1/guilds/:guildId/leave if it has defaultGuildId)
  app.post("/v1/servers/:serverId/leave", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const userId = req.user.sub as string;
    const { serverId } = z.object({ serverId: z.string().min(3) }).parse(req.params);

    const member = await q<{ user_id: string }>(
      `SELECT user_id FROM memberships WHERE server_id=:serverId AND user_id=:userId`,
      { serverId, userId }
    );
    if (!member.length) return rep.code(403).send({ error: "NOT_A_MEMBER" });

    const server = await q<{ id: string }>(`SELECT id FROM servers WHERE id=:serverId`, { serverId });
    if (!server.length) return rep.code(404).send({ error: "SERVER_NOT_FOUND" });

    await q(`DELETE FROM memberships WHERE server_id=:serverId AND user_id=:userId`, { serverId, userId });

    return rep.send({ ok: true });
  });

  // Delete server (owner only); removes server and all memberships
  app.delete("/v1/servers/:serverId", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const userId = req.user.sub as string;
    const { serverId } = z.object({ serverId: z.string().min(3) }).parse(req.params);

    const server = await q<{ owner_user_id: string }>(`SELECT owner_user_id FROM servers WHERE id=:serverId`, { serverId });
    if (!server.length) return rep.code(404).send({ error: "SERVER_NOT_FOUND" });
    if (server[0].owner_user_id !== userId) return rep.code(403).send({ error: "NOT_OWNER" });

    await q(`DELETE FROM memberships WHERE server_id=:serverId`, { serverId });
    await q(`DELETE FROM servers WHERE id=:serverId`, { serverId });

    return rep.send({ ok: true });
  });
}
