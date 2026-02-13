import { useEffect, useMemo, useRef, useState } from "react";

const CORE_API = import.meta.env.VITE_CORE_API_URL || "https://openapi.donskyblock.xyz";
const THEME_STORAGE_KEY = "opencom_custom_theme_css";
const THEME_ENABLED_STORAGE_KEY = "opencom_custom_theme_enabled";
const SELF_STATUS_KEY = "opencom_self_status";
const PINNED_SERVER_KEY = "opencom_pinned_server_messages";
const PINNED_DM_KEY = "opencom_pinned_dm_messages";

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
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      "Content-Type": "application/json",
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

function formatMessageTime(value) {
  if (!value) return "just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "just now";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function playNotificationBeep() {
  try {
    const audioCtx = new window.AudioContext();
    const oscillator = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.value = 0.05;
    oscillator.connect(gain);
    gain.connect(audioCtx.destination);
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.12);
    oscillator.onended = () => audioCtx.close();
  } catch {
    // ignore audio limitations
  }
}


export function App() {
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
  const [activeDmId, setActiveDmId] = useState("");
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
  const [friendRequests, setFriendRequests] = useState({ incoming: [], outgoing: [] });
  const [allowFriendRequests, setAllowFriendRequests] = useState(true);

  const [collapsedCategories, setCollapsedCategories] = useState({});
  const [voiceConnectedChannelId, setVoiceConnectedChannelId] = useState("");
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [selfStatus, setSelfStatus] = useState(localStorage.getItem(SELF_STATUS_KEY) || "online");
  const [dmCallActive, setDmCallActive] = useState(false);
  const [dmCallMuted, setDmCallMuted] = useState(false);
  const [showPinned, setShowPinned] = useState(false);
  const [pinnedServerMessages, setPinnedServerMessages] = useState(getStoredJson(PINNED_SERVER_KEY, {}));
  const [pinnedDmMessages, setPinnedDmMessages] = useState(getStoredJson(PINNED_DM_KEY, {}));
  const [newRoleName, setNewRoleName] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [profileCardPosition, setProfileCardPosition] = useState({ x: 26, y: 26 });
  const [draggingProfileCard, setDraggingProfileCard] = useState(false);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState("profile");
  const [serverContextMenu, setServerContextMenu] = useState(null);
  const [messageContextMenu, setMessageContextMenu] = useState(null);
  const [replyTarget, setReplyTarget] = useState(null);
  const [memberProfileCard, setMemberProfileCard] = useState(null);
  const [themeCss, setThemeCss, themeEnabled, setThemeEnabled] = useThemeCss();

  const messagesRef = useRef(null);
  const composerInputRef = useRef(null);
  const dmComposerInputRef = useRef(null);
  const dmCallStreamRef = useRef(null);
  const dmCallPeerRef = useRef(null);
  const lastDmCallSignalIdRef = useRef("");
  const remoteAudioRef = useRef(null);
  const lastDmMessageIdRef = useRef("");
  const profileCardDragOffsetRef = useRef({ x: 0, y: 0 });
  const storageScope = me?.id || "anonymous";

  const activeServer = useMemo(() => servers.find((server) => server.id === activeServerId) || null, [servers, activeServerId]);
  const activeGuild = useMemo(() => guilds.find((guild) => guild.id === activeGuildId) || null, [guilds, activeGuildId]);
  const channels = guildState?.channels || [];
  const activeChannel = useMemo(() => channels.find((channel) => channel.id === activeChannelId) || null, [channels, activeChannelId]);
  const activeDm = useMemo(() => dms.find((dm) => dm.id === activeDmId) || null, [dms, activeDmId]);

  const canManageServer = useMemo(() => {
    if (!activeServer) return false;
    return (activeServer.roles || []).includes("owner") || (activeServer.roles || []).includes("platform_admin");
  }, [activeServer]);

  const sortedChannels = useMemo(() => [...channels].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)), [channels]);
  const categoryChannels = useMemo(() => sortedChannels.filter((channel) => channel.type === "category"), [sortedChannels]);

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
      members.set(id, { id, username: message.username || id, status: "online", pfp_url: message.pfp_url || null });
    }

    if (me?.id && !members.has(me.id)) {
      members.set(me.id, { id: me.id, username: me.username || me.id, status: "online", pfp_url: profile?.pfpUrl || null });
    }

    return Array.from(members.values());
  }, [guildState, messages, me, profile]);

  const memberNameById = useMemo(() => new Map(memberList.map((member) => [member.id, member.username])), [memberList]);

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
    (message) => message.pfp_url || null
  ), [messages, memberNameById]);

  const groupedDmMessages = useMemo(() => groupMessages(
    activeDm?.messages || [],
    (message) => message.author || "Unknown",
    (message) => message.createdAt,
    (message) => message.authorId || "unknown"
  ), [activeDm]);

  const activePinnedServerMessages = useMemo(() => pinnedServerMessages[activeChannelId] || [], [pinnedServerMessages, activeChannelId]);
  const activePinnedDmMessages = useMemo(() => pinnedDmMessages[activeDmId] || [], [pinnedDmMessages, activeDmId]);

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
    if (!nextDms.some((item) => item.id === activeDmId)) setActiveDmId(nextDms[0]?.id || "");
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

  useEffect(() => () => {
    dmCallStreamRef.current?.getTracks().forEach((track) => track.stop());
    dmCallPeerRef.current?.close();
  }, []);

  useEffect(() => {
    lastDmCallSignalIdRef.current = "";
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

  useEffect(() => {
    if (!messagesRef.current) return;
    messagesRef.current.scrollTo({ top: messagesRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, activeDmId, dms]);

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

        setActiveGuildId(nextGuilds[0].id);
      })
      .catch((error) => {
        setGuilds([]);
        setGuildState(null);
        setStatus(`Workspace list failed: ${error.message}`);
      });
  }, [activeServer, activeGuildId, navMode]);

  useEffect(() => {
    if (navMode !== "servers" || !activeServer || !activeGuildId) return;

    nodeApi(activeServer.baseUrl, `/v1/guilds/${activeGuildId}/state`, activeServer.membershipToken)
      .then((state) => {
        const allChannels = state.channels || [];
        setGuildState(state);

        const activeExists = allChannels.some((channel) => channel.id === activeChannelId && channel.type === "text");
        if (activeExists) return;

        const firstTextChannel = allChannels.find((channel) => channel.type === "text")?.id || "";
        setActiveChannelId(firstTextChannel);
      })
      .catch((error) => {
        setGuildState(null);
        setActiveChannelId("");
        setMessages([]);
        setStatus(`Workspace state failed: ${error.message}`);
      });
  }, [activeServer, activeGuildId, navMode]);

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
    if (!accessToken || navMode !== "dms") return;

    const timer = window.setInterval(async () => {
      try {
        const [dmsData, requestsData] = await Promise.all([
          api("/v1/social/dms", { headers: { Authorization: `Bearer ${accessToken}` } }),
          api("/v1/social/requests", { headers: { Authorization: `Bearer ${accessToken}` } })
        ]);

        setDms((current) => {
          const prevMap = new Map(current.map((item) => [item.id, item]));
          return (dmsData.dms || []).map((item) => ({ ...item, messages: prevMap.get(item.id)?.messages || [] }));
        });
        setFriendRequests({ incoming: requestsData.incoming || [], outgoing: requestsData.outgoing || [] });

        if (activeDmId) {
          const messagesData = await api(`/v1/social/dms/${activeDmId}/messages`, { headers: { Authorization: `Bearer ${accessToken}` } });
          const newestId = messagesData.messages?.[messagesData.messages.length - 1]?.id || "";
          const isNewMessage = newestId && lastDmMessageIdRef.current && newestId !== lastDmMessageIdRef.current;
          if (isNewMessage) {
            const newest = messagesData.messages?.[messagesData.messages.length - 1];
            if (newest?.authorId !== me?.id) playNotificationBeep();
          }
          if (newestId) lastDmMessageIdRef.current = newestId;
          setDms((current) => current.map((item) => item.id === activeDmId ? { ...item, messages: messagesData.messages || [] } : item));
        }
      } catch {
        // keep UI stable if polling fails
      }
    }, 3000);

    return () => window.clearInterval(timer);
  }, [accessToken, navMode, activeDmId]);

  useEffect(() => {
    if (!accessToken || (navMode !== "friends" && navMode !== "dms")) return;

    const timer = window.setInterval(() => {
      refreshSocialData(accessToken).catch(() => {
        // keep existing state on transient failures
      });
    }, 10000);

    return () => window.clearInterval(timer);
  }, [accessToken, navMode]);

  useEffect(() => {
    if (navMode !== "servers" || !activeServer || !activeChannelId) {
      if (navMode !== "servers") setMessages([]);
      return;
    }

    nodeApi(activeServer.baseUrl, `/v1/channels/${activeChannelId}/messages`, activeServer.membershipToken)
      .then((data) => setMessages((data.messages || []).slice().reverse()))
      .catch((error) => setStatus(`Message fetch failed: ${error.message}`));
  }, [activeServer, activeChannelId, navMode]);

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

      setProfile((current) => ({ ...current, ...profileForm }));
      setStatus("Profile updated.");
    } catch (error) {
      setStatus(`Profile update failed: ${error.message}`);
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
    } catch (error) {
      setStatus(`Add server failed: ${error.message}`);
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

  async function joinInvite() {
    const code = joinInviteCode.trim();
    if (!code) return;

    try {
      await api(`/v1/invites/${code}/join`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } });
      setJoinInviteCode("");
      setInvitePreview(null);
      setStatus("Joined server from invite.");

      const refreshed = await api("/v1/servers", { headers: { Authorization: `Bearer ${accessToken}` } });
      const next = refreshed.servers || [];
      setServers(next);
      if (next.length) setActiveServerId(next[0].id);
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
      await nodeApi(activeServer.baseUrl, `/v1/guilds/${activeGuildId}/members/${selectedMemberId}/roles/${selectedRoleId}`, activeServer.membershipToken, { method: "PUT" });
      setStatus("Role assigned.");
    } catch (error) {
      setStatus(`Assign role failed: ${error.message}`);
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

  async function deleteServerMessage(messageId) {
    if (!activeServer || !activeChannelId || !messageId) return;
    try {
      await nodeApi(activeServer.baseUrl, `/v1/channels/${activeChannelId}/messages/${messageId}`, activeServer.membershipToken, { method: "DELETE" });
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

  async function sendDmCallSignal(type, payload, targetUserId = activeDm?.participantId) {
    if (!accessToken || !activeDmId || !targetUserId) return;
    try {
      await api(`/v1/social/dms/${activeDmId}/call-signals`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ type, targetUserId, payload })
      });
    } catch {
      // best effort signaling
    }
  }

  useEffect(() => {
    if (!accessToken || !activeDmId || !me?.id) return;

    const timer = window.setInterval(async () => {
      try {
        const query = lastDmCallSignalIdRef.current ? `?afterId=${encodeURIComponent(lastDmCallSignalIdRef.current)}` : "";
        const data = await api(`/v1/social/dms/${activeDmId}/call-signals${query}`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });

        for (const signal of data.signals || []) {
          lastDmCallSignalIdRef.current = signal.id;
          if (!signal?.type) continue;

          if (signal.type === "offer") {
            try {
              const stream = dmCallStreamRef.current || await navigator.mediaDevices.getUserMedia({ audio: true });
              dmCallStreamRef.current = stream;

              dmCallPeerRef.current?.close();
              const peer = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
              dmCallPeerRef.current = peer;

              stream.getTracks().forEach((track) => peer.addTrack(track, stream));
              peer.ontrack = (remoteEvent) => {
                if (remoteAudioRef.current) remoteAudioRef.current.srcObject = remoteEvent.streams[0];
              };
              peer.onicecandidate = (event) => {
                if (event.candidate) sendDmCallSignal("ice", { candidate: event.candidate }, signal.fromUserId);
              };

              await peer.setRemoteDescription(signal.payload.offer);
              const answer = await peer.createAnswer();
              await peer.setLocalDescription(answer);
              await sendDmCallSignal("answer", { answer }, signal.fromUserId);
              setDmCallActive(true);
            } catch {
              setStatus("Could not join DM call.");
            }
          }

          if (signal.type === "answer" && dmCallPeerRef.current && signal.payload?.answer) {
            await dmCallPeerRef.current.setRemoteDescription(signal.payload.answer);
            setDmCallActive(true);
          }

          if (signal.type === "ice" && dmCallPeerRef.current && signal.payload?.candidate) {
            try { await dmCallPeerRef.current.addIceCandidate(signal.payload.candidate); } catch {}
          }

          if (signal.type === "end") {
            endDmCall(false);
          }
        }
      } catch {
        // ignore poll failures
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [accessToken, activeDmId, me?.id]);

  async function startDmCall() {
    if (!activeDm?.participantId || !activeDmId) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      dmCallStreamRef.current = stream;

      dmCallPeerRef.current?.close();
      const peer = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
      dmCallPeerRef.current = peer;

      stream.getTracks().forEach((track) => peer.addTrack(track, stream));
      peer.ontrack = (remoteEvent) => {
        if (remoteAudioRef.current) remoteAudioRef.current.srcObject = remoteEvent.streams[0];
      };
      peer.onicecandidate = (event) => {
        if (event.candidate) sendDmCallSignal("ice", { candidate: event.candidate });
      };

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await sendDmCallSignal("offer", { offer });
      setDmCallActive(true);
      setStatus(`Voice call started with ${activeDm?.name || "friend"}.`);
    } catch {
      setStatus("Could not start DM voice call. Microphone permission may be blocked.");
    }
  }

  function endDmCall(notifyRemote = true) {
    if (notifyRemote) sendDmCallSignal("end", {});
    dmCallStreamRef.current?.getTracks().forEach((track) => track.stop());
    dmCallStreamRef.current = null;
    dmCallPeerRef.current?.close();
    dmCallPeerRef.current = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    setDmCallActive(false);
    setDmCallMuted(false);
  }

  function toggleDmCallMute() {
    const stream = dmCallStreamRef.current;
    if (!stream) return;
    const nextMuted = !dmCallMuted;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setDmCallMuted(nextMuted);
  }

  function openMessageContextMenu(event, message) {
    event.preventDefault();
    const x = Math.min(event.clientX, window.innerWidth - 240);
    const y = Math.min(event.clientY, window.innerHeight - 180);
    setMessageContextMenu({ x, y, message: { ...message, pinned: isMessagePinned(message) } });
  }

  async function readImageFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("FILE_READ_FAILED"));
      reader.readAsDataURL(file);
    });
  }

  async function onAvatarUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const dataUrl = await readImageFile(file);
    setProfileForm((current) => ({ ...current, pfpUrl: dataUrl }));
  }

  async function onBannerUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const dataUrl = await readImageFile(file);
    setProfileForm((current) => ({ ...current, bannerUrl: dataUrl }));
  }

  async function openMemberProfile(member) {
    try {
      const profileData = await api(`/v1/users/${member.id}/profile`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      setMemberProfileCard({
        ...profileData,
        username: profileData.username || member.username,
        status: member.status || "online"
      });
    } catch {
      setMemberProfileCard({
        id: member.id,
        username: member.username || member.id,
        displayName: member.username || member.id,
        bio: "Profile details are private or unavailable.",
        badges: [],
        status: member.status || "online",
        platformTitle: null
      });
    }
  }

  async function onUploadTheme(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setThemeCss(await file.text());
    setStatus(`Theme loaded: ${file.name}`);
  }

  if (!accessToken) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
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
        <div className="rail-header" title="OpenCom">OC</div>
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
            </button>
          ))}
          <button className="server-pill" title="Create or join a server" onClick={() => { setSettingsOpen(true); setSettingsTab("server"); }}>
            ＋
          </button>
        </div>
      </aside>

      <aside className="channel-sidebar">
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
                    <button className="category-header" onClick={() => toggleCategory(category.id)}>
                      <span className="chevron">{isCollapsed ? "▸" : "▾"}</span>{category.name}
                    </button>
                    {!isCollapsed && (
                      <div className="category-items">
                        {items.map((channel) => (
                          <button
                            key={channel.id}
                            className={`channel-row ${channel.id === activeChannelId ? "active" : ""}`}
                            onClick={() => {
                              if (channel.type === "text") setActiveChannelId(channel.id);
                              if (channel.type === "voice") setVoiceConnectedChannelId(channel.id);
                            }}
                          >
                            <span className="channel-hash">{channel.type === "voice" ? "🔊" : "#"}</span>
                            {channel.name}
                          </button>
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
                  <img src={dm.pfp_url} alt={dm.name} style={{ width: "28px", height: "28px", borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                ) : (
                  <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: `hsl(${Math.abs((dm.participantId || dm.id || "").charCodeAt(0) * 7) % 360}, 70%, 60%)`, display: "grid", placeItems: "center", fontSize: "12px", fontWeight: "bold", flexShrink: 0 }}>
                    {dm.name?.substring(0, 1).toUpperCase()}
                  </div>
                )}
                <span className="channel-hash">@</span> <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{dm.name}</span>
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
                  <img src={friend.pfp_url} alt={friend.username} style={{ width: "28px", height: "28px", borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
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
            <div className="profile-preview" style={{ backgroundImage: profile.bannerUrl ? `url(${profile.bannerUrl})` : undefined }}>
              <div className="avatar">{getInitials(profile.displayName || profile.username || "User")}</div>
              <strong>{profile.displayName || profile.username}</strong>
              <span>@{profile.username}</span>
              <small>{profile.platformTitle || "OpenCom Member"}</small>
            </div>
          </section>
        )}

        <footer className="self-card">
          {voiceConnectedChannelId && (
            <div className="voice-widget">
              <div className="voice-top"><strong>Voice connected</strong><span>{voiceConnectedChannelId}</span></div>
              <div className="voice-actions">
                <button className="ghost" onClick={() => setIsScreenSharing((value) => !value)}>{isScreenSharing ? "Stop Share" : "Share Screen"}</button>
                <button className="danger" onClick={() => { setVoiceConnectedChannelId(""); setIsScreenSharing(false); }}>Disconnect</button>
              </div>
            </div>
          )}

          <div className="user-row">
            <div className="avatar">{profile?.pfpUrl ? <img src={profile.pfpUrl} alt="Your avatar" className="avatar-image" /> : getInitials(me?.username || "OpenCom User")}</div>
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
              <button className="icon-btn danger" onClick={() => { setAccessToken(""); setServers([]); setGuildState(null); setMessages([]); }}>⎋</button>
            </div>
          </div>
        </footer>
      </aside>

      <main className="chat-pane">
        {navMode === "servers" && (
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
                {groupedServerMessages.map((group) => (
                  <article key={group.id} className="msg grouped-msg">
                    {group.pfpUrl ? (
                      <img src={group.pfpUrl} alt={group.author} className="msg-avatar" style={{ objectFit: "cover" }} />
                    ) : (
                      <div className="msg-avatar">{getInitials(group.author || "User")}</div>
                    )}
                    <div className="msg-body">
                      <strong className="msg-author">
                        <button className="name-btn" onClick={() => openMemberProfile({ id: group.authorId, username: group.author, status: "online", pfp_url: group.pfpUrl })}>{group.author}</button>
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
                          {activePinnedServerMessages.some((item) => item.id === message.id) ? "📌 " : ""}{message.content}
                        </p>
                      ))}
                    </div>
                  </article>
                ))}
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
                <input ref={composerInputRef} value={messageText} onChange={(event) => setMessageText(event.target.value)} placeholder={`Message #${activeChannel?.name || "channel"}`} onKeyDown={(event) => event.key === "Enter" && sendMessage()} />
                <button className="ghost composer-icon">🎁</button>
                <button className="send-btn" onClick={sendMessage} disabled={!activeChannelId || !messageText.trim()}>Send</button>
              </footer>
            </section>

            <aside className="members-pane">
              <h4>Online — {memberList.length}</h4>
              {memberList.map((member) => (
                <button className="member-row" key={member.id} title={`View ${member.username}`} onClick={(event) => { event.stopPropagation(); openMemberProfile(member); }}>
                  {member.pfp_url ? (
                    <img src={member.pfp_url} alt={member.username} className="avatar member-avatar" style={{ objectFit: "cover" }} />
                  ) : (
                    <div className="avatar member-avatar">{getInitials(member.username)}</div>
                  )}
                  <div>
                    <strong>{member.username}</strong>
                    <span>{member.id === me?.id ? selfStatus : member.status}</span>
                  </div>
                </button>
              ))}
              {!memberList.length && <p className="hint">No visible members yet.</p>}
            </aside>
          </div>
        )}

        {navMode === "dms" && (
          <>
            <header className="chat-header dm-header-actions">
              <h3>{activeDm ? `@ ${activeDm.name}` : "Direct Messages"}</h3>
              <div className="chat-actions">
                <button className="icon-btn ghost" onClick={() => setShowPinned((value) => !value)} title="Pinned DMs">📌</button>
                {!dmCallActive && <button className="ghost" onClick={startDmCall} disabled={!activeDm}>Start Voice</button>}
                {dmCallActive && <button className="ghost" onClick={toggleDmCallMute}>{dmCallMuted ? "Unmute" : "Mute"}</button>}
                {dmCallActive && <button className="danger" onClick={endDmCall}>End Call</button>}
              </div>
            </header>
            {dmCallActive && <div className="call-banner">In voice call with {activeDm?.name || "friend"}</div>}
            {showPinned && activePinnedDmMessages.length > 0 && (
              <div className="pinned-strip">
                {activePinnedDmMessages.slice(0, 3).map((item) => (
                  <div key={item.id} className="pinned-item"><strong>{item.author}</strong><span>{item.content}</span></div>
                ))}
              </div>
            )}
            <div className="messages" ref={messagesRef}>
              {groupedDmMessages.map((group) => (
                <article key={group.id} className="msg dm-msg grouped-msg">
                  {group.pfpUrl ? (
                    <img src={group.pfpUrl} alt={group.author} className="msg-avatar" style={{ objectFit: "cover" }} />
                  ) : (
                    <div className="msg-avatar">{getInitials(group.author)}</div>
                  )}
                  <div className="msg-body">
                    <strong className="msg-author">
                      <button className="name-btn" onClick={() => openMemberProfile({ id: group.authorId, username: group.author, status: "online", pfp_url: group.pfpUrl })}>{group.author}</button>
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
            <audio ref={remoteAudioRef} autoPlay />
          </>
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

              {(friendView === "online" ? filteredFriends.filter((friend) => friend.status !== "offline") : filteredFriends).map((friend) => (
                <div key={friend.id} className="friend-row">
                  <div className="friend-meta">
                    <strong>{friend.username}</strong>
                    <span>{friend.status}</span>
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
                  <span>{friend.status === "online" ? "Available now" : "Recently active"}</span>
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
          <button className="danger" onClick={() => { setSettingsOpen(true); setSettingsTab("server"); setServerContextMenu(null); }}>Server Settings</button>
        </div>
      )}

      {memberProfileCard && (
        <div className="member-profile-popout" style={{ right: profileCardPosition.x, bottom: profileCardPosition.y }} onClick={(event) => event.stopPropagation()}>
          <div className="popout-drag-handle" onMouseDown={startDraggingProfileCard}>Drag</div>
          <div className="popout-banner" style={{ backgroundImage: memberProfileCard.bannerUrl ? `url(${memberProfileCard.bannerUrl})` : undefined }} />
          <div className="popout-content">
            <div className="avatar popout-avatar">{memberProfileCard.pfpUrl ? <img src={memberProfileCard.pfpUrl} alt="Profile avatar" className="avatar-image" /> : getInitials(memberProfileCard.displayName || memberProfileCard.username || "User")}</div>
            <h4>{memberProfileCard.displayName || memberProfileCard.username}</h4>
            <p className="hint">@{memberProfileCard.username} · {memberProfileCard.status || "online"}</p>
            {memberProfileCard.platformTitle && <p className="hint">{memberProfileCard.platformTitle}</p>}
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
              <button className={settingsTab === "server" ? "active" : "ghost"} onClick={() => setSettingsTab("server")}>Server</button>
              <button className={settingsTab === "roles" ? "active" : "ghost"} onClick={() => setSettingsTab("roles")}>Roles</button>
              <button className={settingsTab === "invites" ? "active" : "ghost"} onClick={() => setSettingsTab("invites")}>Invites</button>
              <button className={settingsTab === "appearance" ? "active" : "ghost"} onClick={() => setSettingsTab("appearance")}>Appearance</button>
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
                    <input placeholder="Server name" value={newServerName} onChange={(event) => setNewServerName(event.target.value)} />
                    <input placeholder="https://node.provider.tld" value={newServerBaseUrl} onChange={(event) => setNewServerBaseUrl(event.target.value)} />
                    <button onClick={createServer}>Add Server</button>
                  </section>

                  {canManageServer && (
                    <section className="card">
                      <h4>Create Workspace</h4>
                      <input placeholder="Workspace name" value={newWorkspaceName} onChange={(event) => setNewWorkspaceName(event.target.value)} />
                      <button onClick={createWorkspace}>Create Workspace</button>
                    </section>
                  )}

                  {canManageServer && (
                    <section className="card">
                      <h4>Create Channel</h4>
                      <input placeholder="New channel/category" value={newChannelName} onChange={(event) => setNewChannelName(event.target.value)} />
                      <select value={newChannelType} onChange={(event) => setNewChannelType(event.target.value)}>
                        <option value="text">Text Channel</option>
                        <option value="voice">Voice Channel</option>
                        <option value="category">Category</option>
                      </select>
                      {newChannelType !== "category" && (
                        <select value={newChannelParentId} onChange={(event) => setNewChannelParentId(event.target.value)}>
                          <option value="">No category</option>
                          {categoryChannels.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                        </select>
                      )}
                      <button onClick={createChannel}>Create Channel</button>
                    </section>
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
                    <h4>Assign Role</h4>
                    <select value={selectedMemberId} onChange={(event) => setSelectedMemberId(event.target.value)}>
                      <option value="">Select member</option>
                      {memberList.map((member) => <option key={member.id} value={member.id}>{member.username}</option>)}
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
                    {inviteCode && <p className="hint">Code: <code>{inviteCode}</code></p>}
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

              {settingsTab === "profile" && (
                <section className="card">
                  <h4>Social Privacy</h4>
                  <label><input type="checkbox" checked={allowFriendRequests} onChange={(event) => setAllowFriendRequests(event.target.checked)} /> Allow incoming friend requests</label>
                  <button onClick={saveSocialSettings}>Save Privacy</button>
                </section>
              )}

              <p className="status">{status}</p>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
