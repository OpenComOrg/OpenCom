import { WebSocketServer } from "ws";
import type { FastifyInstance } from "fastify";
import { GatewayEnvelope, CoreIdentify, PresenceUpdate } from "@ods/shared/events.js";

type Conn = {
  ws: any;
  userId: string;
  deviceId?: string;
  seq: number;
};

export function attachCoreGateway(app: FastifyInstance, redis?: { pub: any; sub: any }) {
  const wss = new WebSocketServer({ noServer: true });

  // local maps (single instance)
  const byDevice = new Map<string, Conn>();
  const byUser = new Map<string, Set<Conn>>();

  function send(ws: any, msg: GatewayEnvelope) {
    ws.send(JSON.stringify(msg));
  }

  // Redis channels for cross-instance fanout
  const DM_CH = "core:dm";
  const PRES_CH = "core:presence";

  if (redis) {
    redis.sub.subscribe(DM_CH, (raw: string) => {
      const { recipientDeviceId, payload } = JSON.parse(raw);
      const c = byDevice.get(recipientDeviceId);
      if (!c) return;
      c.seq += 1;
      send(c.ws, { op: "DISPATCH", t: "DM_MESSAGE_CREATE", s: c.seq, d: { envelope: payload } });
    });

    redis.sub.subscribe(PRES_CH, (raw: string) => {
      const { userId, presence } = JSON.parse(raw);
      // Broadcast to all connected users (MVP = global presence fanout)
      for (const conns of byUser.values()) {
        for (const c of conns) {
          c.seq += 1;
          send(c.ws, { op: "DISPATCH", t: "PRESENCE_UPDATE", s: c.seq, d: { userId, ...presence } });
        }
      }
    });
  }

  app.server.on("upgrade", (req, socket, head) => {
    if (req.url?.startsWith("/gateway")) {
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
    }
  });

  wss.on("connection", (ws) => {
    let conn: Conn | null = null;

    send(ws, { op: "HELLO", d: { heartbeat_interval: 25000 } });

    ws.on("message", async (raw: Buffer) => {
      let msg: GatewayEnvelope;
      try { msg = JSON.parse(raw.toString("utf8")); } catch { return; }

      if (msg.op === "IDENTIFY") {
        const d = msg.d as CoreIdentify;
        try {
          const decoded: any = await (app as any).jwt.verify(d.accessToken);
          const userId = decoded.sub as string;
          const deviceId = d.deviceId;

          conn = { ws, userId, deviceId, seq: 0 };

          if (deviceId) byDevice.set(deviceId, conn);

          if (!byUser.has(userId)) byUser.set(userId, new Set());
          byUser.get(userId)!.add(conn);

          send(ws, { op: "READY", d: { user: { id: userId, username: "unknown" } } });

          // Update presence online
          const presence: PresenceUpdate = { status: "online", customStatus: null };
          await app.pgPresenceUpsert(userId, presence);
          if (redis) await redis.pub.publish(PRES_CH, JSON.stringify({ userId, presence }));
        } catch {
          send(ws, { op: "ERROR", d: { error: "INVALID_TOKEN" } });
          ws.close();
        }
      }

      if (msg.op === "HEARTBEAT") send(ws, { op: "HEARTBEAT_ACK" });

      if (msg.op === "DISPATCH" && msg.t === "SET_PRESENCE") {
        if (!conn) return;
        const presence = msg.d as PresenceUpdate;
        await app.pgPresenceUpsert(conn.userId, presence);
        if (redis) await redis.pub.publish(PRES_CH, JSON.stringify({ userId: conn.userId, presence }));
      }
    });

    ws.on("close", async () => {
      if (conn?.deviceId) byDevice.delete(conn.deviceId);
      if (conn?.userId && byUser.has(conn.userId)) byUser.get(conn.userId)!.delete(conn);

      // If last connection for user, mark offline
      if (conn?.userId) {
        const still = byUser.get(conn.userId);
        if (!still || still.size === 0) {
          const presence: PresenceUpdate = { status: "offline", customStatus: null };
          await app.pgPresenceUpsert(conn.userId, presence);
          if (redis) await redis.pub.publish(PRES_CH, JSON.stringify({ userId: conn.userId, presence }));
        }
      }
    });
  });

  async function broadcastDM(recipientDeviceId: string, payload: any) {
    // local deliver if connected
    const c = byDevice.get(recipientDeviceId);
    if (c) {
      c.seq += 1;
      send(c.ws, { op: "DISPATCH", t: "DM_MESSAGE_CREATE", s: c.seq, d: { envelope: payload } });
      return;
    }
    // cross-instance fanout
    if (redis) await redis.pub.publish(DM_CH, JSON.stringify({ recipientDeviceId, payload }));
  }

  return { broadcastDM };
}
