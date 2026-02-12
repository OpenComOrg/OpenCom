import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ulidLike } from "@ods/shared/ids.js";
import { q } from "../db.js";
import { DEFAULT_EVERYONE_PERMS } from "../permissions/defaults.js";

export async function guildRoutes(app: FastifyInstance) {
  // List all guilds (admin-ish; you can remove later)
  app.get("/v1/guilds", async () => {
    return q(`SELECT id,name,owner_user_id,created_at FROM guilds ORDER BY created_at DESC`);
  });

  // Create guild (auth required)
  app.post("/v1/guilds", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const ownerId = req.auth.userId as string;
    const actorRoles = req.auth.roles || [];

    if (!actorRoles.includes("owner") && !actorRoles.includes("platform_admin")) {
      return rep.code(403).send({ error: "MISSING_PERMS" });
    }

    const body = z.object({
      name: z.string().min(1).max(64),
      createDefaultVoice: z.boolean().optional().default(true)
    }).parse(req.body);

    const guildId = ulidLike();
    await q(
      `INSERT INTO guilds (id,name,owner_user_id) VALUES (:id,:name,:ownerId)`,
      { id: guildId, name: body.name, ownerId }
    );

    // Ensure owner is a member on this node
    await q(
      `INSERT INTO guild_members (guild_id,user_id) VALUES (:guildId,:ownerId)
       ON DUPLICATE KEY UPDATE guild_id=guild_id`,
      { guildId, ownerId }
    );

    // Create @everyone role (Discord-style)
    const everyoneRoleId = ulidLike();
    await q(
      `INSERT INTO roles (id,guild_id,name,color,position,permissions,is_everyone)
       VALUES (:id,:guildId,:name,NULL,:position,:permissions,1)`,
      {
        id: everyoneRoleId,
        guildId,
        name: "@everyone",
        position: 0,
        permissions: DEFAULT_EVERYONE_PERMS.toString()
      }
    );

    // Create default text channel: general
    const generalTextId = ulidLike();
    await q(
      `INSERT INTO channels (id,guild_id,name,type,position,parent_id)
       VALUES (:id,:guildId,:name,'text',:position,NULL)`,
      { id: generalTextId, guildId, name: "general", position: 0 }
    );

    // Optional default voice channel
    let generalVoiceId: string | null = null;
    if (body.createDefaultVoice) {
      generalVoiceId = ulidLike();
      await q(
        `INSERT INTO channels (id,guild_id,name,type,position,parent_id)
         VALUES (:id,:guildId,:name,'voice',:position,NULL)`,
        { id: generalVoiceId, guildId, name: "General", position: 1 }
      );
    }

    return rep.send({
      guildId,
      everyoneRoleId,
      defaultChannels: {
        text: generalTextId,
        voice: generalVoiceId
      }
    });
  });
}
