import { randomUUID } from "node:crypto";
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
  listProducers,
  closePeer,
} from "./voice/mediasoup.js";
import { createLogger, sanitizeErrorMessage } from "./logger.js";

const logger = createLogger("gateway:voice");

type Conn = {
  ws: any;
  connId: string;
  userId: string;
  serverId: string;
  coreServerId: string;
  seq: number;
  channels: Set<string>;
  guilds: Set<string>;
  roles: string[];
  voice?: { guildId: string; channelId: string };
};

function errorPayload(code: string, error: unknown) {
  const details = sanitizeErrorMessage(error);
  return {
    error: code,
    code,
    details,
    ...(env.NODE_ENV !== "production" && error instanceof Error && error.stack ? { stack: error.stack } : {})
  };
}

export function attachNodeGateway(app: FastifyInstance) {
  const wss = new WebSocketServer({ noServer: true });
  const conns = new Set<Conn>();

  app.get("/health", async () => ({ ok: true }));


  app.get("/debug/voice", async (req, rep) => {
    if (!env.DEBUG_VOICE) return rep.code(404).send({ error: "NOT_FOUND" });
    return {
      connections: conns.size,
      activeVoiceConnections: [...conns].filter((c) => !!c.voice).length,
    };
  });

  function send(ws: any, msg: GatewayEnvelope) {
    ws.send(JSON.stringify(msg));
  }

  function sendDispatch(conn: Conn, t: string, d: any) {
    conn.seq += 1;
    send(conn.ws, { op: "DISPATCH", t, s: conn.seq, d });
  }

  function sendVoiceError(conn: Conn, code: string, error: unknown, extra: Record<string, unknown> = {}) {
    const payload = {
      ...errorPayload(code, error),
      ...(conn.voice ? { guildId: conn.voice.guildId, channelId: conn.voice.channelId } : {}),
      ...extra
    };
    logger.error("VOICE_ERROR dispatched", error, {
      connId: conn.connId,
      userId: conn.userId,
      guildId: conn.voice?.guildId,
      channelId: conn.voice?.channelId,
      code,
      ...extra
    });
    sendDispatch(conn, "VOICE_ERROR", payload);
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

  function notifyVoicePeerClosed(guildId: string, channelId: string, userId: string, closedProducerIds: string[]) {
    for (const producerId of closedProducerIds) {
      broadcastVoiceChannel(
        guildId,
        channelId,
        "VOICE_PRODUCER_CLOSED",
        { guildId, channelId, producerId, userId },
        userId
      );
    }

    broadcastVoiceChannel(
      guildId,
      channelId,
      "VOICE_USER_LEFT",
      { guildId, channelId, userId },
      userId
    );
  }

  function cleanupVoicePeerAndNotify(conn: Conn) {
    if (!conn.voice) return;
    const { guildId, channelId } = conn.voice;
    const closedProducerIds = closePeer(guildId, channelId, conn.userId);
    notifyVoicePeerClosed(guildId, channelId, conn.userId, closedProducerIds);
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
      try {
        msg = JSON.parse(raw.toString("utf8"));
      } catch (error) {
        logger.warn("Invalid gateway payload", { raw: raw.toString("utf8").slice(0, 500), details: sanitizeErrorMessage(error) });
        return;
      }

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
            connId: randomUUID(),
            userId: claims.sub,
            serverId: claims.server_id,
            coreServerId: claims.core_server_id || claims.server_id,
            seq: 0,
            channels: new Set(),
            guilds: new Set(),
            roles: Array.isArray((claims as any).roles) ? (claims as any).roles : []
          };
          conns.add(conn);
          logger.info("Gateway identified", { connId: conn.connId, userId: conn.userId, serverId: conn.serverId });

          await q(
            `UPDATE guilds
             SET server_id = :coreServerId
             WHERE owner_user_id = :userId AND (server_id = '' OR server_id IS NULL)`,
            { userId: conn.userId, coreServerId: conn.coreServerId }
          );

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
              guildIds: guildRows.map((r) => r.guild_id)
            }
          });
        } catch (error) {
          logger.error("Gateway identify failed", error);
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
          } catch (error) {
            logger.error("SUBSCRIBE_GUILD failed", error, { connId: conn.connId, guildId, userId: conn.userId });
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
          } catch (error) {
            logger.error("SUBSCRIBE_CHANNEL failed", error, { connId: conn.connId, channelId, userId: conn.userId });
            sendDispatch(conn, "ERROR", { error: "SUBSCRIBE_CHANNEL_FAILED" });
          }
        }
        return;
      }

      if (msg.op === "DISPATCH" && msg.t === "VOICE_JOIN") {
        const guildId = (msg.d as any)?.guildId;
        const channelId = (msg.d as any)?.channelId;
        if (typeof guildId !== "string" || typeof channelId !== "string") {
          sendVoiceError(conn, "BAD_VOICE_JOIN", new Error("Missing guildId/channelId"));
          return;
        }

        try {
          logger.info("VOICE_JOIN", { connId: conn.connId, userId: conn.userId, guildId, channelId });
          await requireGuildMember(guildId, conn.userId, conn.roles, conn.coreServerId);

          const ch = await q<{ id: string; type: string }>(
            `SELECT id,type FROM channels WHERE id=:channelId AND guild_id=:guildId`,
            { channelId, guildId }
          );
          if (!ch.length || ch[0].type !== "voice") {
            sendVoiceError(conn, "VOICE_CHANNEL_NOT_FOUND", new Error("Target channel is missing or not voice"));
            return;
          }

          const perms = await resolveChannelPermissions({ guildId, channelId, userId: conn.userId, roles: conn.roles });
          if (!has(perms, Perm.VIEW_CHANNEL) || !has(perms, Perm.CONNECT)) {
            sendVoiceError(conn, "MISSING_CONNECT_PERMS", new Error("CONNECT permission required"));
            return;
          }

          if (conn.voice && (conn.voice.guildId !== guildId || conn.voice.channelId !== channelId)) {
            cleanupVoicePeerAndNotify(conn);
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
        } catch (error) {
          sendVoiceError(conn, "VOICE_JOIN_FAILED", error, { guildId, channelId });
        }
        return;
      }

      if (msg.op === "DISPATCH" && msg.t === "VOICE_LEAVE") {
        try {
          logger.info("VOICE_LEAVE", { connId: conn.connId, userId: conn.userId, guildId: conn.voice?.guildId, channelId: conn.voice?.channelId });
          cleanupVoicePeerAndNotify(conn);
          await leaveVoice(conn);
          sendDispatch(conn, "VOICE_LEFT", { ok: true });
        } catch (error) {
          sendVoiceError(conn, "VOICE_LEAVE_FAILED", error);
        }
        return;
      }

      if (msg.op === "DISPATCH" && msg.t === "VOICE_SPEAKING") {
        try {
          if (!conn.voice) {
            sendVoiceError(conn, "NOT_IN_VOICE_CHANNEL", new Error("No active voice session"));
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
        } catch (error) {
          sendVoiceError(conn, "VOICE_SPEAKING_FAILED", error);
        }
        return;
      }

      if (msg.op === "DISPATCH" && msg.t === "VOICE_AUDIO_CHUNK") {
        try {
          if (!conn.voice) {
            sendVoiceError(conn, "NOT_IN_VOICE_CHANNEL", new Error("No active voice session"));
            return;
          }

          const encoded = (msg.d as any)?.encoded;
          const codec = (msg.d as any)?.codec;
          const channels = Number((msg.d as any)?.channels || 1);
          const sampleRate = Number((msg.d as any)?.sampleRate || 0);
          const sequence = Number((msg.d as any)?.sequence || 0);

          if (typeof encoded !== "string" || !encoded.length || encoded.length > 512_000) {
            sendVoiceError(conn, "BAD_VOICE_AUDIO_CHUNK", new Error("Invalid encoded audio payload"));
            return;
          }

          if (codec !== "pcm_s16le" || channels !== 1 || !Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 96000) {
            sendVoiceError(conn, "BAD_VOICE_AUDIO_CHUNK", new Error("Unexpected audio chunk codec/sampleRate/channels"));
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
        } catch (error) {
          sendVoiceError(conn, "VOICE_AUDIO_CHUNK_FAILED", error);
        }
        return;
      }

      if (msg.op === "DISPATCH" && msg.t === "VOICE_CREATE_TRANSPORT") {
        try {
          const guildId = (msg.d as any)?.guildId ?? conn.voice?.guildId;
          const channelId = (msg.d as any)?.channelId ?? conn.voice?.channelId;
          const direction = (msg.d as any)?.direction;
          if (typeof guildId !== "string" || typeof channelId !== "string") {
            sendVoiceError(conn, "BAD_VOICE_CONTEXT", new Error("Missing guildId/channelId"));
            return;
          }

          if (direction !== "send" && direction !== "recv") {
            sendVoiceError(conn, "BAD_TRANSPORT_DIRECTION", new Error("direction must be send or recv"));
            return;
          }

          if (!conn.voice || conn.voice.guildId !== guildId || conn.voice.channelId !== channelId) {
            sendVoiceError(conn, "NOT_IN_VOICE_CHANNEL", new Error("Transport creation requested outside joined voice"));
            return;
          }

          const transport = await createWebRtcTransport(guildId, channelId, conn.userId);
          sendDispatch(conn, "VOICE_TRANSPORT_CREATED", { guildId, channelId, direction, transport });
        } catch (error) {
          sendVoiceError(conn, "VOICE_TRANSPORT_CREATE_FAILED", error);
        }
        return;
      }

      if (msg.op === "DISPATCH" && msg.t === "VOICE_CONNECT_TRANSPORT") {
        try {
          if (!conn.voice) {
            sendVoiceError(conn, "NOT_IN_VOICE_CHANNEL", new Error("No active voice session"));
            return;
          }

          const transportId = (msg.d as any)?.transportId;
          const dtlsParameters = (msg.d as any)?.dtlsParameters;
          if (typeof transportId !== "string" || !dtlsParameters) {
            sendVoiceError(conn, "BAD_TRANSPORT_CONNECT", new Error("Missing transportId/dtlsParameters"));
            return;
          }

          const { guildId, channelId } = conn.voice;
          await connectTransport(guildId, channelId, conn.userId, transportId, dtlsParameters);
          sendDispatch(conn, "VOICE_TRANSPORT_CONNECTED", { transportId, guildId, channelId });
        } catch (error) {
          sendVoiceError(conn, "VOICE_TRANSPORT_CONNECT_FAILED", error);
        }
        return;
      }

      if (msg.op === "DISPATCH" && msg.t === "VOICE_PRODUCE") {
        try {
          if (!conn.voice) {
            sendVoiceError(conn, "NOT_IN_VOICE_CHANNEL", new Error("No active voice session"));
            return;
          }

          const guildId = conn.voice.guildId;
          const channelId = conn.voice.channelId;

          const perms = await resolveChannelPermissions({ guildId, channelId, userId: conn.userId, roles: conn.roles });
          if (!has(perms, Perm.SPEAK)) {
            sendVoiceError(conn, "MISSING_SPEAK_PERMS", new Error("SPEAK permission required"));
            return;
          }

          const transportId = (msg.d as any)?.transportId;
          const kind = (msg.d as any)?.kind;
          const rtpParameters = (msg.d as any)?.rtpParameters;
          const appData = (msg.d as any)?.appData;

          if (typeof transportId !== "string" || (kind !== "audio" && kind !== "video") || !rtpParameters) {
            sendVoiceError(conn, "BAD_VOICE_PRODUCE", new Error("Missing transportId/kind/rtpParameters"));
            return;
          }

          const result = await produce(guildId, channelId, conn.userId, transportId, kind, rtpParameters, appData);
          sendDispatch(conn, "VOICE_PRODUCED", { ...result, userId: conn.userId, guildId, channelId });
          broadcastVoiceChannel(guildId, channelId, "VOICE_NEW_PRODUCER", {
            guildId,
            channelId,
            userId: conn.userId,
            producerId: result.producerId,
            kind: result.kind,
            appData: result.appData
          }, conn.userId);
        } catch (error) {
          sendVoiceError(conn, "VOICE_PRODUCE_FAILED", error);
        }
        return;
      }

      if (msg.op === "DISPATCH" && msg.t === "VOICE_CONSUME") {
        try {
          if (!conn.voice) {
            sendVoiceError(conn, "NOT_IN_VOICE_CHANNEL", new Error("No active voice session"));
            return;
          }

          const transportId = (msg.d as any)?.transportId;
          const producerId = (msg.d as any)?.producerId;
          const rtpCapabilities = (msg.d as any)?.rtpCapabilities;

          if (typeof transportId !== "string" || typeof producerId !== "string" || !rtpCapabilities) {
            sendVoiceError(conn, "BAD_VOICE_CONSUME", new Error("Missing transportId/producerId/rtpCapabilities"));
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

          sendDispatch(conn, "VOICE_CONSUMED", { ...data, guildId: conn.voice.guildId, channelId: conn.voice.channelId });
        } catch (error) {
          sendVoiceError(conn, "VOICE_CONSUME_FAILED", error);
        }
        return;
      }
    });

    ws.on("close", async () => {
      if (conn) {
        logger.info("Gateway disconnected", { connId: conn.connId, userId: conn.userId, guildId: conn.voice?.guildId, channelId: conn.voice?.channelId });
        cleanupVoicePeerAndNotify(conn);
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

  function broadcastMention(userIds: string[], payload: any) {
    if (!Array.isArray(userIds) || userIds.length === 0) return;
    const target = new Set(userIds);
    for (const c of conns) {
      if (!target.has(c.userId)) continue;
      sendDispatch(c, "MESSAGE_MENTION", payload);
    }
  }

  return { broadcastToChannel, broadcastGuild, broadcastMention };
}
