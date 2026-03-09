import mediasoup from "mediasoup";
import { env, resolvedMediasoupAnnouncedIp } from "../env.js";

type RoomKey = string; // `${guildId}:${channelId}`

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

const rooms = new Map<RoomKey, Room>();

let worker: mediasoup.types.Worker | null = null;

export function getMediasoupDiagnostics() {
  let peerCount = 0;
  let transportCount = 0;
  let producerCount = 0;
  let consumerCount = 0;

  for (const room of rooms.values()) {
    for (const peer of room.peers.values()) {
      peerCount += 1;
      transportCount += peer.transports.size;
      producerCount += peer.producers.size;
      consumerCount += peer.consumers.size;
    }
  }

  return {
    worker: !!worker,
    rooms: rooms.size,
    peers: peerCount,
    transports: transportCount,
    producers: producerCount,
    consumers: consumerCount,
    listenIp: env.MEDIASOUP_LISTEN_IP,
    announcedIp: resolvedMediasoupAnnouncedIp || null,
    rtcMinPort: env.MEDIASOUP_RTC_MIN_PORT,
    rtcMaxPort: env.MEDIASOUP_RTC_MAX_PORT,
  };
}

export async function initMediasoup() {
  worker = await mediasoup.createWorker({
    rtcMinPort: env.MEDIASOUP_RTC_MIN_PORT,
    rtcMaxPort: env.MEDIASOUP_RTC_MAX_PORT
  });

  worker.on("died", () => {
    console.error("mediasoup worker died");
    process.exit(1);
  });
}

function key(guildId: string, channelId: string): RoomKey {
  return `${guildId}:${channelId}`;
}

async function getOrCreateRoom(guildId: string, channelId: string) {
  if (!worker) throw new Error("MEDIASOUP_NOT_INIT");
  const k = key(guildId, channelId);
  const existing = rooms.get(k);
  if (existing) return existing;

  const mediaCodecs: mediasoup.types.RtpCodecCapability[] = [
    {
      kind: "audio",
      mimeType: "audio/opus",
      preferredPayloadType: 111,
      clockRate: 48000,
      channels: 2
    },
    {
      kind: "video",
      mimeType: "video/VP8",
      preferredPayloadType: 112,
      clockRate: 90000
    }
  ];

  const router = await worker.createRouter({ mediaCodecs });
  const room: Room = { router, peers: new Map() };
  rooms.set(k, room);
  return room;
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
  }
  return room.peers.get(userId)!;
}

export async function createWebRtcTransport(
  guildId: string,
  channelId: string,
  userId: string,
  direction?: "send" | "recv",
) {
  const room = await getOrCreateRoom(guildId, channelId);
  const peer = await ensurePeer(guildId, channelId, userId);

  const transport = await room.router.createWebRtcTransport({
    listenIps: [
      {
        ip: env.MEDIASOUP_LISTEN_IP,
        announcedIp: resolvedMediasoupAnnouncedIp,
      },
    ],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
  });

  try {
    (transport as any).appData = {
      ...(transport as any).appData,
      guildId,
      channelId,
      userId,
      direction,
    };
  } catch {}

  peer.transports.set(transport.id, transport);

  return {
    id: transport.id,
    iceParameters: transport.iceParameters,
    iceCandidates: transport.iceCandidates,
    dtlsParameters: transport.dtlsParameters
  };
}

export async function connectTransport(guildId: string, channelId: string, userId: string, transportId: string, dtlsParameters: any) {
  const peer = await ensurePeer(guildId, channelId, userId);
  const transport = peer.transports.get(transportId);
  if (!transport) throw new Error("TRANSPORT_NOT_FOUND");
  await transport.connect({ dtlsParameters });
}

export async function restartIce(
  guildId: string,
  channelId: string,
  userId: string,
  transportId: string,
) {
  const peer = await ensurePeer(guildId, channelId, userId);
  const transport = peer.transports.get(transportId);
  if (!transport) throw new Error("TRANSPORT_NOT_FOUND");
  const iceParameters = await transport.restartIce();
  return { transportId, iceParameters };
}

export async function produce(guildId: string, channelId: string, userId: string, transportId: string, kind: "audio" | "video", rtpParameters: any) {
  const peer = await ensurePeer(guildId, channelId, userId);
  const transport = peer.transports.get(transportId);
  if (!transport) throw new Error("TRANSPORT_NOT_FOUND");

  const producer = await transport.produce({ kind, rtpParameters });
  peer.producers.set(producer.id, producer);
  producer.on("transportclose", () => {
    peer.producers.delete(producer.id);
  });
  producer.on("@close", () => {
    peer.producers.delete(producer.id);
  });

  return { producerId: producer.id };
}

export async function consume(
  guildId: string,
  channelId: string,
  userId: string,
  transportId: string,
  producerId: string,
  rtpCapabilities: any
) {
  const room = await getOrCreateRoom(guildId, channelId);
  const peer = await ensurePeer(guildId, channelId, userId);
  const transport = peer.transports.get(transportId);
  if (!transport) throw new Error("TRANSPORT_NOT_FOUND");

  if (!room.router.canConsume({ producerId, rtpCapabilities })) {
    throw new Error("CANNOT_CONSUME");
  }

  const consumer = await transport.consume({
    producerId,
    rtpCapabilities,
    paused: false
  });

  peer.consumers.set(consumer.id, consumer);
  consumer.on("transportclose", () => {
    peer.consumers.delete(consumer.id);
  });
  consumer.on("producerclose", () => {
    peer.consumers.delete(consumer.id);
  });
  consumer.on("@close", () => {
    peer.consumers.delete(consumer.id);
  });

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

export function closeProducer(guildId: string, channelId: string, userId: string, producerId: string): boolean {
  const room = rooms.get(key(guildId, channelId));
  if (!room) return false;
  const peer = room.peers.get(userId);
  if (!peer) return false;
  const producer = peer.producers.get(producerId);
  if (!producer) return false;
  try { producer.close(); } catch {}
  peer.producers.delete(producerId);
  return true;
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

  if (room.peers.size === 0) {
    try { room.router.close(); } catch {}
    rooms.delete(roomKey);
  }

  return closedProducerIds;
}
