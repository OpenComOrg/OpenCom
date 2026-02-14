import { WebSocketServer } from "ws";
import type { FastifyInstance } from "fastify";
import { GatewayEnvelope, NodeIdentify } from "@ods/shared/events.js";
import { verifyMembershipToken } from "./auth/verifyMembership.js";
import { q } from "./db.js";

// Optional voice imports (only if you have the mediasoup module).
// If you don't, comment these out and the VOICE_* events will just return VOICE_DISABLED.
// import {
//   getRouterRtpCapabilities,
//   ensurePeer,
//   createWebRtcTransport,
//   connectTransport,
//   produce,
//   consume,
//   listProducers
// } from "./voice/mediasoup.js";

type Conn = {
  ws: any;
  userId: string;
  serverId: string;
  seq: number;
  channels: Set<string>;
  guilds: Set<string>;
  voice?: { guildId: string; channelId: string };
};

export function attachNodeGateway(app: FastifyInstance) {
  const wss = new WebSocketServer({ noServer: true });
  const conns = new Set<Conn>();

  function send(ws: any, msg: GatewayEnvelope) {
    ws.send(JSON.stringify(msg));
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

      // IDENTIFY
      if (msg.op === "IDENTIFY") {
        const d = msg.d as NodeIdentify;
        try {
          const claims = await verifyMembershipToken(d.membershipToken);

          conn = {
            ws,
            userId: claims.sub,
            serverId: claims.server_id,
            seq: 0,
            channels: new Set(),
            guilds: new Set()
          };
          conns.add(conn);

          // READY includes guildIds user has joined on this node
          const guildRows = await q<{ guild_id: string }>(
            `SELECT guild_id FROM guild_members WHERE user_id=:userId`,
            { userId: conn.userId }
          );

          send(ws, {
            op: "READY",
            d: {
              user: { id: conn.userId, username: "unknown" },
              guildIds: guildRows.map(r => r.guild_id)
            }
          });
        } catch {
          send(ws, { op: "ERROR", d: { error: "INVALID_MEMBERSHIP" } });
          ws.close();
        }
        return;
      }

      if (!conn) return;

      if (msg.op === "HEARTBEAT") {
        send(ws, { op: "HEARTBEAT_ACK" });
        return;
      }

      // Subscribe to a guild (to receive ROLE_*/CHANNEL_*/OVERWRITE_* etc)
      if (msg.op === "DISPATCH" && msg.t === "SUBSCRIBE_GUILD") {
        const guildId = (msg.d as any)?.guildId;
        if (typeof guildId === "string") conn.guilds.add(guildId);
        return;
      }

      // Subscribe to a channel (to receive MESSAGE_CREATE)
      if (msg.op === "DISPATCH" && msg.t === "SUBSCRIBE_CHANNEL") {
        const channelId = (msg.d as any)?.channelId;
        if (typeof channelId === "string") conn.channels.add(channelId);
        return;
      }

      // -------- Voice signaling ----------
      if (msg.op === "DISPATCH" && msg.t === "VOICE_JOIN") {
        try {
          const guildId = (msg.d as any)?.guildId;
          const channelId = (msg.d as any)?.channelId;
          if (typeof guildId !== "string" || typeof channelId !== "string") throw new Error("INVALID_VOICE_JOIN");

          const channels = await q<{ guild_id: string; type: string }>(
            `SELECT guild_id, type FROM channels WHERE id=:channelId`,
            { channelId }
          );
          if (!channels.length) throw new Error("CHANNEL_NOT_FOUND");
          if (channels[0].guild_id !== guildId) throw new Error("CHANNEL_GUILD_MISMATCH");
          if (channels[0].type !== "voice") throw new Error("NOT_VOICE_CHANNEL");

          const memberRows = await q<{ guild_id: string }>(
            `SELECT guild_id FROM guild_members WHERE guild_id=:guildId AND user_id=:userId LIMIT 1`,
            { guildId, userId: conn.userId }
          );
          if (!memberRows.length) throw new Error("NOT_GUILD_MEMBER");

          await q(
            `DELETE FROM voice_states WHERE user_id=:userId AND guild_id=:guildId`,
            { userId: conn.userId, guildId }
          );

          await q(
            `INSERT INTO voice_states (guild_id, channel_id, user_id) VALUES (:guildId,:channelId,:userId)
             ON DUPLICATE KEY UPDATE channel_id=:channelId, updated_at=NOW()`,
            { guildId, channelId, userId: conn.userId }
          );

          conn.voice = { guildId, channelId };
          conn.seq += 1;
          send(ws, { op: "DISPATCH", t: "VOICE_JOINED", s: conn.seq, d: { guildId, channelId, userId: conn.userId } });
          broadcastGuild(guildId, "VOICE_STATE_UPDATE", { guildId, channelId, userId: conn.userId, muted: false, deafened: false });
        } catch (error: any) {
          conn.seq += 1;
          send(ws, { op: "DISPATCH", t: "VOICE_ERROR", s: conn.seq, d: { error: error?.message || "VOICE_JOIN_FAILED" } });
        }
        return;
      }

      if (msg.op === "DISPATCH" && msg.t === "VOICE_LEAVE") {
        try {
          const channelId = (msg.d as any)?.channelId;
          if (typeof channelId !== "string") throw new Error("INVALID_VOICE_LEAVE");

          const states = await q<{ guild_id: string }>(
            `SELECT guild_id FROM voice_states WHERE user_id=:userId AND channel_id=:channelId LIMIT 1`,
            { userId: conn.userId, channelId }
          );
          if (!states.length) throw new Error("NOT_IN_VOICE");
          const guildId = states[0].guild_id;

          await q(
            `DELETE FROM voice_states WHERE user_id=:userId AND channel_id=:channelId`,
            { userId: conn.userId, channelId }
          );

          if (conn.voice?.channelId === channelId) conn.voice = undefined;
          conn.seq += 1;
          send(ws, { op: "DISPATCH", t: "VOICE_LEFT", s: conn.seq, d: { guildId, channelId, userId: conn.userId } });
          broadcastGuild(guildId, "VOICE_STATE_REMOVE", { guildId, channelId, userId: conn.userId });
        } catch (error: any) {
          conn.seq += 1;
          send(ws, { op: "DISPATCH", t: "VOICE_ERROR", s: conn.seq, d: { error: error?.message || "VOICE_LEAVE_FAILED" } });
        }
        return;
      }
    });

    ws.on("close", async () => {
      if (conn?.voice) {
        const { guildId, channelId } = conn.voice;
        await q(
          `DELETE FROM voice_states WHERE user_id=:userId AND guild_id=:guildId`,
          { userId: conn.userId, guildId }
        ).catch(() => {});
        broadcastGuild(guildId, "VOICE_STATE_REMOVE", { guildId, channelId, userId: conn.userId });
      }
      if (conn) conns.delete(conn);
    });
  });

  function broadcastToChannel(channelId: string, payload: any) {
    for (const c of conns) {
      if (!c.channels.has(channelId)) continue;
      c.seq += 1;
      send(c.ws, { op: "DISPATCH", t: "MESSAGE_CREATE", s: c.seq, d: payload });
    }
  }

  function broadcastGuild(guildId: string, t: string, d: any) {
    for (const c of conns) {
      if (!c.guilds.has(guildId)) continue;
      c.seq += 1;
      send(c.ws, { op: "DISPATCH", t, s: c.seq, d });
    }
  }

  return { broadcastToChannel, broadcastGuild };
}
