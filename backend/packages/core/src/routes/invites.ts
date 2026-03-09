import { FastifyInstance } from "fastify";
import { z } from "zod";
import crypto from "node:crypto";
import { q } from "../db.js";
import { env } from "../env.js";
import { signMembershipToken } from "../membershipToken.js";
import { parseBody } from "../validation.js";
import { reconcileBoostBadge } from "../boost.js";
import {
  clearInviteCodeReservation,
  getActiveInviteCodeReservation,
  getServerCustomInvites,
  reserveInviteCode,
  revokeCustomInvitesForOwnerLossOfBoost
} from "../customInvites.js";

const GUILD_ADMINISTRATOR_PERMISSION = 1n << 60n;

type PlatformRole = "user" | "admin" | "owner";

type ServerRow = {
  id: string;
  owner_user_id: string;
  base_url: string;
  default_guild_id: string | null;
  name: string;
  logo_url: string | null;
};

type InviteRow = {
  code: string;
  server_id: string;
  created_by: string;
  max_uses: number | null;
  uses: number;
  expires_at: string | null;
  created_at: string;
  is_custom: number;
  is_permanent: number;
  server_name: string;
  server_logo_url: string | null;
  server_owner_user_id: string;
};

const CreateInvite = z.object({
  serverId: z.string().min(3),
  code: z.string().trim().regex(/^[a-zA-Z0-9_-]{3,32}$/).nullable().optional(),
  permanent: z.boolean().optional(),
  maxUses: z.number().int().positive().optional(),
  expiresAt: z.string().datetime().optional()
});

const JoinInviteBody = z.object({
  accept: z.boolean().optional().default(true),
  codeOrUrl: z.string().min(3).optional()
});

const ListInvitesQuery = z.object({
  serverId: z.string().min(3)
});

function inviteCode(): string {
  return crypto.randomBytes(6).toString("base64url");
}

function parseInviteCodeInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^[a-zA-Z0-9_-]{3,32}$/.test(trimmed)) return trimmed;
  const directPathMatch = trimmed.match(/^\/join\/([a-zA-Z0-9_-]{3,32})\/?$/);
  if (directPathMatch?.[1]) return directPathMatch[1];
  try {
    const url = new URL(trimmed);
    const pathMatch = (url.pathname || "").match(/^\/join\/([a-zA-Z0-9_-]{3,32})\/?$/);
    if (pathMatch?.[1]) return pathMatch[1];
    const q = url.searchParams.get("join");
    if (q && /^[a-zA-Z0-9_-]{3,32}$/.test(q)) return q;
    for (const key of url.searchParams.keys()) {
      if (/^join[a-zA-Z0-9_-]{3,32}$/.test(key)) return key;
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

function buildJoinUrl(code: string): string {
  const publicBaseUrl = env.APP_BASE_URL.replace(/\/$/, "");
  return `${publicBaseUrl}/join/${encodeURIComponent(code)}`;
}

function isInvitePermanent(invite: Pick<InviteRow, "is_permanent" | "max_uses" | "expires_at"> | {
  is_permanent?: number;
  max_uses?: number | null;
  expires_at?: string | null;
}): boolean {
  return Boolean(invite.is_permanent) || (!invite.max_uses && !invite.expires_at);
}

function parsePermissionBits(value: unknown): bigint {
  try {
    return BigInt(String(value ?? "0"));
  } catch {
    return 0n;
  }
}

function normalizeHttpBaseUrl(value: string | null | undefined): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = String(hostname || "").trim().toLowerCase();
  if (!normalized) return false;
  return normalized === "localhost"
    || normalized === "::1"
    || normalized === "0:0:0:0:0:0:0:1"
    || normalized === "0.0.0.0"
    || normalized.startsWith("127.");
}

function isLoopbackBaseUrl(value: string | null | undefined): boolean {
  try {
    const parsed = new URL(String(value || "").trim());
    return isLoopbackHostname(parsed.hostname);
  } catch {
    return false;
  }
}

function resolveNodeBaseUrl(baseUrl: string): string {
  const normalized = normalizeHttpBaseUrl(baseUrl);
  if (!normalized) return "";
  const officialBaseUrl = normalizeHttpBaseUrl(env.OFFICIAL_NODE_BASE_URL || "");
  if (officialBaseUrl && isLoopbackBaseUrl(normalized)) return officialBaseUrl;
  return normalized;
}

function normalizeMembershipRoles(rawRoles: string, userId: string, serverOwnerUserId: string, platformRole: PlatformRole): string[] {
  let roles: string[] = [];
  try {
    const parsed = JSON.parse(rawRoles || "[]");
    roles = Array.isArray(parsed) ? parsed.map((role) => String(role)) : [];
  } catch {
    roles = [];
  }

  const isPlatformStaff = platformRole === "admin" || platformRole === "owner";
  if (serverOwnerUserId !== userId && !isPlatformStaff) {
    roles = roles.filter((role) => role !== "owner");
  }

  if (platformRole === "admin" && !roles.includes("platform_admin")) {
    roles.push("platform_admin");
  }
  if (platformRole === "owner") {
    if (!roles.includes("platform_admin")) roles.push("platform_admin");
    if (!roles.includes("platform_owner")) roles.push("platform_owner");
  }

  return roles;
}

async function getPlatformRole(userId: string): Promise<PlatformRole> {
  const founder = await q<{ founder_user_id: string | null }>(`SELECT founder_user_id FROM platform_config WHERE id=1`);
  if (founder.length && founder[0].founder_user_id === userId) return "owner";

  const admin = await q<{ user_id: string }>(`SELECT user_id FROM platform_admins WHERE user_id=:userId`, { userId });
  if (admin.length) return "admin";

  return "user";
}

async function getServer(serverId: string): Promise<ServerRow | null> {
  const rows = await q<ServerRow>(
    `SELECT id,owner_user_id,base_url,default_guild_id,name,logo_url
     FROM servers
     WHERE id=:serverId
     LIMIT 1`,
    { serverId }
  );
  return rows[0] ?? null;
}

async function ownerHasBoost(ownerUserId: string): Promise<boolean> {
  const entitlement = await reconcileBoostBadge(ownerUserId);
  if (!entitlement.active) {
    await revokeCustomInvitesForOwnerLossOfBoost(ownerUserId);
  }
  return entitlement.active;
}

async function canManageServerInvites(input: {
  server: ServerRow;
  userId: string;
  platformRole: PlatformRole;
  log: any;
}): Promise<boolean> {
  if (input.server.owner_user_id === input.userId) return true;
  if (input.platformRole === "admin" || input.platformRole === "owner") return true;
  if (!input.server.default_guild_id) return false;

  const membershipRows = await q<{ roles: string }>(
    `SELECT roles
     FROM memberships
     WHERE server_id=:serverId AND user_id=:userId
     LIMIT 1`,
    { serverId: input.server.id, userId: input.userId }
  );
  if (!membershipRows.length) return false;

  const baseUrl = resolveNodeBaseUrl(input.server.base_url || "");
  if (!baseUrl) return false;

  const roles = normalizeMembershipRoles(
    membershipRows[0].roles,
    input.userId,
    input.server.owner_user_id,
    input.platformRole
  );

  const officialBase = normalizeHttpBaseUrl(env.OFFICIAL_NODE_BASE_URL || "");
  const audience =
    officialBase && env.OFFICIAL_NODE_SERVER_ID && (baseUrl === officialBase || isLoopbackBaseUrl(input.server.base_url))
      ? env.OFFICIAL_NODE_SERVER_ID
      : input.server.id;

  try {
    const membershipToken = await signMembershipToken(
      audience,
      input.userId,
      roles,
      input.platformRole,
      input.server.id
    );
    const stateRes = await fetch(`${baseUrl}/v1/guilds/${input.server.default_guild_id}/state`, {
      headers: { Authorization: `Bearer ${membershipToken}` }
    });
    if (!stateRes.ok) return false;

    const state = await stateRes.json() as {
      guild?: { owner_user_id?: string };
      roles?: Array<{ id: string; permissions?: string | number | null; is_everyone?: boolean | number }>;
      me?: { roleIds?: string[] };
    };

    if (state.guild?.owner_user_id === input.userId) return true;

    const myRoleIds = new Set((state.me?.roleIds || []).map((roleId) => String(roleId)));
    let permissions = 0n;
    for (const role of state.roles || []) {
      const isEveryone = role?.is_everyone === true || role?.is_everyone === 1;
      if (!isEveryone && !myRoleIds.has(String(role?.id || ""))) continue;
      permissions |= parsePermissionBits(role?.permissions);
    }
    return (permissions & GUILD_ADMINISTRATOR_PERMISSION) === GUILD_ADMINISTRATOR_PERMISSION;
  } catch (error) {
    input.log.warn({ err: error, serverId: input.server.id, userId: input.userId }, "Invite permission check failed");
    return false;
  }
}

async function queryInviteByCode(code: string): Promise<InviteRow | null> {
  const rows = await q<InviteRow>(
    `SELECT i.code,i.server_id,i.created_by,i.max_uses,i.uses,i.expires_at,i.created_at,i.is_custom,i.is_permanent,
            s.name AS server_name,
            s.logo_url AS server_logo_url,
            s.owner_user_id AS server_owner_user_id
     FROM invites i
     JOIN servers s ON s.id = i.server_id
     WHERE i.code=:code
     LIMIT 1`,
    { code }
  );
  return rows[0] ?? null;
}

async function lookupInviteByCode(code: string): Promise<{ invite: InviteRow | null; disabledCustomInvite: boolean }> {
  let invite = await queryInviteByCode(code);
  if (!invite && code.toLowerCase().startsWith("join") && code.length > 4) {
    invite = await queryInviteByCode(code.slice(4));
  }
  if (!invite) return { invite: null, disabledCustomInvite: false };

  if (invite.is_custom) {
    const boostActive = await ownerHasBoost(invite.server_owner_user_id);
    if (!boostActive) return { invite: null, disabledCustomInvite: true };
  }

  return { invite, disabledCustomInvite: false };
}

function mapInvite(invite: InviteRow) {
  return {
    code: invite.code,
    serverId: invite.server_id,
    serverName: invite.server_name,
    serverLogoUrl: invite.server_logo_url,
    permanent: isInvitePermanent(invite),
    uses: invite.uses,
    expiresAt: invite.expires_at,
    joinUrl: buildJoinUrl(invite.code),
    isCustom: Boolean(invite.is_custom)
  };
}

export async function inviteRoutes(app: FastifyInstance) {
  async function joinByInviteCode(input: {
    userId: string;
    code: string;
    accept: boolean;
    log: any;
  }) {
    const lookup = await lookupInviteByCode(input.code);
    if (lookup.disabledCustomInvite) {
      return { status: 410, body: { error: "CUSTOM_INVITE_DISABLED" } };
    }
    if (!lookup.invite) return { status: 404, body: { error: "NOT_FOUND" } };

    const inv = lookup.invite;
    if (inv.expires_at && new Date(inv.expires_at).getTime() < Date.now()) {
      return { status: 410, body: { error: "EXPIRED" } };
    }
    if (inv.max_uses && inv.uses >= inv.max_uses) {
      return { status: 410, body: { error: "MAX_USES" } };
    }
    if (!input.accept) {
      return {
        status: 200,
        body: {
          ok: false,
          requiresAccept: true,
          serverId: inv.server_id,
          serverName: inv.server_name,
          code: inv.code
        }
      };
    }

    await q(
      `INSERT INTO memberships (server_id,user_id,roles)
       VALUES (:serverId,:userId,:roles)
       ON DUPLICATE KEY UPDATE user_id=user_id`,
      { serverId: inv.server_id, userId: input.userId, roles: JSON.stringify(["member"]) }
    );

    await q(`UPDATE invites SET uses = uses + 1 WHERE code=:code`, { code: inv.code });

    const serverRow = await q<{ base_url: string; default_guild_id: string | null }>(
      `SELECT base_url, default_guild_id FROM servers WHERE id=:id`,
      { id: inv.server_id }
    );
    if (serverRow.length && serverRow[0].default_guild_id) {
      const rawBaseUrl = serverRow[0].base_url || "";
      const baseUrl = resolveNodeBaseUrl(rawBaseUrl);
      if (!baseUrl) {
        input.log.warn({ serverId: inv.server_id, userId: input.userId }, "Invite join: node base URL is unavailable");
        return { status: 200, body: { ok: true, serverId: inv.server_id, serverName: inv.server_name } };
      }
      const defaultGuildId = serverRow[0].default_guild_id;
      const platformRole = await getPlatformRole(input.userId);
      const officialBase = normalizeHttpBaseUrl(env.OFFICIAL_NODE_BASE_URL || "");
      const audience =
        officialBase && env.OFFICIAL_NODE_SERVER_ID && (baseUrl === officialBase || isLoopbackBaseUrl(rawBaseUrl))
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

    return { status: 200, body: { ok: true, serverId: inv.server_id, serverName: inv.server_name } };
  }

  app.get("/v1/invites", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const userId = req.user.sub as string;
    const { serverId } = ListInvitesQuery.parse(req.query || {});
    const server = await getServer(serverId);
    if (!server) return rep.code(404).send({ error: "SERVER_NOT_FOUND" });

    const platformRole = await getPlatformRole(userId);
    const canManage = await canManageServerInvites({ server, userId, platformRole, log: req.log });
    if (!canManage) return rep.code(403).send({ error: "FORBIDDEN" });

    await ownerHasBoost(server.owner_user_id);

    const invites = await q<InviteRow>(
      `SELECT i.code,i.server_id,i.created_by,i.max_uses,i.uses,i.expires_at,i.created_at,i.is_custom,i.is_permanent,
              s.name AS server_name,
              s.logo_url AS server_logo_url,
              s.owner_user_id AS server_owner_user_id
       FROM invites i
       JOIN servers s ON s.id = i.server_id
       WHERE i.server_id=:serverId
       ORDER BY i.is_custom DESC, i.created_at DESC`,
      { serverId }
    );

    return rep.send({ invites: invites.map(mapInvite) });
  });

  app.post("/v1/invites", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const userId = req.user.sub as string;
    const body = parseBody(CreateInvite, req.body);
    const server = await getServer(body.serverId);
    if (!server) return rep.code(404).send({ error: "SERVER_NOT_FOUND" });

    const platformRole = await getPlatformRole(userId);
    const canManage = await canManageServerInvites({ server, userId, platformRole, log: req.log });
    if (!canManage) return rep.code(403).send({ error: "FORBIDDEN" });

    const normalizedRequestedCode = String(body.code || "").trim();
    const wantsCustomCode = normalizedRequestedCode.length > 0;
    const wantsPermanent = body.permanent === true;

    if ((wantsCustomCode || wantsPermanent) && !(await ownerHasBoost(server.owner_user_id))) {
      return rep.code(403).send({ error: "BOOST_REQUIRED" });
    }

    const code = wantsCustomCode ? normalizedRequestedCode : inviteCode();
    const maxUses = wantsPermanent ? null : (body.maxUses ?? null);
    const expiresAt = wantsPermanent ? null : (body.expiresAt ?? null);

    if (wantsCustomCode) {
      const reservation = await getActiveInviteCodeReservation(code);
      if (reservation && reservation.reservedServerId !== body.serverId) {
        return rep.code(409).send({ error: "INVITE_CODE_LOCKED", lockedUntil: reservation.lockedUntil });
      }

      const activeCustomInvites = await getServerCustomInvites(body.serverId);
      for (const activeInvite of activeCustomInvites) {
        if (activeInvite.code.toLowerCase() === code.toLowerCase()) continue;
        await reserveInviteCode({
          code: activeInvite.code,
          serverId: body.serverId,
          ownerUserId: server.owner_user_id,
          reason: "invite_replaced"
        });
        await q(`DELETE FROM invites WHERE code=:code`, { code: activeInvite.code });
      }

      const existingSameCustom = activeCustomInvites.find((invite) => invite.code.toLowerCase() === code.toLowerCase());
      if (existingSameCustom) {
        await clearInviteCodeReservation(code);
        await q(
          `UPDATE invites
           SET created_by=:userId,
               is_permanent=:isPermanent,
               max_uses=:maxUses,
               expires_at=:expiresAt
           WHERE code=:code`,
          {
            userId,
            code,
            isPermanent: wantsPermanent ? 1 : 0,
            maxUses,
            expiresAt
          }
        );
        return rep.send({
          code,
          serverId: body.serverId,
          permanent: wantsPermanent,
          joinUrl: buildJoinUrl(code),
          isCustom: true
        });
      }

      await clearInviteCodeReservation(code);
    }

    try {
      await q(
        `INSERT INTO invites (code, server_id, created_by, is_custom, is_permanent, max_uses, expires_at)
         VALUES (:code,:serverId,:userId,:isCustom,:isPermanent,:maxUses,:expiresAt)`,
        {
          code,
          serverId: body.serverId,
          userId,
          isCustom: wantsCustomCode ? 1 : 0,
          isPermanent: wantsPermanent ? 1 : 0,
          maxUses,
          expiresAt
        }
      );
    } catch (error: any) {
      if (String(error?.message || "").toLowerCase().includes("duplicate")) {
        return rep.code(409).send({ error: "INVITE_CODE_TAKEN" });
      }
      throw error;
    }

    return rep.send({
      code,
      serverId: body.serverId,
      permanent: wantsPermanent,
      joinUrl: buildJoinUrl(code),
      isCustom: wantsCustomCode
    });
  });

  async function sendInvitePreview(req: any, rep: any, codeInput: string) {
    const lookup = await lookupInviteByCode(codeInput);
    if (lookup.disabledCustomInvite) return rep.code(410).send({ error: "CUSTOM_INVITE_DISABLED" });
    if (!lookup.invite) return rep.code(404).send({ error: "NOT_FOUND" });

    const inv = lookup.invite;
    if (inv.expires_at && new Date(inv.expires_at).getTime() < Date.now()) {
      return rep.code(410).send({ error: "EXPIRED" });
    }
    if (inv.max_uses && inv.uses >= inv.max_uses) {
      return rep.code(410).send({ error: "MAX_USES" });
    }

    return rep.send({
      ...mapInvite(inv),
      server_id: inv.server_id
    });
  }

  app.get("/v1/invites/:code/preview", async (req: any, rep: any) => {
    const { code } = z.object({ code: z.string().min(3) }).parse(req.params);
    return sendInvitePreview(req, rep, code);
  });

  app.get("/v1/invites/:code", async (req: any, rep: any) => {
    const { code } = z.object({ code: z.string().min(3) }).parse(req.params);
    return sendInvitePreview(req, rep, code);
  });

  app.delete("/v1/invites/:code", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const userId = req.user.sub as string;
    const { code } = z.object({ code: z.string().min(3) }).parse(req.params);
    const invite = await queryInviteByCode(code);
    if (!invite) return rep.code(404).send({ error: "NOT_FOUND" });

    const server = await getServer(invite.server_id);
    if (!server) return rep.code(404).send({ error: "SERVER_NOT_FOUND" });

    const platformRole = await getPlatformRole(userId);
    const canManage = await canManageServerInvites({ server, userId, platformRole, log: req.log });
    if (!canManage) return rep.code(403).send({ error: "FORBIDDEN" });

    let lockedUntil: string | null = null;
    if (invite.is_custom) {
      lockedUntil = await reserveInviteCode({
        code: invite.code,
        serverId: invite.server_id,
        ownerUserId: invite.server_owner_user_id,
        reason: "invite_deleted"
      });
    }

    await q(`DELETE FROM invites WHERE code=:code`, { code: invite.code });
    return rep.send({ ok: true, lockedUntil });
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
