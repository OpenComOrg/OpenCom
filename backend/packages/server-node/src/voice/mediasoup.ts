import mediasoup from "mediasoup";
import { env } from "../env.js";
import { createLogger } from "../logger.js";

type RoomKey = string; // `${guildId}:${channelId}`
type TransportDirection = "send" | "recv";

type Room = {
  router: mediasoup.types.Router;
  peers: Map<string, Peer>;
};

type Peer = {
  userId: string;
  transports: Map<string, mediasoup.types.WebRtcTransport>;
  producers: Map<string, mediasoup.types.Producer>;
  consumers: Map<string, mediasoup.types.Consumer>;
};

const logger = createLogger("voice:mediasoup");
const rooms = new Map<RoomKey, Room>();

let worker: mediasoup.types.Worker | null = null;
let workerDiedAt: string | null = null;

export async function initMediasoup() {
  worker = await mediasoup.createWorker({
    rtcMinPort: env.MEDIASOUP_RTC_MIN_PORT,
    rtcMaxPort: env.MEDIASOUP_RTC_MAX_PORT
  });

  logger.info("mediasoup worker created", {
    pid: worker.pid,
    rtcMinPort: env.MEDIASOUP_RTC_MIN_PORT,
    rtcMaxPort: env.MEDIASOUP_RTC_MAX_PORT
  });

  worker.on("died", () => {
    workerDiedAt = new Date().toISOString();
    logger.error("mediasoup worker died", undefined, { workerDiedAt });
  });
}

function key(guildId: string, channelId: string): RoomKey {
  return `${guildId}:${channelId}`;
}

async function getOrCreateRoom(guildId: string, channelId: string) {
  if (workerDiedAt) throw new Error("MEDIASOUP_WORKER_DIED");
  if (!worker) throw new Error("MEDIASOUP_NOT_INIT");
  const k = key(guildId, channelId);
  const existing = rooms.get(k);
  if (existing) return existing;

  const mediaCodecs: mediasoup.types.RtpCodecCapability[] = [
    {
      kind: "audio",
      mimeType: "audio/opus",
      clockRate: 48000,
      channels: 2
    }
  ];

  const router = await worker.createRouter({ mediaCodecs });
  logger.info("router created", { guildId, channelId, roomId: k, routerId: router.id });
  const room: Room = { router, peers: new Map() };
  rooms.set(k, room);
  return room;
}

function getExistingPeer(guildId: string, channelId: string, userId: string) {
  const room = rooms.get(key(guildId, channelId));
  if (!room) throw new Error("ROOM_NOT_FOUND");
  const peer = room.peers.get(userId);
  if (!peer) throw new Error("PEER_NOT_FOUND");
  return { room, peer };
}

function getTransportDirection(transport: mediasoup.types.WebRtcTransport): TransportDirection | undefined {
  return transport.appData?.direction as TransportDirection | undefined;
}

export async function getRouterRtpCapabilities(guildId: string, channelId: string) {
  const room = await getOrCreateRoom(guildId, channelId);
  return room.router.rtpCapabilities;
}

export async function ensurePeer(guildId: string, channelId: string, userId: string) {
  const room = await getOrCreateRoom(guildId, channelId);
  if (!room.peers.has(userId)) {
    room.peers.set(userId, {
      userId,
      transports: new Map(),
      producers: new Map(),
      consumers: new Map()
    });
    logger.debug("peer created", { guildId, channelId, userId, roomId: key(guildId, channelId) });
  }
  return room.peers.get(userId)!;
}

export async function createWebRtcTransport(guildId: string, channelId: string, userId: string, direction: TransportDirection) {
  const room = await getOrCreateRoom(guildId, channelId);
  const peer = await ensurePeer(guildId, channelId, userId);

  const listenIp = {
    ip: env.MEDIASOUP_LISTEN_IP,
    ...(env.MEDIASOUP_ANNOUNCED_IP ? { announcedIp: env.MEDIASOUP_ANNOUNCED_IP } : {})
  };

  const transport = await room.router.createWebRtcTransport({
    listenIps: [listenIp],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    appData: { direction }
  });

  transport.on("close", () => {
    peer.transports.delete(transport.id);
    logger.info("transport closed", { guildId, channelId, userId, transportId: transport.id, direction });
  });

  peer.transports.set(transport.id, transport);
  logger.info("transport created", { guildId, channelId, userId, roomId: key(guildId, channelId), transportId: transport.id, direction });

  return {
    id: transport.id,
    iceParameters: transport.iceParameters,
    iceCandidates: transport.iceCandidates,
    dtlsParameters: transport.dtlsParameters
  };
}

