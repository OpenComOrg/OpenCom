import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ulidLike } from "@ods/shared/ids.js";
import { q } from "../db.js";
import { SignJWT, importJWK } from "jose";
import { env } from "../env.js";

const CreateServer = z.object({
  name: z.string().min(2).max(64),
  baseUrl: z.string().url()
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

async function ensureDefaultGuildOnServerNode(serverId: string, serverName: string, baseUrl: string, ownerUserId: string) {
  const platformRole = await getPlatformRole(ownerUserId);
  const ownerRoles = ["owner"];
  if (platformRole === "admin") ownerRoles.push("platform_admin");
  if (platformRole === "owner") ownerRoles.push("platform_admin", "platform_owner");

  const membershipToken = await signMembershipToken(serverId, ownerUserId, ownerRoles, platformRole);

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
  app.post("/v1/servers", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const userId = req.user.sub as string;
    const body = CreateServer.parse(req.body);

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

  app.get("/v1/servers", { preHandler: [app.authenticate] } as any, async (req: any) => {
    const userId = req.user.sub as string;
    const platformRole = await getPlatformRole(userId);

    const rows = platformRole === "user"
      ? await q<{ id: string; name: string; base_url: string; roles: string }>(
        `SELECT s.id, s.name, s.base_url, m.roles
         FROM memberships m
         JOIN servers s ON s.id=m.server_id
         WHERE m.user_id=:userId
         ORDER BY s.created_at DESC`,
        { userId }
      )
      : await q<{ id: string; name: string; base_url: string; roles: string }>(
        `SELECT s.id, s.name, s.base_url,
                COALESCE((SELECT m.roles FROM memberships m WHERE m.server_id=s.id AND m.user_id=:userId LIMIT 1), '[]') AS roles
         FROM servers s
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

      const membershipToken = await signMembershipToken(r.id, userId, membershipRoles, platformRole);

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
