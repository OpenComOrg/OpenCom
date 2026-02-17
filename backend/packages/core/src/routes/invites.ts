import { FastifyInstance } from "fastify";
import { z } from "zod";
import crypto from "node:crypto";
import { q } from "../db.js";
import { env } from "../env.js";
import { signMembershipToken } from "../membershipToken.js";
import { parseBody } from "../validation.js";

function inviteCode(): string {
  return crypto.randomBytes(6).toString("base64url");
}

const CreateInvite = z.object({
  serverId: z.string().min(3),
  code: z.string().regex(/^[a-zA-Z0-9_-]{3,32}$/).optional(),
  permanent: z.boolean().optional(),
  maxUses: z.number().int().positive().optional(),
  expiresAt: z.string().datetime().optional()
});

const JoinInviteBody = z.object({
  accept: z.boolean().optional().default(true),
  codeOrUrl: z.string().min(3).optional()
});

function parseInviteCodeInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^[a-zA-Z0-9_-]{3,32}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    const q = url.searchParams.get("join");
    if (q && /^[a-zA-Z0-9_-]{3,32}$/.test(q)) return q;
    for (const key of url.searchParams.keys()) {
      if (/^join[a-zA-Z0-9_-]{3,32}$/.test(key)) {
        return key;
      }
    }
    const fromHash = (url.hash || "").replace(/^#/, "");
    if (fromHash.startsWith("join=")) {
      const hashCode = decodeURIComponent(fromHash.slice(5));
      if (/^[a-zA-Z0-9_-]{3,32}$/.test(hashCode)) return hashCode;
    }
  } catch {
    return "";
  }
  return "";
}

async function getPlatformRole(userId: string): Promise<"user" | "admin" | "owner"> {
  const founder = await q<{ founder_user_id: string | null }>(`SELECT founder_user_id FROM platform_config WHERE id=1`);
  if (founder.length && founder[0].founder_user_id === userId) return "owner";

  const admin = await q<{ user_id: string }>(`SELECT user_id FROM platform_admins WHERE user_id=:userId`, { userId });
  if (admin.length) return "admin";

  return "user";
}

async function hasBoostBadge(userId: string): Promise<boolean> {
  const rows = await q<{ badge: string }>(
    `SELECT badge FROM user_badges WHERE user_id=:userId AND badge='boost' LIMIT 1`,
    { userId }
  );
  return rows.length > 0;
}

