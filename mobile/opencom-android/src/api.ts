import type {
  AuthTokens,
  ChannelMessagesResponse,
  CoreServer,
  CoreServersResponse,
  Guild,
  GuildMember,
  GuildState,
  Invite,
  LoginResult,
  MemberProfile,
  MyProfile,
  PinnedMessage,
  PrivateCallCreateResult,
  PrivateCallJoinResult,
  PrivateCallStatusResult,
  Role,
  UserStatus,
  VoiceState,
} from "./types";

type TokenReader = () => AuthTokens | null;
type TokenWriter = (tokens: AuthTokens | null) => Promise<void> | void;
type ServerTokenWriter = (serverId: string, membershipToken: string) => void;

type RequestOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
};

export function createApiClient(input: {
  coreApiUrl: string;
  getTokens: TokenReader;
  setTokens: TokenWriter;
  updateServerMembershipToken: ServerTokenWriter;
}) {
  const coreBase = input.coreApiUrl.replace(/\/$/, "");

  async function coreRequest<T>(
    path: string,
    options: RequestOptions = {},
    retry = true,
  ): Promise<T> {
    const tokens = input.getTokens();
    const headers = new Headers(options.headers || {});
    if (tokens?.accessToken)
      headers.set("Authorization", `Bearer ${tokens.accessToken}`);
    if (options.body !== undefined)
      headers.set("Content-Type", "application/json");

    const response = await fetch(`${coreBase}${path}`, {
      method: options.method || "GET",
      headers,
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
    });

    if (response.status === 401 && retry && path !== "/v1/auth/refresh") {
      const refreshed = await refreshAccessToken();
      if (refreshed) return coreRequest(path, options, false);
    }

    if (!response.ok) throw new Error(await response.text());
    return (await response.json()) as T;
  }

  async function nodeRequest<T>(
    server: CoreServer,
    path: string,
    options: RequestOptions = {},
    retry = true,
  ): Promise<T> {
    const headers = new Headers(options.headers || {});
    headers.set("Authorization", `Bearer ${server.membershipToken}`);
    if (options.body !== undefined)
      headers.set("Content-Type", "application/json");

    const response = await fetch(
      `${server.baseUrl.replace(/\/$/, "")}${path}`,
      {
        method: options.method || "GET",
        headers,
        body:
          options.body === undefined ? undefined : JSON.stringify(options.body),
      },
    );

    if (response.status === 401 && retry) {
      const refreshed = await refreshMembershipToken(server.id);
      if (refreshed) {
        const updated = { ...server, membershipToken: refreshed };
        return nodeRequest(updated, path, options, false);
      }
    }

    if (!response.ok) throw new Error(await response.text());
    return (await response.json()) as T;
  }

  async function nodeRequestRaw(
    server: CoreServer,
    path: string,
    options: RequestOptions & { rawBody?: FormData } = {},
    retry = true,
  ): Promise<Response> {
    const headers = new Headers(options.headers || {});
    headers.set("Authorization", `Bearer ${server.membershipToken}`);

    const response = await fetch(
      `${server.baseUrl.replace(/\/$/, "")}${path}`,
      {
        method: options.method || "POST",
        headers,
        body: options.rawBody,
      },
    );

    if (response.status === 401 && retry) {
      const refreshed = await refreshMembershipToken(server.id);
      if (refreshed) {
        const updated = { ...server, membershipToken: refreshed };
        return nodeRequestRaw(updated, path, options, false);
      }
    }

    return response;
  }

  async function coreRequestRaw(
    path: string,
    options: RequestOptions & { rawBody?: FormData } = {},
    retry = true,
  ): Promise<Response> {
    const tokens = input.getTokens();
    const headers = new Headers(options.headers || {});
    if (tokens?.accessToken)
      headers.set("Authorization", `Bearer ${tokens.accessToken}`);

    const response = await fetch(`${coreBase}${path}`, {
      method: options.method || "POST",
      headers,
      body: options.rawBody,
    });

    if (response.status === 401 && retry && path !== "/v1/auth/refresh") {
      const refreshed = await refreshAccessToken();
      if (refreshed) return coreRequestRaw(path, options, false);
    }

    return response;
  }

  async function refreshAccessToken(): Promise<AuthTokens | null> {
    const tokens = input.getTokens();
    if (!tokens?.refreshToken) return null;

    const response = await fetch(`${coreBase}/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    });
    if (!response.ok) {
      await input.setTokens(null);
      return null;
    }

    const data = (await response.json()) as {
      accessToken?: string;
      refreshToken?: string;
    };
    if (!data.accessToken || !data.refreshToken) {
      await input.setTokens(null);
      return null;
    }
    const next = {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
    };
    await input.setTokens(next);
    return next;
  }

  async function refreshMembershipToken(
    serverId: string,
  ): Promise<string | null> {
    const response = await coreRequest<{ membershipToken: string }>(
      `/v1/servers/${encodeURIComponent(serverId)}/membership-token`,
      { method: "POST" },
    );
    if (!response.membershipToken) return null;
    input.updateServerMembershipToken(serverId, response.membershipToken);
    return response.membershipToken;
  }

  return {
    // ─── Auth ────────────────────────────────────────────────────────────────

    register(email: string, username: string, password: string) {
      return coreRequest<{ id: string; email: string; username: string }>(
        "/v1/auth/register",
        { method: "POST", body: { email, username, password } },
        false,
      );
    },

    login(email: string, password: string) {
      return coreRequest<LoginResult>(
        "/v1/auth/login",
        { method: "POST", body: { email, password } },
        false,
      );
    },

    forgotPassword(email: string) {
      return coreRequest<{ ok: boolean }>(
        "/v1/auth/forgot-password",
        { method: "POST", body: { email } },
        false,
      );
    },

    // ─── Me / Profile ─────────────────────────────────────────────────────────

    getMe() {
      return coreRequest<{ id: string; email: string; username: string }>(
        "/v1/me",
      );
    },

    getMyProfile() {
      return coreRequest<MyProfile>("/v1/me/profile");
    },

    updateProfile(fields: {
      displayName?: string | null;
      bio?: string | null;
      pfpUrl?: string | null;
      bannerUrl?: string | null;
    }) {
      return coreRequest<{ ok: boolean }>("/v1/me/profile", {
        method: "PATCH",
        body: fields,
      });
    },

    async uploadProfileImage(
      uri: string,
      fieldName: "pfp" | "banner",
      options?: { filename?: string; mimeType?: string | null },
    ): Promise<{ url: string }> {
      const formData = new FormData();
      const filename =
        options?.filename || uri.split("/").pop() || `${fieldName}.jpg`;
      (formData as any).append("file", {
        uri,
        name: filename,
        type: options?.mimeType || "image/jpeg",
      });
      const response = await coreRequestRaw(
        `/v1/me/profile/${fieldName}`,
        {
          method: "POST",
          rawBody: formData,
        },
      );
      if (!response.ok) throw new Error(await response.text());
      const data = (await response.json()) as {
        url?: string;
        pfpUrl?: string;
        bannerUrl?: string;
      };
      const url = data.url || data.pfpUrl || data.bannerUrl || "";
      if (!url) throw new Error("UPLOAD_FAILED");
      return { url };
    },

    // ─── Presence / Status ────────────────────────────────────────────────────

    setStatus(status: UserStatus, customStatus?: string | null) {
      return coreRequest<{ ok: boolean }>("/v1/me/presence", {
        method: "POST",
        body: { status, customStatus: customStatus ?? null },
      });
    },

    async getPresence(userIds: string[]) {
      const params = new URLSearchParams({ userIds: userIds.join(",") });
      const raw = await coreRequest<
        | {
            presence: Record<
              string,
              { status: string; customStatus?: string | null }
            >;
          }
        | Record<string, { status: string; customStatus?: string | null }>
      >(`/v1/presence?${params.toString()}`);
      const presence =
        raw && typeof raw === "object" && "presence" in raw
          ? raw.presence || {}
          : raw || {};
      return {
        presence: presence as Record<
          string,
          { status: string; customStatus?: string | null }
        >,
      };
    },

    // ─── Sessions ─────────────────────────────────────────────────────────────

    async getSessions() {
      const data = await coreRequest<{
        sessions: {
          id: string;
          deviceName?: string;
          lastActive?: string;
          expiresAt?: string;
          isCurrent?: boolean;
        }[];
      }>("/v1/auth/sessions");
      return {
        sessions: Array.isArray(data.sessions)
          ? data.sessions.map((session) => ({
              id: session.id,
              device: session.deviceName,
              location: session.expiresAt
                ? `Expires ${new Date(session.expiresAt).toLocaleDateString()}`
                : undefined,
              lastActive: session.lastActive,
              current: session.isCurrent,
            }))
          : [],
      };
    },

    revokeSession(sessionId: string) {
      return coreRequest<{ ok: boolean }>(
        `/v1/auth/sessions/${encodeURIComponent(sessionId)}`,
        {
          method: "DELETE",
        },
      );
    },

    changePassword(currentPassword: string, newPassword: string) {
      return coreRequest<{ success: boolean }>("/v1/auth/password", {
        method: "PATCH",
        body: { currentPassword, newPassword },
      });
    },

    // ─── Servers ──────────────────────────────────────────────────────────────

    getServers() {
      return coreRequest<CoreServersResponse>("/v1/servers");
    },

    createServer(
      name: string,
      baseUrl: string,
      logoUrl?: string,
      bannerUrl?: string,
    ) {
      return coreRequest<{ id: string; name: string }>("/v1/servers", {
        method: "POST",
        body: {
          name,
          baseUrl,
          logoUrl: logoUrl || null,
          bannerUrl: bannerUrl || null,
        },
      });
    },

    leaveServer(serverId: string) {
      return coreRequest<{ ok: boolean }>(
        `/v1/servers/${encodeURIComponent(serverId)}/leave`,
        { method: "POST" },
      );
    },

    deleteServer(serverId: string) {
      return coreRequest<{ ok: boolean }>(
        `/v1/servers/${encodeURIComponent(serverId)}`,
        { method: "DELETE" },
      );
    },

    reorderServers(serverIds: string[]) {
      return coreRequest<{ ok: boolean }>("/v1/servers/order", {
        method: "POST",
        body: { serverIds },
      });
    },

    // ─── Guilds ───────────────────────────────────────────────────────────────

    listGuilds(server: CoreServer) {
      return nodeRequest<Guild[]>(server, "/v1/guilds");
    },

    getGuildState(server: CoreServer, guildId: string) {
      return nodeRequest<GuildState>(
        server,
        `/v1/guilds/${encodeURIComponent(guildId)}/state`,
      );
    },

    createGuild(server: CoreServer, name: string) {
      return nodeRequest<{ id: string; name: string }>(server, "/v1/guilds", {
        method: "POST",
        body: { name, createDefaultVoice: true },
      });
    },

    // ─── Channels ─────────────────────────────────────────────────────────────

    createChannel(
      server: CoreServer,
      guildId: string,
      name: string,
      type: "text" | "voice" | "category",
      parentId?: string | null,
    ) {
      return nodeRequest<{ id: string }>(
        server,
        `/v1/guilds/${encodeURIComponent(guildId)}/channels`,
        {
          method: "POST",
          body: { name, type, parentId: parentId ?? null },
        },
      );
    },

    deleteChannel(server: CoreServer, channelId: string) {
      return nodeRequest<{ ok: boolean }>(
        server,
        `/v1/channels/${encodeURIComponent(channelId)}`,
        { method: "DELETE" },
      );
    },

    // ─── Messages ─────────────────────────────────────────────────────────────

    listMessages(
      server: CoreServer,
      channelId: string,
      options?: { limit?: number; before?: string },
    ) {
      const params = new URLSearchParams();
      if (options?.limit) params.set("limit", String(options.limit));
      if (options?.before) params.set("before", options.before);
      const qs = params.toString();
      return nodeRequest<ChannelMessagesResponse>(
        server,
        `/v1/channels/${encodeURIComponent(channelId)}/messages${qs ? `?${qs}` : ""}`,
      );
    },

    sendMessage(
      server: CoreServer,
      channelId: string,
      content: string,
      options?: { replyToId?: string | null; attachmentIds?: string[] },
    ) {
      return nodeRequest<{ id: string }>(
        server,
        `/v1/channels/${encodeURIComponent(channelId)}/messages`,
        {
          method: "POST",
          body: {
            content,
            replyToId: options?.replyToId ?? null,
            attachmentIds: options?.attachmentIds ?? [],
          },
        },
      );
    },

    editMessage(
      server: CoreServer,
      channelId: string,
      messageId: string,
      content: string,
    ) {
      return nodeRequest<{ ok: boolean }>(
        server,
        `/v1/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}`,
        { method: "PATCH", body: { content } },
      );
    },

    deleteServerMessage(
      server: CoreServer,
      channelId: string,
      messageId: string,
    ) {
      return nodeRequest<{ ok: boolean }>(
        server,
        `/v1/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}`,
        { method: "DELETE" },
      );
    },

    async uploadServerAttachment(
      server: CoreServer,
      channelId: string,
      uri: string,
      filename: string,
      mimeType: string,
    ): Promise<{ id: string; url: string }> {
      const formData = new FormData();
      (formData as any).append("file", { uri, name: filename, type: mimeType });
      const response = await nodeRequestRaw(
        server,
        `/v1/channels/${encodeURIComponent(channelId)}/attachments`,
        { method: "POST", rawBody: formData },
      );
      if (!response.ok) throw new Error(await response.text());
      const data = (await response.json()) as {
        id?: string;
        attachmentId?: string;
        url?: string;
      };
      return {
        id: data.id || data.attachmentId || "",
        url: data.url || "",
      };
    },

    // ─── Pinned Messages (server) ─────────────────────────────────────────────

    getServerPins(server: CoreServer, channelId: string) {
      return nodeRequest<{ pins: PinnedMessage[] }>(
        server,
        `/v1/channels/${encodeURIComponent(channelId)}/pins`,
      );
    },

    pinServerMessage(server: CoreServer, channelId: string, messageId: string) {
      return nodeRequest<{ ok: boolean }>(
        server,
        `/v1/channels/${encodeURIComponent(channelId)}/pins/${encodeURIComponent(messageId)}`,
        { method: "PUT" },
      );
    },

    unpinServerMessage(
      server: CoreServer,
      channelId: string,
      messageId: string,
    ) {
      return nodeRequest<{ ok: boolean }>(
        server,
        `/v1/channels/${encodeURIComponent(channelId)}/pins/${encodeURIComponent(messageId)}`,
        { method: "DELETE" },
      );
    },

    // ─── Members ──────────────────────────────────────────────────────────────

    getGuildMembers(server: CoreServer, guildId: string) {
      return nodeRequest<{ members: GuildMember[] }>(
        server,
        `/v1/guilds/${encodeURIComponent(guildId)}/members`,
      );
    },

    getMemberProfile(server: CoreServer, userId: string) {
      return nodeRequest<MemberProfile>(
        server,
        `/v1/members/${encodeURIComponent(userId)}/profile`,
      );
    },

    kickMember(server: CoreServer, guildId: string, userId: string) {
      return nodeRequest<{ ok: boolean }>(
        server,
        `/v1/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(userId)}/kick`,
        { method: "POST" },
      );
    },

    banMember(
      server: CoreServer,
      guildId: string,
      userId: string,
      reason?: string,
    ) {
      return nodeRequest<{ ok: boolean }>(
        server,
        `/v1/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(userId)}/ban`,
        { method: "POST", body: { reason: reason ?? null } },
      );
    },

    // ─── Roles ────────────────────────────────────────────────────────────────

    getRoles(server: CoreServer, guildId: string) {
      return nodeRequest<{ roles: Role[] }>(
        server,
        `/v1/guilds/${encodeURIComponent(guildId)}/roles`,
      );
    },

    createRole(server: CoreServer, guildId: string, name: string) {
      return nodeRequest<Role>(
        server,
        `/v1/guilds/${encodeURIComponent(guildId)}/roles`,
        {
          method: "POST",
          body: { name, permissions: 0 },
        },
      );
    },

    assignRole(
      server: CoreServer,
      guildId: string,
      userId: string,
      roleId: string,
    ) {
      return nodeRequest<{ ok: boolean }>(
        server,
        `/v1/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(userId)}/roles`,
        { method: "POST", body: { roleId } },
      );
    },

    // ─── Voice ────────────────────────────────────────────────────────────────

    getVoiceStates(server: CoreServer, guildId: string) {
      return nodeRequest<{ voiceStates: VoiceState[] }>(
        server,
        `/v1/guilds/${encodeURIComponent(guildId)}/voice-states`,
      );
    },

    // ─── Invites ──────────────────────────────────────────────────────────────

    joinInvite(code: string) {
      return coreRequest<{ ok: boolean; serverId?: string }>(
        `/v1/invites/${encodeURIComponent(code)}/join`,
        { method: "POST", body: {} },
      );
    },

    previewInvite(code: string) {
      return coreRequest<{
        serverName?: string;
        serverLogo?: string | null;
        memberCount?: number;
        onlineCount?: number;
      }>(`/v1/invites/${encodeURIComponent(code)}/preview`);
    },

    createInvite(
      serverId: string,
      options?: { code?: string; permanent?: boolean },
    ) {
      return coreRequest<Invite>("/v1/invites", {
        method: "POST",
        body: {
          serverId,
          code: options?.code || null,
          permanent: options?.permanent ?? true,
        },
      });
    },

    getServerInvites(serverId: string) {
      const params = new URLSearchParams({ serverId });
      return coreRequest<{ invites: Invite[] }>(
        `/v1/invites?${params.toString()}`,
      );
    },

    deleteInvite(code: string) {
      return coreRequest<{ ok: boolean }>(
        `/v1/invites/${encodeURIComponent(code)}`,
        {
          method: "DELETE",
        },
      );
    },

    // ─── Push notifications ───────────────────────────────────────────────────

    registerPushToken(token: string) {
      return coreRequest<{ ok: boolean }>("/v1/push/register", {
        method: "POST",
        body: { token, platform: "android" },
      });
    },

    // ─── Social: friends ──────────────────────────────────────────────────────

    getFriends() {
      return coreRequest<{
        friends: {
          id: string;
          username: string;
          pfp_url?: string | null;
          status?: string;
        }[];
      }>("/v1/social/friends");
    },

    addFriend(username: string) {
      return coreRequest<{
        ok: boolean;
        threadId?: string;
        friend?: { id: string; username?: string };
        requestId?: string;
        requestStatus?: string;
      }>("/v1/social/friends", { method: "POST", body: { username } });
    },

    removeFriend(friendId: string) {
      return coreRequest<{ ok: boolean }>(
        `/v1/social/friends/${encodeURIComponent(friendId)}`,
        { method: "DELETE" },
      );
    },

    getFriendRequests() {
      return coreRequest<{
        incoming: {
          id: string;
          userId: string;
          username: string;
          createdAt: string;
        }[];
        outgoing: {
          id: string;
          userId: string;
          username: string;
          createdAt: string;
        }[];
      }>("/v1/social/requests");
    },

    acceptFriendRequest(requestId: string) {
      return coreRequest<{ ok: boolean }>(
        `/v1/social/requests/${encodeURIComponent(requestId)}/accept`,
        { method: "POST" },
      );
    },

    declineFriendRequest(requestId: string) {
      return coreRequest<{ ok: boolean }>(
        `/v1/social/requests/${encodeURIComponent(requestId)}/decline`,
        { method: "POST" },
      );
    },

    // ─── Social: DMs ──────────────────────────────────────────────────────────

    getDms() {
      return coreRequest<{
        dms: {
          id: string;
          participantId: string;
          name: string;
          pfp_url?: string | null;
          lastMessageAt?: string | null;
          lastMessageContent?: string | null;
        }[];
      }>("/v1/social/dms");
    },

    openDm(friendId: string) {
      return coreRequest<{ threadId: string }>("/v1/social/dms/open", {
        method: "POST",
        body: { friendId },
      });
    },

    createPrivateCall(friendId: string) {
      return coreRequest<PrivateCallCreateResult>("/call/create", {
        method: "POST",
        body: { id: friendId },
      });
    },

    joinPrivateCall(callId: string) {
      return coreRequest<PrivateCallJoinResult>("/call/join", {
        method: "POST",
        body: { callId },
      });
    },

    getPrivateCallStatus(callId: string, options?: { requireConnected?: boolean }) {
      return coreRequest<PrivateCallStatusResult>("/call/get_status", {
        method: "POST",
        body: {
          callId,
          requireConnected: options?.requireConnected === true,
        },
      });
    },

    endPrivateCall(callId?: string) {
      return coreRequest<{ success: boolean; message?: string }>("/call/end", {
        method: "POST",
        body: callId ? { callId } : {},
      });
    },

    getDmMessages(
      threadId: string,
      options?: { limit?: number; before?: string },
    ) {
      const params = new URLSearchParams();
      if (options?.limit) params.set("limit", String(options.limit));
      if (options?.before) params.set("before", options.before);
      const qs = params.toString();
      return coreRequest<{
        messages: {
          id: string;
          authorId: string;
          author: string;
          pfp_url?: string | null;
          content: string;
          createdAt: string;
          edited?: boolean;
          replyToId?: string | null;
          replyToContent?: string | null;
          replyToAuthor?: string | null;
        }[];
        hasMore: boolean;
      }>(
        `/v1/social/dms/${encodeURIComponent(threadId)}/messages${qs ? `?${qs}` : ""}`,
      );
    },

    sendDmMessage(
      threadId: string,
      content: string,
      options?: { replyToId?: string | null; attachmentIds?: string[] },
    ) {
      return coreRequest<{ id: string }>(
        `/v1/social/dms/${encodeURIComponent(threadId)}/messages`,
        {
          method: "POST",
          body: {
            content,
            replyToId: options?.replyToId ?? null,
            attachmentIds: options?.attachmentIds ?? [],
          },
        },
      );
    },

    deleteDmMessage(threadId: string, messageId: string) {
      return coreRequest<{ ok: boolean }>(
        `/v1/social/dms/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(messageId)}`,
        { method: "DELETE" },
      );
    },

    async uploadDmAttachment(
      threadId: string,
      uri: string,
      filename: string,
      mimeType: string,
    ): Promise<{ id: string; url: string }> {
      const formData = new FormData();
      (formData as any).append("file", { uri, name: filename, type: mimeType });
      const response = await coreRequestRaw(
        `/v1/social/dms/${encodeURIComponent(threadId)}/attachments`,
        { method: "POST", rawBody: formData },
      );
      if (!response.ok) throw new Error(await response.text());
      const data = (await response.json()) as {
        id?: string;
        attachmentId?: string;
        url?: string;
      };
      return {
        id: data.id || data.attachmentId || "",
        url: data.url || "",
      };
    },

    // ─── Pinned DM messages ───────────────────────────────────────────────────

    getDmPins(threadId: string) {
      return coreRequest<{ pins: PinnedMessage[] }>(
        `/v1/social/dms/${encodeURIComponent(threadId)}/pinned`,
      );
    },

    pinDmMessage(threadId: string, messageId: string) {
      return coreRequest<{ ok: boolean }>(
        `/v1/social/dms/${encodeURIComponent(threadId)}/pins/${encodeURIComponent(messageId)}`,
        { method: "POST" },
      );
    },

    unpinDmMessage(threadId: string, messageId: string) {
      return coreRequest<{ ok: boolean }>(
        `/v1/social/dms/${encodeURIComponent(threadId)}/pins/${encodeURIComponent(messageId)}`,
        { method: "DELETE" },
      );
    },

    // ─── Social settings ──────────────────────────────────────────────────────

    getSocialSettings() {
      return coreRequest<{ allowFriendRequests: boolean }>(
        "/v1/social/settings",
      );
    },

    updateSocialSettings(settings: { allowFriendRequests?: boolean }) {
      return coreRequest<{ ok: boolean }>("/v1/social/settings", {
        method: "PATCH",
        body: settings,
      });
    },
  };
}
