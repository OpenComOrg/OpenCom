export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

export type LoginResult = {
  user: {
    id: string;
    email: string;
    username: string;
  };
  accessToken: string;
  refreshToken: string;
};

export type CoreServer = {
  id: string;
  name: string;
  baseUrl: string;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  defaultGuildId?: string;
  roles?: string[];
  membershipToken: string;
};

export type CoreServersResponse = {
  servers: CoreServer[];
};

export type Guild = {
  id: string;
  name: string;
};

export type Channel = {
  id: string;
  guild_id: string;
  name: string;
  type: "text" | "voice" | "category" | string;
  position: number;
  parent_id: string | null;
};

export type Role = {
  id: string;
  name: string;
  color?: string | null;
  position: number;
  permissions?: number;
};

export type ServerEmote = {
  name: string;
  imageUrl: string;
};

export type GuildMember = {
  id: string;
  username: string;
  displayName?: string | null;
  pfp_url?: string | null;
  status?: string;
  roleIds?: string[];
};

export type GuildState = {
  guild: {
    id: string;
    name: string;
    owner_user_id: string;
    created_at: string;
  };
  channels: Channel[];
  roles?: Role[];
  members?: GuildMember[];
  emotes?: ServerEmote[];
};

export type MessageAttachment = {
  id: string;
  filename: string;
  fileName?: string;
  url: string;
  mimeType?: string | null;
  contentType?: string | null;
  size?: number | null;
  sizeBytes?: number | null;
};

export type ChannelMessage = {
  id: string;
  author_id: string;
  username?: string;
  pfp_url?: string | null;
  content: string;
  created_at: string;
  edited?: boolean;
  attachments?: MessageAttachment[];
  reply_to_id?: string | null;
  reply_to_content?: string | null;
  reply_to_author?: string | null;
};

export type ChannelMessagesResponse = {
  messages: ChannelMessage[];
  hasMore?: boolean;
};

export type DmMessageApi = {
  id: string;
  authorId: string;
  author: string;
  pfp_url?: string | null;
  content: string;
  createdAt: string;
  edited?: boolean;
  attachments?: MessageAttachment[];
  replyToId?: string | null;
  replyToContent?: string | null;
  replyToAuthor?: string | null;
};

export type DeepLinkTarget =
  | { kind: "login" }
  | { kind: "join"; code: string }
  | { kind: "friends" }
  | { kind: "dm"; threadId: string }
  | { kind: "server"; serverId: string }
  | { kind: "channel"; serverId: string; guildId: string; channelId: string };

// Social (friends, DMs)
export type Friend = {
  id: string;
  username: string;
  pfp_url?: string | null;
  status?: string;
};

export type DmThreadApi = {
  id: string;
  participantId: string;
  name: string;
  pfp_url?: string | null;
  lastMessageAt?: string | null;
  lastMessageContent?: string | null;
};

export type FriendRequestIncoming = {
  id: string;
  userId: string;
  username: string;
  createdAt: string;
};

export type FriendRequestOutgoing = {
  id: string;
  userId: string;
  username: string;
  createdAt: string;
};

// Presence
export type UserStatus = "online" | "idle" | "dnd" | "offline" | "invisible";

export type UserPresence = {
  status: UserStatus;
  customStatus?: string | null;
};

// Voice
export type VoiceState = {
  userId: string;
  username?: string;
  pfp_url?: string | null;
  channelId: string;
  guildId: string;
  muted: boolean;
  deafened: boolean;
  speaking?: boolean;
};

export type VoiceProducerSource = "microphone" | "camera" | "screen";

export type VoiceProducerInfo = {
  producerId: string;
  userId: string;
  source: VoiceProducerSource;
};

// Invites
export type Invite = {
  code: string;
  serverId: string;
  serverName?: string;
  permanent: boolean;
  uses?: number;
  expiresAt?: string | null;
  joinUrl?: string;
};

// Pinned messages
export type PinnedMessage = {
  id: string;
  author: string;
  pfp_url?: string | null;
  content: string;
  createdAt?: string;
  attachments?: MessageAttachment[];
};

// Full user profile
export type MyProfile = {
  id: string;
  username: string;
  email: string;
  displayName?: string | null;
  bio?: string | null;
  pfp_url?: string | null;
  banner_url?: string | null;
};

// Member profile (for viewing other users)
export type MemberProfile = {
  id: string;
  username: string;
  displayName?: string | null;
  bio?: string | null;
  pfp_url?: string | null;
  banner_url?: string | null;
  status?: string;
  roles?: string[];
  createdAt?: string;
};

// Gateway events from the core gateway
export type GatewayEventType =
  | "PRESENCE_UPDATE"
  | "DM_NEW_MESSAGE"
  | "DM_MESSAGE_DELETED"
  | "DM_READ"
  | "CALL_INCOMING"
  | "CALL_ENDED"
  | "SELF_STATUS"
  | "FRIEND_REQUEST"
  | "FRIEND_ACCEPTED";

export type GatewayPresenceUpdate = {
  type: "PRESENCE_UPDATE";
  userId: string;
  status: string;
  customStatus?: string | null;
};

