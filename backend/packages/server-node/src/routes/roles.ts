import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ulidLike } from "@ods/shared/dist/ids.js";
import { q } from "../db.js";
import { requireGuildMember } from "../auth/requireGuildMember.js";
import { canEditRole, requireManageRoles, rolePosition } from "../permissions/hierarchy.js";

export async function roleRoutes(
  app: FastifyInstance,
  broadcastGuild: (guildId: string, t: string, d: any) => void
) {
  app.post("/v1/guilds/:guildId/roles", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const { guildId } = z.object({ guildId: z.string().min(3) }).parse(req.params);
    const userId = req.auth.userId as string;

    const body = z.object({
      name: z.string().min(1).max(64),
      color: z.number().int().nonnegative().nullable().optional(),
      permissions: z.string().regex(/^\d+$/).optional()
    }).parse(req.body);

    try { await requireGuildMember(guildId, userId, req.auth.roles); } catch { return rep.code(403).send({ error: "NOT_GUILD_MEMBER" }); }

    const anyChannel = await q<{ id: string }>(
      `SELECT id FROM channels WHERE guild_id=:guildId ORDER BY created_at ASC LIMIT 1`,
      { guildId }
    );
    if (!anyChannel.length) return rep.code(400).send({ error: "GUILD_HAS_NO_CHANNELS" });

    try {
      await requireManageRoles({ guildId, channelIdForPerms: anyChannel[0].id, actorId: userId, actorRoles: req.auth.roles });
    } catch {
      return rep.code(403).send({ error: "MISSING_PERMS" });
    }

    const id = ulidLike();
    const pos = (await q<{ p: number }>(
      `SELECT COALESCE(MAX(position),0)+1 AS p FROM roles WHERE guild_id=:guildId`,
      { guildId }
    ))[0]?.p ?? 1;

    await q(
      `INSERT INTO roles (id,guild_id,name,color,position,permissions,is_everyone)
       VALUES (:id,:guildId,:name,:color,:position,:permissions,0)`,
      {
        id,
        guildId,
        name: body.name,
        color: body.color ?? null,
        position: pos,
        permissions: body.permissions ?? "0"
      }
    );

    const role = (await q<any>(`SELECT id,guild_id,name,color,position,permissions,is_everyone FROM roles WHERE id=:id`, { id }))[0];
    broadcastGuild(guildId, "ROLE_CREATE", { role });
    return rep.send({ roleId: id });
  });

  app.patch("/v1/roles/:roleId", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const { roleId } = z.object({ roleId: z.string().min(3) }).parse(req.params);
    const userId = req.auth.userId as string;

    const body = z.object({
      name: z.string().min(1).max(64).optional(),
      color: z.number().int().nonnegative().nullable().optional(),
      permissions: z.string().regex(/^\d+$/).optional()
    }).parse(req.body);

    let meta: { guildId: string; position: number; isEveryone: boolean };
    try { meta = await rolePosition(roleId); } catch { return rep.code(404).send({ error: "ROLE_NOT_FOUND" }); }
    if (meta.isEveryone) return rep.code(400).send({ error: "CANNOT_EDIT_EVERYONE" });

    try { await requireGuildMember(meta.guildId, userId, req.auth.roles); } catch { return rep.code(403).send({ error: "NOT_GUILD_MEMBER" }); }

    const can = await canEditRole(meta.guildId, userId, meta.position);
    if (!can) return rep.code(403).send({ error: "ROLE_HIERARCHY" });

    await q(
      `UPDATE roles SET
        name = COALESCE(:name, name),
        color = CASE WHEN :colorSet=1 THEN :color ELSE color END,
        permissions = COALESCE(:permissions, permissions)
       WHERE id=:roleId`,
      {
        roleId,
        name: body.name ?? null,
        colorSet: body.color !== undefined ? 1 : 0,
        color: body.color ?? null,
        permissions: body.permissions ?? null
      }
    );

    const role = (await q<any>(`SELECT id,guild_id,name,color,position,permissions,is_everyone FROM roles WHERE id=:roleId`, { roleId }))[0];
    broadcastGuild(meta.guildId, "ROLE_UPDATE", { role });
    return rep.send({ ok: true });
  });

  app.delete("/v1/roles/:roleId", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const { roleId } = z.object({ roleId: z.string().min(3) }).parse(req.params);
    const userId = req.auth.userId as string;

    let meta: { guildId: string; position: number; isEveryone: boolean };
    try { meta = await rolePosition(roleId); } catch { return rep.code(404).send({ error: "ROLE_NOT_FOUND" }); }
    if (meta.isEveryone) return rep.code(400).send({ error: "CANNOT_DELETE_EVERYONE" });

    try { await requireGuildMember(meta.guildId, userId, req.auth.roles); } catch { return rep.code(403).send({ error: "NOT_GUILD_MEMBER" }); }

    const can = await canEditRole(meta.guildId, userId, meta.position);
    if (!can) return rep.code(403).send({ error: "ROLE_HIERARCHY" });

    await q(`DELETE FROM roles WHERE id=:roleId`, { roleId });
    broadcastGuild(meta.guildId, "ROLE_DELETE", { roleId });
    return rep.send({ ok: true });
  });
}
