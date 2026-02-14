import { env } from "../env.js";
import { q } from "../db.js";

type GuildRow = { id: string; server_id: string; name: string };

async function postNodeSync() {
  if (!env.NODE_SYNC_SECRET) return;

  const guilds = await q<GuildRow>(
    `SELECT id, server_id, name
     FROM guilds`
  );

  const payload = {
    nodeServerId: env.NODE_SERVER_ID,
    baseUrl: env.PUBLIC_BASE_URL,
    gatewayUrl: `${env.PUBLIC_BASE_URL.replace(/\/$/, "")}/gateway`,
    guilds: guilds.map((g) => ({ id: g.id, serverId: g.server_id, name: g.name }))
  };

  const res = await fetch(`${env.CORE_BASE_URL.replace(/\/$/, "")}/v1/internal/node-sync`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-node-sync-secret": env.NODE_SYNC_SECRET
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`NODE_SYNC_FAILED ${res.status} ${txt}`);
  }
}

export function startNodeSyncLoop() {
  if (!env.NODE_SYNC_SECRET) return;

  const tick = async () => {
    try {
      await postNodeSync();
    } catch (error: any) {
      console.warn("[node-sync]", error?.message || error);
    }
  };

  void tick();
  setInterval(() => {
    void tick();
  }, 5000);
}
