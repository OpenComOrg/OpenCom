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

export type GuildState = {
  guild: {
    id: string;
    name: string;
    owner_user_id: string;
    created_at: string;
  };
  channels: Channel[];
};

export type ChannelMessage = {
  id: string;
  author_id: string;
  username?: string;
  content: string;
  created_at: string;
};

export type ChannelMessagesResponse = {
  messages: ChannelMessage[];
};

export type DeepLinkTarget =
  | { kind: "login" }
  | { kind: "join"; code: string }
  | { kind: "server"; serverId: string }
  | { kind: "channel"; serverId: string; guildId: string; channelId: string };
