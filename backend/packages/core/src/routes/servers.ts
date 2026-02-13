import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ulidLike } from "@ods/shared/ids.js";
import { q } from "../db.js";
import { SignJWT, importJWK } from "jose";
import { env } from "../env.js";
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

async function signMembershipToken(serverId: string, userId: string, roles: string[], platformRole: "user" | "admin" | "owner") {
  const privateJwk = JSON.parse(env.CORE_MEMBERSHIP_PRIVATE_JWK);
  const priv = await importJWK(privateJwk, "RS256");

  return new SignJWT({
    server_id: serverId,
    roles,
    platform_role: platformRole
  })
    .setProtectedHeader({ alg: "RS256", kid: privateJwk.kid })
    .setIssuer(env.CORE_ISSUER)
    .setAudience(serverId)
    .setSubject(userId)
    .setExpirationTime("10m")
    .sign(priv);
}

async function ensureDefaultGuildOnServerNode(serverId: string, serverName: string, baseUrl: string, ownerUserId: string, tokenServerId?: string) {
  const platformRole = await getPlatformRole(ownerUserId);
  const ownerRoles = ["owner"];
  if (platformRole === "admin") ownerRoles.push("platform_admin");
  if (platformRole === "owner") ownerRoles.push("platform_admin", "platform_owner");

  // Use tokenServerId when calling the official node so the node accepts the token (it expects server_id === NODE_SERVER_ID)
  const idForToken = tokenServerId ?? serverId;
  const membershipToken = await signMembershipToken(idForToken, ownerUserId, ownerRoles, platformRole);

  const response = await fetch(`${baseUrl}/v1/guilds`, {
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
}

export async function serverRoutes(app: FastifyInstance) {
  // Create one server per user hosted on the platform's official node (no baseUrl needed).
  // Validate all config and quota before writing anything to DB.
  app.post("/v1/servers/official", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const userId = req.user.sub as string;
    const body = parseBody(CreateOfficialServer, req.body);

    if (!OFFICIAL_NODE_BASE_URL) {
      return rep.code(503).send({ error: "OFFICIAL_SERVER_UNAVAILABLE" });
    }
    if (!OFFICIAL_NODE_SERVER_ID) {
      app.log.warn("OFFICIAL_NODE_SERVER_ID is not set; set it to the same value as NODE_SERVER_ID on the official node");
      return rep.code(503).send({ error: "OFFICIAL_SERVER_NOT_CONFIGURED" });
    }

    const platformRole = await getPlatformRole(userId);
    if (platformRole === "user") {
      const owned = await q<{ count: number }>(`SELECT COUNT(*) as count FROM servers WHERE owner_user_id=:userId`, { userId });
      if (Number(owned[0]?.count || 0) >= 1) {
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
      await ensureDefaultGuildOnServerNode(id, body.name, OFFICIAL_NODE_BASE_URL, userId, OFFICIAL_NODE_SERVER_ID);
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
      const ownedServers = await q<{ count: number }>(
        `SELECT COUNT(*) as count FROM servers WHERE owner_user_id=:userId`,
        { userId }
      );
      const totalOwned = Number(ownedServers[0]?.count || 0);
      if (totalOwned >= 1) return rep.code(403).send({ error: "SERVER_LIMIT_REACHED" });
    }

    const id = ulidLike();
    await q(`INSERT INTO servers (id,name,base_url,owner_user_id) VALUES (:id,:name,:baseUrl,:userId)`,
      { id, name: body.name, baseUrl: body.baseUrl, userId }
    );
    await q(`INSERT INTO memberships (server_id,user_id,roles) VALUES (:id,:userId,:roles)`,
      { id, userId, roles: JSON.stringify(["owner"]) }
    );

    try {
      await ensureDefaultGuildOnServerNode(id, body.name, body.baseUrl, userId);
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

    const rows = await q<{ id: string; name: string; base_url: string; roles: string }>(
      `SELECT s.id, s.name, s.base_url, m.roles
       FROM memberships m
       JOIN servers s ON s.id = m.server_id
       WHERE m.user_id = :userId
       ORDER BY s.created_at DESC`,
      { userId }
    );

    const servers = await Promise.all(rows.map(async (r) => {
      const membershipRoles = Array.isArray(r.roles) ? r.roles : JSON.parse(r.roles || "[]");
      if (platformRole === "admin" && !membershipRoles.includes("platform_admin")) membershipRoles.push("platform_admin");
      if (platformRole === "owner") {
        if (!membershipRoles.includes("platform_admin")) membershipRoles.push("platform_admin");
        if (!membershipRoles.includes("platform_owner")) membershipRoles.push("platform_owner");
      }

      // For official node, token must use OFFICIAL_NODE_SERVER_ID so the node accepts it
      const idForToken = (OFFICIAL_NODE_BASE_URL && OFFICIAL_NODE_SERVER_ID && r.base_url === OFFICIAL_NODE_BASE_URL)
        ? OFFICIAL_NODE_SERVER_ID
        : r.id;
      const membershipToken = await signMembershipToken(idForToken, userId, membershipRoles, platformRole);

      return {
        id: r.id,
        name: r.name,
        baseUrl: r.base_url,
        roles: membershipRoles,
        membershipToken
      };
    }));

    return { servers };
  });
}