import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { q } from "../db.js";
import { env } from "../env.js";

const NodeSyncBody = z.object({
  nodeServerId: z.string().min(1),
  baseUrl: z.string().url(),
  gatewayUrl: z.string().url().optional(),
  guilds: z.array(z.object({
    id: z.string().min(1),
    serverId: z.string().min(1),
    name: z.string().min(1)
  })).default([])
});

export async function nodeSyncRoutes(app: FastifyInstance) {
  if (!env.CORE_NODE_SYNC_SECRET) {
    app.log.warn("CORE_NODE_SYNC_SECRET not set; node sync route disabled");
    return;
  }

  app.post("/v1/internal/node-sync", async (req: any, rep) => {
    const secret = req.headers["x-node-sync-secret"];
    if (secret !== env.CORE_NODE_SYNC_SECRET) {
      return rep.code(401).send({ error: "INVALID_SYNC_SECRET" });
    }

    const parsed = NodeSyncBody.safeParse(req.body || {});
    if (!parsed.success) {
      return rep.code(400).send({ error: "INVALID_SYNC_BODY" });
    }

    const body = parsed.data;
    const uniqueServerIds = Array.from(new Set(body.guilds.map((g) => g.serverId)));

    if (uniqueServerIds.length) {
      for (const serverId of uniqueServerIds) {
        await q(
          `UPDATE servers
           SET base_url = :baseUrl,
               node_server_id = :nodeServerId,
               node_gateway_url = :gatewayUrl,
               node_guild_count = :guildCount,
               node_last_sync_at = NOW(),
               node_sync_status = 'online'
           WHERE id = :serverId`,
          {
            serverId,
            baseUrl: body.baseUrl,
            nodeServerId: body.nodeServerId,
            gatewayUrl: body.gatewayUrl ?? `${body.baseUrl.replace(/\/$/, "")}/gateway`,
            guildCount: body.guilds.filter((g) => g.serverId === serverId).length
          }
        );
      }
    }

    return rep.send({ ok: true, serversSynced: uniqueServerIds.length, guildsReported: body.guilds.length });
  });
}