export async function connectTransport(guildId: string, channelId: string, userId: string, transportId: string, dtlsParameters: unknown) {
  const { peer } = getExistingPeer(guildId, channelId, userId);
  const transport = peer.transports.get(transportId);
  if (!transport) throw new Error("TRANSPORT_NOT_FOUND");
  await transport.connect({ dtlsParameters: dtlsParameters as mediasoup.types.DtlsParameters });
  logger.info("transport connected", { guildId, channelId, userId, transportId, direction: getTransportDirection(transport) });
}

export async function produce(guildId: string, channelId: string, userId: string, transportId: string, kind: "audio" | "video", rtpParameters: unknown) {
  const { peer } = getExistingPeer(guildId, channelId, userId);
  const transport = peer.transports.get(transportId);
  if (!transport) throw new Error("TRANSPORT_NOT_FOUND");
  if (getTransportDirection(transport) !== "send") throw new Error("WRONG_TRANSPORT_DIRECTION");

  const producer = await transport.produce({ kind, rtpParameters: rtpParameters as mediasoup.types.RtpParameters });
  producer.on("transportclose", () => peer.producers.delete(producer.id));
  producer.on("close", () => peer.producers.delete(producer.id));
  peer.producers.set(producer.id, producer);
  logger.info("producer created", { guildId, channelId, userId, transportId, producerId: producer.id, kind });

  return { producerId: producer.id };
}

export async function consume(
  guildId: string,
  channelId: string,
  userId: string,
  transportId: string,
  producerId: string,
  rtpCapabilities: unknown
) {
  const room = await getOrCreateRoom(guildId, channelId);
  const { peer } = getExistingPeer(guildId, channelId, userId);
  const transport = peer.transports.get(transportId);
  if (!transport) throw new Error("TRANSPORT_NOT_FOUND");
  if (getTransportDirection(transport) !== "recv") throw new Error("WRONG_TRANSPORT_DIRECTION");

  if (!room.router.canConsume({ producerId, rtpCapabilities: rtpCapabilities as mediasoup.types.RtpCapabilities })) {
    throw new Error("CANNOT_CONSUME");
  }

  const consumer = await transport.consume({
    producerId,
    rtpCapabilities: rtpCapabilities as mediasoup.types.RtpCapabilities,
    paused: true
  });

  consumer.on("transportclose", () => peer.consumers.delete(consumer.id));
  consumer.on("producerclose", () => peer.consumers.delete(consumer.id));
  consumer.on("close", () => peer.consumers.delete(consumer.id));
  peer.consumers.set(consumer.id, consumer);
  await consumer.resume();
  logger.info("consumer created", { guildId, channelId, userId, transportId, producerId, consumerId: consumer.id });

  return {
    id: consumer.id,
    producerId,
    kind: consumer.kind,
    rtpParameters: consumer.rtpParameters
  };
}

export function listProducers(guildId: string, channelId: string) {
  const room = rooms.get(key(guildId, channelId));
  if (!room) return [];
  const producers: { producerId: string; userId: string }[] = [];
  for (const [uid, peer] of room.peers) {
    for (const pid of peer.producers.keys()) producers.push({ producerId: pid, userId: uid });
  }
  return producers;
}

export function closePeer(guildId: string, channelId: string, userId: string): string[] {
  const roomKey = key(guildId, channelId);
  const room = rooms.get(roomKey);
  if (!room) return [];

  const peer = room.peers.get(userId);
  if (!peer) return [];

  const closedProducerIds = [...peer.producers.keys()];

  for (const producer of peer.producers.values()) {
    try { producer.close(); } catch {}
  }
  peer.producers.clear();

  for (const consumer of peer.consumers.values()) {
    try { consumer.close(); } catch {}
  }
  peer.consumers.clear();

  for (const transport of peer.transports.values()) {
    try { transport.close(); } catch {}
  }
  peer.transports.clear();

  room.peers.delete(userId);
  logger.info("peer closed", { guildId, channelId, userId, roomId: roomKey, closedProducerIds });

  if (room.peers.size === 0) {
    try { room.router.close(); } catch {}
    rooms.delete(roomKey);
    logger.info("router closed", { guildId, channelId, roomId: roomKey });
  }

  return closedProducerIds;
}

export function getMediasoupDiagnostics() {
  let transportCount = 0;
  let producerCount = 0;
  let consumerCount = 0;
  for (const room of rooms.values()) {
    for (const peer of room.peers.values()) {
      transportCount += peer.transports.size;
      producerCount += peer.producers.size;
      consumerCount += peer.consumers.size;
    }
  }

  return {
    workerUp: !!worker && !workerDiedAt,
    workerDiedAt,
    roomCount: rooms.size,
    transportCount,
    producerCount,
    consumerCount,
    rtcMinPort: env.MEDIASOUP_RTC_MIN_PORT,
    rtcMaxPort: env.MEDIASOUP_RTC_MAX_PORT
  };
}
