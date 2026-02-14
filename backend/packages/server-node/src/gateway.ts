import { WebSocketServer } from "ws";
import type { FastifyInstance } from "fastify";
import { GatewayEnvelope, NodeIdentify } from "@ods/shared/events.js";
import { verifyMembershipToken } from "./auth/verifyMembership.js";
import { q } from "./db.js";
import { env } from "./env.js";
import { requireGuildMember } from "./auth/requireGuildMember.js";
import { resolveChannelPermissions } from "./permissions/resolve.js";
import { Perm, has } from "./permissions/bits.js";
import {
  getRouterRtpCapabilities,
  ensurePeer,
  createWebRtcTransport,
  connectTransport,
  produce,
  consume,
  listProducers
} from "./voice/mediasoup.js";

type Conn = {
  ws: any;
  userId: string;
  serverId: string;
  coreServerId: string;
  seq: number;
  channels: Set<string>;
  guilds: Set<string>;
  roles: string[];
  voice?: { guildId: string; channelId: string };
};

export function attachNodeGateway(app: FastifyInstance) {
  const wss = new WebSocketServer({ noServer: true });
  const conns = new Set<Conn>();

  function send(ws: any, msg: GatewayEnvelope) {
    ws.send(JSON.stringify(msg));
  }

  function sendDispatch(conn: Conn, t: string, d: any) {
    conn.seq += 1;
    send(conn.ws, { op: "DISPATCH", t, s: conn.seq, d });
  }

  function broadcastGuild(guildId: string, t: string, d: any) {
    for (const c of conns) {
      if (!c.guilds.has(guildId)) continue;
      sendDispatch(c, t, d);
    }
  }

  function broadcastVoiceChannel(guildId: string, channelId: string, t: string, d: any, excludeUserId?: string) {
    for (const c of conns) {
      if (!c.voice) continue;
      if (c.voice.guildId !== guildId || c.voice.channelId !== channelId) continue;
      if (excludeUserId && c.userId === excludeUserId) continue;
      sendDispatch(c, t, d);
    }
  }

  async function emitVoiceState(guildId: string, userId: string) {
    const rows = await q<any>(
      `SELECT guild_id, channel_id, user_id, muted, deafened, updated_at
       FROM voice_states
       WHERE guild_id=:guildId AND user_id=:userId`,
      { guildId, userId }
    );

    if (!rows.length) {
      broadcastGuild(guildId, "VOICE_STATE_UPDATE", { guildId, userId, channelId: null, muted: false, deafened: false });
      return;
    }

    const r = rows[0];
    broadcastGuild(guildId, "VOICE_STATE_UPDATE", {
      guildId: r.guild_id,
      channelId: r.channel_id,
      userId: r.user_id,
      muted: !!r.muted,
      deafened: !!r.deafened,
      updatedAt: new Date(r.updated_at).toISOString()
    });
  }

  async function leaveVoice(conn: Conn) {
    if (!conn.voice) return;
    const { guildId } = conn.voice;

    await q(`DELETE FROM voice_states WHERE guild_id=:guildId AND user_id=:userId`, {
      guildId,
      userId: conn.userId
    });

    conn.voice = undefined;
    await emitVoiceState(guildId, conn.userId);
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
        const d = msg.d as NodeIdentify;
        try {
          const claims = await verifyMembershipToken(d.membershipToken);
          if (claims.server_id !== env.NODE_SERVER_ID) {
            send(ws, { op: "ERROR", d: { error: "INVALID_MEMBERSHIP" } });
            ws.close();
            return;
          }

          conn = {
            ws,
            userId: claims.sub,
            serverId: claims.server_id,
            coreServerId: claims.core_server_id || claims.server_id,
            seq: 0,
            channels: new Set(),
            guilds: new Set(),
            roles: Array.isArray((claims as any).roles) ? (claims as any).roles : []
          };
          conns.add(conn);

          await q(
            `UPDATE guilds
             SET server_id = :coreServerId
             WHERE owner_user_id = :userId AND (server_id = '' OR server_id IS NULL)`,
            { userId: conn.userId, coreServerId: conn.coreServerId }
          );

          // Legacy compatibility: ensure owned guilds always have a guild_members row,
          // so READY/subscriptions behave consistently for websocket clients.
          await q(
            `INSERT INTO guild_members (guild_id,user_id)
             SELECT g.id, :userId
             FROM guilds g
             WHERE g.owner_user_id = :userId AND g.server_id = :coreServerId
             ON DUPLICATE KEY UPDATE guild_id=guild_id`,
            { userId: conn.userId, coreServerId: conn.coreServerId }
          );

          const guildRows = await q<{ guild_id: string }>(
            `SELECT gm.guild_id
             FROM guild_members gm
             JOIN guilds g ON g.id = gm.guild_id
             WHERE gm.user_id=:userId AND g.server_id=:coreServerId`,
            { userId: conn.userId, coreServerId: conn.coreServerId }
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

      if (msg.op === "DISPATCH" && msg.t === "SUBSCRIBE_GUILD") {
        const guildId = (msg.d as any)?.guildId;
        if (typeof guildId === "string") {
          try {
            const allowedGuild = await q<{ id: string }>(
              `SELECT g.id
               FROM guilds g
               LEFT JOIN guild_members gm ON gm.guild_id=g.id AND gm.user_id=:userId
               WHERE g.id=:guildId AND g.server_id=:coreServerId
                 AND (g.owner_user_id=:userId OR gm.user_id=:userId)
               LIMIT 1`,
              { guildId, userId: conn.userId, coreServerId: conn.coreServerId }
            );
            if (allowedGuild.length) conn.guilds.add(guildId);
          } catch {
            sendDispatch(conn, "ERROR", { error: "SUBSCRIBE_GUILD_FAILED" });
          }
        }
        return;
      }

      if (msg.op === "DISPATCH" && msg.t === "SUBSCRIBE_CHANNEL") {
        const channelId = (msg.d as any)?.channelId;
        if (typeof channelId === "string") {
          try {
            const allowedChannel = await q<{ id: string }>(
              `SELECT c.id
               FROM channels c
               JOIN guilds g ON g.id=c.guild_id
               LEFT JOIN guild_members gm ON gm.guild_id=g.id AND gm.user_id=:userId
               WHERE c.id=:channelId AND g.server_id=:coreServerId
                 AND (g.owner_user_id=:userId OR gm.user_id=:userId)
               LIMIT 1`,
              { channelId, userId: conn.userId, coreServerId: conn.coreServerId }
            );
            if (allowedChannel.length) conn.channels.add(channelId);
          } catch {
            sendDispatch(conn, "ERROR", { error: "SUBSCRIBE_CHANNEL_FAILED" });
          }
        }
        return;
      }

      if (msg.op === "DISPATCH" && msg.t === "VOICE_JOIN") {
        const guildId = (msg.d as any)?.guildId;
        const channelId = (msg.d as any)?.channelId;
        if (typeof guildId !== "string" || typeof channelId !== "string") {
          sendDispatch(conn, "VOICE_ERROR", { error: "BAD_VOICE_JOIN" });
          return;
        }

        try {
          await requireGuildMember(guildId, conn.userId, conn.roles, conn.coreServerId);

          const ch = await q<{ id: string; type: string }>(
            `SELECT id,type FROM channels WHERE id=:channelId AND guild_id=:guildId`,
            { channelId, guildId }
          );
          if (!ch.length || ch[0].type !== "voice") {
            sendDispatch(conn, "VOICE_ERROR", { error: "VOICE_CHANNEL_NOT_FOUND" });
            return;
          }

          const perms = await resolveChannelPermissions({ guildId, channelId, userId: conn.userId, roles: conn.roles });
          if (!has(perms, Perm.VIEW_CHANNEL) || !has(perms, Perm.CONNECT)) {
            sendDispatch(conn, "VOICE_ERROR", { error: "MISSING_CONNECT_PERMS" });
            return;
          }

          if (conn.voice && (conn.voice.guildId !== guildId || conn.voice.channelId !== channelId)) {
            await leaveVoice(conn);
          }

          await ensurePeer(guildId, channelId, conn.userId);

          await q(
            `INSERT INTO voice_states (guild_id,channel_id,user_id,muted,deafened,updated_at)
             VALUES (:guildId,:channelId,:userId,0,0,NOW())
             ON DUPLICATE KEY UPDATE channel_id=VALUES(channel_id),updated_at=NOW()`,
            { guildId, channelId, userId: conn.userId }
          );

          conn.voice = { guildId, channelId };

          const rtpCapabilities = await getRouterRtpCapabilities(guildId, channelId);
          const producers = listProducers(guildId, channelId).filter((p) => p.userId !== conn.userId);

          sendDispatch(conn, "VOICE_JOINED", { guildId, channelId, rtpCapabilities, producers });
          await emitVoiceState(guildId, conn.userId);
        } catch {
          sendDispatch(conn, "VOICE_ERROR", { error: "VOICE_JOIN_FAILED" });
        }
        return;
      }

      if (msg.op === "DISPATCH" && msg.t === "VOICE_LEAVE") {
        try {
          await leaveVoice(conn);
          sendDispatch(conn, "VOICE_LEFT", { ok: true });
        } catch {
          sendDispatch(conn, "VOICE_ERROR", { error: "VOICE_LEAVE_FAILED" });
        }
        return;
      }

      if (msg.op === "DISPATCH" && msg.t === "VOICE_WEBRTC_SIGNAL") {
        try {
          if (!conn.voice) {
            sendDispatch(conn, "VOICE_ERROR", { error: "NOT_IN_VOICE_CHANNEL" });
            return;
          }
          const targetUserId = (msg.d as any)?.targetUserId;
          const payload = (msg.d as any)?.payload;
          if (typeof targetUserId !== "string" || !payload) {
            sendDispatch(conn, "VOICE_ERROR", { error: "BAD_VOICE_WEBRTC_SIGNAL" });
            return;
          }

          for (const c of conns) {
            if (c.userId !== targetUserId) continue;
            if (!c.voice) continue;
            if (c.voice.guildId !== conn.voice.guildId || c.voice.channelId !== conn.voice.channelId) continue;
            sendDispatch(c, "VOICE_WEBRTC_SIGNAL", {
              guildId: conn.voice.guildId,
              channelId: conn.voice.channelId,
              fromUserId: conn.userId,
              payload
            });
            break;
          }
        } catch {
          sendDispatch(conn, "VOICE_ERROR", { error: "VOICE_WEBRTC_SIGNAL_FAILED" });
        }
        return;
      }

      if (msg.op === "DISPATCH" && msg.t === "VOICE_SPEAKING") {
        try {
          if (!conn.voice) {
            sendDispatch(conn, "VOICE_ERROR", { error: "NOT_IN_VOICE_CHANNEL" });
            return;
          }

          const speaking = !!(msg.d as any)?.speaking;
          const guildId = conn.voice.guildId;
          const channelId = conn.voice.channelId;

          broadcastGuild(guildId, "VOICE_SPEAKING", {
            guildId,
            channelId,
            userId: conn.userId,
            speaking
          });
        } catch {
          sendDispatch(conn, "VOICE_ERROR", { error: "VOICE_SPEAKING_FAILED" });
        }
        return;
      }

      if (msg.op === "DISPATCH" && msg.t === "VOICE_AUDIO_CHUNK") {
        try {
          if (!conn.voice) {
            sendDispatch(conn, "VOICE_ERROR", { error: "NOT_IN_VOICE_CHANNEL" });
            return;
          }

          const encoded = (msg.d as any)?.encoded;
          const codec = (msg.d as any)?.codec;
          const channels = Number((msg.d as any)?.channels || 1);
          const sampleRate = Number((msg.d as any)?.sampleRate || 0);
          const sequence = Number((msg.d as any)?.sequence || 0);

          if (typeof encoded !== "string" || !encoded.length || encoded.length > 512_000) {
            sendDispatch(conn, "VOICE_ERROR", { error: "BAD_VOICE_AUDIO_CHUNK" });
            return;
          }

          if (codec !== "pcm_s16le" || channels !== 1 || !Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 96000) {
            sendDispatch(conn, "VOICE_ERROR", { error: "BAD_VOICE_AUDIO_CHUNK" });
            return;
          }

          broadcastVoiceChannel(
            conn.voice.guildId,
            conn.voice.channelId,
            "VOICE_AUDIO_CHUNK",
            {
              guildId: conn.voice.guildId,
              channelId: conn.voice.channelId,
              fromUserId: conn.userId,
              encoded,
              codec,
              channels,
              sampleRate,
              sequence
            },
            conn.userId
          );
        } catch {
          sendDispatch(conn, "VOICE_ERROR", { error: "VOICE_AUDIO_CHUNK_FAILED" });
        }
        return;
      }

      if (msg.op === "DISPATCH" && msg.t === "VOICE_CREATE_TRANSPORT") {
        try {
          const guildId = (msg.d as any)?.guildId ?? conn.voice?.guildId;
          const channelId = (msg.d as any)?.channelId ?? conn.voice?.channelId;
          const direction = (msg.d as any)?.direction;
          if (typeof guildId !== "string" || typeof channelId !== "string") {
            sendDispatch(conn, "VOICE_ERROR", { error: "BAD_VOICE_CONTEXT" });
            return;
          }

          if (!conn.voice || conn.voice.guildId !== guildId || conn.voice.channelId !== channelId) {
            sendDispatch(conn, "VOICE_ERROR", { error: "NOT_IN_VOICE_CHANNEL" });
            return;
          }

          const transport = await createWebRtcTransport(guildId, channelId, conn.userId);
          sendDispatch(conn, "VOICE_TRANSPORT_CREATED", { guildId, channelId, direction, transport });
        } catch {
          sendDispatch(conn, "VOICE_ERROR", { error: "VOICE_TRANSPORT_CREATE_FAILED" });
        }
        return;
      }

      if (msg.op === "DISPATCH" && msg.t === "VOICE_CONNECT_TRANSPORT") {
        try {
          if (!conn.voice) {
            sendDispatch(conn, "VOICE_ERROR", { error: "NOT_IN_VOICE_CHANNEL" });
            return;
          }

          const transportId = (msg.d as any)?.transportId;
          const dtlsParameters = (msg.d as any)?.dtlsParameters;
          if (typeof transportId !== "string" || !dtlsParameters) {
            sendDispatch(conn, "VOICE_ERROR", { error: "BAD_TRANSPORT_CONNECT" });
            return;
          }

          await connectTransport(conn.voice.guildId, conn.voice.channelId, conn.userId, transportId, dtlsParameters);
          sendDispatch(conn, "VOICE_TRANSPORT_CONNECTED", { transportId });
        } catch {
          sendDispatch(conn, "VOICE_ERROR", { error: "VOICE_TRANSPORT_CONNECT_FAILED" });
        }
        return;
      }

      if (msg.op === "DISPATCH" && msg.t === "VOICE_PRODUCE") {
        try {
          if (!conn.voice) {
            sendDispatch(conn, "VOICE_ERROR", { error: "NOT_IN_VOICE_CHANNEL" });
            return;
          }

          const guildId = conn.voice.guildId;
          const channelId = conn.voice.channelId;

          const perms = await resolveChannelPermissions({ guildId, channelId, userId: conn.userId, roles: conn.roles });
          if (!has(perms, Perm.SPEAK)) {
            sendDispatch(conn, "VOICE_ERROR", { error: "MISSING_SPEAK_PERMS" });
            return;
          }

          const transportId = (msg.d as any)?.transportId;
          const kind = (msg.d as any)?.kind;
          const rtpParameters = (msg.d as any)?.rtpParameters;

          if (typeof transportId !== "string" || (kind !== "audio" && kind !== "video") || !rtpParameters) {
            sendDispatch(conn, "VOICE_ERROR", { error: "BAD_VOICE_PRODUCE" });
            return;
          }

          const result = await produce(guildId, channelId, conn.userId, transportId, kind, rtpParameters);
          sendDispatch(conn, "VOICE_PRODUCED", { ...result, userId: conn.userId, guildId, channelId });
          broadcastGuild(guildId, "VOICE_NEW_PRODUCER", {
            guildId,
            channelId,
            userId: conn.userId,
            producerId: result.producerId
          });
        } catch {
          sendDispatch(conn, "VOICE_ERROR", { error: "VOICE_PRODUCE_FAILED" });
        }
        return;
      }

      if (msg.op === "DISPATCH" && msg.t === "VOICE_CONSUME") {
        try {
          if (!conn.voice) {
            sendDispatch(conn, "VOICE_ERROR", { error: "NOT_IN_VOICE_CHANNEL" });
            return;
          }

          const transportId = (msg.d as any)?.transportId;
          const producerId = (msg.d as any)?.producerId;
          const rtpCapabilities = (msg.d as any)?.rtpCapabilities;

          if (typeof transportId !== "string" || typeof producerId !== "string" || !rtpCapabilities) {
            sendDispatch(conn, "VOICE_ERROR", { error: "BAD_VOICE_CONSUME" });
            return;
          }

          const data = await consume(
            conn.voice.guildId,
            conn.voice.channelId,
            conn.userId,
            transportId,
            producerId,
            rtpCapabilities
          );

          sendDispatch(conn, "VOICE_CONSUMED", data);
        } catch {
          sendDispatch(conn, "VOICE_ERROR", { error: "VOICE_CONSUME_FAILED" });
        }
        return;
      }
    });

    ws.on("close", async () => {
      if (conn) {
        await leaveVoice(conn);
        conns.delete(conn);
      }
    });
  });

  function broadcastToChannel(channelId: string, payload: any) {
    for (const c of conns) {
      if (!c.channels.has(channelId)) continue;
      sendDispatch(c, "MESSAGE_CREATE", payload);
    }
  }

  return { broadcastToChannel, broadcastGuild };
}
