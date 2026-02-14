import { createServer } from "node:http";
import { createServer as createTlsServer } from "node:https";
import { readFileSync } from "node:fs";
import { WebSocketServer, WebSocket } from "ws";
import type { FastifyInstance } from "fastify";
import { GatewayEnvelope, CoreIdentify, PresenceUpdate } from "@ods/shared/events.js";
import { env } from "../env.js";
import { q } from "../db.js";
import { importJWK, jwtVerify } from "jose";

type Conn = {
  ws: any;
  userId: string;
  deviceId?: string;
  seq: number;
  mode?: "core" | "voice_proxy";
  upstream?: WebSocket;
  upstreamReady?: boolean;
};

function nodeGatewayUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.protocol = url.protocol === "http:" ? "ws:" : "wss:";
  url.pathname = "/gateway";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

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
  const CALL_SIGNAL_CH = "core:call-signal";

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

    redis.sub.subscribe(CALL_SIGNAL_CH, (raw: string) => {
      const { targetUserId, signal } = JSON.parse(raw);
      const conns = byUser.get(targetUserId);
      if (!conns) return;
      for (const c of conns) {
        c.seq += 1;
        send(c.ws, { op: "DISPATCH", t: "CALL_SIGNAL_CREATE", s: c.seq, d: signal });
      }
    });
  }

  function handleUpgrade(allowRoot: boolean) {
    return (req: any, socket: any, head: Buffer) => {
      const path = req.url?.split("?")[0] ?? "";
      const ok = path === "/gateway" || (allowRoot && path === "/");
      if (ok) {
        wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
      } else {
        socket.destroy();
      }
    };
  }

  app.server.on("upgrade", handleUpgrade(false));

  // Gateway on its own host (0.0.0.0) and port so it's reachable externally and doesn't conflict with main API (CORE_HOST:CORE_PORT)
  const gatewayHost = env.CORE_GATEWAY_HOST;
  const gatewayPort = env.CORE_GATEWAY_PORT;
  const tlsCertFile = env.CORE_GATEWAY_TLS_CERT_FILE;
  const tlsKeyFile = env.CORE_GATEWAY_TLS_KEY_FILE;

  if ((tlsCertFile && !tlsKeyFile) || (!tlsCertFile && tlsKeyFile)) {
    throw new Error("CORE_GATEWAY_TLS_CERT_FILE and CORE_GATEWAY_TLS_KEY_FILE must be provided together");
  }

  const gatewayServer = (tlsCertFile && tlsKeyFile)
    ? createTlsServer({
        cert: readFileSync(tlsCertFile, "utf8"),
        key: readFileSync(tlsKeyFile, "utf8")
      })
    : createServer();

  gatewayServer.on("upgrade", handleUpgrade(true)); // accept / or /gateway on dedicated port
  gatewayServer.listen(gatewayPort, gatewayHost, () => {
    (app as any).log?.info?.({ host: gatewayHost, port: gatewayPort, tls: Boolean(tlsCertFile && tlsKeyFile) }, "Gateway listening (WS only)");
  });

  wss.on("connection", (ws) => {
    let conn: Conn | null = null;

    send(ws, { op: "HELLO", d: { heartbeat_interval: 25000 } });

    ws.on("message", async (raw: Buffer) => {
      let msg: GatewayEnvelope;
      try { msg = JSON.parse(raw.toString("utf8")); } catch { return; }

      if (msg.op === "IDENTIFY") {
        const payload = (msg.d || {}) as any;

        // Core social/presence identify path
        if (payload.accessToken) {
          const d = payload as CoreIdentify;
          try {
            const decoded: any = await (app as any).jwt.verify(d.accessToken);
            const userId = decoded.sub as string;
            const deviceId = d.deviceId;

            conn = { ws, userId, deviceId, seq: 0, mode: "core" };

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
          return;
        }

        // Voice compatibility path: allow clients to connect to core gateway with membershipToken.
        if (payload.membershipToken) {
          try {
            const pub = await importJWK(JSON.parse(env.CORE_MEMBERSHIP_PUBLIC_JWK), "RS256");
            const { payload: claims } = await jwtVerify(payload.membershipToken, pub, {
              issuer: env.CORE_ISSUER
            });

            const userId = typeof claims.sub === "string" ? claims.sub : "";
            const serverId = typeof claims.server_id === "string"
              ? claims.server_id
              : (typeof claims.aud === "string" ? claims.aud : "");

            if (!userId || !serverId) throw new Error("INVALID_MEMBERSHIP");

            const rows = await q<{ base_url: string }>(
              `SELECT base_url FROM servers WHERE id=:serverId LIMIT 1`,
              { serverId }
            );
            if (!rows.length || !rows[0].base_url) throw new Error("SERVER_NOT_FOUND");

            const upstreamUrl = nodeGatewayUrl(rows[0].base_url);

            conn = { ws, userId, seq: 0, mode: "voice_proxy", upstreamReady: false };
            const upstream = new WebSocket(upstreamUrl);
            conn.upstream = upstream;

            upstream.on("open", () => {
              conn!.upstreamReady = true;
              upstream.send(JSON.stringify({ op: "IDENTIFY", d: { membershipToken: payload.membershipToken } }));
            });

            upstream.on("message", (uRaw: Buffer) => {
              if (ws.readyState === WebSocket.OPEN) ws.send(uRaw.toString("utf8"));
            });

            upstream.on("close", () => {
              if (ws.readyState === WebSocket.OPEN) ws.close();
            });

            upstream.on("error", () => {
              if (ws.readyState === WebSocket.OPEN) {
                send(ws, { op: "ERROR", d: { error: "VOICE_UPSTREAM_UNAVAILABLE" } });
                ws.close();
              }
            });
          } catch {
            send(ws, { op: "ERROR", d: { error: "INVALID_MEMBERSHIP" } });
            ws.close();
          }
          return;
        }

        send(ws, { op: "ERROR", d: { error: "INVALID_IDENTIFY_PAYLOAD" } });
        ws.close();
        return;
      }

      if (conn?.mode === "voice_proxy") {
        if (conn.upstream && conn.upstream.readyState === WebSocket.OPEN) {
          conn.upstream.send(raw.toString("utf8"));
        }
        return;
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
      if (conn?.upstream) {
        try { conn.upstream.close(); } catch {}
      }

      if (conn?.mode === "voice_proxy") return;

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


  async function broadcastToUser(targetUserId: string, t: string, d: any) {
    const conns = byUser.get(targetUserId);
    if (!conns || conns.size === 0) return;
    for (const c of conns) {
      c.seq += 1;
      send(c.ws, { op: "DISPATCH", t, s: c.seq, d });
    }
  }

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

  async function broadcastCallSignal(targetUserId: string, signal: any) {
    // local deliver if connected
    const conns = byUser.get(targetUserId);
    if (conns && conns.size > 0) {
      for (const c of conns) {
        c.seq += 1;
        send(c.ws, { op: "DISPATCH", t: "CALL_SIGNAL_CREATE", s: c.seq, d: signal });
      }
      return;
    }
    // cross-instance fanout
    if (redis) await redis.pub.publish(CALL_SIGNAL_CH, JSON.stringify({ targetUserId, signal }));
  }

  return { broadcastDM, broadcastCallSignal, broadcastToUser };
}
