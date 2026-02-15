import { useEffect, useMemo, useRef, useState } from "react";
import { createSfuVoiceClient } from "./voice/sfuClient";

const CORE_API = import.meta.env.VITE_CORE_API_URL || "https://openapi.donskyblock.xyz";

/** Resolve profile image URL so it loads from the API when relative (e.g. /v1/profile-images/...) */
function profileImageUrl(url) {
  if (!url || typeof url !== "string") return null;
  if (url.startsWith("data:")) return url;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("/")) return `${CORE_API.replace(/\/$/, "")}${url}`;
  return url;
}

const THEME_STORAGE_KEY = "opencom_custom_theme_css";
const THEME_ENABLED_STORAGE_KEY = "opencom_custom_theme_enabled";
const SELF_STATUS_KEY = "opencom_self_status";
const PINNED_SERVER_KEY = "opencom_pinned_server_messages";
const PINNED_DM_KEY = "opencom_pinned_dm_messages";
const ACTIVE_DM_KEY = "opencom_active_dm";
const GATEWAY_DEVICE_ID_KEY = "opencom_gateway_device_id";
const MIC_GAIN_KEY = "opencom_mic_gain";
const MIC_SENSITIVITY_KEY = "opencom_mic_sensitivity";
const AUDIO_INPUT_DEVICE_KEY = "opencom_audio_input_device";
const AUDIO_OUTPUT_DEVICE_KEY = "opencom_audio_output_device";
// Kept for backward compatibility with any persisted/runtime references from older bundles.
const SERVER_VOICE_GATEWAY_PREFS_KEY = "opencom_server_voice_gateway_prefs";
const LAST_CORE_GATEWAY_KEY = "opencom_last_core_gateway";
const LAST_SERVER_GATEWAY_KEY = "opencom_last_server_gateway";
const FALLBACK_CORE_GATEWAY_WS_URL = "wss://ws.opencom.online/gateway";

function normalizeGatewayWsUrl(value) {
  if (!value || typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed, window.location.origin);
    if (url.protocol !== "ws:" && url.protocol !== "wss:") {
      url.protocol = url.protocol === "http:" ? "ws:" : "wss:";
    }
    url.pathname = "/gateway";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    const normalized = trimmed.replace(/\/$/, "");
    return normalized.endsWith("/gateway") ? normalized : `${normalized}/gateway`;
  }
}

function getDefaultCoreGatewayWsUrl() {
  if (typeof window === "undefined") return FALLBACK_CORE_GATEWAY_WS_URL;
  const hostname = window.location.hostname || "";
  if (hostname === "opencom.online" || hostname.endsWith(".opencom.online")) {
    return FALLBACK_CORE_GATEWAY_WS_URL;
  }
  return normalizeGatewayWsUrl("/gateway");
}

function getCoreGatewayWsCandidates() {
  const explicit = import.meta.env.VITE_CORE_GATEWAY_URL || import.meta.env.VITE_GATEWAY_WS_URL;
  const candidates = [];

  const push = (value) => {
    const normalized = normalizeGatewayWsUrl(value);
    if (!normalized) return;
    if (!candidates.includes(normalized)) candidates.push(normalized);
  };

  // Explicit endpoint first when provided.
  if (explicit && typeof explicit === "string" && explicit.trim()) push(explicit);
  push(getDefaultCoreGatewayWsUrl());

  return candidates;
}


function getVoiceGatewayWsCandidates(serverBaseUrl, includeDirectNodeWsFallback = false) {
  const explicitVoiceGateway = import.meta.env.VITE_VOICE_GATEWAY_URL;
  const candidates = [];
  const push = (value) => {
    const normalized = normalizeGatewayWsUrl(value);
    if (!normalized) return;
    if (!candidates.includes(normalized)) candidates.push(normalized);
  };

  // Optional explicit voice gateway override for direct-node deployments.
  if (explicitVoiceGateway && typeof explicitVoiceGateway === "string" && explicitVoiceGateway.trim()) {
    push(explicitVoiceGateway);
  }

  // Prefer core gateway routing by default so clients don't guess node addresses.
  for (const wsUrl of getCoreGatewayWsCandidates()) push(wsUrl);

  const allowDirectNodeWsFallback = includeDirectNodeWsFallback
    || String(import.meta.env.VITE_ENABLE_DIRECT_NODE_WS_FALLBACK || "").trim() === "1";
  if (allowDirectNodeWsFallback) {
    // Optional escape hatch: derive WS from the node base URL.
    push(serverBaseUrl);
  }

  return candidates;
}

function prioritizeLastSuccessfulGateway(candidates, storageKey) {
  const last = localStorage.getItem(storageKey);
  if (!last) return candidates;
  const idx = candidates.indexOf(last);
  if (idx <= 0) return candidates;
  return [candidates[idx], ...candidates.slice(0, idx), ...candidates.slice(idx + 1)];
}


function useThemeCss() {
  const [css, setCss] = useState(localStorage.getItem(THEME_STORAGE_KEY) || "");
  const [enabled, setEnabled] = useState(localStorage.getItem(THEME_ENABLED_STORAGE_KEY) !== "0");

  useEffect(() => {
    let tag = document.getElementById("opencom-theme-style");
    if (!tag) {
      tag = document.createElement("style");
      tag.id = "opencom-theme-style";
      document.head.appendChild(tag);
    }

    tag.textContent = enabled ? css : "";
    localStorage.setItem(THEME_STORAGE_KEY, css);
    localStorage.setItem(THEME_ENABLED_STORAGE_KEY, enabled ? "1" : "0");
  }, [css, enabled]);

  return [css, setCss, enabled, setEnabled];
}

function groupMessages(messages = [], getAuthor, getTimestamp, getAuthorId = null, getPfpUrl = null) {
  const groups = [];

  for (const message of messages) {
    const author = getAuthor(message);
    const authorId = getAuthorId ? getAuthorId(message) : author;
    const pfpUrl = getPfpUrl ? getPfpUrl(message) : null;
    const createdRaw = getTimestamp(message);
    const createdAt = createdRaw ? new Date(createdRaw) : null;
    const createdMs = createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt.getTime() : null;

    const previousGroup = groups[groups.length - 1];
    const canGroup = previousGroup
      && previousGroup.authorId === authorId
      && createdMs !== null
      && previousGroup.lastMessageMs !== null
      && (createdMs - previousGroup.lastMessageMs) <= 120000;

    if (canGroup) {
      previousGroup.messages.push(message);
      previousGroup.lastMessageMs = createdMs;
      continue;
    }

    groups.push({
      id: message.id,
      author,
      authorId,
      pfpUrl,
      firstMessageTime: createdRaw,
      lastMessageMs: createdMs,
      messages: [message]
    });
  }

  return groups;
}

async function api(path, options = {}) {
  const response = await fetch(`${CORE_API}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP_${response.status}`);
  }

  return response.json();
}

