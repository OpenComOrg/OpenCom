import { FastifyInstance } from "fastify";
import { z } from "zod";
import { q } from "../db.js";

export async function guildJoinRoutes(app: FastifyInstance) {
  app.post("/v1/guilds/:guildId/join", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const { guildId } = z.object({ guildId: z.string().min(3) }).parse(req.params);
    const userId = req.auth.userId as string;
    const coreServerId = req.auth.coreServerId as string;

    await q(
      `UPDATE guilds SET server_id=:coreServerId WHERE id=:guildId AND (server_id='' OR server_id IS NULL)`,
      { guildId, coreServerId }
    );
    const g = await q<{ id: string }>(`SELECT id FROM guilds WHERE id=:guildId AND server_id=:coreServerId`, { guildId, coreServerId });
    if (!g.length) return rep.code(404).send({ error: "GUILD_NOT_FOUND" });

    await q(
      `INSERT INTO guild_members (guild_id,user_id) VALUES (:guildId,:userId)
       ON DUPLICATE KEY UPDATE guild_id=guild_id`,
      { guildId, userId }
    );

    return rep.send({ ok: true });
  });

  app.post("/v1/guilds/:guildId/leave", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const { guildId } = z.object({ guildId: z.string().min(3) }).parse(req.params);
    const userId = req.auth.userId as string;
    const coreServerId = req.auth.coreServerId as string;

    await q(
      `UPDATE guilds SET server_id=:coreServerId WHERE id=:guildId AND (server_id='' OR server_id IS NULL)`,
      { guildId, coreServerId }
    );
    const g = await q<{ id: string }>(`SELECT id FROM guilds WHERE id=:guildId AND server_id=:coreServerId`, { guildId, coreServerId });
    if (!g.length) return rep.code(404).send({ error: "GUILD_NOT_FOUND" });

    await q(`DELETE FROM guild_members WHERE guild_id=:guildId AND user_id=:userId`, { guildId, userId });

    return rep.send({ ok: true });
  });
}
