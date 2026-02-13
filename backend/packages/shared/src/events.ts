export type GatewayOpcode =
  | "HELLO"
  | "IDENTIFY"
  | "READY"
  | "DISPATCH"
  | "HEARTBEAT"
  | "HEARTBEAT_ACK"
  | "ERROR";

export type GatewayEnvelope<T = unknown> = {
  op: GatewayOpcode;
  d?: T;
  s?: number;
  t?: string;
};

// Identify payloads
export type CoreIdentify = { accessToken: string; deviceId?: string };
export type NodeIdentify = { membershipToken: string };

// Presence
export type PresenceStatus = "online" | "idle" | "dnd" | "offline";
export type PresenceUpdate = { status: PresenceStatus; customStatus?: string | null };

// Profiles
export type UserProfile = {
  id: string;
  username: string;
  displayName?: string | null;
  bio?: string | null;
  pfpUrl?: string | null;
  bannerUrl?: string | null;
  badges: string[];
};

// DMs (E2EE-ready)
export type DMEnvelope = {
  threadId: string;
  senderDeviceId: string;
  recipientDeviceId: string;
  header: Record<string, unknown>;
  ciphertext: string;
  sentAt: string;
  messageId: string;
};

export type DMMessageCreate = { envelope: DMEnvelope };
export type TypingStart = { channelId?: string; threadId?: string; userId: string };

// Server messages
export type NodeMessageCreate = {
  channelId: string;
  message: { id: string; authorId: string; content: string; createdAt: string };
};

// Invites
export type InviteCreated = { code: string; serverId: string; createdAt: string };

// Voice (signaling + SFU coordination)
// These are intentionally generic so you can use mediasoup on the node.
export type VoiceState = { guildId: string; channelId: string; userId: string; muted: boolean; deafened: boolean };

export type VoiceJoin = { guildId: string; channelId: string };
export type VoiceLeave = { guildId: string; channelId: string };

export type VoiceRouterRtpCapabilities = { guildId: string; channelId: string; rtpCapabilities: any };
export type VoiceCreateTransport = { guildId: string; channelId: string; direction: "send" | "recv" };
export type VoiceConnectTransport = { transportId: string; dtlsParameters: any };
export type VoiceProduce = { transportId: string; kind: "audio" | "video"; rtpParameters: any; appData?: any };
export type VoiceConsume = { transportId: string; producerId: string; rtpCapabilities: any };

// DM Call Signals
export type CallSignal = {
  id: string;
  threadId: string;
  fromUserId: string;
  type: "offer" | "answer" | "ice" | "end";
  payload: any;
  createdAt: string;
};
export type CallSignalCreate = CallSignal;