export async function inviteRoutes(app: FastifyInstance) {
  async function joinByInviteCode(input: {
    userId: string;
    code: string;
    accept: boolean;
    log: any;
  }) {
    let rows = await q<any>(`SELECT * FROM invites WHERE code=:code`, { code: input.code });
    if (!rows.length && input.code.toLowerCase().startsWith("join") && input.code.length > 4) {
      rows = await q<any>(`SELECT * FROM invites WHERE code=:code`, { code: input.code.slice(4) });
    }
    if (!rows.length) return { status: 404, body: { error: "NOT_FOUND" } };

    const inv = rows[0];
    if (inv.expires_at && new Date(inv.expires_at).getTime() < Date.now()) return { status: 410, body: { error: "EXPIRED" } };
    if (inv.max_uses && inv.uses >= inv.max_uses) return { status: 410, body: { error: "MAX_USES" } };
    if (!input.accept) {
      return { status: 200, body: { ok: false, requiresAccept: true, serverId: inv.server_id, code: inv.code } };
    }

    await q(
      `INSERT INTO memberships (server_id,user_id,roles)
       VALUES (:serverId,:userId,:roles)
       ON DUPLICATE KEY UPDATE user_id=user_id`,
      { serverId: inv.server_id, userId: input.userId, roles: JSON.stringify(["member"]) }
    );

    await q(`UPDATE invites SET uses = uses + 1 WHERE code=:code`, { code: inv.code });

    // Add user to the node's guild so they see channels and can use the server
    const serverRow = await q<{ base_url: string; default_guild_id: string | null }>(
      `SELECT base_url, default_guild_id FROM servers WHERE id=:id`,
      { id: inv.server_id }
    );
    if (serverRow.length && serverRow[0].default_guild_id) {
      const baseUrl = (serverRow[0].base_url || "").replace(/\/$/, "");
      const defaultGuildId = serverRow[0].default_guild_id;
      const platformRole = await getPlatformRole(input.userId);
      const officialBase = (env.OFFICIAL_NODE_BASE_URL || "").replace(/\/$/, "");
      const audience =
        officialBase && env.OFFICIAL_NODE_SERVER_ID && baseUrl === officialBase
          ? env.OFFICIAL_NODE_SERVER_ID
          : inv.server_id;
      try {
        const joinToken = await signMembershipToken(audience, input.userId, ["member"], platformRole, inv.server_id);
        const joinRes = await fetch(`${baseUrl}/v1/guilds/${defaultGuildId}/join`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${joinToken}`
          },
          body: "{}"
        });
        if (!joinRes.ok) {
          input.log.warn({ serverId: inv.server_id, userId: input.userId, status: joinRes.status }, "Invite join: failed to add user to node guild");
        }

        // Post a simple join embed to the first text channel so invite joins are visible.
        try {
          const channelsRes = await fetch(`${baseUrl}/v1/guilds/${defaultGuildId}/channels`, {
            headers: { Authorization: `Bearer ${joinToken}` }
          });
          if (channelsRes.ok) {
            const channelsPayload = await channelsRes.json() as { channels?: any[] };
            const firstText = (channelsPayload.channels || []).find((channel) => channel.type === "text");
            if (firstText?.id) {
              await fetch(`${baseUrl}/v1/channels/${firstText.id}/messages`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${joinToken}`
                },
                body: JSON.stringify({
                  content: `${input.userId} joined via invite ${inv.code}`,
                  embeds: [
                    {
                      title: "Member Joined",
                      description: `${input.userId} accepted an invite.`,
                      footer: { text: `Invite code: ${inv.code}` }
                    }
                  ]
                })
              });
            }
          }
        } catch (embedErr) {
          input.log.warn({ err: embedErr, serverId: inv.server_id, userId: input.userId }, "Invite join: failed to post join embed");
        }
      } catch (err) {
        input.log.warn({ err, serverId: inv.server_id, userId: input.userId }, "Invite join: error calling node guild join");
      }
    }

    return { status: 200, body: { ok: true, serverId: inv.server_id } };
  }

  app.post("/v1/invites", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const userId = req.user.sub as string;
    const body = parseBody(CreateInvite, req.body);

    const s = await q<{ owner_user_id: string }>(`SELECT owner_user_id FROM servers WHERE id=:serverId`, { serverId: body.serverId });
    if (!s.length) return rep.code(404).send({ error: "SERVER_NOT_FOUND" });

    const platformRole = await getPlatformRole(userId);
    const canManage = s[0].owner_user_id === userId || platformRole === "admin" || platformRole === "owner";
    if (!canManage) return rep.code(403).send({ error: "FORBIDDEN" });

    const boostUser = await hasBoostBadge(userId);
    const wantsCustomCode = typeof body.code === "string" && body.code.trim().length > 0;
    const wantsPermanent = body.permanent === true;
    if ((wantsCustomCode || wantsPermanent) && !boostUser) {
      return rep.code(403).send({ error: "BOOST_REQUIRED" });
    }

    const code = body.code ?? inviteCode();
    const normalizedCode = code.trim();
    const maxUses = wantsPermanent ? null : (body.maxUses ?? null);
    const expiresAt = wantsPermanent ? null : (body.expiresAt ?? null);
    try {
      await q(
        `INSERT INTO invites (code, server_id, created_by, max_uses, expires_at)
         VALUES (:code,:serverId,:userId,:maxUses,:expiresAt)`,
        { code: normalizedCode, serverId: body.serverId, userId, maxUses, expiresAt }
      );
    } catch (error: any) {
      if (String(error?.message || "").toLowerCase().includes("duplicate")) {
        return rep.code(409).send({ error: "INVITE_CODE_TAKEN" });
      }
      throw error;
    }

    const compactKey = normalizedCode.toLowerCase().startsWith("join") ? normalizedCode : `join${normalizedCode}`;
    const publicBaseUrl = env.APP_BASE_URL.replace(/\/$/, "");
    const compactJoinUrl = boostUser && wantsCustomCode
      ? `${publicBaseUrl}/?${encodeURIComponent(compactKey)}`
      : `${publicBaseUrl}/?join=${encodeURIComponent(normalizedCode)}`;
    return {
      code: normalizedCode,
      serverId: body.serverId,
      permanent: wantsPermanent,
      joinUrl: compactJoinUrl
    };
  });

  app.get("/v1/invites/:code", async (req, rep) => {
    const { code } = z.object({ code: z.string().min(3) }).parse(req.params);
    let rows = await q<any>(
      `SELECT i.code, i.server_id, i.max_uses, i.uses, i.expires_at, i.created_at, s.name AS server_name, s.logo_url AS server_logo_url
       FROM invites i
       JOIN servers s ON s.id = i.server_id
       WHERE i.code=:code`,
      { code }
    );
    if (!rows.length && code.toLowerCase().startsWith("join") && code.length > 4) {
      rows = await q<any>(
        `SELECT i.code, i.server_id, i.max_uses, i.uses, i.expires_at, i.created_at, s.name AS server_name, s.logo_url AS server_logo_url
         FROM invites i
         JOIN servers s ON s.id = i.server_id
         WHERE i.code=:code`,
        { code: code.slice(4) }
      );
    }
    if (!rows.length) return rep.code(404).send({ error: "NOT_FOUND" });

    const inv = rows[0];
    if (inv.expires_at && new Date(inv.expires_at).getTime() < Date.now()) return rep.code(410).send({ error: "EXPIRED" });
    if (inv.max_uses && inv.uses >= inv.max_uses) return rep.code(410).send({ error: "MAX_USES" });

    return {
      ...inv,
      serverName: inv.server_name,
      serverLogoUrl: inv.server_logo_url
    };
  });

  app.post("/v1/invites/join", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const userId = req.user.sub as string;
    const body = parseBody(JoinInviteBody, req.body || {});
    const code = parseInviteCodeInput(body.codeOrUrl || "");
    if (!code) return rep.code(400).send({ error: "INVALID_INVITE_INPUT" });
    const result = await joinByInviteCode({ userId, code, accept: body.accept, log: req.log });
    return rep.code(result.status).send(result.body);
  });

  app.post("/v1/invites/:code/join", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const userId = req.user.sub as string;
    const { code } = z.object({ code: z.string().min(3) }).parse(req.params);
    const body = parseBody(JoinInviteBody, req.body || {});
    const result = await joinByInviteCode({ userId, code, accept: body.accept, log: req.log });
    return rep.code(result.status).send(result.body);
  });
}
