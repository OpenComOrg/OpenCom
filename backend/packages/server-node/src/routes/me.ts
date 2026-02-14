import { FastifyInstance } from "fastify";
import { q } from "../db.js";

export async function meRoutes(app: FastifyInstance) {
  // Returns guilds the authed user has joined on THIS node tenant
  app.get("/v1/me/guilds", { preHandler: [app.authenticate] } as any, async (req: any) => {
    const userId = req.auth.userId as string;
    const coreServerId = req.auth.coreServerId as string;

    await q(
      `UPDATE guilds
       SET server_id = :coreServerId
       WHERE owner_user_id = :userId AND (server_id = '' OR server_id IS NULL)`,
      { userId, coreServerId }
    );

    const rows = await q<any>(
      `SELECT g.id, g.name, g.owner_user_id, g.created_at
       FROM guild_members gm
       JOIN guilds g ON g.id = gm.guild_id
       WHERE gm.user_id = :userId
         AND g.server_id = :coreServerId
       ORDER BY gm.joined_at DESC`,
      { userId, coreServerId }
    );

    return { guilds: rows };
  });

  app.get("/v1/me/voice-state", { preHandler: [app.authenticate] } as any, async (req: any) => {
    const userId = req.auth.userId as string;
    const coreServerId = req.auth.coreServerId as string;

    const voiceStates = await q<any>(
      `SELECT vs.guild_id, vs.channel_id, vs.muted, vs.deafened, vs.updated_at
       FROM voice_states vs
       JOIN guilds g ON g.id = vs.guild_id
       WHERE vs.user_id = :userId
         AND g.server_id = :coreServerId`,
      { userId, coreServerId }
    );

    return { voiceStates };
  });

  app.post("/v1/me/voice-disconnect", { preHandler: [app.authenticate] } as any, async (req: any) => {
    const userId = req.auth.userId as string;
    const coreServerId = req.auth.coreServerId as string;

    await q(
      `DELETE vs FROM voice_states vs
       JOIN guilds g ON g.id = vs.guild_id
       WHERE vs.user_id = :userId
         AND g.server_id = :coreServerId`,
      { userId, coreServerId }
    );

    return { ok: true };
  });
}