export type GatewayDmNewMessage = {
  type: "DM_NEW_MESSAGE";
  threadId: string;
  message: DmMessageApi;
};

export type GatewayDmMessageDeleted = {
  type: "DM_MESSAGE_DELETED";
  threadId: string;
  messageId: string;
};

export type GatewayDmRead = {
  type: "DM_READ";
  threadId: string;
};

export type GatewayCallIncoming = {
  type: "CALL_INCOMING";
  callId: string;
  callerId: string;
  callerName: string;
  callerPfp?: string | null;
  channelId?: string;
  guildId?: string;
  nodeBaseUrl?: string;
};

export type GatewayCallEnded = {
  type: "CALL_ENDED";
  callId: string;
};

export type PrivateCallCreateResult = {
  success: boolean;
  call_id?: string;
  channel_id?: string;
  guild_id?: string;
  node_base_url?: string;
  warning?: string;
  message?: string;
};

export type PrivateCallJoinResult = {
  success: boolean;
  membershipToken?: string;
  nodeBaseUrl?: string;
  guildId?: string;
  channelId?: string;
  callId?: string;
  error?: string | boolean;
};

export type PrivateCallStatusResult = {
  success: boolean;
  active?: boolean;
  connected?: boolean;
  connectedUserIds?: string[];
  staleReason?: string | null;
};

export type GatewaySelfStatus = {
  type: "SELF_STATUS";
  status: string;
  customStatus?: string | null;
};

export type GatewayFriendRequest = {
  type: "FRIEND_REQUEST";
  requestId: string;
  userId: string;
  username: string;
};

export type GatewayFriendAccepted = {
  type: "FRIEND_ACCEPTED";
  friendId: string;
  username: string;
  threadId?: string;
};

export type GatewayEvent =
  | GatewayPresenceUpdate
  | GatewayDmNewMessage
  | GatewayDmMessageDeleted
  | GatewayDmRead
  | GatewayCallIncoming
  | GatewayCallEnded
  | GatewaySelfStatus
  | GatewayFriendRequest
  | GatewayFriendAccepted;

// Node gateway events (per server)
export type NodeGatewayMessageCreate = {
  type: "MESSAGE_CREATE";
  channelId: string;
  message: ChannelMessage;
};

export type NodeGatewayMessageUpdate = {
  type: "MESSAGE_UPDATE";
  channelId: string;
  messageId: string;
  content: string;
  edited: boolean;
};

export type NodeGatewayMessageDelete = {
  type: "MESSAGE_DELETE";
  channelId: string;
  messageId: string;
};

export type NodeGatewayVoiceStateUpdate = {
  type: "VOICE_STATE_UPDATE";
  userId: string;
  guildId: string;
  channelId: string | null;
  muted: boolean;
  deafened: boolean;
  username?: string;
  pfp_url?: string | null;
};

export type NodeGatewayVoiceJoin = {
  type: "VOICE_JOIN";
  userId: string;
  username: string;
  guildId: string;
  channelId: string;
};

export type NodeGatewayVoiceLeave = {
  type: "VOICE_LEAVE";
  userId: string;
  guildId: string;
  channelId: string;
};

export type NodeGatewayVoiceSpeaking = {
  type: "VOICE_SPEAKING";
  userId: string;
  guildId: string;
  channelId: string;
  speaking: boolean;
};

export type NodeGatewayVoiceJoined = {
  type: "VOICE_JOINED";
  guildId: string;
  channelId: string;
  requestId?: string;
  producers: VoiceProducerInfo[];
};

export type NodeGatewayVoiceLeft = {
  type: "VOICE_LEFT";
  ok: boolean;
};

export type NodeGatewayVoiceNewProducer = {
  type: "VOICE_NEW_PRODUCER";
  guildId: string;
  channelId: string;
  userId: string;
  producerId: string;
  source: VoiceProducerSource;
};

export type NodeGatewayVoiceProducerClosed = {
  type: "VOICE_PRODUCER_CLOSED";
  guildId: string;
  channelId: string;
  userId: string;
  producerId: string;
};

export type NodeGatewayVoiceUserLeft = {
  type: "VOICE_USER_LEFT";
  guildId: string;
  channelId: string;
  userId: string;
};

export type NodeGatewayVoiceError = {
  type: "VOICE_ERROR";
  error: string;
  code?: string;
  details?: string;
  requestId?: string;
};

export type NodeGatewayEvent =
  | NodeGatewayMessageCreate
  | NodeGatewayMessageUpdate
  | NodeGatewayMessageDelete
  | NodeGatewayVoiceStateUpdate
  | NodeGatewayVoiceJoin
  | NodeGatewayVoiceLeave
  | NodeGatewayVoiceSpeaking
  | NodeGatewayVoiceJoined
  | NodeGatewayVoiceLeft
  | NodeGatewayVoiceNewProducer
  | NodeGatewayVoiceProducerClosed
  | NodeGatewayVoiceUserLeft
  | NodeGatewayVoiceError;
