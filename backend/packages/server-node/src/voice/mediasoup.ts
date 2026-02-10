import mediasoup from "mediasoup";
import { env } from "../env.js";

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
      clockRate: 48000,
      channels: 2
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

export async function createWebRtcTransport(guildId: string, channelId: string, userId: string) {
  const room = await getOrCreateRoom(guildId, channelId);
  const peer = await ensurePeer(guildId, channelId, userId);

  const transport = await room.router.createWebRtcTransport({
    listenIps: [{ ip: env.MEDIASOUP_LISTEN_IP, announcedIp: env.MEDIASOUP_ANNOUNCED_IP }],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true
  });

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

export async function produce(guildId: string, channelId: string, userId: string, transportId: string, kind: "audio" | "video", rtpParameters: any) {
  const peer = await ensurePeer(guildId, channelId, userId);
  const transport = peer.transports.get(transportId);
  if (!transport) throw new Error("TRANSPORT_NOT_FOUND");

  const producer = await transport.produce({ kind, rtpParameters });
  peer.producers.set(producer.id, producer);

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