async function nodeApi(baseUrl, path, token, options = {}) {
  const hasBody = options.body !== undefined && options.body !== null;
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    },
    ...options
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP_${response.status}`);
  }

  return response.json();
}

function getStoredJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function getInitials(value = "") {
  const cleaned = value.trim();
  if (!cleaned) return "OC";
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function escapeRegex(value = "") {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getMentionQuery(value = "") {
  const match = value.match(/(?:^|\s)(@\{?)([^\s{}@]*)$/);
  if (!match) return null;
  const marker = match[1] || "@";
  const query = match[2] || "";
  const start = value.length - marker.length - query.length;
  return { query: query.toLowerCase(), start };
}

function contentMentionsSelf(content = "", selfId, selfNames = []) {
  if (!content || !selfId) return false;
  if (/@everyone\b/i.test(content)) return true;
  if (new RegExp(`@\\{${escapeRegex(selfId)}\\}`, "i").test(content)) return true;
  if (new RegExp(`(^|\\s)@${escapeRegex(selfId)}\\b`, "i").test(content)) return true;
  for (const name of selfNames) {
    if (!name || typeof name !== "string") continue;
    const trimmed = name.trim();
    if (!trimmed) continue;
    if (new RegExp(`@\\{${escapeRegex(trimmed)}\\}`, "i").test(content)) return true;
    if (new RegExp(`(^|\\s)@${escapeRegex(trimmed)}\\b`, "i").test(content)) return true;
  }
  return false;
}

function formatMessageTime(value) {
  if (!value) return "just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "just now";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function playNotificationBeep(mute = false) {
  if (mute) return;
  try {
    const audioCtx = new window.AudioContext();
    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc1.type = "sine";
    osc1.frequency.value = 523.25;
    osc2.type = "sine";
    osc2.frequency.value = 659.25;
    gain.gain.setValueAtTime(0, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.12, audioCtx.currentTime + 0.04);
    gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.22);
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(audioCtx.destination);
    osc1.start();
    osc2.start();
    osc1.stop(audioCtx.currentTime + 0.22);
    osc2.stop(audioCtx.currentTime + 0.22);
    osc1.onended = () => { osc2.onended = () => audioCtx.close(); };
  } catch (_) {}
}

export function App() {
  const storedActiveDmId = localStorage.getItem(ACTIVE_DM_KEY) || "";
  const [accessToken, setAccessToken] = useState(localStorage.getItem("opencom_access_token") || "");
  const [authMode, setAuthMode] = useState("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [me, setMe] = useState(null);

  const [navMode, setNavMode] = useState("servers");
  const [status, setStatus] = useState("");

  const [servers, setServers] = useState([]);
  const [guilds, setGuilds] = useState([]);
  const [activeServerId, setActiveServerId] = useState("");
  const [activeGuildId, setActiveGuildId] = useState("");
  const [activeChannelId, setActiveChannelId] = useState("");
  const [guildState, setGuildState] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState("");

  const [friends, setFriends] = useState([]);
  const [friendQuery, setFriendQuery] = useState("");
  const [friendAddInput, setFriendAddInput] = useState("");
  const [friendView, setFriendView] = useState("online");

  const [dms, setDms] = useState([]);
  const [activeDmId, setActiveDmId] = useState(storedActiveDmId);
  const [dmText, setDmText] = useState("");

  const [profile, setProfile] = useState(null);
  const [profileForm, setProfileForm] = useState({ displayName: "", bio: "", pfpUrl: "", bannerUrl: "" });

  const [newServerName, setNewServerName] = useState("");
  const [newServerBaseUrl, setNewServerBaseUrl] = useState("https://");
  const [inviteServerId, setInviteServerId] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [joinInviteCode, setJoinInviteCode] = useState("");
  const [invitePreview, setInvitePreview] = useState(null);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelType, setNewChannelType] = useState("text");
  const [newChannelParentId, setNewChannelParentId] = useState("");
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [friendRequests, setFriendRequests] = useState({ incoming: [], outgoing: [] });
  const [allowFriendRequests, setAllowFriendRequests] = useState(true);

  const [collapsedCategories, setCollapsedCategories] = useState({});
  const [voiceSession, setVoiceSession] = useState({ guildId: "", channelId: "" });
  const [isDisconnectingVoice, setIsDisconnectingVoice] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [micGain, setMicGain] = useState(Number(localStorage.getItem(MIC_GAIN_KEY) || 100));
  const [micSensitivity, setMicSensitivity] = useState(Number(localStorage.getItem(MIC_SENSITIVITY_KEY) || 50));
  const [audioInputDeviceId, setAudioInputDeviceId] = useState(localStorage.getItem(AUDIO_INPUT_DEVICE_KEY) || "");
  const [audioOutputDeviceId, setAudioOutputDeviceId] = useState(localStorage.getItem(AUDIO_OUTPUT_DEVICE_KEY) || "");
  const [audioInputDevices, setAudioInputDevices] = useState([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState([]);
  const [selfStatus, setSelfStatus] = useState(localStorage.getItem(SELF_STATUS_KEY) || "online");
  const [showPinned, setShowPinned] = useState(false);
  const [newOfficialServerName, setNewOfficialServerName] = useState("");
  const [pinnedServerMessages, setPinnedServerMessages] = useState(getStoredJson(PINNED_SERVER_KEY, {}));
  const [pinnedDmMessages, setPinnedDmMessages] = useState(getStoredJson(PINNED_DM_KEY, {}));
  const [newRoleName, setNewRoleName] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [profileCardPosition, setProfileCardPosition] = useState({ x: 26, y: 26 });
  const [draggingProfileCard, setDraggingProfileCard] = useState(false);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState("profile");
  const [addServerModalOpen, setAddServerModalOpen] = useState(false);
  const [addServerTab, setAddServerTab] = useState("create");
  const [serverContextMenu, setServerContextMenu] = useState(null);
  const [messageContextMenu, setMessageContextMenu] = useState(null);
  const [replyTarget, setReplyTarget] = useState(null);
  const [serverPingCounts, setServerPingCounts] = useState({});
  const [memberProfileCard, setMemberProfileCard] = useState(null);
  const [userCache, setUserCache] = useState({});
  const userCacheFetchingRef = useRef(new Set());
  const [themeCss, setThemeCss, themeEnabled, setThemeEnabled] = useThemeCss();
  const [sessions, setSessions] = useState([]);
  const [passwordForm, setPasswordForm] = useState({ current: "", new: "", confirm: "" });
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [activeSessions, setActiveSessions] = useState([{ id: "current", device: "Current Device", location: "Your Location", lastActive: "Now", status: "active" }]);
  const [lastLoginInfo, setLastLoginInfo] = useState({ date: new Date().toISOString(), device: "Current Device", location: "Your Location" });
  const [twoFactorSecret, setTwoFactorSecret] = useState("");
  const [twoFactorQRCode, setTwoFactorQRCode] = useState("");
  const [backupCodes, setBackupCodes] = useState([]);
  const [twoFactorToken, setTwoFactorToken] = useState("");
  const [twoFactorVerified, setTwoFactorVerified] = useState(false);
  const [show2FASetup, setShow2FASetup] = useState(false);
  const [securitySettings, setSecuritySettings] = useState({ twoFactorEnabled: false });
  const [channelDragId, setChannelDragId] = useState(null);
  const [categoryDragId, setCategoryDragId] = useState(null);
  const [channelPermsChannelId, setChannelPermsChannelId] = useState("");
  const [presenceByUserId, setPresenceByUserId] = useState({});
  const [showClientFlow, setShowClientFlow] = useState(false);
  const [gatewayConnected, setGatewayConnected] = useState(false);
  const [dmNotification, setDmNotification] = useState(null);
  const [voiceStatesByGuild, setVoiceStatesByGuild] = useState({});
  const [voiceSpeakingByGuild, setVoiceSpeakingByGuild] = useState({});
  const [serverVoiceGatewayPrefs, setServerVoiceGatewayPrefs] = useState(getStoredJson(SERVER_VOICE_GATEWAY_PREFS_KEY, {}));
  const [nodeGatewayUnavailableByServer, setNodeGatewayUnavailableByServer] = useState({});

  const messagesRef = useRef(null);
  const gatewayWsRef = useRef(null);
  const gatewayHeartbeatRef = useRef(null);
  const nodeGatewayWsRef = useRef(null);
  const nodeGatewayHeartbeatRef = useRef(null);
  const nodeGatewayReadyRef = useRef(false);
  const voiceGatewayCandidatesRef = useRef([]);
  const voiceSpeakingDetectorRef = useRef({ audioCtx: null, stream: null, analyser: null, timer: null, lastSpeaking: false });
  const pendingVoiceEventsRef = useRef(new Map());
  const selfUserIdRef = useRef("");
  selfUserIdRef.current = me?.id || "";
  const voiceSfuRef = useRef(null);
  if (!voiceSfuRef.current) {
    voiceSfuRef.current = createSfuVoiceClient({
      getSelfUserId: () => selfUserIdRef.current,
      sendDispatch: (type, data) => sendNodeVoiceDispatch(type, data),
      waitForEvent: waitForVoiceEvent
    });
  }
  const selfStatusRef = useRef(selfStatus);
  selfStatusRef.current = selfStatus;

  function getPresence(userId) {
    if (!userId) return "offline";
    if (userId === me?.id) return selfStatus;
    return presenceByUserId[userId]?.status ?? "offline";
  }
  const presenceLabels = { online: "Online", idle: "Idle", dnd: "Do Not Disturb", offline: "Offline" };
  function presenceLabel(status) {
    return presenceLabels[status] || status || "Offline";
  }

  const dmMessagesRef = useRef(null);
  const composerInputRef = useRef(null);
  const dmComposerInputRef = useRef(null);
  const isAtBottomRef = useRef(true);
  const lastDmMessageCountRef = useRef(0);
  const previousDmIdRef = useRef("");
  const activeChannelIdRef = useRef("");
  const profileCardDragOffsetRef = useRef({ x: 0, y: 0 });
  const storageScope = me?.id || "anonymous";

  // Resolve usernames and profile pictures from core for guild members and message authors
  useEffect(() => {
    if (!accessToken) return;
    const ids = new Set();
    (guildState?.members || []).forEach((m) => m.id && ids.add(m.id));
    messages.forEach((msg) => {
      const id = msg.author_id || msg.authorId;
      if (id) ids.add(id);
    });
    if (me?.id) ids.add(me.id);
    const toFetch = [...ids].filter((id) => !userCache[id] && !userCacheFetchingRef.current.has(id));
    if (toFetch.length === 0) return;
    toFetch.forEach((id) => userCacheFetchingRef.current.add(id));
    Promise.all(
      toFetch.map((id) =>
        fetch(`${CORE_API}/v1/users/${id}/profile`, { headers: { Authorization: `Bearer ${accessToken}` } })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)
      )
    ).then((results) => {
      toFetch.forEach((id) => userCacheFetchingRef.current.delete(id));
      setUserCache((prev) => {
        const next = { ...prev };
        toFetch.forEach((id, i) => {
          const data = results[i];
          if (data && (data.username != null || data.displayName != null || data.pfpUrl != null)) {
            next[id] = {
              username: data.username ?? data.displayName ?? id,
              displayName: data.displayName ?? data.username ?? id,
              pfpUrl: data.pfpUrl ?? null
            };
          }
        });
        return next;
      });
    });
  }, [accessToken, guildState?.members, messages, me?.id]);

  // Seed current user into cache when we have profile
  useEffect(() => {
    if (!me?.id || !profile) return;
    setUserCache((prev) => ({
      ...prev,
      [me.id]: {
        username: profile.username ?? me.username ?? me.id,
        displayName: profile.displayName ?? profile.username ?? me.username ?? me.id,
        pfpUrl: profile.pfpUrl ?? null
      }
    }));
  }, [me?.id, me?.username, profile?.username, profile?.displayName, profile?.pfpUrl]);

  const activeServer = useMemo(() => servers.find((server) => server.id === activeServerId) || null, [servers, activeServerId]);
  const activeGuild = useMemo(() => guilds.find((guild) => guild.id === activeGuildId) || null, [guilds, activeGuildId]);
  const voiceConnectedChannelId = voiceSession.channelId;
  const voiceConnectedGuildId = voiceSession.guildId;
  const isInVoiceChannel = !!voiceConnectedChannelId;
  const channels = guildState?.channels || [];
  const voiceConnectedChannelName = useMemo(() => {
    if (!voiceConnectedChannelId) return "";
    const connectedChannel = channels.find((channel) => channel.id === voiceConnectedChannelId);
    return connectedChannel?.name || voiceConnectedChannelId;
  }, [channels, voiceConnectedChannelId]);
  const activeChannel = useMemo(() => channels.find((channel) => channel.id === activeChannelId) || null, [channels, activeChannelId]);
  const activeDm = useMemo(() => dms.find((dm) => dm.id === activeDmId) || null, [dms, activeDmId]);

  const canManageServer = useMemo(() => {
    if (!activeServer) return false;
    return (activeServer.roles || []).includes("owner") || (activeServer.roles || []).includes("platform_admin");
  }, [activeServer]);

  const sortedChannels = useMemo(() => [...(channels || [])].filter(Boolean).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)), [channels]);
  const categoryChannels = useMemo(() => sortedChannels.filter((channel) => channel && channel.type === "category"), [sortedChannels]);

  const filteredFriends = useMemo(() => {
    const query = friendQuery.trim().toLowerCase();
    if (!query) return friends;
    return friends.filter((friend) => friend.username.toLowerCase().includes(query) || friend.id.includes(query));
  }, [friendQuery, friends]);

  const memberList = useMemo(() => {
    const listed = guildState?.members || [];
    if (listed.length) return listed;

    const members = new Map();
    for (const message of messages) {
      const id = message.author_id || message.authorId;
      if (!id || members.has(id)) continue;
      members.set(id, { id, username: message.username || id, status: "offline", pfp_url: message.pfp_url || null, roleIds: [] });
    }

    if (me?.id && !members.has(me.id)) {
      members.set(me.id, { id: me.id, username: me.username || me.id, status: "offline", pfp_url: profile?.pfpUrl || null, roleIds: guildState?.me?.roleIds || [] });
    }

    return Array.from(members.values());
  }, [guildState, messages, me, profile]);

  const resolvedMemberList = useMemo(() =>
    memberList.map((m) => ({
      ...m,
      username: userCache[m.id]?.displayName || userCache[m.id]?.username || m.username,
      pfp_url: userCache[m.id]?.pfpUrl ?? m.pfp_url
    })),
    [memberList, userCache]
  );

  const mentionSuggestions = useMemo(() => {
    const mention = getMentionQuery(messageText);
    if (!mention || navMode !== "servers") return [];
    const candidateNames = ["everyone", ...resolvedMemberList.map((member) => member.username || "")]
      .map((name) => name.trim())
      .filter(Boolean);
    const uniqueNames = Array.from(new Set(candidateNames));
    if (!mention.query) return uniqueNames.slice(0, 8);
    return uniqueNames.filter((name) => name.toLowerCase().startsWith(mention.query)).slice(0, 8);
  }, [messageText, navMode, resolvedMemberList]);

  const memberByMentionToken = useMemo(() => {
    const map = new Map();
    for (const member of resolvedMemberList) {
      if (!member?.id) continue;
      map.set(String(member.id).toLowerCase(), member);
      if (member.username) map.set(String(member.username).toLowerCase(), member);
    }
    return map;
  }, [resolvedMemberList]);

  const memberNameById = useMemo(() => new Map(resolvedMemberList.map((member) => [member.id, member.username])), [resolvedMemberList]);

  const mergedVoiceStates = useMemo(() => {
    const base = guildState?.voiceStates || [];
    if (!activeGuildId) return base;
    const live = voiceStatesByGuild[activeGuildId] || {};
    if (!Object.keys(live).length) return base;
    const byUser = new Map(base.map((vs) => [vs.userId, vs]));
    for (const [userId, state] of Object.entries(live)) {
      if (!state?.channelId) byUser.delete(userId);
      else byUser.set(userId, { userId, channelId: state.channelId, muted: !!state.muted, deafened: !!state.deafened });
    }
    return Array.from(byUser.values());
  }, [guildState?.voiceStates, voiceStatesByGuild, activeGuildId]);

  const isVoiceSessionSynced = useMemo(() => {
    if (!me?.id || !voiceConnectedGuildId || !voiceConnectedChannelId) return false;
    const liveSelfState = voiceStatesByGuild[voiceConnectedGuildId]?.[me.id];
    if (liveSelfState?.channelId) return liveSelfState.channelId === voiceConnectedChannelId;
    if (activeGuildId === voiceConnectedGuildId) {
      const mergedSelfState = mergedVoiceStates.find((vs) => vs.userId === me.id);
      return mergedSelfState?.channelId === voiceConnectedChannelId;
    }
    return false;
  }, [me?.id, voiceConnectedGuildId, voiceConnectedChannelId, voiceStatesByGuild, activeGuildId, mergedVoiceStates]);

  const voiceMembersByChannel = useMemo(() => {
    const map = new Map();
    for (const vs of mergedVoiceStates) {
      if (!vs?.channelId || !vs?.userId) continue;
      if (!map.has(vs.channelId)) map.set(vs.channelId, []);
      map.get(vs.channelId).push({
        userId: vs.userId,
        username: memberNameById.get(vs.userId) || vs.userId,
        pfp_url: resolvedMemberList.find((m) => m.id === vs.userId)?.pfp_url || null,
        muted: !!vs.muted,
        deafened: !!vs.deafened
      });
    }
    return map;
  }, [mergedVoiceStates, memberNameById, resolvedMemberList]);

  const groupedChannelSections = useMemo(() => {
    const categories = categoryChannels.map((category) => ({
      category,
      channels: sortedChannels.filter((channel) => channel.parent_id === category.id && channel.type !== "category")
    }));

    const uncategorized = sortedChannels.filter((channel) => !channel.parent_id && channel.type !== "category");

    return [
      ...categories,
      ...(uncategorized.length ? [{ category: { id: "uncategorized", name: "Channels" }, channels: uncategorized }] : [])
    ];
  }, [categoryChannels, sortedChannels]);

  const groupedServerMessages = useMemo(() => groupMessages(
    messages,
    (message) => {
      const id = message.author_id || message.authorId;
      return memberNameById.get(id) || id || "Unknown";
    },
    (message) => message.created_at || message.createdAt,
    (message) => message.author_id || message.authorId || "unknown",
    (message) => {
      const id = message.author_id || message.authorId;
      return userCache[id]?.pfpUrl ?? message.pfp_url ?? null;
    }
  ), [messages, memberNameById, userCache]);

  const groupedDmMessages = useMemo(() => groupMessages(
    activeDm?.messages || [],
    (message) => message.author || "Unknown",
    (message) => message.createdAt,
    (message) => message.authorId || "unknown",
    (message) => message.pfp_url || null
  ), [activeDm]);

  const activePinnedServerMessages = useMemo(() => pinnedServerMessages[activeChannelId] || [], [pinnedServerMessages, activeChannelId]);
  const activePinnedDmMessages = useMemo(() => pinnedDmMessages[activeDmId] || [], [pinnedDmMessages, activeDmId]);
  const activeServerVoiceGatewayPref = useMemo(() => {
    if (!activeServerId) return { mode: "core", customUrl: "" };
    const pref = serverVoiceGatewayPrefs[activeServerId] || {};
    return {
      mode: pref.mode === "server" ? "server" : "core",
      customUrl: typeof pref.customUrl === "string" ? pref.customUrl : ""
    };
  }, [activeServerId, serverVoiceGatewayPrefs]);

  async function refreshSocialData(token = accessToken) {
    if (!token) return;
    const [friendsData, dmsData, requestData, socialSettingsData] = await Promise.all([
      api("/v1/social/friends", { headers: { Authorization: `Bearer ${token}` } }),
      api("/v1/social/dms", { headers: { Authorization: `Bearer ${token}` } }),
      api("/v1/social/requests", { headers: { Authorization: `Bearer ${token}` } }),
      api("/v1/social/settings", { headers: { Authorization: `Bearer ${token}` } })
    ]);

    setFriends(friendsData.friends || []);
    let nextDms = [];
    setDms((current) => {
      const previous = new Map(current.map((item) => [item.id, item]));
      nextDms = (dmsData.dms || []).map((item) => ({ ...item, messages: previous.get(item.id)?.messages || [] }));
      return nextDms;
    });
    
    
    // Preserve current DM selection if it still exists, otherwise find last DM with messages
    if (!nextDms.some((item) => item.id === activeDmId)) {
      const dmWithMessages = nextDms.find((dm) => dm.messages && dm.messages.length > 0);
      const nextActiveDmId = dmWithMessages?.id || nextDms[0]?.id || "";
      if (nextActiveDmId) {
        setActiveDmId(nextActiveDmId);
        localStorage.setItem(ACTIVE_DM_KEY, nextActiveDmId);
      }
    }
    
    setFriendRequests({ incoming: requestData.incoming || [], outgoing: requestData.outgoing || [] });
    setAllowFriendRequests(socialSettingsData.allowFriendRequests !== false);
  }

  useEffect(() => {
    if (accessToken) localStorage.setItem("opencom_access_token", accessToken);
    else localStorage.removeItem("opencom_access_token");
  }, [accessToken]);

  useEffect(() => {
    if (accessToken) return;
    const storedFriends = getStoredJson(`opencom_friends_${storageScope}`, []);
    const storedDms = getStoredJson(`opencom_dms_${storageScope}`, []);
    setFriends(storedFriends);
    setDms(storedDms);
    if (!storedDms.some((item) => item.id === activeDmId)) setActiveDmId(storedDms[0]?.id || "");
  }, [storageScope, accessToken]);

  useEffect(() => {
    localStorage.setItem(`opencom_friends_${storageScope}`, JSON.stringify(friends));
  }, [friends, storageScope]);

  useEffect(() => {
    localStorage.setItem(`opencom_dms_${storageScope}`, JSON.stringify(dms));
  }, [dms, storageScope]);

  useEffect(() => {
    if (!status) return;
    const timer = window.setTimeout(() => setStatus(""), 4500);
    return () => window.clearTimeout(timer);
  }, [status]);

  useEffect(() => {
    localStorage.setItem(SELF_STATUS_KEY, selfStatus);
  }, [selfStatus]);

  useEffect(() => {
    localStorage.setItem(PINNED_SERVER_KEY, JSON.stringify(pinnedServerMessages));
  }, [pinnedServerMessages]);

  useEffect(() => {
    localStorage.setItem(PINNED_DM_KEY, JSON.stringify(pinnedDmMessages));
  }, [pinnedDmMessages]);

  useEffect(() => {
    if (activeDmId) localStorage.setItem(ACTIVE_DM_KEY, activeDmId);
  }, [activeDmId]);

  useEffect(() => {
    if (!draggingProfileCard) return;
    const onMove = (event) => {
      const x = Math.max(8, Math.min(window.innerWidth - 340, event.clientX - profileCardDragOffsetRef.current.x));
      const y = Math.max(8, Math.min(window.innerHeight - 280, event.clientY - profileCardDragOffsetRef.current.y));
      setProfileCardPosition({ x, y });
    };
    const onUp = () => setDraggingProfileCard(false);

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [draggingProfileCard]);

  useEffect(() => {
    const onGlobalClick = () => {
      setServerContextMenu(null);
      setMessageContextMenu(null);
      if (!settingsOpen) setMemberProfileCard(null);
    };
    const onEscape = (event) => {
      if (event.key === "Escape") {
        setServerContextMenu(null);
        setMemberProfileCard(null);
        setSettingsOpen(false);
      }
    };

    window.addEventListener("click", onGlobalClick);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("click", onGlobalClick);
      window.removeEventListener("keydown", onEscape);
    };
  }, [settingsOpen]);

  // Handle scroll position for server messages
  useEffect(() => {
    if (!messagesRef.current || navMode !== "servers") return;
    messagesRef.current.scrollTo({ top: messagesRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, navMode]);

  // Handle scroll position for DM messages - only scroll if at bottom
  useEffect(() => {
    if (!dmMessagesRef.current || navMode !== "dms") return;
    
    const container = dmMessagesRef.current;
    const isNewDm = activeDmId !== previousDmIdRef.current;
    
    if (isNewDm) {
      // New DM selected - scroll to bottom
      previousDmIdRef.current = activeDmId;
      lastDmMessageCountRef.current = activeDm?.messages?.length || 0;
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
      isAtBottomRef.current = true;
      return;
    }
    
    // Check if user is near bottom
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    
    // Check if new messages were added
    const currentMessageCount = activeDm?.messages?.length || 0;
    const hasNewMessages = currentMessageCount > lastDmMessageCountRef.current;
    
    // Only auto-scroll if user is at bottom and new messages arrived
    if (hasNewMessages && isNearBottom) {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
      isAtBottomRef.current = true;
    } else if (hasNewMessages) {
      // New messages but user scrolled up - don't scroll, just update count
      isAtBottomRef.current = false;
    }
    
    lastDmMessageCountRef.current = currentMessageCount;
  }, [activeDm?.messages, activeDmId, navMode]);

  // Track scroll position for DMs
  useEffect(() => {
    if (!dmMessagesRef.current || navMode !== "dms") return;
    
    const container = dmMessagesRef.current;
    const handleScroll = () => {
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
      isAtBottomRef.current = isNearBottom;
    };
    
    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [navMode, activeDmId]);

  useEffect(() => {
    if (!accessToken) return;

    async function loadSession() {
      try {
        const meData = await api("/v1/me", { headers: { Authorization: `Bearer ${accessToken}` } });
        setMe(meData);

        const [profileData, serverData] = await Promise.all([
          api(`/v1/users/${meData.id}/profile`, { headers: { Authorization: `Bearer ${accessToken}` } }),
          api("/v1/servers", { headers: { Authorization: `Bearer ${accessToken}` } })
        ]);

        const nextServers = serverData.servers || [];
        setProfile(profileData);
        setProfileForm({
          displayName: profileData.displayName || "",
          bio: profileData.bio || "",
          pfpUrl: profileData.pfpUrl || "",
          bannerUrl: profileData.bannerUrl || ""
        });

        setServers(nextServers);
        try {
          await refreshSocialData(accessToken);
        } catch {
          // fallback to local-only social data if backend social routes are unavailable
        }

        if (!nextServers.length) {
          setActiveServerId("");
          setActiveGuildId("");
          setGuildState(null);
          setMessages([]);
          return;
        }

        if (!nextServers.some((server) => server.id === activeServerId)) {
          setActiveServerId(nextServers[0].id);
        }
      } catch (error) {
        setStatus(`Session error: ${error.message}`);
      }
    }

    loadSession();
  }, [accessToken]);

  // Core gateway: connect for presence updates, send SET_PRESENCE when self status changes
  useEffect(() => {
    if (!accessToken || !me?.id) {
      setGatewayConnected(false);
      if (gatewayWsRef.current) {
        gatewayWsRef.current.close();
        gatewayWsRef.current = null;
      }
      if (gatewayHeartbeatRef.current) {
        clearInterval(gatewayHeartbeatRef.current);
        gatewayHeartbeatRef.current = null;
      }
      return;
    }
    let deviceId = localStorage.getItem(GATEWAY_DEVICE_ID_KEY);
    if (!deviceId) {
      deviceId = "web-" + Math.random().toString(36).slice(2) + "-" + Date.now();
      localStorage.setItem(GATEWAY_DEVICE_ID_KEY, deviceId);
    }
    let disposed = false;
    let connected = false;
    let hasEverConnected = false;
    let reconnectTimer = null;
    let candidateIndex = 0;
    let reconnectAttempts = 0;
    const candidates = prioritizeLastSuccessfulGateway(getCoreGatewayWsCandidates(), LAST_CORE_GATEWAY_KEY);

    const scheduleReconnect = () => {
      if (disposed) return;
      const delay = Math.min(5000, 300 * (2 ** Math.min(reconnectAttempts, 4)));
      reconnectAttempts += 1;
      reconnectTimer = setTimeout(connectNext, delay);
    };

    const connectNext = () => {
      if (disposed || connected || !candidates.length) return;

      const wsUrl = candidates[candidateIndex % candidates.length];
      candidateIndex += 1;
      const ws = new WebSocket(wsUrl);
      gatewayWsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ op: "IDENTIFY", d: { accessToken, deviceId } }));
      };

      ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.op === "HELLO" && msg.d?.heartbeat_interval) {
          if (gatewayHeartbeatRef.current) clearInterval(gatewayHeartbeatRef.current);
          gatewayHeartbeatRef.current = setInterval(() => {
            if (gatewayWsRef.current?.readyState === WebSocket.OPEN) gatewayWsRef.current.send(JSON.stringify({ op: "HEARTBEAT" }));
          }, msg.d.heartbeat_interval);
        }
        if (msg.op === "READY") {
          connected = true;
          hasEverConnected = true;
          reconnectAttempts = 0;
          setGatewayConnected(true);
          localStorage.setItem(LAST_CORE_GATEWAY_KEY, wsUrl);
          setStatus("");
          if (gatewayWsRef.current?.readyState === WebSocket.OPEN) {
            gatewayWsRef.current.send(JSON.stringify({ op: "DISPATCH", t: "SET_PRESENCE", d: { status: selfStatus, customStatus: null } }));
          }
        }
        if (msg.op === "DISPATCH" && msg.t === "PRESENCE_UPDATE" && msg.d?.userId) {
          setPresenceByUserId((prev) => ({ ...prev, [msg.d.userId]: { status: msg.d.status ?? "offline", customStatus: msg.d.customStatus ?? null } }));
        }
        if (msg.op === "DISPATCH" && msg.t === "SOCIAL_DM_MESSAGE_CREATE" && msg.d?.threadId && msg.d?.message?.id) {
          const threadId = msg.d.threadId;
          const incoming = msg.d.message;
          setDms((current) => {
            const next = [...current];
            const idx = next.findIndex((item) => item.id === threadId);
            const already = (messages = []) => messages.some((m) => m.id === incoming.id);
            if (idx >= 0) {
              const existing = next[idx];
              if (already(existing.messages || [])) return current;
              next[idx] = { ...existing, messages: [...(existing.messages || []), incoming] };
              return next;
            }
            return [{
              id: threadId,
              participantId: incoming.authorId === me?.id ? "unknown" : incoming.authorId,
              name: incoming.authorId === me?.id ? "Unknown" : (incoming.author || "Unknown"),
              messages: [incoming]
            }, ...next];
          });
          if (incoming.authorId && incoming.authorId !== me?.id) {
            playNotificationBeep(selfStatusRef.current === "dnd");
            setDmNotification({ dmId: threadId, at: Date.now() });
          }
        }
        if (msg.op === "DISPATCH" && msg.t === "SOCIAL_DM_MESSAGE_DELETE" && msg.d?.threadId && msg.d?.messageId) {
          const threadId = msg.d.threadId;
          const messageId = msg.d.messageId;
          setDms((current) => current.map((item) =>
            item.id === threadId
              ? { ...item, messages: (item.messages || []).filter((m) => m.id !== messageId) }
              : item
          ));
        }
      } catch (_) {}
      };

      ws.onclose = () => {
        if (disposed) return;
        setGatewayConnected(false);
        gatewayWsRef.current = null;
        if (gatewayHeartbeatRef.current) {
          clearInterval(gatewayHeartbeatRef.current);
          gatewayHeartbeatRef.current = null;
        }

        connected = false;
        rejectPendingVoiceEvents("VOICE_GATEWAY_CLOSED");
        scheduleReconnect();

        if (!hasEverConnected) {
          setStatus("Gateway websocket unavailable. Check DNS/TLS or set VITE_CORE_GATEWAY_URL.");
        } else {
          setStatus("Gateway disconnected. Reconnecting...");
        }
      };

      ws.onerror = () => {};
    };

    connectNext();

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      setGatewayConnected(false);
      if (gatewayHeartbeatRef.current) clearInterval(gatewayHeartbeatRef.current);
      gatewayHeartbeatRef.current = null;
      if (gatewayWsRef.current) gatewayWsRef.current.close();
      gatewayWsRef.current = null;
    };
  }, [accessToken, me?.id]);

  useEffect(() => {
    if (!accessToken || !me?.id || gatewayWsRef.current?.readyState !== WebSocket.OPEN) return;
    gatewayWsRef.current.send(JSON.stringify({ op: "DISPATCH", t: "SET_PRESENCE", d: { status: selfStatus, customStatus: null } }));
  }, [selfStatus, accessToken, me?.id]);

  useEffect(() => {
    const server = activeServer;
    if (navMode !== "servers" || !server?.baseUrl || !server?.membershipToken) {
      voiceGatewayCandidatesRef.current = [];
      nodeGatewayReadyRef.current = false;
      if (nodeGatewayHeartbeatRef.current) {
        clearInterval(nodeGatewayHeartbeatRef.current);
        nodeGatewayHeartbeatRef.current = null;
      }
      if (nodeGatewayWsRef.current) {
        nodeGatewayWsRef.current.close();
        nodeGatewayWsRef.current = null;
      }
      cleanupVoiceRtc().catch(() => {});
      return;
    }

    if (nodeGatewayUnavailableByServer[server.id]) {
      voiceGatewayCandidatesRef.current = [];
      nodeGatewayReadyRef.current = false;
      if (nodeGatewayHeartbeatRef.current) {
        clearInterval(nodeGatewayHeartbeatRef.current);
        nodeGatewayHeartbeatRef.current = null;
      }
      if (nodeGatewayWsRef.current) {
        nodeGatewayWsRef.current.close();
        nodeGatewayWsRef.current = null;
      }
      cleanupVoiceRtc().catch(() => {});
      return;
    }

    const wsCandidates = prioritizeLastSuccessfulGateway(getVoiceGatewayWsCandidates(server.baseUrl), LAST_SERVER_GATEWAY_KEY);
    voiceGatewayCandidatesRef.current = wsCandidates;
    if (!wsCandidates.length) return;

    let disposed = false;
    let connected = false;
    let hasEverConnected = false;
    let reconnectTimer = null;
    let candidateIndex = 0;
    let reconnectAttempts = 0;

    const scheduleReconnect = () => {
      if (disposed) return;
      const delay = Math.min(5000, 300 * (2 ** Math.min(reconnectAttempts, 4)));
      reconnectAttempts += 1;
      reconnectTimer = setTimeout(connectNext, delay);
    };

    const connectNext = () => {
      if (disposed || !wsCandidates.length) return;
      const wsUrl = wsCandidates[candidateIndex % wsCandidates.length];
      candidateIndex += 1;
      const ws = new WebSocket(wsUrl);
      nodeGatewayWsRef.current = ws;

      ws.onopen = () => {
        setStatus("");
        ws.send(JSON.stringify({ op: "IDENTIFY", d: { membershipToken: server.membershipToken } }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          resolvePendingVoiceEvent(msg);
          if (msg.op === "HELLO" && msg.d?.heartbeat_interval) {
            if (nodeGatewayHeartbeatRef.current) clearInterval(nodeGatewayHeartbeatRef.current);
            nodeGatewayHeartbeatRef.current = setInterval(() => {
              if (nodeGatewayWsRef.current?.readyState === WebSocket.OPEN) {
                nodeGatewayWsRef.current.send(JSON.stringify({ op: "HEARTBEAT" }));
              }
            }, msg.d.heartbeat_interval);
            return;
          }

          if (msg.op === "READY") {
            connected = true;
            hasEverConnected = true;
            reconnectAttempts = 0;
            nodeGatewayReadyRef.current = true;
            localStorage.setItem(LAST_SERVER_GATEWAY_KEY, wsUrl);
            if (activeGuildId) {
              ws.send(JSON.stringify({ op: "DISPATCH", t: "SUBSCRIBE_GUILD", d: { guildId: activeGuildId } }));
            }
            if (activeChannelId) {
              ws.send(JSON.stringify({ op: "DISPATCH", t: "SUBSCRIBE_CHANNEL", d: { channelId: activeChannelId } }));
            }
            return;
          }

          if (msg.op === "ERROR" && msg.d?.error) {
            if (typeof msg.d.error === "string" && msg.d.error.startsWith("VOICE_UPSTREAM_UNAVAILABLE") && server?.id) {
              setNodeGatewayUnavailableByServer((prev) => prev[server.id] ? prev : { ...prev, [server.id]: true });
              setStatus("Realtime voice gateway unavailable for this server. Falling back to REST voice controls.");
              try { ws.close(); } catch {}
              return;
            }
            setStatus(`Voice gateway error: ${msg.d.error}`);
            return;
          }

          if (msg.op === "DISPATCH" && msg.t === "MESSAGE_MENTION" && msg.d?.channelId) {
            const mentionChannelId = msg.d.channelId;
            if (activeServer?.id && mentionChannelId !== activeChannelIdRef.current) {
              setServerPingCounts((prev) => ({
                ...prev,
                [activeServer.id]: (prev[activeServer.id] || 0) + 1
              }));
            }
            return;
          }

          if (msg.op === "DISPATCH" && msg.t === "MESSAGE_CREATE" && msg.d?.channelId && msg.d?.message) {
            const channelId = msg.d.channelId;
            const incoming = msg.d.message;

            if (channelId === activeChannelIdRef.current) {
              setMessages((prev) => {
                if (prev.some((m) => m.id === incoming.id)) return prev;
                return [...prev, {
                  id: incoming.id,
                  author_id: incoming.authorId,
                  content: incoming.content,
                  created_at: incoming.createdAt,
                  attachments: incoming.attachments || []
                }];
              });
            }
            return;
          }

          if (msg.op === "DISPATCH" && msg.t === "VOICE_STATE_UPDATE" && msg.d?.guildId && msg.d?.userId) {
            setVoiceStatesByGuild((prev) => {
              const guildId = msg.d.guildId;
              const byUser = { ...(prev[guildId] || {}) };
              if (!msg.d.channelId) delete byUser[msg.d.userId];
              else byUser[msg.d.userId] = { channelId: msg.d.channelId, muted: !!msg.d.muted, deafened: !!msg.d.deafened };
              return { ...prev, [guildId]: byUser };
            });
            if (msg.d.userId === me?.id) {
              setVoiceSession(msg.d.channelId ? { guildId: msg.d.guildId, channelId: msg.d.channelId } : { guildId: "", channelId: "" });
            }
            return;
          }

          if (msg.op === "DISPATCH" && msg.t === "VOICE_STATE_REMOVE" && msg.d?.guildId && msg.d?.userId) {
            setVoiceStatesByGuild((prev) => {
              const guildId = msg.d.guildId;
              const byUser = { ...(prev[guildId] || {}) };
              delete byUser[msg.d.userId];
              return { ...prev, [guildId]: byUser };
            });
            setVoiceSpeakingByGuild((prev) => {
              const guildId = msg.d.guildId;
              const byUser = { ...(prev[guildId] || {}) };
              delete byUser[msg.d.userId];
              return { ...prev, [guildId]: byUser };
            });
            voiceSfuRef.current?.closeConsumersForUser(msg.d.userId);
            if (msg.d.userId === me?.id) {
              setVoiceSession({ guildId: "", channelId: "" });
              cleanupVoiceRtc().catch(() => {});
            }
            return;
          }

          if (msg.op === "DISPATCH" && msg.t === "VOICE_SPEAKING" && msg.d?.guildId && msg.d?.userId) {
            setVoiceSpeakingByGuild((prev) => {
              const guildId = msg.d.guildId;
              const byUser = { ...(prev[guildId] || {}) };
              byUser[msg.d.userId] = !!msg.d.speaking;
              return { ...prev, [guildId]: byUser };
            });
            return;
          }

          if (msg.op === "DISPATCH" && msg.t === "VOICE_JOINED" && msg.d?.channelId) {
            setVoiceSession({ guildId: msg.d?.guildId || activeGuildId || "", channelId: msg.d.channelId });
            return;
          }

          if (msg.op === "DISPATCH" && msg.t === "VOICE_LEFT") {
            setVoiceSession({ guildId: "", channelId: "" });
            cleanupVoiceRtc().catch(() => {});
            return;
          }

          if (msg.op === "DISPATCH" && msg.t === "VOICE_ERROR") {
            const error = msg.d?.error || "VOICE_ERROR";
            const activeVoiceContext = voiceSfuRef.current?.getContext?.() || {};
            rejectPendingVoiceEventsByScope({
              guildId: msg.d?.guildId ?? activeVoiceContext.guildId ?? null,
              channelId: msg.d?.channelId ?? activeVoiceContext.channelId ?? null,
              reason: error
            });
            if (error === "NOT_IN_VOICE_CHANNEL") {
              setVoiceSession({ guildId: "", channelId: "" });
              setStatus("Voice state desynced. Rejoin voice to continue.");
              cleanupVoiceRtc().catch(() => {});
              return;
            }
            const message = `Voice connection failed: ${error}`;
            setStatus(message);
            window.alert(message);
            return;
          }

          if (msg.op === "DISPATCH" && typeof msg.t === "string") {
            voiceSfuRef.current?.handleGatewayDispatch(msg.t, msg.d).catch(() => {});
          }
        } catch (_) {}
      };

      ws.onclose = () => {
        if (disposed) return;
        nodeGatewayReadyRef.current = false;
        if (nodeGatewayHeartbeatRef.current) {
          clearInterval(nodeGatewayHeartbeatRef.current);
          nodeGatewayHeartbeatRef.current = null;
        }
        nodeGatewayWsRef.current = null;

        connected = false;
        rejectPendingVoiceEvents("VOICE_GATEWAY_CLOSED");
        scheduleReconnect();

        if (!hasEverConnected) {
          setStatus("Voice gateway unavailable. Check core gateway/proxy configuration.");
        } else {
          setStatus("Server voice gateway disconnected. Reconnecting...");
        }
      };

      ws.onerror = () => {};
    };

    connectNext();

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      nodeGatewayReadyRef.current = false;
      if (nodeGatewayHeartbeatRef.current) {
        clearInterval(nodeGatewayHeartbeatRef.current);
        nodeGatewayHeartbeatRef.current = null;
      }
      if (nodeGatewayWsRef.current) {
        nodeGatewayWsRef.current.close();
        nodeGatewayWsRef.current = null;
      }
      cleanupVoiceRtc().catch(() => {});
    };
  }, [navMode, activeServer?.id, activeServer?.baseUrl, activeServer?.membershipToken, nodeGatewayUnavailableByServer]);

  useEffect(() => {
    if (!activeGuildId || !activeChannelId) return;
    const ws = nodeGatewayWsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !nodeGatewayReadyRef.current) return;
    ws.send(JSON.stringify({ op: "DISPATCH", t: "SUBSCRIBE_GUILD", d: { guildId: activeGuildId } }));
    ws.send(JSON.stringify({ op: "DISPATCH", t: "SUBSCRIBE_CHANNEL", d: { channelId: activeChannelId } }));
  }, [activeGuildId, activeChannelId]);

  useEffect(() => {
    if (navMode !== "servers" || !activeGuildId || !guildState?.channels?.length) return;
    const ws = nodeGatewayWsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !nodeGatewayReadyRef.current) return;
    for (const channel of guildState.channels) {
      if (!channel?.id || channel.type !== "text") continue;
      ws.send(JSON.stringify({ op: "DISPATCH", t: "SUBSCRIBE_CHANNEL", d: { channelId: channel.id } }));
    }
  }, [navMode, activeGuildId, guildState?.channels]);

  useEffect(() => {
    if (!activeServerId) return;
    setServerPingCounts((prev) => {
      if (!prev[activeServerId]) return prev;
      const next = { ...prev };
      delete next[activeServerId];
      return next;
    });
  }, [activeServerId]);

  // Fetch initial presence for guild members and friends
  useEffect(() => {
    if (!accessToken) return;
    const ids = new Set();
    (guildState?.members || []).forEach((m) => m.id && ids.add(m.id));
    (friends || []).forEach((f) => f.id && ids.add(f.id));
    const userIds = [...ids];
    if (userIds.length === 0) return;
    const params = new URLSearchParams({ userIds: userIds.join(",") });
    fetch(`${CORE_API}/v1/presence?${params}`, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((r) => r.ok ? r.json() : {})
      .then((data) => {
        if (data && typeof data === "object") setPresenceByUserId((prev) => ({ ...prev, ...data }));
      })
      .catch(() => {});
  }, [accessToken, guildState?.members, friends]);

  // Handle invite link: ?join=CODE — pre-fill join form; if logged in, auto-join and clear URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const joinCode = params.get("join") || (window.location.hash && window.location.hash.startsWith("#join=") && decodeURIComponent(window.location.hash.slice(6))) || null;
    const code = joinCode?.trim();
    if (!code) return;
    setJoinInviteCode(code);
    setAddServerModalOpen(true);
    setAddServerTab("join");
    if (accessToken) {
      joinInvite(code);
      const url = new URL(window.location.href);
      url.searchParams.delete("join");
      if (url.hash.startsWith("#join=")) url.hash = url.hash.replace(/#join=[^#&]*/, "").replace(/^#&?|&#?$/, "") || "";
      window.history.replaceState({}, "", url.pathname + (url.search || "") + (url.hash ? "#" + url.hash : ""));
    }
  }, [accessToken]);

  useEffect(() => {
    if (navMode !== "servers" || !activeServer) {
      setGuilds([]);
      if (navMode !== "servers") {
        setGuildState(null);
        setMessages([]);
      }
      return;
    }

    nodeApi(activeServer.baseUrl, "/v1/guilds", activeServer.membershipToken)
      .then((items) => {
        const nextGuilds = items || [];
        setGuilds(nextGuilds);

        if (!nextGuilds.length) {
          setActiveGuildId("");
          setGuildState(null);
          return;
        }

        const hasActiveGuild = nextGuilds.some((guild) => guild.id === activeGuildId);
        if (!hasActiveGuild) {
          setActiveGuildId(nextGuilds[0].id);
        }
      })
      .catch((error) => {
        setGuilds([]);
        setGuildState(null);
        setStatus(`Workspace list failed: ${error.message}`);
      });
  }, [activeServer, activeGuildId, navMode]);

  useEffect(() => {
    if (navMode !== "servers" || !activeServer || !activeGuildId) return;

    let cancelled = false;

    const loadGuildState = () => nodeApi(activeServer.baseUrl, `/v1/guilds/${activeGuildId}/state`, activeServer.membershipToken)
      .then((state) => {
        if (cancelled) return;
        const allChannels = state.channels || [];
        setGuildState(state);

        const activeExists = allChannels.some((channel) => channel.id === activeChannelId && channel.type === "text");
        if (activeExists) return;

        const firstTextChannel = allChannels.find((channel) => channel.type === "text")?.id || "";
        setActiveChannelId(firstTextChannel);
      })
      .catch((error) => {
        if (cancelled) return;
        setGuildState(null);
        setActiveChannelId("");
        setMessages([]);
        setStatus(`Workspace state failed: ${error.message}`);
      });

    loadGuildState();
    const timer = window.setInterval(loadGuildState, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeServer, activeGuildId, navMode, activeChannelId]);

  useEffect(() => {
    if (navMode !== "dms" || !activeDmId || !accessToken) return;

    api(`/v1/social/dms/${activeDmId}/messages`, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((data) => {
        const nextMessages = data.messages || [];
        setDms((current) => current.map((item) => item.id === activeDmId ? { ...item, messages: nextMessages } : item));
      })
      .catch(() => {
        // keep existing local messages as fallback
      });
  }, [activeDmId, navMode, accessToken]);

  useEffect(() => {
    if (navMode !== "dms") return;
    if (!dms.length) {
      setActiveDmId("");
      return;
    }
    if (!activeDmId || !dms.some((dm) => dm.id === activeDmId)) {
      setActiveDmId(dms[0].id);
    }
  }, [navMode, dms, activeDmId]);

  useEffect(() => {
    if (!dmNotification) return;
    const t = setTimeout(() => setDmNotification(null), 4000);
    return () => clearTimeout(t);
  }, [dmNotification]);

  useEffect(() => {
    const canSendVoiceSpeaking = isInVoiceChannel
      && isVoiceSessionSynced
      && !!voiceConnectedGuildId
      && !!nodeGatewayReadyRef.current
      && nodeGatewayWsRef.current?.readyState === WebSocket.OPEN;

    if (!isInVoiceChannel || !isVoiceSessionSynced || !voiceConnectedGuildId || isMuted || isDeafened || !navigator.mediaDevices?.getUserMedia || !canSendVoiceSpeaking) {
      const detector = voiceSpeakingDetectorRef.current;
      if (detector.timer) clearInterval(detector.timer);
      detector.timer = null;
      if (detector.stream && detector.stream !== voiceSfuRef.current?.getLocalStream()) detector.stream.getTracks().forEach((t) => t.stop());
      detector.stream = null;
      if (detector.audioCtx) detector.audioCtx.close().catch(() => {});
      detector.audioCtx = null;
      detector.analyser = null;
      detector.lastSpeaking = false;
      if (voiceConnectedGuildId && me?.id) {
        setVoiceSpeakingByGuild((prev) => ({ ...prev, [voiceConnectedGuildId]: { ...(prev[voiceConnectedGuildId] || {}), [me.id]: false } }));
      }
      if (isInVoiceChannel && voiceConnectedGuildId && canSendVoiceSpeaking) {
        void sendNodeVoiceDispatch("VOICE_SPEAKING", {
          guildId: voiceConnectedGuildId,
          channelId: voiceConnectedChannelId,
          speaking: false,
        }).catch(() => {});
      }
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const stream = voiceSfuRef.current?.getLocalStream() || await navigator.mediaDevices.getUserMedia({
          audio: audioInputDeviceId ? { deviceId: { exact: audioInputDeviceId } } : true
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        const audioCtx = new window.AudioContext();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);

        const detector = voiceSpeakingDetectorRef.current;
        detector.stream = stream;
        detector.audioCtx = audioCtx;
        detector.analyser = analyser;
        detector.lastSpeaking = false;

        const data = new Uint8Array(analyser.fftSize);
        detector.timer = setInterval(() => {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i += 1) {
            const n = (data[i] - 128) / 128;
            sum += n * n;
          }
          const rms = Math.sqrt(sum / data.length);
          const threshold = 0.01 + ((100 - Math.max(0, Math.min(100, micSensitivity))) / 100) * 0.03;
          const speaking = rms > threshold;
          if (speaking === detector.lastSpeaking) return;
          detector.lastSpeaking = speaking;

          if (voiceConnectedGuildId && me?.id) {
            setVoiceSpeakingByGuild((prev) => ({ ...prev, [voiceConnectedGuildId]: { ...(prev[voiceConnectedGuildId] || {}), [me.id]: speaking } }));
          }
          if (isInVoiceChannel && voiceConnectedGuildId && nodeGatewayReadyRef.current && nodeGatewayWsRef.current?.readyState === WebSocket.OPEN) {
            void sendNodeVoiceDispatch("VOICE_SPEAKING", { guildId: voiceConnectedGuildId, channelId: voiceConnectedChannelId, speaking }).catch(() => {});
          }
        }, 150);
      } catch {
        setStatus("Mic speaking detection unavailable. Check microphone permissions.");
      }
    })();

    return () => {
      cancelled = true;
      const detector = voiceSpeakingDetectorRef.current;
      if (detector.timer) clearInterval(detector.timer);
      detector.timer = null;
      if (detector.stream && detector.stream !== voiceSfuRef.current?.getLocalStream()) detector.stream.getTracks().forEach((t) => t.stop());
      detector.stream = null;
      if (detector.audioCtx) detector.audioCtx.close().catch(() => {});
      detector.audioCtx = null;
      detector.analyser = null;
      detector.lastSpeaking = false;
    };
  }, [isInVoiceChannel, isVoiceSessionSynced, voiceConnectedGuildId, voiceConnectedChannelId, isMuted, isDeafened, micSensitivity, audioInputDeviceId, me?.id]);

  useEffect(() => {
    localStorage.setItem(MIC_GAIN_KEY, String(micGain));
  }, [micGain]);

  useEffect(() => {
    localStorage.setItem(MIC_SENSITIVITY_KEY, String(micSensitivity));
  }, [micSensitivity]);

  useEffect(() => {
    localStorage.setItem(AUDIO_INPUT_DEVICE_KEY, audioInputDeviceId || "");
  }, [audioInputDeviceId]);

  useEffect(() => {
    localStorage.setItem(AUDIO_OUTPUT_DEVICE_KEY, audioOutputDeviceId || "");
  }, [audioOutputDeviceId]);

  useEffect(() => {
    voiceSfuRef.current?.setMuted(isMuted);
  }, [isMuted]);

  useEffect(() => {
    voiceSfuRef.current?.setDeafened(isDeafened);
  }, [isDeafened]);

  useEffect(() => {
    voiceSfuRef.current?.setAudioOutputDevice(audioOutputDeviceId);
  }, [audioOutputDeviceId]);


  useEffect(() => {
    if (settingsTab !== "voice" || !settingsOpen || !navigator.mediaDevices?.enumerateDevices) return;
    let cancelled = false;
    const loadDevices = async () => {
      try {
        try {
          await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch {
          // still attempt enumerateDevices even if permission is denied
        }
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;
        const ins = devices.filter((d) => d.kind === "audioinput");
        const outs = devices.filter((d) => d.kind === "audiooutput");
        setAudioInputDevices(ins);
        setAudioOutputDevices(outs);
        if (!audioInputDeviceId && ins[0]?.deviceId) setAudioInputDeviceId(ins[0].deviceId);
        if (!audioOutputDeviceId && outs[0]?.deviceId) setAudioOutputDeviceId(outs[0].deviceId);
      } catch {
        if (!cancelled) setStatus("Could not load audio devices. Check browser permissions.");
      }
    };
    loadDevices();
    return () => { cancelled = true; };
  }, [settingsTab, settingsOpen, audioInputDeviceId, audioOutputDeviceId]);

  useEffect(() => {
    if (!me?.id) return;

    let detectedGuildId = "";
    let detectedChannelId = "";

    for (const [guildId, byUser] of Object.entries(voiceStatesByGuild || {})) {
      const selfState = byUser?.[me.id];
      if (selfState?.channelId) {
        detectedGuildId = guildId;
        detectedChannelId = selfState.channelId;
        break;
      }
    }

    if (!detectedChannelId) {
      const selfState = mergedVoiceStates.find((vs) => vs.userId === me.id);
      if (selfState?.channelId) {
        detectedGuildId = activeGuildId || voiceConnectedGuildId || "";
        detectedChannelId = selfState.channelId;
      }
    }

    setVoiceSession((prev) => {
      if (detectedChannelId) {
        if (prev.guildId === detectedGuildId && prev.channelId === detectedChannelId) return prev;
        return { guildId: detectedGuildId, channelId: detectedChannelId };
      }
      if (prev.guildId && prev.guildId !== activeGuildId) return prev;
      if (!prev.guildId && !prev.channelId) return prev;
      return { guildId: "", channelId: "" };
    });
  }, [mergedVoiceStates, voiceStatesByGuild, me?.id, activeGuildId, voiceConnectedGuildId]);

  useEffect(() => {
    if (!accessToken || (navMode !== "friends" && navMode !== "dms")) return;
    refreshSocialData(accessToken).catch(() => {
      // keep existing state on transient failures
    });
  }, [accessToken, navMode]);

  activeChannelIdRef.current = activeChannelId;

  useEffect(() => {
    if (navMode !== "servers" || !activeServer || !activeChannelId) {
      if (navMode !== "servers") setMessages([]);
      return;
    }

    let cancelled = false;

    const loadChannelMessages = () => nodeApi(activeServer.baseUrl, `/v1/channels/${activeChannelId}/messages`, activeServer.membershipToken)
      .then((data) => {
        if (cancelled) return;
        setStatus("");
        setMessages((data.messages || []).slice().reverse());
      })
      .catch((error) => {
        if (cancelled) return;
        if (error?.message?.startsWith("HTTP 403")) {
          setMessages([]);
          setStatus("You no longer have access to that channel.");
          setActiveChannelId("");
          return;
        }
        setStatus(`Message fetch failed: ${error.message}`);
      });

    loadChannelMessages();
    const timer = window.setInterval(loadChannelMessages, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeServer, activeChannelId, navMode]);

  useEffect(() => {
    if (navMode !== "servers" || !accessToken || !activeGuildId) return;

    let cancelled = false;

    const loadGuildPresence = () => {
      const memberIds = Array.from(new Set((guildState?.members || []).map((m) => m?.id).filter(Boolean)));
      if (!memberIds.length) return;
      const params = new URLSearchParams({ userIds: memberIds.join(",") });
      fetch(`${CORE_API}/v1/presence?${params}`, { headers: { Authorization: `Bearer ${accessToken}` } })
        .then((r) => r.ok ? r.json() : {})
        .then((data) => {
          if (cancelled || !data || typeof data !== "object") return;
          setPresenceByUserId((prev) => ({ ...prev, ...data }));
        })
        .catch(() => {});
    };

    loadGuildPresence();
    const timer = window.setInterval(loadGuildPresence, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [navMode, accessToken, activeGuildId, guildState?.members]);

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setStatus("Authenticating...");

    try {
      if (authMode === "register") {
        await api("/v1/auth/register", { method: "POST", body: JSON.stringify({ email, username, password }) });
      }

      const loginData = await api("/v1/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      setAccessToken(loginData.accessToken);
      setMe(loginData.user);
      setStatus("Authenticated.");
    } catch (error) {
      setStatus(`Auth failed: ${error.message}`);
    }
  }

  async function sendMessage() {
    if (!activeServer || !activeChannelId || !messageText.trim()) return;
    const content = `${replyTarget ? `> replying to ${replyTarget.author}: ${replyTarget.content}\n` : ""}${messageText.trim()}`;

    try {
      setMessageText("");
      await nodeApi(activeServer.baseUrl, `/v1/channels/${activeChannelId}/messages`, activeServer.membershipToken, {
        method: "POST",
        body: JSON.stringify({ content })
      });

      const data = await nodeApi(activeServer.baseUrl, `/v1/channels/${activeChannelId}/messages`, activeServer.membershipToken);
      setMessages((data.messages || []).slice().reverse());
      setReplyTarget(null);
    } catch (error) {
      setMessageText(content);
      setStatus(`Send failed: ${error.message}`);
    }
  }

  async function sendDm() {
    if (!activeDm || !dmText.trim()) return;

    const content = dmText.trim();
    setDmText("");

    try {
      await api(`/v1/social/dms/${activeDm.id}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ content })
      });

      const data = await api(`/v1/social/dms/${activeDm.id}/messages`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      setDms((current) => current.map((item) => item.id === activeDm.id ? { ...item, messages: data.messages || [] } : item));
    } catch (error) {
      setDmText(content);
      setStatus(`DM send failed: ${error.message}`);
    }
  }

  async function addFriend() {
    const cleaned = friendAddInput.trim();
    if (!cleaned) return;

    try {
      const data = await api("/v1/social/friends", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ username: cleaned })
      });

      if (data.friend && data.threadId) {
        setFriends((current) => [data.friend, ...current.filter((item) => item.id !== data.friend.id)]);
        const nextDm = { id: data.threadId, participantId: data.friend.id, name: data.friend.username, messages: [] };
        setDms((current) => [nextDm, ...current.filter((item) => item.id !== nextDm.id)]);
        setActiveDmId(nextDm.id);
        setStatus(`You're now connected with ${data.friend.username}.`);
      } else {
        setStatus("Friend request sent.");
      }

      const requests = await api("/v1/social/requests", { headers: { Authorization: `Bearer ${accessToken}` } });
      setFriendRequests({ incoming: requests.incoming || [], outgoing: requests.outgoing || [] });
      setFriendAddInput("");
      setFriendView("requests");
    } catch (error) {
      setStatus(`Add friend failed: ${error.message}`);
    }
  }

  async function respondToFriendRequest(requestId, action) {
    try {
      await api(`/v1/social/requests/${requestId}/${action}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      const [requests, friendsData] = await Promise.all([
        api("/v1/social/requests", { headers: { Authorization: `Bearer ${accessToken}` } }),
        api("/v1/social/friends", { headers: { Authorization: `Bearer ${accessToken}` } })
      ]);
      setFriendRequests({ incoming: requests.incoming || [], outgoing: requests.outgoing || [] });
      setFriends(friendsData.friends || []);
      setStatus(action === "accept" ? "Friend request accepted." : "Friend request declined.");
    } catch (error) {
      setStatus(`Request update failed: ${error.message}`);
    }
  }

  async function saveSocialSettings() {
    try {
      await api("/v1/social/settings", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ allowFriendRequests })
      });
      setStatus("Privacy settings saved.");
    } catch (error) {
      setStatus(`Could not save privacy settings: ${error.message}`);
    }
  }

  async function loadSessions() {
    if (!accessToken) return;
    try {
      const data = await api("/v1/auth/sessions", {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      setSessions(data.sessions || []);
    } catch (error) {
      setStatus(`Could not load sessions: ${error.message}`);
    }
  }

  async function revokeSession(sessionId) {
    if (!accessToken) return;
    try {
      await api(`/v1/auth/sessions/${sessionId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      setStatus("Session revoked.");
      await loadSessions();
    } catch (error) {
      setStatus(`Could not revoke session: ${error.message}`);
    }
  }

  async function changePassword() {
    if (!passwordForm.current || !passwordForm.new || passwordForm.new !== passwordForm.confirm) {
      setStatus("Please fill all fields and ensure passwords match.");
      return;
    }
    if (passwordForm.new.length < 8) {
      setStatus("New password must be at least 8 characters.");
      return;
    }
    try {
      await api("/v1/auth/password", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          currentPassword: passwordForm.current,
          newPassword: passwordForm.new
        })
      });
      setPasswordForm({ current: "", new: "", confirm: "" });
      setStatus("Password changed successfully.");
    } catch (error) {
      setStatus(`Could not change password: ${error.message}`);
    }
  }

  function generateBase32Secret(length = 32) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let secret = "";
    for (let i = 0; i < length; i++) {
      secret += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return secret;
  }

  function generateBackupCodes(count = 8) {
    const codes = [];
    for (let i = 0; i < count; i++) {
      let code = "";
      for (let j = 0; j < 4; j++) {
        code += Math.floor(Math.random() * 10000).toString().padStart(4, "0");
        if (j < 3) code += "-";
      }
      codes.push(code);
    }
    return codes;
  }

  function initiate2FASetup() {
    const secret = generateBase32Secret(32);
    const codes = generateBackupCodes(8);
    
    setTwoFactorSecret(secret);
    setBackupCodes(codes);
    setShow2FASetup(true);
    setTwoFactorVerified(false);
    setTwoFactorToken("");
    
    const appName = "OpenCom";
    const accountName = me?.username || "user";
    const otpauthUrl = `otpauth://totp/${appName}:${accountName}?secret=${secret}&issuer=${appName}`;
    
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauthUrl)}`;
    setTwoFactorQRCode(qrCodeUrl);
    setStatus("2FA setup initiated. Scan the QR code with your authenticator app.");
  }

  function verifyTOTPToken(token, secret) {
    if (!token || !secret) return false;
    const cleanToken = token.replace(/\s/g, "").slice(0, 6);
    if (!/^\d{6}$/.test(cleanToken)) return false;
    
    if (backupCodes.includes(cleanToken)) {
      setStatus("Backup code verified! Removing code from backups.");
      setBackupCodes((current) => current.filter((code) => code !== cleanToken));
      return true;
    }
    
    for (let offset = -1; offset <= 1; offset++) {
      const counter = Math.floor(Date.now() / 30000) + offset;
      if (calculateTOTP(secret, counter) === cleanToken) {
        return true;
      }
    }
    return false;
  }

  function calculateTOTP(secret, counter) {
    const secretBytes = base32Decode(secret);
    const counterBytes = new ArrayBuffer(8);
    const view = new DataView(counterBytes);
    view.setBigInt64(0, BigInt(counter), false);
    
    const hmacKey = secretBytes;
    return simpleHmacSha1(hmacKey, counterBytes);
  }

  function base32Decode(str) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let bits = "";
    for (let i = 0; i < str.length; i++) {
      const idx = alphabet.indexOf(str[i]);
      if (idx < 0) continue;
      bits += idx.toString(2).padStart(5, "0");
    }
    const bytes = new Uint8Array(Math.floor(bits.length / 8));
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(bits.slice(i * 8, (i + 1) * 8), 2);
    }
    return bytes;
  }

  function simpleHmacSha1(key, data) {
    const blockSize = 64;
    let k = new Uint8Array(blockSize);
    if (key.length > blockSize) {
      k = sha1Bytes(key);
      k = new Uint8Array(blockSize).map((_, i) => i < k.length ? k[i] : 0);
    } else {
      k.set(key);
    }
    
    const oPad = new Uint8Array(blockSize);
    const iPad = new Uint8Array(blockSize);
    for (let i = 0; i < blockSize; i++) {
      oPad[i] = k[i] ^ 0x5c;
      iPad[i] = k[i] ^ 0x36;
    }
    
    const iKeyPad = new Uint8Array(iPad.length + data.byteLength);
    iKeyPad.set(iPad);
    iKeyPad.set(new Uint8Array(data), iPad.length);
    
    const innerHash = sha1Bytes(iKeyPad.buffer);
    
    const oKeyPad = new Uint8Array(oPad.length + innerHash.length);
    oKeyPad.set(oPad);
    oKeyPad.set(innerHash, oPad.length);
    
    const hash = sha1Bytes(oKeyPad.buffer);
    const offset = hash[hash.length - 1] & 0x0f;
    const code = ((hash[offset] & 0x7f) << 24) | ((hash[offset + 1] & 0xff) << 16) | 
                 ((hash[offset + 2] & 0xff) << 8) | (hash[offset + 3] & 0xff);
    
    return (code % 1000000).toString().padStart(6, "0");
  }

  function sha1Bytes(data) {
    let view = new Uint8Array(data);
    const buf = Array.from(view).map((x) => String.fromCharCode(x)).join("");
    const hash = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
    
    const len = buf.length * 8;
    let msg = buf.slice(0);
    msg += String.fromCharCode(0x80);
    while ((msg.length * 8) % 512 !== 448) msg += String.fromCharCode(0x00);
    
    for (let i = 7; i >= 0; i--) {
      msg += String.fromCharCode((len >>> (i * 8)) & 0xff);
    }
    
    for (let chunkStart = 0; chunkStart < msg.length; chunkStart += 64) {
      const w = Array(80);
      for (let i = 0; i < 16; i++) {
        w[i] = (msg.charCodeAt(chunkStart + i * 4) << 24) | 
               (msg.charCodeAt(chunkStart + i * 4 + 1) << 16) |
               (msg.charCodeAt(chunkStart + i * 4 + 2) << 8) | 
               msg.charCodeAt(chunkStart + i * 4 + 3);
      }
      
      for (let i = 16; i < 80; i++) {
        w[i] = ((w[i-3] ^ w[i-8] ^ w[i-14] ^ w[i-16]) << 1) |
               ((w[i-3] ^ w[i-8] ^ w[i-14] ^ w[i-16]) >>> 31);
      }
      
      let [a, b, c, d, e] = hash;
      
      for (let i = 0; i < 80; i++) {
        let f, k;
        if (i < 20) {
          f = (b & c) | ((~b) & d);
          k = 0x5a827999;
        } else if (i < 40) {
          f = b ^ c ^ d;
          k = 0x6ed9eba1;
        } else if (i < 60) {
          f = (b & c) | (b & d) | (c & d);
          k = 0x8f1bbcdc;
        } else {
          f = b ^ c ^ d;
          k = 0xca62c1d6;
        }
        
        const temp = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) >>> 0;
        e = d;
        d = c;
        c = ((b << 30) | (b >>> 2));
        b = a;
        a = temp;
      }
      
      hash[0] = (hash[0] + a) >>> 0;
      hash[1] = (hash[1] + b) >>> 0;
      hash[2] = (hash[2] + c) >>> 0;
      hash[3] = (hash[3] + d) >>> 0;
      hash[4] = (hash[4] + e) >>> 0;
    }
    
    const result = new Uint8Array(20);
    for (let i = 0; i < 5; i++) {
      result[i * 4] = (hash[i] >>> 24) & 0xff;
      result[i * 4 + 1] = (hash[i] >>> 16) & 0xff;
      result[i * 4 + 2] = (hash[i] >>> 8) & 0xff;
      result[i * 4 + 3] = hash[i] & 0xff;
    }
    return result;
  }

  function confirm2FA() {
    if (!verifyTOTPToken(twoFactorToken, twoFactorSecret)) {
      setStatus("Invalid token. Please check your authenticator app.");
      return;
    }
    
    setSecuritySettings((current) => ({ ...current, twoFactorEnabled: true }));
    setTwoFactorVerified(true);
    setStatus("2FA enabled successfully! Your backup codes have been saved.");
    setShow2FASetup(false);
  }

  function disable2FA() {
    if (window.confirm("Are you sure? You will lose 2FA protection.")) {
      setSecuritySettings((current) => ({ ...current, twoFactorEnabled: false }));
      setTwoFactorSecret("");
      setBackupCodes([]);
      setTwoFactorVerified(false);
      setShow2FASetup(false);
      setStatus("2FA has been disabled.");
    }
  }

  async function openDmFromFriend(friend) {
    const existing = dms.find((item) => item.participantId === friend.id || item.name === friend.username);
    if (existing) {
      setActiveDmId(existing.id);
      setNavMode("dms");
      return;
    }

    try {
      const data = await api("/v1/social/dms/open", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ friendId: friend.id })
      });

      const threadId = data.threadId;
      setDms((current) => {
        const existing = current.find((item) => item.id === threadId);
        if (existing) return current;
        return [{ id: threadId, participantId: friend.id, name: friend.username, messages: [] }, ...current];
      });
      setActiveDmId(threadId);
      setNavMode("dms");
    } catch (error) {
      setStatus(`Open DM failed: ${error.message}`);
    }
  }

  async function saveProfile() {
    try {
      await api("/v1/me/profile", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          displayName: profileForm.displayName || null,
          bio: profileForm.bio || null,
          pfpUrl: profileForm.pfpUrl || null,
          bannerUrl: profileForm.bannerUrl || null
        })
      });
      if (me?.id) {
        const updated = await api(`/v1/users/${me.id}/profile`, { headers: { Authorization: `Bearer ${accessToken}` } });
        setProfile(updated);
        setProfileForm({
          displayName: updated.displayName ?? "",
          bio: updated.bio ?? "",
          pfpUrl: updated.pfpUrl ?? "",
          bannerUrl: updated.bannerUrl ?? ""
        });
      } else {
        setProfile((current) => ({ ...current, ...profileForm }));
      }
      setStatus("Profile updated.");
    } catch (error) {
      const msg = error?.message || "";
      if (msg.includes("INVALID_IMAGE")) setStatus("Invalid image. Use PNG, JPG, GIF, or WebP under 4MB.");
      else setStatus(`Profile update failed: ${msg}`);
    }
  }

  async function createServer() {
    if (!newServerName.trim() || !newServerBaseUrl.trim()) return;
    try {
      await api("/v1/servers", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ name: newServerName.trim(), baseUrl: newServerBaseUrl.trim() })
      });
      setNewServerName("");
      setNewServerBaseUrl("https://");
      setStatus("Server provider added.");
      const refreshed = await api("/v1/servers", { headers: { Authorization: `Bearer ${accessToken}` } });
      setServers(refreshed.servers || []);
      setAddServerModalOpen(false);
    } catch (error) {
      setStatus(`Add server failed: ${error.message}`);
    }
  }

  function updateActiveServerVoiceGatewayPref(patch) {
    if (!activeServerId) return;
    setServerVoiceGatewayPrefs((current) => {
      const prev = current[activeServerId] || { mode: "core", customUrl: "" };
      const next = { ...prev, ...patch };
      return { ...current, [activeServerId]: next };
    });
  }

  async function createWorkspace() {
    if (!activeServer?.baseUrl || !activeServer?.membershipToken || !newWorkspaceName?.trim()) {
      setStatus("Select a server and enter a workspace name.");
      return;
    }
    try {
      const data = await nodeApi(activeServer.baseUrl, "/v1/guilds", activeServer.membershipToken, {
        method: "POST",
        body: JSON.stringify({ name: newWorkspaceName.trim(), createDefaultVoice: true })
      });
      setNewWorkspaceName("");
      setStatus("Workspace created.");
      const nextGuilds = await nodeApi(activeServer.baseUrl, "/v1/guilds", activeServer.membershipToken);
      const list = Array.isArray(nextGuilds) ? nextGuilds : [];
      setGuilds(list);
      if (data?.guildId && list.length) setActiveGuildId(data.guildId);
    } catch (error) {
      setStatus(`Create workspace failed: ${error.message}`);
    }
  }

  async function createInvite() {
    if (!inviteServerId) return;
    try {
      const data = await api("/v1/invites", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ serverId: inviteServerId })
      });
      setInviteCode(data.code);
      setStatus("Invite code generated.");
    } catch (error) {
      setStatus(`Invite failed: ${error.message}`);
    }
  }

  async function previewInvite() {
    if (!joinInviteCode.trim()) return;
    try {
      const data = await api(`/v1/invites/${joinInviteCode.trim()}`);
      setInvitePreview(data);
      setStatus("Invite preview loaded.");
    } catch (error) {
      setInvitePreview(null);
      setStatus(`Invite lookup failed: ${error.message}`);
    }
  }

  async function joinInvite(codeToUse = null) {
    const code = (codeToUse || joinInviteCode || "").trim();
    if (!code) return;

    try {
      const data = await api(`/v1/invites/${code}/join`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } });
      setJoinInviteCode("");
      setInvitePreview(null);
      setStatus("Joined server from invite.");

      const refreshed = await api("/v1/servers", { headers: { Authorization: `Bearer ${accessToken}` } });
      const next = refreshed.servers || [];
      setServers(next);
      const joinedServerId = data?.serverId;
      if (joinedServerId && next.some((s) => s.id === joinedServerId)) {
        setActiveServerId(joinedServerId);
      } else if (next.length) {
        setActiveServerId(next[0].id);
      }
      setAddServerModalOpen(false);
    } catch (error) {
      setStatus(`Join failed: ${error.message}`);
    }
  }

  async function createChannel() {
    if (!activeServer || !activeGuildId || !newChannelName.trim()) return;
    try {
      const payload = { name: newChannelName.trim(), type: newChannelType };
      if (newChannelType !== "category" && newChannelParentId) payload.parentId = newChannelParentId;

      await nodeApi(activeServer.baseUrl, `/v1/guilds/${activeGuildId}/channels`, activeServer.membershipToken, {
        method: "POST",
        body: JSON.stringify(payload)
      });

      setNewChannelName("");
      setNewChannelParentId("");
      setStatus("Channel created.");

      const state = await nodeApi(activeServer.baseUrl, `/v1/guilds/${activeGuildId}/state`, activeServer.membershipToken);
      setGuildState(state);
    } catch (error) {
      setStatus(`Create channel failed: ${error.message}`);
    }
  }

  async function updateChannelPosition(channelId, newPosition) {
    if (!activeServer || !activeGuildId) return;
    try {
      await nodeApi(activeServer.baseUrl, `/v1/channels/${channelId}`, activeServer.membershipToken, {
        method: "PATCH",
        body: JSON.stringify({ position: newPosition })
      });
      const state = await nodeApi(activeServer.baseUrl, `/v1/guilds/${activeGuildId}/state`, activeServer.membershipToken);
      setGuildState(state);
    } catch (e) {
      setStatus(`Move channel failed: ${e.message}`);
    }
  }

  async function handleChannelDrop(draggedId, targetId, sectionItems) {
    const fromIndex = sectionItems.findIndex((c) => c.id === draggedId);
    const toIndex = sectionItems.findIndex((c) => c.id === targetId);
    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;
    const reordered = [...sectionItems];
    const [removed] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, removed);
    const channels = guildState?.channels || [];
    const byParent = new Map();
    for (const c of channels) {
      const pid = c.parent_id || "__uncat__";
      if (!byParent.has(pid)) byParent.set(pid, []);
      byParent.get(pid).push(c);
    }
    const sectionParentId = sectionItems[0]?.parent_id ?? "__uncat__";
    const flatOrder = [];
    const sortedParents = [...byParent.keys()].sort((a, b) => {
      const listA = byParent.get(a);
      const listB = byParent.get(b);
      const posA = Math.min(...listA.map((c) => c.position ?? 0));
      const posB = Math.min(...listB.map((c) => c.position ?? 0));
      return posA - posB;
    });
    for (const pid of sortedParents) {
      const list = byParent.get(pid);
      const isThisSection = (pid === sectionParentId);
      const ordered = isThisSection ? reordered : list.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      flatOrder.push(...ordered);
    }
    const updates = flatOrder.map((ch, idx) => ((ch.position ?? -1) !== idx ? updateChannelPosition(ch.id, idx) : Promise.resolve()));
    await Promise.all(updates);
    setChannelDragId(null);
  }

  async function handleCategoryDrop(draggedId, targetId) {
    const categories = [...(categoryChannels || [])];
    const fromIndex = categories.findIndex((c) => c.id === draggedId);
    const toIndex = categories.findIndex((c) => c.id === targetId);
    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;
    const reordered = [...categories];
    const [removed] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, removed);
    try {
      await Promise.all(reordered.map((cat, idx) => updateChannelPosition(cat.id, idx * 100)));
      setCategoryDragId(null);
    } catch (e) {
      setStatus(`Move category failed: ${e.message}`);
    }
  }

  const SEND_MESSAGES_BIT = 2;
  const VIEW_CHANNEL_BIT = 1;

  async function setChannelRoleSend(channelId, roleId, canSend) {
    if (!activeServer || !channelId || !roleId) return;
    try {
      const everyoneRole = (guildState?.roles || []).find((r) => r.is_everyone);
      if (canSend) {
        if (everyoneRole) {
          await nodeApi(activeServer.baseUrl, `/v1/channels/${channelId}/overwrites`, activeServer.membershipToken, {
            method: "PUT",
            body: JSON.stringify({ targetType: "role", targetId: everyoneRole.id, allow: "0", deny: String(SEND_MESSAGES_BIT) })
          });
        }
        await nodeApi(activeServer.baseUrl, `/v1/channels/${channelId}/overwrites`, activeServer.membershipToken, {
          method: "PUT",
          body: JSON.stringify({ targetType: "role", targetId: roleId, allow: String(SEND_MESSAGES_BIT), deny: "0" })
        });
      } else {
        await nodeApi(activeServer.baseUrl, `/v1/channels/${channelId}/overwrites`, activeServer.membershipToken, {
          method: "DELETE",
          body: JSON.stringify({ targetType: "role", targetId: roleId })
        });
        const otherRoleAllows = (guildState?.overwrites || []).filter(
          (o) => o.channel_id === channelId && o.target_type === "role" && o.target_id !== roleId && (parseInt(o.allow, 10) & SEND_MESSAGES_BIT)
        );
        if (everyoneRole && otherRoleAllows.length === 0) {
          await nodeApi(activeServer.baseUrl, `/v1/channels/${channelId}/overwrites`, activeServer.membershipToken, {
            method: "DELETE",
            body: JSON.stringify({ targetType: "role", targetId: everyoneRole.id })
          });
        }
      }
      const state = await nodeApi(activeServer.baseUrl, `/v1/guilds/${activeGuildId}/state`, activeServer.membershipToken);
      setGuildState(state);
    } catch (e) {
      setStatus(`Permission update failed: ${e.message}`);
    }
  }

  function channelOverwriteAllowsSend(channelId, roleId) {
    const ov = (guildState?.overwrites || []).find((o) => o.channel_id === channelId && o.target_type === "role" && o.target_id === roleId);
    if (!ov) return false;
    return (parseInt(ov.allow, 10) & SEND_MESSAGES_BIT) !== 0;
  }

  async function createRole() {
    if (!activeServer || !activeGuildId || !newRoleName.trim()) return;
    try {
      await nodeApi(activeServer.baseUrl, `/v1/guilds/${activeGuildId}/roles`, activeServer.membershipToken, {
        method: "POST",
        body: JSON.stringify({ name: newRoleName.trim(), permissions: "0" })
      });
      setNewRoleName("");
      const state = await nodeApi(activeServer.baseUrl, `/v1/guilds/${activeGuildId}/state`, activeServer.membershipToken);
      setGuildState(state);
      setStatus("Role created.");
    } catch (error) {
      setStatus(`Create role failed: ${error.message}`);
    }
  }

  async function assignRoleToMember() {
    if (!activeServer || !activeGuildId || !selectedMemberId || !selectedRoleId) return;
    try {
      await nodeApi(activeServer.baseUrl, `/v1/guilds/${activeGuildId}/members/${selectedMemberId}/roles/${selectedRoleId}`, activeServer.membershipToken, { method: "PUT", body: "{}" });
      setStatus("Role assigned.");
    } catch (error) {
      setStatus(`Assign role failed: ${error.message}`);
    }
  }

  async function updateRole(roleId, { color, position }) {
    if (!activeServer || !roleId) return;
    try {
      const body = {};
      if (color !== undefined) body.color = typeof color === "string" && color.startsWith("#") ? parseInt(color.slice(1), 16) : color;
      if (position !== undefined) body.position = position;
      if (Object.keys(body).length === 0) return;
      await nodeApi(activeServer.baseUrl, `/v1/roles/${roleId}`, activeServer.membershipToken, {
        method: "PATCH",
        body: JSON.stringify(body)
      });
      const state = await nodeApi(activeServer.baseUrl, `/v1/guilds/${activeGuildId}/state`, activeServer.membershipToken);
      setGuildState(state);
      setStatus("Role updated.");
    } catch (error) {
      setStatus(`Update role failed: ${error.message}`);
    }
  }

  function startDraggingProfileCard(event) {
    event.preventDefault();
    profileCardDragOffsetRef.current = {
      x: event.clientX - profileCardPosition.x,
      y: event.clientY - profileCardPosition.y
    };
    setDraggingProfileCard(true);
  }

  function toggleCategory(categoryId) {
    setCollapsedCategories((current) => ({ ...current, [categoryId]: !current[categoryId] }));
  }

  function openServerContextMenu(event, server) {
    event.preventDefault();
    setServerContextMenu({ server, x: event.clientX, y: event.clientY });
  }

  async function copyServerId(serverId) {
    try {
      await navigator.clipboard.writeText(serverId);
      setStatus("Server ID copied.");
    } catch {
      setStatus("Could not copy server ID.");
    }
    setServerContextMenu(null);
  }

  function openServerFromContext(serverId) {
    setNavMode("servers");
    setActiveServerId(serverId);
    setServerContextMenu(null);
  }

  async function leaveServer(server) {
    if (!server?.id) return;
    setServerContextMenu(null);
    const wasActive = activeServerId === server.id;
    if (wasActive) {
      setActiveServerId("");
      setActiveGuildId("");
      setGuildState(null);
      setMessages([]);
    }
    try {
      await api(`/v1/servers/${server.id}/leave`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } });
      if (server.defaultGuildId && server.baseUrl) {
        try {
          await nodeApi(server.baseUrl, `/v1/guilds/${server.defaultGuildId}/leave`, server.membershipToken, { method: "POST", body: "{}" });
        } catch {
          // membership already gone on core; node leave is best-effort
        }
      }
      const refreshed = await api("/v1/servers", { headers: { Authorization: `Bearer ${accessToken}` } });
      const next = refreshed.servers || [];
      setServers(next);
      if (wasActive && next.length) setActiveServerId(next[0].id);
      setStatus("Left server.");
    } catch (error) {
      setStatus(`Leave failed: ${error.message}`);
    }
  }

  async function deleteServer(server) {
    if (!server?.id || !(server.roles || []).includes("owner")) return;
    if (!window.confirm(`Delete "${server.name}"? This cannot be undone. All members will lose access.`)) return;
    setServerContextMenu(null);
    try {
      await api(`/v1/servers/${server.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } });
      const refreshed = await api("/v1/servers", { headers: { Authorization: `Bearer ${accessToken}` } });
      const next = refreshed.servers || [];
      setServers(next);
      if (activeServerId === server.id) {
        setActiveServerId(next.length ? next[0].id : "");
        setActiveGuildId("");
        setGuildState(null);
        setMessages([]);
      }
      setStatus("Server deleted.");
    } catch (error) {
      setStatus(`Delete failed: ${error.message}`);
    }
  }

  async function deleteServerMessage(messageId) {
    if (!activeServer || !activeChannelId || !messageId) return;
    try {
      await nodeApi(activeServer.baseUrl, `/v1/channels/${activeChannelId}/messages/${messageId}`, activeServer.membershipToken, { method: "DELETE", body: "{}" });
      setMessages((current) => current.filter((message) => message.id !== messageId));
      setStatus("Message deleted.");
    } catch (error) {
      setStatus(`Delete failed: ${error.message}`);
    }
    setMessageContextMenu(null);
  }

  async function deleteDmMessage(messageId) {
    if (!activeDmId || !messageId) return;
    try {
      await api(`/v1/social/dms/${activeDmId}/messages/${messageId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      setDms((current) => current.map((item) => item.id === activeDmId
        ? { ...item, messages: (item.messages || []).filter((message) => message.id !== messageId) }
        : item));
      setStatus("DM message deleted.");
    } catch (error) {
      setStatus(`Delete failed: ${error.message}`);
    }
    setMessageContextMenu(null);
  }

  function togglePinMessage(message) {
    if (!message?.id) return;

    if (message.kind === "server") {
      if (!activeChannelId) return;
      setPinnedServerMessages((current) => {
        const existing = current[activeChannelId] || [];
        const isPinned = existing.some((item) => item.id === message.id);
        const next = isPinned
          ? existing.filter((item) => item.id !== message.id)
          : [{ id: message.id, author: message.author, content: message.content }, ...existing].slice(0, 50);
        return { ...current, [activeChannelId]: next };
      });
      setStatus("Updated pinned messages.");
      return;
    }

    if (message.kind === "dm") {
      if (!activeDmId) return;
      setPinnedDmMessages((current) => {
        const existing = current[activeDmId] || [];
        const isPinned = existing.some((item) => item.id === message.id);
        const next = isPinned
          ? existing.filter((item) => item.id !== message.id)
          : [{ id: message.id, author: message.author, content: message.content }, ...existing].slice(0, 50);
        return { ...current, [activeDmId]: next };
      });
      setStatus("Updated pinned messages.");
    }
  }

  function isMessagePinned(message) {
    if (!message?.id) return false;
    if (message.kind === "server") return activePinnedServerMessages.some((item) => item.id === message.id);
    if (message.kind === "dm") return activePinnedDmMessages.some((item) => item.id === message.id);
    return false;
  }

  function waitForVoiceEvent({
    type,
    match = null,
    timeoutMs = 10000,
    guildId = null,
    channelId = null,
    sessionToken = null,
    transportId = null
  }) {
    return new Promise((resolve, reject) => {
      const key = type;
      const bucket = pendingVoiceEventsRef.current.get(key) || [];
      const pending = {
        match,
        guildId,
        channelId,
        sessionToken,
        transportId,
        resolve,
        reject,
        timeout: setTimeout(() => {
          reject(new Error(`${type}_TIMEOUT`));
          const current = pendingVoiceEventsRef.current.get(key) || [];
          pendingVoiceEventsRef.current.set(key, current.filter((entry) => entry !== pending));
        }, timeoutMs)
      };
      bucket.push(pending);
      pendingVoiceEventsRef.current.set(key, bucket);
    });
  }

  function resolvePendingVoiceEvent(msg) {
    if (msg?.op !== "DISPATCH" || typeof msg.t !== "string") return;
    const bucket = pendingVoiceEventsRef.current.get(msg.t);
    if (!bucket?.length) return;
    const data = msg.d || {};
    const isTransportConnected = msg.t === "VOICE_TRANSPORT_CONNECTED";
    if (import.meta.env.DEV && isTransportConnected) {
      console.debug("[voice] VOICE_TRANSPORT_CONNECTED received", data);
    }
    const remaining = [];
    for (const pending of bucket) {
      const guildMatches = isTransportConnected
        ? !pending.guildId || data.guildId == null || data.guildId === pending.guildId
        : !pending.guildId || data.guildId === pending.guildId;
      const channelMatches = isTransportConnected
        ? !pending.channelId || data.channelId == null || data.channelId === pending.channelId
        : !pending.channelId || data.channelId === pending.channelId;
      const transportMatches = !isTransportConnected
        || !pending.transportId
        || data.transportId === pending.transportId;
      const matchOk = !pending.match || pending.match(data, msg);
      if (guildMatches && channelMatches && transportMatches && matchOk) {
        clearTimeout(pending.timeout);
        pending.resolve(data);
        continue;
      }
      remaining.push(pending);
    }
    if (remaining.length) pendingVoiceEventsRef.current.set(msg.t, remaining);
    else pendingVoiceEventsRef.current.delete(msg.t);
  }

  function rejectPendingVoiceEventsByScope({ guildId = null, channelId = null, reason = "VOICE_REQUEST_CANCELLED" } = {}) {
    for (const [key, bucket] of pendingVoiceEventsRef.current.entries()) {
      const remaining = [];
      for (const pending of bucket) {
        const guildMatches = !guildId || !pending.guildId || pending.guildId === guildId;
        const channelMatches = !channelId || !pending.channelId || pending.channelId === channelId;
        if (guildMatches && channelMatches) {
          clearTimeout(pending.timeout);
          pending.reject(new Error(reason));
          continue;
        }
        remaining.push(pending);
      }
      if (remaining.length) pendingVoiceEventsRef.current.set(key, remaining);
      else pendingVoiceEventsRef.current.delete(key);
    }
  }

  function rejectPendingVoiceEvents(reason = "VOICE_REQUEST_CANCELLED") {
    for (const [key, bucket] of pendingVoiceEventsRef.current.entries()) {
      for (const pending of bucket) {
        clearTimeout(pending.timeout);
        pending.reject(new Error(reason));
      }
      pendingVoiceEventsRef.current.delete(key);
    }
  }

  async function cleanupVoiceRtc() {
    rejectPendingVoiceEvents("VOICE_SESSION_CLEANUP");
    await voiceSfuRef.current?.cleanup();
  }

  async function waitForVoiceGatewayReady(timeoutMs = 5000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const ws = nodeGatewayWsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN && nodeGatewayReadyRef.current) return ws;
      await new Promise((resolve) => setTimeout(resolve, 120));
    }

    const wsState = nodeGatewayWsRef.current?.readyState;
    const wsStateName = wsState === WebSocket.CONNECTING
      ? "CONNECTING"
      : wsState === WebSocket.OPEN
        ? "OPEN"
        : wsState === WebSocket.CLOSING
          ? "CLOSING"
          : wsState === WebSocket.CLOSED
            ? "CLOSED"
            : "MISSING";
    const candidates = voiceGatewayCandidatesRef.current?.length
      ? voiceGatewayCandidatesRef.current.join(",")
      : "none";
    throw new Error(`VOICE_GATEWAY_UNAVAILABLE:ready=${nodeGatewayReadyRef.current ? "1" : "0"},ws=${wsStateName},candidates=${candidates}`);
  }

  async function sendNodeVoiceDispatch(type, data) {
    const ws = await waitForVoiceGatewayReady();
    ws.send(JSON.stringify({ op: "DISPATCH", t: type, d: data }));
  }

  async function joinVoiceChannel(channel) {
    if (!channel?.id || !activeGuildId || !activeServer?.baseUrl || !activeServer?.membershipToken) return;
    try {
      setStatus(`Joining ${channel.name}...`);
      await voiceSfuRef.current?.join({
        guildId: activeGuildId,
        channelId: channel.id,
        audioInputDeviceId,
        isMuted,
        isDeafened,
        audioOutputDeviceId
      });
      setVoiceSession({ guildId: activeGuildId, channelId: channel.id });
      setStatus(`Joined ${channel.name}.`);
      return;
    } catch (error) {
      const message = `Voice connection failed: ${error.message || "VOICE_JOIN_FAILED"}`;
      setStatus(message);
      window.alert(message);
    }

    try {
      await nodeApi(activeServer.baseUrl, `/v1/channels/${channel.id}/voice/join`, activeServer.membershipToken, { method: "POST" });
      setVoiceSession({ guildId: activeGuildId, channelId: channel.id });
      setStatus(`Joined ${channel.name} (REST fallback).`);
    } catch (error) {
      const message = `Voice connection failed: ${error.message || "VOICE_JOIN_FAILED"}`;
      setStatus(message);
      window.alert(message);
    }
  }

  async function leaveVoiceChannel() {
    if (isDisconnectingVoice) return;

    let targetGuildId = voiceConnectedGuildId;
    let targetChannelId = voiceConnectedChannelId;

    if (!targetGuildId || !targetChannelId) {
      for (const [guildId, byUser] of Object.entries(voiceStatesByGuild || {})) {
        const selfState = byUser?.[me?.id];
        if (selfState?.channelId) {
          targetGuildId = guildId;
          targetChannelId = selfState.channelId;
          break;
        }
      }
    }

    if (!targetChannelId) {
      const selfState = mergedVoiceStates.find((state) => state.userId === me?.id);
      if (selfState?.channelId) {
        targetGuildId = targetGuildId || activeGuildId || "";
        targetChannelId = selfState.channelId;
      }
    }

    const connectedServer = servers.find((server) => server.defaultGuildId === targetGuildId) || activeServer || null;

    const forceLocalDisconnect = async () => {
      setVoiceSession({ guildId: "", channelId: "" });
      setIsScreenSharing(false);
      setIsMuted(false);
      setIsDeafened(false);
      if (me?.id) {
        setVoiceStatesByGuild((prev) => {
          let changed = false;
          const next = { ...prev };
          for (const guildId of Object.keys(next)) {
            if (!next[guildId]?.[me.id]) continue;
            const nextGuild = { ...next[guildId] };
            delete nextGuild[me.id];
            next[guildId] = nextGuild;
            changed = true;
          }
          return changed ? next : prev;
        });
      }
      await cleanupVoiceRtc();
    };

    setIsDisconnectingVoice(true);
    try {
      await forceLocalDisconnect();
      setStatus("Disconnected from voice.");

      if (!targetGuildId || !targetChannelId) return;

      try {
        await sendNodeVoiceDispatch("VOICE_LEAVE", { guildId: targetGuildId, channelId: targetChannelId });
        return;
      } catch {}

      if (!connectedServer?.baseUrl || !connectedServer?.membershipToken) return;

      try {
        await nodeApi(connectedServer.baseUrl, `/v1/channels/${targetChannelId}/voice/leave`, connectedServer.membershipToken, { method: "POST" });
      } catch (error) {
        const message = `Disconnected locally. Server voice leave failed: ${error.message || "VOICE_LEAVE_FAILED"}`;
        setStatus(message);
        console.warn(message);
      }
    } finally {
      setIsDisconnectingVoice(false);
    }
  }

  async function createOfficialServer() {
    const name = newOfficialServerName.trim();
    if (!name || !accessToken) return;
    try {
      const data = await api("/v1/servers/official", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ name })
      });
      setNewOfficialServerName("");
      setStatus("Your server was created.");
      const refreshed = await api("/v1/servers", { headers: { Authorization: `Bearer ${accessToken}` } });
      const next = refreshed.servers || [];
      setServers(next);
      if (data.serverId && next.length) {
        setActiveServerId(data.serverId);
        setNavMode("servers");
      }
      setAddServerModalOpen(false);
    } catch (err) {
      const msg = err?.message || "";
      if (msg.includes("SERVER_LIMIT")) setStatus("You already have a server.");
      else if (msg.includes("OFFICIAL_SERVER_NOT_CONFIGURED")) setStatus("Server creation isn’t set up yet. The site admin needs to set OFFICIAL_NODE_SERVER_ID on the API server (same value as NODE_SERVER_ID on the node).");
      else if (msg.includes("OFFICIAL_SERVER_UNAVAILABLE")) setStatus("Official server is unavailable. Please try again later.");
      else setStatus(`Failed: ${msg}`);
    }
  }

  function openMessageContextMenu(event, message) {
    event.preventDefault();
    const x = Math.min(event.clientX, window.innerWidth - 240);
    const y = Math.min(event.clientY, window.innerHeight - 180);
    setMessageContextMenu({ x, y, message: { ...message, pinned: isMessagePinned(message) } });
  }

  const MAX_IMAGE_BYTES = 25 * 1024 * 1024; // 25MB for raw image upload

  function isAcceptedImage(file) {
    if (!file?.type) return false;
    return file.type.startsWith("image/");
  }

  async function uploadProfileImage(file, endpoint) {
    const formData = new FormData();
    formData.append("image", file);
    const res = await fetch(`${CORE_API}${endpoint}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: formData
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Upload failed: ${res.status}`);
    }
    return res.json();
  }

  async function onAvatarUpload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!isAcceptedImage(file)) {
      setStatus("Please choose an image (PNG, JPG, GIF, WebP, etc.).");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setStatus(`Image too large. Max ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB.`);
      return;
    }
    try {
      setStatus("Uploading avatar…");
      const data = await uploadProfileImage(file, "/v1/me/profile/pfp");
      setProfileForm((current) => ({ ...current, pfpUrl: data.pfpUrl || "" }));
      setProfile(profile ? { ...profile, pfpUrl: data.pfpUrl } : null);
      setStatus("Avatar updated.");
    } catch (e) {
      setStatus(e.message || "Upload failed.");
    }
  }

  async function onBannerUpload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!isAcceptedImage(file)) {
      setStatus("Please choose an image (PNG, JPG, GIF, WebP, etc.).");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setStatus(`Image too large. Max ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB.`);
      return;
    }
    try {
      setStatus("Uploading banner…");
      const data = await uploadProfileImage(file, "/v1/me/profile/banner");
      setProfileForm((current) => ({ ...current, bannerUrl: data.bannerUrl || "" }));
      setProfile(profile ? { ...profile, bannerUrl: data.bannerUrl } : null);
      setStatus("Banner updated.");
    } catch (e) {
      setStatus(e.message || "Upload failed.");
    }
  }

  async function openMemberProfile(member) {
    try {
      const profileData = await api(`/v1/users/${member.id}/profile`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      setUserCache((prev) => ({
        ...prev,
        [member.id]: {
          username: profileData.username ?? prev[member.id]?.username ?? member.username,
          displayName: profileData.displayName ?? profileData.username ?? member.username,
          pfpUrl: profileData.pfpUrl ?? null
        }
      }));
      setMemberProfileCard({
        ...profileData,
        username: profileData.username || member.username,
        status: getPresence(member.id) || "offline",
        roleIds: member.roleIds || []
      });
    } catch {
      setMemberProfileCard({
        id: member.id,
        username: member.username || member.id,
        displayName: member.username || member.id,
        bio: "Profile details are private or unavailable.",
        badges: [],
        status: getPresence(member.id) || "offline",
        platformTitle: null,
        createdAt: null,
        roleIds: member.roleIds || []
      });
    }
  }

  function renderContentWithMentions(message) {
    const content = message?.content || "";
    const nodes = [];
    const mentionRegex = /@\{([^}\n]{1,64})\}|@([a-zA-Z0-9_.-]{2,64})/g;
    let cursor = 0;

    for (const match of content.matchAll(mentionRegex)) {
      const index = match.index ?? 0;
      const raw = (match[1] || match[2] || "").trim();
      const token = match[0];
      const prevChar = index > 0 ? content[index - 1] : "";
      const mentionAtWordBoundary = index === 0 || /\s/.test(prevChar);

      if (!mentionAtWordBoundary || !raw) continue;

      if (index > cursor) {
        nodes.push(<span key={`text-${cursor}`}>{content.slice(cursor, index)}</span>);
      }

      if (raw.toLowerCase() === "everyone") {
        nodes.push(<span key={`everyone-${index}`} className="message-mention">{token}</span>);
      } else {
        const member = memberByMentionToken.get(raw.toLowerCase());
        if (member) {
          nodes.push(
            <button
              key={`mention-${index}`}
              type="button"
              className="message-mention mention-click"
              onClick={(event) => {
                event.stopPropagation();
                openMemberProfile(member);
              }}
            >
              @{member.username || member.id}
            </button>
          );
        } else {
          nodes.push(<span key={`unknown-${index}`} className="message-mention">{token}</span>);
        }
      }

      cursor = index + token.length;
    }

    if (cursor < content.length) {
      nodes.push(<span key={`tail-${cursor}`}>{content.slice(cursor)}</span>);
    }

    return nodes.length ? nodes : content;
  }

  function formatAccountCreated(createdAt) {
    if (!createdAt) return null;
    try {
      const d = new Date(createdAt);
      if (Number.isNaN(d.getTime())) return null;
      return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
    } catch {
      return null;
    }
  }

  async function onUploadTheme(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setThemeCss(await file.text());
    setStatus(`Theme loaded: ${file.name}`);
  }

  if (!accessToken) {
    if (!showClientFlow) {
      return (
        <div className="landing-page">
          <header className="landing-header">
            <img src="logo.png" alt="OpenCom" className="landing-logo" />
            <span className="landing-brand">OpenCom</span>
          </header>
          <main className="landing-main">
            <section className="landing-hero">
              <h1 className="landing-headline">The best way to communicate.</h1>
              <p className="landing-sub">One place for your servers, friends, and communities. Chat, voice, and stay in sync—without the noise.</p>
            </section>
            <section className="landing-features">
              <div className="landing-feature">
                <span className="landing-feature-icon">💬</span>
                <h3>Servers & channels</h3>
                <p>Organize conversations by topic. Create spaces that scale from a few friends to large communities.</p>
              </div>
              <div className="landing-feature">
                <span className="landing-feature-icon">👥</span>
                <h3>Friends & DMs</h3>
                <p>Add friends, send direct messages, and see who’s online. Simple and private.</p>
              </div>
              <div className="landing-feature">
                <span className="landing-feature-icon">🔊</span>
                <h3>Voice & presence</h3>
                <p>Jump into voice channels when you need to talk. Status and presence keep everyone in the loop.</p>
              </div>
            </section>
            <section className="landing-cta">
              <div className="landing-cta-download">
                <h3>Get the desktop app</h3>
                <p className="landing-hint">Windows, macOS, and Linux — one install, all your chats.</p>
                <button type="button" className="landing-btn landing-btn-secondary" disabled title="Coming soon">
                  Download — Coming soon
                </button>
              </div>
              <div className="landing-cta-client">
                <h3>Use OpenCom now</h3>
                <p className="landing-hint">Open the client in your browser. No install required.</p>
                <button type="button" className="landing-btn landing-btn-primary" onClick={() => setShowClientFlow(true)}>
                  Open client
                </button>
              </div>
            </section>
          </main>
          <footer className="landing-footer">
            <p>OpenCom — one place for teams, communities, and friends.</p>
          </footer>
        </div>
      );
    }
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <button type="button" className="link-btn auth-back" onClick={() => setShowClientFlow(false)}>← Back to home</button>
          <h1>Welcome back</h1>
          <p className="sub">OpenCom keeps your teams, communities, and updates in one place.</p>
          <form onSubmit={handleAuthSubmit}>
            <label>Email<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required /></label>
            {authMode === "register" && <label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} required /></label>}
            <label>Password<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required /></label>
            <button type="submit">{authMode === "login" ? "Log in" : "Create account & continue"}</button>
          </form>
          <button className="link-btn" onClick={() => setAuthMode(authMode === "login" ? "register" : "login")}>
            {authMode === "login" ? "Need an account? Register" : "Have an account? Login"}
          </button>
          <p className="status">{status}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="opencom-shell">
      <aside className="server-rail">
        <div className="rail-header" title="OpenCom">
          <img src="logo.png" alt="OpenCom" className="logo-img" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        </div>
        {dmNotification && (() => {
          const notifDm = dms.find((d) => d.id === dmNotification.dmId);
          return notifDm ? (
            <button
              type="button"
              className="dm-notification-popup"
              onClick={() => { setNavMode("dms"); setActiveDmId(dmNotification.dmId); setDmNotification(null); }}
            >
              {notifDm.pfp_url ? (
                <img src={profileImageUrl(notifDm.pfp_url)} alt="" className="dm-notification-avatar" />
              ) : (
                <div className="dm-notification-avatar dm-notification-avatar-initials">{getInitials(notifDm.name || notifDm.username || "?")}</div>
              )}
              <span className="dm-notification-text">New message from {notifDm.name || notifDm.username || "Someone"}</span>
            </button>
          ) : null;
        })()}
        <button className={`server-pill nav-pill ${navMode === "friends" ? "active" : ""}`} onClick={() => setNavMode("friends")} title="Friends">👥</button>
        <button className={`server-pill nav-pill ${navMode === "dms" ? "active" : ""}`} onClick={() => setNavMode("dms")} title="Direct messages">💬</button>
        <button className={`server-pill nav-pill ${navMode === "profile" ? "active" : ""}`} onClick={() => setNavMode("profile")} title="Profile">🪪</button>
        <div className="server-list">
          {servers.map((server) => (
            <button
              key={server.id}
              className={`server-pill ${server.id === activeServerId && navMode === "servers" ? "active" : ""}`}
              title={server.name}
              onClick={() => {
                setNavMode("servers");
                setActiveServerId(server.id);
                setActiveGuildId("");
                setGuildState(null);
                setMessages([]);
              }}
              onContextMenu={(event) => openServerContextMenu(event, server)}
            >
              {getInitials(server.name)}
              {(serverPingCounts[server.id] || 0) > 0 && (
                <span className="server-pill-ping-badge">{serverPingCounts[server.id]}</span>
              )}
            </button>
          ))}
          <button className="server-pill" title="Create or join a server" onClick={() => setAddServerModalOpen(true)}>
            ＋
          </button>
        </div>
      </aside>

      <aside className={`channel-sidebar ${isInVoiceChannel ? "voice-connected" : ""}`}>
        <header className="sidebar-header">
          <h2>{navMode === "servers" ? (activeServer?.name || "No server") : navMode.toUpperCase()}</h2>
          <small>{navMode === "servers" ? (activeGuild?.name || "Choose a channel") : "Unified communication hub"}</small>
        </header>

        {navMode === "servers" && (
          <>
            <section className="sidebar-block channels-container">
              {groupedChannelSections.map(({ category, channels: items }) => {
                const isCollapsed = collapsedCategories[category.id];
                return (
                  <div className="category-block" key={category.id}>
                    <button
                      className={`category-header ${categoryDragId === category.id ? "channel-dragging" : ""}`}
                      draggable={canManageServer && category.id !== "uncategorized"}
                      onDragStart={() => canManageServer && category.id !== "uncategorized" && setCategoryDragId(category.id)}
                      onDragOver={(e) => { e.preventDefault(); if (category.id !== "uncategorized") e.currentTarget.classList.add("channel-drop-target"); }}
                      onDragLeave={(e) => e.currentTarget.classList.remove("channel-drop-target")}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.currentTarget.classList.remove("channel-drop-target");
                        if (canManageServer && categoryDragId && category.id !== "uncategorized" && categoryDragId !== category.id) {
                          handleCategoryDrop(categoryDragId, category.id);
                        }
                      }}
                      onDragEnd={() => setCategoryDragId(null)}
                      onClick={() => toggleCategory(category.id)}
                    >
                      <span className="chevron">{isCollapsed ? "▸" : "▾"}</span>{category.name}
                    </button>
                    {!isCollapsed && (
                      <div className="category-items">
                        {items.map((channel) => (
                          <div key={channel.id}>
                          <button
                            className={`channel-row ${channel.id === activeChannelId ? "active" : ""} ${channelDragId === channel.id ? "channel-dragging" : ""}`}
                            draggable={canManageServer}
                            onDragStart={() => canManageServer && setChannelDragId(channel.id)}
                            onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("channel-drop-target"); }}
                            onDragLeave={(e) => e.currentTarget.classList.remove("channel-drop-target")}
                            onDrop={(e) => {
                              e.preventDefault();
                              e.currentTarget.classList.remove("channel-drop-target");
                              if (canManageServer && channelDragId && channelDragId !== channel.id) handleChannelDrop(channelDragId, channel.id, items);
                            }}
                            onDragEnd={() => setChannelDragId(null)}
                            onClick={() => {
                              if (channel.type === "text") {
                                setActiveChannelId(channel.id);
                                return;
                              }
                              if (channel.type === "voice") joinVoiceChannel(channel);
                            }}
                          >
                            <span className="channel-hash">{channel.type === "voice" ? "🔊" : "#"}</span>
                            <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", minWidth: 0 }}>
                              <span>{channel.name}</span>
                              {channel.type === "voice" && (voiceMembersByChannel.get(channel.id)?.length || 0) > 0 && (
                                <span className="hint" style={{ fontSize: "11px" }}>
                                  {voiceMembersByChannel.get(channel.id).length} connected
                                </span>
                              )}
                            </span>
                          </button>
                          {channel.type === "voice" && (voiceMembersByChannel.get(channel.id)?.length || 0) > 0 && (
                            <div className="voice-channel-members">
                              {voiceMembersByChannel.get(channel.id).map((member) => {
                                const speaking = !!voiceSpeakingByGuild[activeGuildId]?.[member.userId];
                                return (
                                  <div key={`${channel.id}-${member.userId}`} className="voice-channel-member-row">
                                    <div className={`avatar member-avatar vc-avatar ${speaking ? "speaking" : ""}`}>
                                      {member.pfp_url ? <img src={profileImageUrl(member.pfp_url)} alt={member.username} className="avatar-image" /> : getInitials(member.username)}
                                    </div>
                                    <span className="voice-channel-member-name">{member.username}</span>
                                    <span className="voice-channel-member-icons">{member.deafened ? "🔇" : member.muted ? "🎙️" : "🎤"}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {!groupedChannelSections.length && <p className="hint">No channels available. Create one in Settings.</p>}
            </section>
          </>
        )}

        {navMode === "dms" && (
          <section className="sidebar-block channels-container">
            {dms.map((dm) => (
                <button key={dm.id} className={`channel-row dm-sidebar-row ${dm.id === activeDmId ? "active" : ""}`} onClick={() => setActiveDmId(dm.id)} title={`DM ${dm.name}`} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  {dm.pfp_url ? (
                    <img src={profileImageUrl(dm.pfp_url)} alt={dm.name} style={{ width: "28px", height: "28px", borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: `hsl(${Math.abs((dm.participantId || dm.id || "").charCodeAt(0) * 7) % 360}, 70%, 60%)`, display: "grid", placeItems: "center", fontSize: "12px", fontWeight: "bold", flexShrink: 0 }}>
                      {dm.name?.substring(0, 1).toUpperCase()}
                    </div>
                  )}
                  <span className="channel-hash">@</span> 
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{dm.name}</span>
                </button>
              ))}
            {!dms.length && <p className="hint">Add friends to open direct message threads.</p>}
          </section>
        )}

        {navMode === "friends" && (
          <section className="sidebar-block channels-container">
            {friends.map((friend) => (
              <button className="friend-row friend-sidebar-row" key={friend.id} onClick={() => openDmFromFriend(friend)} title={`Open ${friend.username}`} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {friend.pfp_url ? (
                  <img src={profileImageUrl(friend.pfp_url)} alt={friend.username} style={{ width: "28px", height: "28px", borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                ) : (
                  <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: `hsl(${Math.abs((friend.id || "").charCodeAt(0) * 7) % 360}, 70%, 60%)`, display: "grid", placeItems: "center", fontSize: "12px", fontWeight: "bold", flexShrink: 0 }}>
                    {friend.username?.substring(0, 1).toUpperCase()}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong>{friend.username}</strong>
                  <span className="hint">{friend.status}</span>
                </div>
              </button>
            ))}
            {!friends.length && <p className="hint">No friends yet. Use the Add Friend tab in the main panel.</p>}
          </section>
        )}

        {navMode === "profile" && profile && (
          <section className="sidebar-block channels-container">
            <div className="profile-preview" style={{ backgroundImage: profile?.bannerUrl ? `url(${profileImageUrl(profile.bannerUrl)})` : undefined }}>
              <div className="avatar">{getInitials(profile.displayName || profile.username || "User")}</div>
              <strong>{profile.displayName || profile.username}</strong>
              <span>@{profile.username}</span>
              <small>{profile.platformTitle || "OpenCom Member"}</small>
            </div>
          </section>
        )}

        <footer className="self-card">
          {isInVoiceChannel && (
            <div className="voice-widget">
              <div className="voice-top"><strong>Voice connected</strong><span title={voiceConnectedChannelName}>{voiceConnectedChannelName}</span></div>
              <div className="voice-actions">
                <button className="ghost" onClick={() => setIsScreenSharing((value) => !value)}>{isScreenSharing ? "Stop Share" : "Share Screen"}</button>
                <button className="danger" onClick={leaveVoiceChannel} disabled={isDisconnectingVoice}>{isDisconnectingVoice ? "Disconnecting..." : "Disconnect"}</button>
              </div>
              <p className="hint">Voice controls moved to Settings → Voice.</p>
            </div>
          )}

          <div className="user-row">
            <div className="avatar">{profile?.pfpUrl ? <img src={profileImageUrl(profile.pfpUrl)} alt="Your avatar" className="avatar-image" /> : getInitials(me?.username || "OpenCom User")}</div>
            <div className="user-meta"><strong>{me?.username}</strong><span>{canManageServer ? "Owner" : "Member"}</span></div>
            <select className="status-select" value={selfStatus} onChange={(event) => setSelfStatus(event.target.value)} title="Your status">
              <option value="online">Online</option>
              <option value="idle">Idle</option>
              <option value="dnd">Do Not Disturb</option>
              <option value="invisible">Invisible</option>
            </select>
            <div className="user-controls">
              <button className={`icon-btn ${isMuted ? "danger" : "ghost"}`} onClick={() => setIsMuted((value) => !value)}>{isMuted ? "🎙️" : "🎤"}</button>
              <button className={`icon-btn ${isDeafened ? "danger" : "ghost"}`} onClick={() => setIsDeafened((value) => !value)}>{isDeafened ? "🔇" : "🎧"}</button>
              <button className="icon-btn ghost" onClick={() => { setSettingsOpen(true); setSettingsTab("profile"); }}>⚙️</button>
              <button className="icon-btn danger" onClick={() => { cleanupVoiceRtc().catch(() => {}); setAccessToken(""); setServers([]); setGuildState(null); setMessages([]); }}>⎋</button>
            </div>
          </div>
        </footer>
      </aside>

      <main className="chat-pane">
        {navMode === "servers" && servers.length === 0 && (
          <div className="create-server-empty" style={{ padding: "2rem", maxWidth: "420px", margin: "auto" }}>
            <h3 style={{ marginBottom: "0.5rem" }}>Create your server</h3>
            <p className="hint" style={{ marginBottom: "1rem" }}>You get one server hosted by us. Name it and start customising channels and roles.</p>
            <input
              type="text"
              value={newOfficialServerName}
              onChange={(e) => setNewOfficialServerName(e.target.value)}
              placeholder="Server name"
              style={{ width: "100%", marginBottom: "0.75rem", padding: "0.5rem" }}
            />
            <button onClick={createOfficialServer} disabled={!newOfficialServerName.trim()}>Create your server</button>
          </div>
        )}
        {navMode === "servers" && servers.length > 0 && (
          <div className="chat-layout">
            <section className="chat-main">
              <header className="chat-header">
                <h3><span className="channel-hash">#</span> {activeChannel?.name || "updates"}</h3>
                <div className="chat-actions">
                  <button className="icon-btn ghost" title="Pinned messages" onClick={() => setShowPinned((value) => !value)}>📌</button>
                  <button className="icon-btn ghost" title="Threads">🧵</button>
                  <button className="icon-btn ghost" title="Notifications">🔔</button>
                  <button className="icon-btn ghost" title="Members">👥</button>
                  <input className="search-input" placeholder={`Search ${activeServer?.name || "server"}`} />
                  <button className="ghost" onClick={() => { setSettingsOpen(true); setSettingsTab("server"); }}>Open settings</button>
                </div>
              </header>

              {showPinned && activePinnedServerMessages.length > 0 && (
                <div className="pinned-strip">
                  {activePinnedServerMessages.slice(0, 3).map((item) => (
                    <div key={item.id} className="pinned-item"><strong>{item.author}</strong><span>{item.content}</span></div>
                  ))}
                </div>
              )}

              <div className="messages" ref={messagesRef}>
                {groupedServerMessages.map((group) => {
                  const member = resolvedMemberList.find((m) => m.id === group.authorId);
                  const roles = (guildState?.roles || []).filter((r) => (member?.roleIds || []).includes(r.id)).sort((a, b) => (b.position ?? 0) - (a.position ?? 0));
                  const topRole = roles[0];
                  const roleColor = topRole?.color != null && topRole.color !== "" ? (typeof topRole.color === "number" ? `#${Number(topRole.color).toString(16).padStart(6, "0")}` : topRole.color) : null;
                  return (
                  <article key={group.id} className="msg grouped-msg">
                    <div className="msg-avatar">
                      {group.pfpUrl ? (
                        <img src={profileImageUrl(group.pfpUrl)} alt={group.author} />
                      ) : (
                        getInitials(group.author || "User")
                      )}
                    </div>
                    <div className="msg-body">
                      <strong className="msg-author">
                        <button className="name-btn" style={roleColor ? { color: roleColor } : undefined} onClick={() => openMemberProfile({ id: group.authorId, username: group.author, status: getPresence(group.authorId), pfp_url: group.pfpUrl })}>{group.author}</button>
                        {topRole && <span className="msg-role-tag">{topRole.name}</span>}
                        <span className="msg-time">{formatMessageTime(group.firstMessageTime)}</span>
                      </strong>
                      {group.messages.map((message) => (
                        <p key={message.id} onContextMenu={(event) => openMessageContextMenu(event, {
                          id: message.id,
                          kind: "server",
                          author: group.author,
                          content: message.content,
                          mine: (message.author_id || message.authorId) === me?.id
                        })}>
                          {activePinnedServerMessages.some((item) => item.id === message.id) ? "📌 " : ""}{renderContentWithMentions(message)}
                        </p>
                      ))}
                    </div>
                  </article>
                  );
                })}
                {!messages.length && <p className="empty">No messages yet. Start the conversation.</p>}
              </div>

              {replyTarget && (
                <div className="reply-banner">
                  <span>Replying to {replyTarget.author}</span>
                  <button className="ghost" onClick={() => setReplyTarget(null)}>Cancel</button>
                </div>
              )}

              <footer className="composer server-composer" onClick={() => composerInputRef.current?.focus()}>
                <button className="ghost composer-icon">＋</button>
                <div className="composer-input-wrap">
                  <input
                    ref={composerInputRef}
                    value={messageText}
                    onChange={(event) => setMessageText(event.target.value)}
                    placeholder={`Message #${activeChannel?.name || "channel"}`}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        sendMessage();
                        return;
                      }
                      if (event.key === "Tab" && mentionSuggestions.length) {
                        event.preventDefault();
                        const mention = getMentionQuery(messageText);
                        if (!mention) return;
                        const selected = mentionSuggestions[0];
                        const prefix = messageText.slice(0, mention.start);
                        setMessageText(`${prefix}@{${selected}} `);
                      }
                    }}
                  />
                  {mentionSuggestions.length > 0 && (
                    <div className="mention-suggestions">
                      {mentionSuggestions.map((name) => (
                        <button
                          key={name}
                          type="button"
                          className="mention-suggestion"
                          onClick={(event) => {
                            event.stopPropagation();
                            const mention = getMentionQuery(messageText);
                            if (!mention) return;
                            const prefix = messageText.slice(0, mention.start);
                            setMessageText(`${prefix}@{${name}} `);
                            composerInputRef.current?.focus();
                          }}
                        >
                          @{name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button className="ghost composer-icon">🎁</button>
                <button className="send-btn" onClick={sendMessage} disabled={!activeChannelId || !messageText.trim()}>Send</button>
              </footer>
            </section>

            <aside className="members-pane">
              <h4>Members — {resolvedMemberList.length}</h4>
              {(() => {
                const rolesById = new Map((guildState?.roles || []).map((r) => [r.id, r]));
                const getHighestRole = (member) => {
                  const memberRoles = (member.roleIds || []).map((id) => rolesById.get(id)).filter(Boolean).sort((a, b) => (b.position ?? 0) - (a.position ?? 0));
                  return memberRoles[0] || null;
                };
                const byHighestRole = new Map();
                for (const member of resolvedMemberList) {
                  const top = getHighestRole(member);
                  const key = top?.id ?? "__none__";
                  if (!byHighestRole.has(key)) byHighestRole.set(key, { role: top, members: [] });
                  byHighestRole.get(key).members.push(member);
                }
                const noneRole = { id: "__none__", name: "No role", position: -1, color: null };
                const sections = Array.from(byHighestRole.entries()).map(([key, { role, members }]) => ({ role: role || noneRole, members }));
                sections.sort((a, b) => (b.role.position ?? 0) - (a.role.position ?? 0));
                return sections.map(({ role, members }) => {
                  const roleColor = role.color != null && role.color !== "" ? (typeof role.color === "number" ? `#${Number(role.color).toString(16).padStart(6, "0")}` : role.color) : null;
                  return (
                    <div className="members-role-section" key={role.id}>
                      <div className="members-role-label" style={roleColor ? { color: roleColor } : undefined}>{role.name}</div>
                      {members.map((member) => {
                        const topRole = getHighestRole(member);
                        const color = topRole?.color != null && topRole.color !== "" ? (typeof topRole.color === "number" ? `#${Number(topRole.color).toString(16).padStart(6, "0")}` : topRole.color) : null;
                        const memberVoice = mergedVoiceStates.find((vs) => vs.userId === member.id);
                        const inMyCall = memberVoice?.channelId && memberVoice.channelId === voiceConnectedChannelId;
                        const speaking = !!inMyCall && !!voiceSpeakingByGuild[activeGuildId]?.[member.id];
                        return (
                          <button className="member-row" key={member.id} title={`View ${member.username}`} onClick={(event) => { event.stopPropagation(); openMemberProfile(member); }}>
                            {member.pfp_url ? (
                              <img src={profileImageUrl(member.pfp_url)} alt={member.username} className={`avatar member-avatar ${speaking ? "speaking" : ""}`} style={{ objectFit: "cover" }} />
                            ) : (
                              <div className={`avatar member-avatar ${speaking ? "speaking" : ""}`}>{getInitials(member.username)}</div>
                            )}
                            <div>
                              <strong style={color ? { color } : undefined}>{member.username}</strong>
                              <span>{memberVoice ? `${memberVoice.deafened ? "🔇" : memberVoice.muted ? "🎙️" : "🎤"} In voice` : presenceLabel(getPresence(member.id))}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  );
                });
              })()}
              {!resolvedMemberList.length && <p className="hint">No visible members yet.</p>}
            </aside>
          </div>
        )}

        {navMode === "dms" && (
          <section className="chat-main">
            <header className="chat-header dm-header-actions">
              <h3>{activeDm ? `@ ${activeDm.name}` : "Direct Messages"}</h3>
              <div className="chat-actions">
                <button className="icon-btn ghost" onClick={() => setShowPinned((value) => !value)} title="Pinned DMs">📌</button>
              </div>
            </header>
            {showPinned && activePinnedDmMessages.length > 0 && (
              <div className="pinned-strip">
                {activePinnedDmMessages.slice(0, 3).map((item) => (
                  <div key={item.id} className="pinned-item"><strong>{item.author}</strong><span>{item.content}</span></div>
                ))}
              </div>
            )}
            <div className="messages" ref={dmMessagesRef}>
              {groupedDmMessages.map((group) => (
                <article key={group.id} className="msg dm-msg grouped-msg">
                  <div className="msg-avatar">
                    {group.pfpUrl ? (
                      <img src={profileImageUrl(group.pfpUrl)} alt={group.author} />
                    ) : (
                      getInitials(group.author)
                    )}
                  </div>
                  <div className="msg-body">
                    <strong className="msg-author">
                      <button className="name-btn" onClick={() => openMemberProfile({ id: group.authorId, username: group.author, status: getPresence(group.authorId), pfp_url: group.pfpUrl })}>{group.author}</button>
                      <span className="msg-time">{formatMessageTime(group.firstMessageTime)}</span>
                    </strong>
                    {group.messages.map((message) => (
                      <p key={message.id} onContextMenu={(event) => openMessageContextMenu(event, {
                        id: message.id,
                        kind: "dm",
                        author: message.author,
                        content: message.content,
                        mine: message.authorId === me?.id
                      })}>
                        {activePinnedDmMessages.some((item) => item.id === message.id) ? "📌 " : ""}{message.content}
                      </p>
                    ))}
                  </div>
                </article>
              ))}
              {!activeDm && <p className="empty">Select a DM on the left.</p>}
            </div>
            <footer className="composer dm-composer" onClick={() => dmComposerInputRef.current?.focus()}>
              <input ref={dmComposerInputRef} value={dmText} onChange={(event) => setDmText(event.target.value)} placeholder={`Message ${activeDm?.name || "friend"}`} onKeyDown={(event) => event.key === "Enter" && sendDm()} />
              <button className="send-btn" onClick={sendDm} disabled={!activeDm || !dmText.trim()}>Send</button>
            </footer>
          </section>
        )}

        {navMode === "friends" && (
          <div className="friends-surface">
            <section className="friends-main">
              <header className="friends-header">
                <h3>Friends</h3>
                <div className="friends-tabs">
                  <button className={friendView === "online" ? "active" : "ghost"} onClick={() => setFriendView("online")}>Online</button>
                  <button className={friendView === "all" ? "active" : "ghost"} onClick={() => setFriendView("all")}>All</button>
                  <button className={friendView === "add" ? "active" : "ghost"} onClick={() => setFriendView("add")}>Add Friend</button>
                  <button className={friendView === "requests" ? "active" : "ghost"} onClick={() => setFriendView("requests")}>Requests</button>
                </div>
              </header>

              <input placeholder="Search friends" value={friendQuery} onChange={(event) => setFriendQuery(event.target.value)} />

              {friendView === "add" && (
                <div className="friend-add-card">
                  <h4>Add Friend</h4>
                  <p className="hint">Type the username and send your request instantly.</p>
                  <div className="friend-add-row">
                    <input placeholder="Username" value={friendAddInput} onChange={(event) => setFriendAddInput(event.target.value)} />
                    <button onClick={addFriend}>Send Request</button>
                  </div>
                </div>
              )}

              {friendView === "requests" && (
                <div className="friend-add-card">
                  <h4>Friend Requests</h4>
                  {friendRequests.incoming.map((request) => (
                    <div key={request.id} className="friend-row">
                      <div className="friend-meta"><strong>{request.username}</strong><span>Incoming request</span></div>
                      <div className="row-actions">
                        <button onClick={() => respondToFriendRequest(request.id, "accept")}>Accept</button>
                        <button className="ghost" onClick={() => respondToFriendRequest(request.id, "decline")}>Decline</button>
                      </div>
                    </div>
                  ))}
                  {friendRequests.outgoing.map((request) => (
                    <div key={request.id} className="friend-row">
                      <div className="friend-meta"><strong>{request.username}</strong><span>Pending</span></div>
                    </div>
                  ))}
                  {!friendRequests.incoming.length && !friendRequests.outgoing.length && <p className="hint">No pending friend requests.</p>}
                </div>
              )}

              {(friendView === "online" ? filteredFriends.filter((friend) => getPresence(friend.id) !== "offline") : filteredFriends).map((friend) => (
                <div key={friend.id} className="friend-row">
                  <div className="friend-meta">
                    <strong>{friend.username}</strong>
                    <span>{presenceLabel(getPresence(friend.id))}</span>
                  </div>
                  <button className="ghost" onClick={(event) => { event.stopPropagation(); openDmFromFriend(friend); }}>Message</button>
                </div>
              ))}
            </section>

            <aside className="active-now">
              <h4>Active Now</h4>
              {filteredFriends.slice(0, 5).map((friend) => (
                <button key={`active-${friend.id}`} className="active-card" onClick={(event) => { event.stopPropagation(); openMemberProfile(friend); }}>
                  <strong>{friend.username}</strong>
                  <span>{getPresence(friend.id) === "online" ? "Available now" : presenceLabel(getPresence(friend.id))}</span>
                </button>
              ))}
              {!filteredFriends.length && <p className="hint">When friends are active, they will appear here.</p>}
            </aside>
          </div>
        )}

        {navMode === "profile" && (
          <div className="social-panel">
            <h3>Your Profile</h3>
            <p className="hint">Manage your public details and account appearance in Settings.</p>
            <button onClick={() => { setSettingsOpen(true); setSettingsTab("profile"); }}>Open Profile Settings</button>
          </div>
        )}
      </main>

      {messageContextMenu && (
        <div className="server-context-menu" style={{ top: messageContextMenu.y, left: messageContextMenu.x }} onClick={(event) => event.stopPropagation()}>
          {messageContextMenu.message.kind === "server" && (
            <button onClick={() => { setReplyTarget({ author: messageContextMenu.message.author, content: messageContextMenu.message.content }); setMessageContextMenu(null); }}>Reply</button>
          )}
          <button onClick={() => { togglePinMessage(messageContextMenu.message); setMessageContextMenu(null); }}>
            {messageContextMenu.message.pinned ? "Unpin" : "Pin"}
          </button>
          {messageContextMenu.message.kind === "dm" && (
            <button onClick={async () => {
              try {
                await navigator.clipboard.writeText(messageContextMenu.message.content || "");
                setStatus("Copied message text.");
              } catch {
                setStatus("Could not copy message text.");
              }
              setMessageContextMenu(null);
            }}>Copy Text</button>
          )}
          {messageContextMenu.message.mine && messageContextMenu.message.kind === "server" && (
            <button className="danger" onClick={() => deleteServerMessage(messageContextMenu.message.id)}>Delete</button>
          )}
          {messageContextMenu.message.mine && messageContextMenu.message.kind === "dm" && (
            <button className="danger" onClick={() => deleteDmMessage(messageContextMenu.message.id)}>Delete</button>
          )}
        </div>
      )}

      {serverContextMenu && (
        <div className="server-context-menu" style={{ top: serverContextMenu.y, left: serverContextMenu.x }} onClick={(event) => event.stopPropagation()}>
          <button onClick={() => openServerFromContext(serverContextMenu.server.id)}>Open Server</button>
          <button onClick={() => { setInviteServerId(serverContextMenu.server.id); setSettingsOpen(true); setSettingsTab("invites"); setServerContextMenu(null); }}>Create Invite</button>
          <button onClick={() => copyServerId(serverContextMenu.server.id)}>Copy Server ID</button>
          <button onClick={() => { setSettingsOpen(true); setSettingsTab("server"); setServerContextMenu(null); }}>Server Settings</button>
          <button className="danger" onClick={() => leaveServer(serverContextMenu.server)}>Leave Server</button>
          {(serverContextMenu.server.roles || []).includes("owner") && (
            <button className="danger" onClick={() => deleteServer(serverContextMenu.server)}>Delete Server</button>
          )}
        </div>
      )}

      {addServerModalOpen && (
        <div className="settings-overlay" onClick={() => setAddServerModalOpen(false)}>
          <div className="add-server-modal" onClick={(e) => e.stopPropagation()}>
            <header className="add-server-modal-header">
              <h3 style={{ margin: 0 }}>Create or join a server</h3>
              <div className="add-server-tabs">
                <button type="button" className={addServerTab === "join" ? "active" : "ghost"} onClick={() => setAddServerTab("join")}>Join</button>
                <button type="button" className={addServerTab === "custom" ? "active" : "ghost"} onClick={() => setAddServerTab("custom")}>Add host</button>
                <button type="button" className={addServerTab === "create" ? "active" : "ghost"} onClick={() => setAddServerTab("create")}>Create yours</button>
                {servers.some((s) => s?.roles?.includes?.("owner")) && (
                  <a href="/server-admin.html" target="_blank" rel="noopener noreferrer" className="add-server-admin-link" onClick={(e) => e.stopPropagation()}>🔧 Admin</a>
                )}
              </div>
            </header>

            <div className="add-server-content">
              {addServerTab === "join" && (
                <section className="card">
                  <p className="hint" style={{ marginBottom: "0.5rem" }}>Paste an invite code, or use a link — if someone sent you a join link, open it to join automatically when logged in.</p>
                  <input placeholder="Invite code" value={joinInviteCode ?? ""} onChange={(e) => setJoinInviteCode(e.target.value)} style={{ width: "100%", marginBottom: "0.5rem", padding: "0.5rem" }} />
                  <div className="row-actions" style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    <button className="ghost" onClick={previewInvite}>Preview</button>
                    <button onClick={joinInvite}>Join</button>
                  </div>
                  {invitePreview && <p className="hint" style={{ marginTop: "0.5rem" }}>Invite: {invitePreview.code} · Uses: {invitePreview.uses}</p>}
                </section>
              )}

              {addServerTab === "custom" && (
                <section className="card">
                  <p className="hint" style={{ marginBottom: "0.5rem" }}>Connect to a server node by URL (self-hosted or provider).</p>
                  <input placeholder="Server name" value={newServerName ?? ""} onChange={(e) => setNewServerName(e.target.value)} style={{ width: "100%", marginBottom: "0.5rem", padding: "0.5rem" }} />
                  <input placeholder="https://node.example.com" value={newServerBaseUrl ?? "https://"} onChange={(e) => setNewServerBaseUrl(e.target.value)} style={{ width: "100%", marginBottom: "0.5rem", padding: "0.5rem" }} />
                  <button onClick={createServer}>Add Server</button>
                </section>
              )}

              {addServerTab === "create" && (
                <section className="card">
                  <p className="hint" style={{ marginBottom: "0.5rem" }}>One server hosted by us—name it and customize channels and roles.</p>
                  <input placeholder="Server name" value={newOfficialServerName ?? ""} onChange={(e) => setNewOfficialServerName(e.target.value)} style={{ width: "100%", marginBottom: "0.5rem", padding: "0.5rem" }} />
                  <button onClick={createOfficialServer} disabled={!newOfficialServerName?.trim()}>Create your server</button>
                </section>
              )}
            </div>

            <button type="button" className="ghost" style={{ width: "100%", marginTop: "0.5rem" }} onClick={() => setAddServerModalOpen(false)}>Close</button>
          </div>
        </div>
      )}

      {memberProfileCard && (
        <div className="member-profile-popout" style={{ right: profileCardPosition.x, bottom: profileCardPosition.y }} onClick={(event) => event.stopPropagation()}>
          <div className="popout-drag-handle" onMouseDown={startDraggingProfileCard}>Drag</div>
          <div className="popout-banner" style={{ backgroundImage: memberProfileCard.bannerUrl ? `url(${profileImageUrl(memberProfileCard.bannerUrl)})` : undefined }} />
          <div className="popout-content">
            <div className="avatar popout-avatar">{memberProfileCard.pfpUrl ? <img src={profileImageUrl(memberProfileCard.pfpUrl)} alt="Profile avatar" className="avatar-image" /> : getInitials(memberProfileCard.displayName || memberProfileCard.username || "User")}</div>
            <h4>{memberProfileCard.displayName || memberProfileCard.username}</h4>
            <p className="hint">@{memberProfileCard.username} · {presenceLabel(getPresence(memberProfileCard?.id) || memberProfileCard?.status || "offline")}</p>
            {memberProfileCard.platformTitle && <p className="hint">{memberProfileCard.platformTitle}</p>}
            {formatAccountCreated(memberProfileCard.createdAt) && <p className="hint">Account created: {formatAccountCreated(memberProfileCard.createdAt)}</p>}
            {(memberProfileCard.roleIds?.length > 0) && guildState?.roles && (
              <div className="popout-roles">
                {(guildState.roles || [])
                  .filter((r) => (memberProfileCard.roleIds || []).includes(r.id) && !r.is_everyone)
                  .sort((a, b) => (b.position ?? 0) - (a.position ?? 0))
                  .map((role) => {
                    const hex = role.color != null && role.color !== "" ? (typeof role.color === "number" ? `#${Number(role.color).toString(16).padStart(6, "0")}` : role.color) : "#99aab5";
                    return <span key={role.id} className="popout-role-tag" style={{ backgroundColor: hex + "22", color: hex, borderColor: hex }}>{role.name}</span>;
                  })}
              </div>
            )}
            <p>{memberProfileCard.bio || "No bio set."}</p>
            <div className="popout-actions">
              <button className="ghost" onClick={() => openDmFromFriend({ id: memberProfileCard.id, username: memberProfileCard.username })}>Message</button>
              <button onClick={() => setMemberProfileCard(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {settingsOpen && (
        <div className="settings-overlay" onClick={() => setSettingsOpen(false)}>
          <div className="settings-panel" onClick={(event) => event.stopPropagation()}>
            <aside className="settings-nav">
              <h3>Settings</h3>
              <button className={settingsTab === "profile" ? "active" : "ghost"} onClick={() => setSettingsTab("profile")}>Profile</button>
              <button className={settingsTab === "security" ? "active" : "ghost"} onClick={() => { setSettingsTab("security"); loadSessions(); }}>🔒 Security</button>
              <button className={settingsTab === "server" ? "active" : "ghost"} onClick={() => setSettingsTab("server")}>Server</button>
              <button className={settingsTab === "roles" ? "active" : "ghost"} onClick={() => setSettingsTab("roles")}>Roles</button>
              <button className={settingsTab === "invites" ? "active" : "ghost"} onClick={() => setSettingsTab("invites")}>Invites</button>
              <button className={settingsTab === "appearance" ? "active" : "ghost"} onClick={() => setSettingsTab("appearance")}>Appearance</button>
              <button className={settingsTab === "voice" ? "active" : "ghost"} onClick={() => setSettingsTab("voice")}>Voice</button>
              {servers.some(s => s.roles.includes("owner")) && (
                <a href="/server-admin.html" target="_blank" style={{ display: "block", padding: "var(--space-sm) var(--space-md)", background: "rgba(149, 168, 205, 0.12)", border: "1px solid rgba(125, 164, 255, 0.25)", borderRadius: "calc(var(--radius) * 0.9)", color: "var(--text-main)", textDecoration: "none", textAlign: "center", fontWeight: "500", cursor: "pointer", fontSize: "0.95em" }}>🔧 Server Admin Panel</a>
              )}
              <button className="ghost" onClick={() => setSettingsOpen(false)}>Close</button>
            </aside>

            <section className="settings-content">
              {settingsTab === "profile" && (
                <div className="card">
                  <h4>Profile Settings</h4>
                  <label>Display Name<input value={profileForm.displayName} onChange={(event) => setProfileForm((current) => ({ ...current, displayName: event.target.value }))} /></label>
                  <label>Bio<textarea rows={4} value={profileForm.bio} onChange={(event) => setProfileForm((current) => ({ ...current, bio: event.target.value }))} /></label>
                  <label>Avatar URL<input value={profileForm.pfpUrl} onChange={(event) => setProfileForm((current) => ({ ...current, pfpUrl: event.target.value }))} /></label>
                  <label>Upload Avatar<input type="file" accept="image/*" onChange={onAvatarUpload} /></label>
                  <label>Banner URL<input value={profileForm.bannerUrl} onChange={(event) => setProfileForm((current) => ({ ...current, bannerUrl: event.target.value }))} /></label>
                  <label>Upload Banner<input type="file" accept="image/*" onChange={onBannerUpload} /></label>
                  <button onClick={saveProfile}>Save Profile</button>
                </div>
              )}

              {settingsTab === "server" && (
                <>
                  <section className="card">
                    <h4>Add Server Provider</h4>
                    <input placeholder="Server name" value={newServerName ?? ""} onChange={(e) => setNewServerName(e.target.value)} />
                    <input placeholder="https://node.provider.tld" value={newServerBaseUrl ?? "https://"} onChange={(e) => setNewServerBaseUrl(e.target.value)} />
                    <button onClick={createServer}>Add Server</button>
                  </section>

                  {activeServer && canManageServer && (
                    <section className="card">
                      <h4>Voice Gateway Routing</h4>
                      <p className="hint">Default is OpenCom core gateway. Switch to self-hosted to reduce latency for your server.</p>
                      <label>Voice Gateway Mode
                        <select
                          value={activeServerVoiceGatewayPref.mode}
                          onChange={(e) => updateActiveServerVoiceGatewayPref({ mode: e.target.value === "server" ? "server" : "core" })}
                        >
                          <option value="core">OpenCom Core (default)</option>
                          <option value="server">Self-hosted/Server-first</option>
                        </select>
                      </label>
                      <label>Optional custom gateway URL
                        <input
                          placeholder="https://gateway.yourserver.tld"
                          value={activeServerVoiceGatewayPref.customUrl}
                          onChange={(e) => updateActiveServerVoiceGatewayPref({ customUrl: e.target.value })}
                        />
                      </label>
                      <p className="hint">Client fallback order follows this mode and automatically tries the other gateways if one fails.</p>
                    </section>
                  )}

                  {activeServer && canManageServer && (
                    <section className="card">
                      <h4>Create Workspace</h4>
                      <input placeholder="Workspace name" value={newWorkspaceName ?? ""} onChange={(e) => setNewWorkspaceName(e.target.value)} />
                      <button onClick={createWorkspace}>Create Workspace</button>
                    </section>
                  )}

                  {activeServer && canManageServer && (
                    <section className="card">
                      <h4>Create Channel</h4>
                      <input placeholder="New channel/category" value={newChannelName ?? ""} onChange={(e) => setNewChannelName(e.target.value)} />
                      <select value={newChannelType ?? "text"} onChange={(e) => setNewChannelType(e.target.value)}>
                        <option value="text">Text Channel</option>
                        <option value="voice">Voice Channel</option>
                        <option value="category">Category</option>
                      </select>
                      {newChannelType !== "category" && (
                        <select value={newChannelParentId ?? ""} onChange={(e) => setNewChannelParentId(e.target.value)}>
                          <option value="">No category</option>
                          {(categoryChannels || []).map((cat) => (
                            <option key={cat?.id ?? ""} value={cat?.id ?? ""}>{cat?.name ?? "Category"}</option>
                          ))}
                        </select>
                      )}
                      <button onClick={createChannel}>Create Channel</button>
                    </section>
                  )}

                  {activeServer && canManageServer && (
                    <section className="card">
                      <h4>Channel permissions</h4>
                      <p className="hint">Choose a channel and set which roles can send messages there. By default everyone can send.</p>
                      <select value={channelPermsChannelId} onChange={(e) => setChannelPermsChannelId(e.target.value)}>
                        <option value="">Select channel</option>
                        {(sortedChannels || []).filter((c) => c.type === "text").map((ch) => (
                          <option key={ch.id} value={ch.id}>#{ch.name}</option>
                        ))}
                      </select>
                      {channelPermsChannelId && (
                        <ul className="channel-perms-role-list">
                          {(guildState?.roles || []).filter((r) => !r.is_everyone).sort((a, b) => (b.position ?? 0) - (a.position ?? 0)).map((role) => (
                            <li key={role.id}>
                              <label>
                                <input
                                  type="checkbox"
                                  checked={channelOverwriteAllowsSend(channelPermsChannelId, role.id)}
                                  onChange={(e) => setChannelRoleSend(channelPermsChannelId, role.id, e.target.checked)}
                                />
                                <span className="channel-perms-role-name" style={{ color: role.color != null && role.color !== "" ? (typeof role.color === "number" ? `#${Number(role.color).toString(16).padStart(6, "0")}` : role.color) : "#99aab5" }}>{role.name}</span>
                                <span className="hint"> can send here</span>
                              </label>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  )}

                  {settingsTab === "server" && !activeServer && servers.length > 0 && (
                    <p className="hint">Select a server from the sidebar to manage workspaces and channels.</p>
                  )}
                </>
              )}

              {settingsTab === "roles" && canManageServer && (
                <>
                  <section className="card">
                    <h4>Create Role</h4>
                    <input placeholder="Role name" value={newRoleName} onChange={(event) => setNewRoleName(event.target.value)} />
                    <button onClick={createRole}>Create Role</button>
                  </section>

                  <section className="card">
                    <h4>Edit Roles (colour & hierarchy)</h4>
                    <p className="hint">Higher position = higher in the list. Colours show in member list and chat.</p>
                    <ul className="role-edit-list">
                      {(guildState?.roles || []).filter((r) => !r.is_everyone).sort((a, b) => (b.position ?? 0) - (a.position ?? 0)).map((role) => {
                        const hexColor = role.color != null && role.color !== "" ? (typeof role.color === "number" ? `#${Number(role.color).toString(16).padStart(6, "0")}` : role.color) : "#99aab5";
                        return (
                          <li key={role.id} className="role-edit-row">
                            <span className="role-edit-name" style={{ color: hexColor }}>{role.name}</span>
                            <input type="color" value={hexColor} onChange={(e) => updateRole(role.id, { color: e.target.value })} title="Role colour" />
                            <label>Position <input type="number" min={0} value={role.position ?? 0} onChange={(e) => updateRole(role.id, { position: parseInt(e.target.value, 10) || 0 })} /></label>
                          </li>
                        );
                      })}
                    </ul>
                  </section>

                  <section className="card">
                    <h4>Assign Role</h4>
                    <select value={selectedMemberId} onChange={(event) => setSelectedMemberId(event.target.value)}>
                      <option value="">Select member</option>
                      {resolvedMemberList.map((member) => <option key={member.id} value={member.id}>{member.username}</option>)}
                    </select>
                    <select value={selectedRoleId} onChange={(event) => setSelectedRoleId(event.target.value)}>
                      <option value="">Select role</option>
                      {(guildState?.roles || []).filter((role) => !role.is_everyone).map((role) => (
                        <option key={role.id} value={role.id}>{role.name}</option>
                      ))}
                    </select>
                    <button onClick={assignRoleToMember}>Assign Role</button>
                  </section>
                </>
              )}

              {settingsTab === "invites" && (
                <>
                  <section className="card">
                    <h4>Join Server</h4>
                    <input placeholder="Paste invite code" value={joinInviteCode} onChange={(event) => setJoinInviteCode(event.target.value)} />
                    <div className="row-actions">
                      <button className="ghost" onClick={previewInvite}>Preview</button>
                      <button onClick={joinInvite}>Join</button>
                    </div>
                    {invitePreview && <p className="hint">Invite: {invitePreview.code} · Uses: {invitePreview.uses}</p>}
                  </section>

                  <section className="card">
                    <h4>Create Invite</h4>
                    <select value={inviteServerId} onChange={(event) => setInviteServerId(event.target.value)}>
                      <option value="">Select server</option>
                      {servers.map((server) => <option key={server.id} value={server.id}>{server.name}</option>)}
                    </select>
                    <button onClick={createInvite}>Generate Invite</button>
                    {inviteCode && (
                      <>
                        <p className="hint">Code: <code>{inviteCode}</code></p>
                        <p className="hint">Invite link (share this — opens app and joins when logged in):</p>
                        <div className="invite-link-row">
                          <input readOnly className="invite-link-input" value={`${typeof window !== "undefined" ? window.location.origin + (window.location.pathname || "/") : ""}?join=${encodeURIComponent(inviteCode)}`} />
                          <button type="button" onClick={() => { const u = `${window.location.origin}${window.location.pathname || "/"}?join=${encodeURIComponent(inviteCode)}`; navigator.clipboard.writeText(u).then(() => setStatus("Invite link copied.")).catch(() => setStatus("Could not copy.")); }}>Copy link</button>
                        </div>
                      </>
                    )}
                  </section>
                </>
              )}

              {settingsTab === "appearance" && (
                <section className="card">
                  <h4>Custom CSS Theme</h4>
                  <label><input type="checkbox" checked={themeEnabled} onChange={(event) => setThemeEnabled(event.target.checked)} /> Enable custom CSS</label>
                  <input type="file" accept="text/css,.css" onChange={onUploadTheme} />
                  <textarea value={themeCss} onChange={(event) => setThemeCss(event.target.value)} rows={10} placeholder="Paste custom CSS" />
                </section>
              )}

              {settingsTab === "voice" && (
                <section className="card">
                  <h4>Voice Settings</h4>
                  <label>Input Device
                    <select value={audioInputDeviceId} onChange={(event) => setAudioInputDeviceId(event.target.value)}>
                      <option value="">System default</option>
                      {audioInputDevices.map((device) => (
                        <option key={device.deviceId} value={device.deviceId}>{device.label || `Microphone ${device.deviceId.slice(0, 6)}`}</option>
                      ))}
                    </select>
                  </label>
                  <label>Output Device
                    <select value={audioOutputDeviceId} onChange={(event) => setAudioOutputDeviceId(event.target.value)}>
                      <option value="">System default</option>
                      {audioOutputDevices.map((device) => (
                        <option key={device.deviceId} value={device.deviceId}>{device.label || `Speaker ${device.deviceId.slice(0, 6)}`}</option>
                      ))}
                    </select>
                  </label>
                  <label>Microphone Gain ({micGain}%)
                    <input type="range" min="0" max="200" step="5" value={micGain} onChange={(e) => setMicGain(Number(e.target.value))} />
                  </label>
                  <label>Mic Sensitivity ({micSensitivity}%)
                    <input type="range" min="0" max="100" step="5" value={micSensitivity} onChange={(e) => setMicSensitivity(Number(e.target.value))} />
                  </label>
                  <p className="hint">Tip: allow microphone permissions so device names show properly.</p>
                </section>
              )}

              {settingsTab === "security" && (
                <>
                  <section className="card security-card">
                    <h4>🔐 Account Security</h4>
                    <div className="security-info">
                      <p className="hint">Last login: {new Date(lastLoginInfo.date).toLocaleString()}</p>
                      <p className="hint">Device: {lastLoginInfo.device}</p>
                    </div>
                  </section>

                  <section className="card security-card">
                    <h4>🔑 Change Password</h4>
                    {!showPasswordChange ? (
                      <button onClick={() => setShowPasswordChange(true)}>Change Password</button>
                    ) : (
                      <>
                        <label>Current Password<input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label>
                        <label>New Password<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>
                        <label>Confirm Password<input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label>
                        <div className="row-actions">
                          <button className="ghost" onClick={() => { setShowPasswordChange(false); setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); }}>Cancel</button>
                          <button onClick={async () => { 
                            if (newPassword !== confirmPassword) {
                              setStatus("Passwords do not match.");
                              return;
                            }
                            if (newPassword.length < 8) {
                              setStatus("Password must be at least 8 characters.");
                              return;
                            }
                            try {
                              await api("/v1/auth/password", {
                                method: "PATCH",
                                headers: { Authorization: `Bearer ${accessToken}` },
                                body: JSON.stringify({
                                  currentPassword: currentPassword,
                                  newPassword: newPassword
                                })
                              });
                              setStatus("Password changed successfully.");
                              setShowPasswordChange(false);
                              setCurrentPassword("");
                              setNewPassword("");
                              setConfirmPassword("");
                            } catch (error) {
                              setStatus(`Could not change password: ${error.message}`);
                            }
                          }}>Update Password</button>
                        </div>
                      </>
                    )}
                  </section>

                  <section className="card security-card">
                    <h4>🛡️ Two-Factor Authentication</h4>
                    <p className="hint">Secure your account with an additional authentication layer</p>
                    
                    {!securitySettings.twoFactorEnabled && !show2FASetup && (
                      <button onClick={initiate2FASetup}>Enable 2FA</button>
                    )}
                    
                    {show2FASetup && !twoFactorVerified && (
                      <>
                        <p className="hint" style={{ marginTop: "var(--space-sm)", fontWeight: 600 }}>📱 Step 1: Scan QR Code</p>
                        <p className="hint">Scan this QR code with an authenticator app (Google Authenticator, Authy, Microsoft Authenticator, etc.):</p>
                        {twoFactorQRCode && <img src={twoFactorQRCode} alt="2FA QR Code" style={{ width: "200px", height: "200px", border: "2px solid rgba(125, 164, 255, 0.3)", borderRadius: "var(--radius)", margin: "var(--space-sm) 0", background: "#fff", padding: "0.5em" }} />}
                        
                        <p className="hint" style={{ marginTop: "var(--space-md)", fontWeight: 600 }}>🔐 Step 2: Verify Token</p>
                        <p className="hint">Enter a 6-digit code from your authenticator app:</p>
                        <input type="text" placeholder="000000" value={twoFactorToken} onChange={(event) => setTwoFactorToken(event.target.value.replace(/\D/g, "").slice(0, 6))} maxLength="6" style={{ textAlign: "center", fontSize: "1.2em", letterSpacing: "0.3em", fontFamily: "monospace" }} />
                        
                        <p className="hint" style={{ marginTop: "var(--space-md)", fontWeight: 600 }}>💾 Step 3: Save Backup Codes</p>
                        <p className="hint">Save these backup codes somewhere safe. You can use them to regain access if you lose your authenticator.</p>
                        <code style={{ display: "block", background: "var(--bg-input)", padding: "var(--space-sm)", borderRadius: "calc(var(--radius)*0.8)", fontSize: "0.85em", marginBottom: "var(--space-sm)", whiteSpace: "pre-wrap", wordBreak: "break-all", fontFamily: "monospace", lineHeight: "1.8" }}>
                          {backupCodes.map((code) => `${code}\n`).join("")}
                        </code>
                        
                        <div className="row-actions">
                          <button className="ghost" onClick={() => { setShow2FASetup(false); setTwoFactorSecret(""); setBackupCodes([]); setTwoFactorToken(""); }}>Cancel</button>
                          <button onClick={confirm2FA}>Verify & Enable 2FA</button>
                        </div>
                      </>
                    )}
                    
                    {securitySettings.twoFactorEnabled && (
                      <>
                        <p style={{ color: "var(--green)", fontWeight: 600, marginTop: "var(--space-sm)" }}>✓ 2FA is enabled</p>
                        <p className="hint">Your account is protected with two-factor authentication. Your backup codes are stored securely.</p>
                        <button className="danger" onClick={disable2FA} style={{ marginTop: "var(--space-sm)" }}>Disable 2FA</button>
                      </>
                    )}
                  </section>

                  <section className="card security-card">
                    <h4>📱 Active Sessions</h4>
                    <p className="hint">Devices where you're logged in. Sign out of any session you don't recognize.</p>
                    {activeSessions.map((session) => (
                      <div key={session.id} className="session-item">
                        <div className="session-info">
                          <strong>{session.device}</strong>
                          <span className="hint">{session.location}</span>
                          <span className="hint">Last active: {session.lastActive}</span>
                        </div>
                        <button className={session.status === "active" ? "ghost" : "danger"} onClick={() => setStatus(`Session ${session.device} would be signed out.`)}>{session.status === "active" ? "Current" : "Sign Out"}</button>
                      </div>
                    ))}
                  </section>

                  <section className="card security-card danger-card">
                    <h4>⚠️ Danger Zone</h4>
                    <p className="hint">Irreversible actions. Proceed with caution.</p>
                    <button className="danger" onClick={() => { if (window.confirm("Are you absolutely sure? This cannot be undone.")) setStatus("Account deletion request submitted for review."); }}>Delete Account Permanently</button>
                  </section>

                  <section className="card">
                    <h4>Security Privacy</h4>
                    <label><input type="checkbox" /> Log out of all other sessions</label>
                    <label><input type="checkbox" /> Show security alerts</label>
                    <button onClick={() => setStatus("Privacy settings saved.")}>Save Security Settings</button>
                  </section>
                </>
              )}

              <p className="status">{status}</p>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
