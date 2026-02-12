import { useEffect, useMemo, useRef, useState } from "react";

const CORE_API = import.meta.env.VITE_CORE_API_URL || "https://openapi.donskyblock.xyz";
const THEME_STORAGE_KEY = "opencom_custom_theme_css";
const THEME_ENABLED_STORAGE_KEY = "opencom_custom_theme_enabled";

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

function groupMessages(messages = [], getAuthor, getTimestamp) {
  const groups = [];

  for (const message of messages) {
    const author = getAuthor(message);
    const createdRaw = getTimestamp(message);
    const createdAt = createdRaw ? new Date(createdRaw) : null;
    const createdMs = createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt.getTime() : null;

    const previousGroup = groups[groups.length - 1];
    const canGroup = previousGroup
      && previousGroup.author === author
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
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [friendRequests, setFriendRequests] = useState({ incoming: [], outgoing: [] });
  const [allowFriendRequests, setAllowFriendRequests] = useState(true);

  const [collapsedCategories, setCollapsedCategories] = useState({});
  const [voiceConnectedChannelId, setVoiceConnectedChannelId] = useState("");
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState("profile");
  const [serverContextMenu, setServerContextMenu] = useState(null);
  const [messageContextMenu, setMessageContextMenu] = useState(null);
  const [replyTarget, setReplyTarget] = useState(null);
  const [memberProfileCard, setMemberProfileCard] = useState(null);
  const [themeCss, setThemeCss, themeEnabled, setThemeEnabled] = useThemeCss();

  const messagesRef = useRef(null);
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
      members.set(id, { id, username: id, status: "online" });
    }

    if (me?.id && !members.has(me.id)) {
      members.set(me.id, { id: me.id, username: me.username || me.id, status: "online" });
    }

    return Array.from(members.values());
  }, [guildState, messages, me]);

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
    (message) => message.author_id || message.authorId || "Unknown",
    (message) => message.created_at || message.createdAt
  ), [messages]);

  const groupedDmMessages = useMemo(() => groupMessages(
    activeDm?.messages || [],
    (message) => message.author || "Unknown",
    (message) => message.createdAt
  ), [activeDm]);

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
          const [friendsData, dmsData, requestData, socialSettingsData] = await Promise.all([
            api("/v1/social/friends", { headers: { Authorization: `Bearer ${accessToken}` } }),
            api("/v1/social/dms", { headers: { Authorization: `Bearer ${accessToken}` } }),
            api("/v1/social/requests", { headers: { Authorization: `Bearer ${accessToken}` } }),
            api("/v1/social/settings", { headers: { Authorization: `Bearer ${accessToken}` } })
          ]);
          setFriends(friendsData.friends || []);
          setDms((dmsData.dms || []).map((item) => ({ ...item, messages: [] })));
          setFriendRequests({ incoming: requestData.incoming || [], outgoing: requestData.outgoing || [] });
          setAllowFriendRequests(socialSettingsData.allowFriendRequests !== false);
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

        if (!nextGuilds.some((guild) => guild.id === activeGuildId)) {
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

  async function createWorkspace() {
    if (!activeServer || !newWorkspaceName.trim()) return;
    const name = newWorkspaceName.trim();

    async function createWith(server) {
      await nodeApi(server.baseUrl, "/v1/guilds", server.membershipToken, {
        method: "POST",
        body: JSON.stringify({ name })
      });
      const updated = await nodeApi(server.baseUrl, "/v1/guilds", server.membershipToken);
      setGuilds(updated || []);
    }

    try {
      await createWith(activeServer);
      setNewWorkspaceName("");
      setStatus("Workspace created.");
    } catch (error) {
      if (String(error.message).includes("401")) {
        try {
          const refreshed = await api("/v1/servers", { headers: { Authorization: `Bearer ${accessToken}` } });
          const nextServers = refreshed.servers || [];
          setServers(nextServers);
          const activeRefreshed = nextServers.find((server) => server.id === activeServer.id);
          if (activeRefreshed) {
            await createWith(activeRefreshed);
            setNewWorkspaceName("");
            setStatus("Workspace created.");
            return;
          }
        } catch {
          // continue to error message below
        }
      }
      setStatus(`Create workspace failed: ${error.message}`);
    }
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

  function openMessageContextMenu(event, message) {
    event.preventDefault();
    setMessageContextMenu({ x: event.clientX, y: event.clientY, message });
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
          <button className="server-pill" title="Create or join a server" onClick={() => { setSettingsOpen(true); setSettingsTab("workspace"); }}>
            ＋
          </button>
        </div>
      </aside>

      <aside className="channel-sidebar">
        <header className="sidebar-header">
          <h2>{navMode === "servers" ? (activeServer?.name || "No workspace") : navMode.toUpperCase()}</h2>
          <small>{navMode === "servers" ? (activeGuild?.name || "Choose a workspace") : "Unified communication hub"}</small>
        </header>

        {navMode === "servers" && (
          <>
            <section className="sidebar-block">
              <label>Workspace</label>
              <select value={activeGuildId} onChange={(event) => setActiveGuildId(event.target.value)}>
                <option value="">Select workspace</option>
                {guilds.map((guild) => <option key={guild.id} value={guild.id}>{guild.name}</option>)}
              </select>
            </section>

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
              <button key={dm.id} className={`channel-row ${dm.id === activeDmId ? "active" : ""}`} onClick={() => setActiveDmId(dm.id)}>
                <span className="channel-hash">@</span> {dm.name}
              </button>
            ))}
            {!dms.length && <p className="hint">Add friends to open direct message threads.</p>}
          </section>
        )}

        {navMode === "friends" && (
          <section className="sidebar-block channels-container">
            {friends.map((friend) => (
              <button className="friend-row" key={friend.id} onClick={() => openDmFromFriend(friend)}>
                <strong>{friend.username}</strong>
                <span>{friend.status}</span>
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
            <div className="avatar">{getInitials(me?.username || "OpenCom User")}</div>
            <div className="user-meta"><strong>{me?.username}</strong><span>{canManageServer ? "Owner" : "Member"}</span></div>
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
                  <button className="icon-btn ghost" title="Threads">🧵</button>
                  <button className="icon-btn ghost" title="Notifications">🔔</button>
                  <button className="icon-btn ghost" title="Pinned">📌</button>
                  <button className="icon-btn ghost" title="Members">👥</button>
                  <input className="search-input" placeholder={`Search ${activeServer?.name || "workspace"}`} />
                  <button className="ghost" onClick={() => { setSettingsOpen(true); setSettingsTab("workspace"); }}>Open settings</button>
                </div>
              </header>

              <div className="messages" ref={messagesRef}>
                {groupedServerMessages.map((group) => (
                  <article key={group.id} className="msg grouped-msg">
                    <div className="msg-avatar">{getInitials(group.author || "User")}</div>
                    <div className="msg-body">
                      <strong className="msg-author">{group.author} <span className="msg-time">{formatMessageTime(group.firstMessageTime)}</span></strong>
                      {group.messages.map((message) => (
                        <p key={message.id} onContextMenu={(event) => openMessageContextMenu(event, { id: message.id, author: group.author, content: message.content, mine: (message.author_id || message.authorId) === me?.id })}>
                          {message.content}
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

              <footer className="composer server-composer">
                <button className="ghost composer-icon">＋</button>
                <input value={messageText} onChange={(event) => setMessageText(event.target.value)} placeholder={`Message #${activeChannel?.name || "channel"}`} onKeyDown={(event) => event.key === "Enter" && sendMessage()} />
                <button className="ghost composer-icon">🎁</button>
                <button className="send-btn" onClick={sendMessage} disabled={!activeChannelId || !messageText.trim()}>Send</button>
              </footer>
            </section>

            <aside className="members-pane">
              <h4>Online — {memberList.length}</h4>
              {memberList.map((member) => (
                <button className="member-row" key={member.id} title={`View ${member.username}`} onClick={(event) => { event.stopPropagation(); openMemberProfile(member); }}>
                  <div className="avatar member-avatar">{getInitials(member.username)}</div>
                  <div>
                    <strong>{member.username}</strong>
                    <span>{member.status}</span>
                  </div>
                </button>
              ))}
              {!memberList.length && <p className="hint">No visible members yet.</p>}
            </aside>
          </div>
        )}

        {navMode === "dms" && (
          <>
            <header className="chat-header"><h3>{activeDm ? `@ ${activeDm.name}` : "Direct Messages"}</h3></header>
            <div className="messages" ref={messagesRef}>
              {groupedDmMessages.map((group) => (
                <article key={group.id} className="msg dm-msg grouped-msg">
                  <div className="msg-avatar">{getInitials(group.author)}</div>
                  <div className="msg-body">
                    <strong className="msg-author">{group.author} <span className="msg-time">{formatMessageTime(group.firstMessageTime)}</span></strong>
                    {group.messages.map((message) => <p key={message.id}>{message.content}</p>)}
                  </div>
                </article>
              ))}
              {!activeDm && <p className="empty">Select a DM on the left.</p>}
            </div>
            <footer className="composer dm-composer">
              <input value={dmText} onChange={(event) => setDmText(event.target.value)} placeholder={`Message ${activeDm?.name || "friend"}`} onKeyDown={(event) => event.key === "Enter" && sendDm()} />
              <button className="send-btn" onClick={sendDm} disabled={!activeDm || !dmText.trim()}>Send</button>
            </footer>
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
          <button onClick={() => { setReplyTarget({ author: messageContextMenu.message.author, content: messageContextMenu.message.content }); setMessageContextMenu(null); }}>Reply</button>
          {messageContextMenu.message.mine && <button className="danger" onClick={() => deleteServerMessage(messageContextMenu.message.id)}>Delete</button>}
        </div>
      )}

      {serverContextMenu && (
        <div className="server-context-menu" style={{ top: serverContextMenu.y, left: serverContextMenu.x }} onClick={(event) => event.stopPropagation()}>
          <button onClick={() => openServerFromContext(serverContextMenu.server.id)}>Open Server</button>
          <button onClick={() => { setInviteServerId(serverContextMenu.server.id); setSettingsOpen(true); setSettingsTab("invites"); setServerContextMenu(null); }}>Create Invite</button>
          <button onClick={() => copyServerId(serverContextMenu.server.id)}>Copy Server ID</button>
          <button className="danger" onClick={() => { setSettingsOpen(true); setSettingsTab("workspace"); setServerContextMenu(null); }}>Server Settings</button>
        </div>
      )}

      {memberProfileCard && (
        <div className="member-profile-popout" onClick={(event) => event.stopPropagation()}>
          <div className="popout-banner" style={{ backgroundImage: memberProfileCard.bannerUrl ? `url(${memberProfileCard.bannerUrl})` : undefined }} />
          <div className="popout-content">
            <div className="avatar popout-avatar">{getInitials(memberProfileCard.displayName || memberProfileCard.username || "User")}</div>
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
              <button className={settingsTab === "workspace" ? "active" : "ghost"} onClick={() => setSettingsTab("workspace")}>Workspace</button>
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

              {settingsTab === "workspace" && (
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
