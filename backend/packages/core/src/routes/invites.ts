import { FastifyInstance } from "fastify";
import { z } from "zod";
import crypto from "node:crypto";
import { q } from "../db.js";

function inviteCode(): string {
  return crypto.randomBytes(6).toString("base64url");
}

const CreateInvite = z.object({
  serverId: z.string().min(3),
  code: z.string().regex(/^[a-zA-Z0-9_-]{3,32}$/).optional(),
  maxUses: z.number().int().positive().optional(),
  expiresAt: z.string().datetime().optional()
});

async function getPlatformRole(userId: string): Promise<"user" | "admin" | "owner"> {
  const founder = await q<{ founder_user_id: string | null }>(`SELECT founder_user_id FROM platform_config WHERE id=1`);
  if (founder.length && founder[0].founder_user_id === userId) return "owner";

  const admin = await q<{ user_id: string }>(`SELECT user_id FROM platform_admins WHERE user_id=:userId`, { userId });
  if (admin.length) return "admin";

  return "user";
}

export async function inviteRoutes(app: FastifyInstance) {
  app.post("/v1/invites", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const userId = req.user.sub as string;
    const body = CreateInvite.parse(req.body);

    const s = await q<{ owner_user_id: string }>(`SELECT owner_user_id FROM servers WHERE id=:serverId`, { serverId: body.serverId });
    if (!s.length) return rep.code(404).send({ error: "SERVER_NOT_FOUND" });

    const platformRole = await getPlatformRole(userId);
    const canManage = s[0].owner_user_id === userId || platformRole === "admin" || platformRole === "owner";
    if (!canManage) return rep.code(403).send({ error: "FORBIDDEN" });

    const code = body.code ?? inviteCode();
    await q(
      `INSERT INTO invites (code, server_id, created_by, max_uses, expires_at)
       VALUES (:code,:serverId,:userId,:maxUses,:expiresAt)`,
      { code, serverId: body.serverId, userId, maxUses: body.maxUses ?? null, expiresAt: body.expiresAt ?? null }
    );

    return { code, serverId: body.serverId };
  });

  app.get("/v1/invites/:code", async (req, rep) => {
    const { code } = z.object({ code: z.string().min(3) }).parse(req.params);
    const rows = await q<any>(
      `SELECT code, server_id, max_uses, uses, expires_at, created_at FROM invites WHERE code=:code`,
      { code }
    );
    if (!rows.length) return rep.code(404).send({ error: "NOT_FOUND" });

    const inv = rows[0];
    if (inv.expires_at && new Date(inv.expires_at).getTime() < Date.now()) return rep.code(410).send({ error: "EXPIRED" });
    if (inv.max_uses && inv.uses >= inv.max_uses) return rep.code(410).send({ error: "MAX_USES" });

    return inv;
  });

  app.post("/v1/invites/:code/join", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const userId = req.user.sub as string;
    const { code } = z.object({ code: z.string().min(3) }).parse(req.params);

    const rows = await q<any>(`SELECT * FROM invites WHERE code=:code`, { code });
    if (!rows.length) return rep.code(404).send({ error: "NOT_FOUND" });

    const inv = rows[0];
    if (inv.expires_at && new Date(inv.expires_at).getTime() < Date.now()) return rep.code(410).send({ error: "EXPIRED" });
    if (inv.max_uses && inv.uses >= inv.max_uses) return rep.code(410).send({ error: "MAX_USES" });

    await q(
      `INSERT INTO memberships (server_id,user_id,roles)
       VALUES (:serverId,:userId,:roles)
       ON DUPLICATE KEY UPDATE user_id=user_id`,
      { serverId: inv.server_id, userId, roles: JSON.stringify(["member"]) }
    );

    await q(`UPDATE invites SET uses = uses + 1 WHERE code=:code`, { code });

    return { ok: true, serverId: inv.server_id };
  });
}
