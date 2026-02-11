import { useEffect, useMemo, useRef, useState } from "react";

const CORE_API = import.meta.env.VITE_CORE_API_URL || "https://openapi.donskyblock.xyz";
const THEME_STORAGE_KEY = "opencom_custom_theme_css";

function useThemeCss() {
  const [css, setCss] = useState(localStorage.getItem(THEME_STORAGE_KEY) || "");

  useEffect(() => {
    let tag = document.getElementById("opencom-theme-style");
    if (!tag) {
      tag = document.createElement("style");
      tag.id = "opencom-theme-style";
      document.head.appendChild(tag);
    }
    tag.textContent = css;
    localStorage.setItem(THEME_STORAGE_KEY, css);
  }, [css]);

  return [css, setCss];
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

export function App() {
  const [accessToken, setAccessToken] = useState(localStorage.getItem("opencom_access_token") || "");
  const [authMode, setAuthMode] = useState("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [me, setMe] = useState(null);
  const [navMode, setNavMode] = useState("servers");

  const [servers, setServers] = useState([]);
  const [guilds, setGuilds] = useState([]);
  const [activeServerId, setActiveServerId] = useState("");
  const [activeGuildId, setActiveGuildId] = useState("");
  const [activeChannelId, setActiveChannelId] = useState("");
  const [guildState, setGuildState] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState("");

  const [friends, setFriends] = useState([]);
  const [friendSearch, setFriendSearch] = useState("");
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
  const [collapsedCategories, setCollapsedCategories] = useState({});
  const [voiceConnectedChannelId, setVoiceConnectedChannelId] = useState("");
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [serverContextMenu, setServerContextMenu] = useState(null);
  const [status, setStatus] = useState("");
  const [themeCss, setThemeCss] = useThemeCss();
  const messagesRef = useRef(null);

  const storageScope = me?.id || "anonymous";

  useEffect(() => {
    if (accessToken) localStorage.setItem("opencom_access_token", accessToken);
    else localStorage.removeItem("opencom_access_token");
  }, [accessToken]);

  useEffect(() => {
    setFriends(getStoredJson(`opencom_friends_${storageScope}`, []));
    const storedDms = getStoredJson(`opencom_dms_${storageScope}`, []);
    setDms(storedDms);
    if (!storedDms.some((item) => item.id === activeDmId)) setActiveDmId(storedDms[0]?.id || "");
  }, [storageScope]);

  useEffect(() => {
    localStorage.setItem(`opencom_friends_${storageScope}`, JSON.stringify(friends));
  }, [friends, storageScope]);

  useEffect(() => {
    localStorage.setItem(`opencom_dms_${storageScope}`, JSON.stringify(dms));
  }, [dms, storageScope]);

  useEffect(() => {
    const onGlobalClick = () => setServerContextMenu(null);
    const onEscape = (event) => {
      if (event.key === "Escape") setServerContextMenu(null);
    };

    window.addEventListener("click", onGlobalClick);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("click", onGlobalClick);
      window.removeEventListener("keydown", onEscape);
    };
  }, []);

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
    const query = friendSearch.trim().toLowerCase();
    if (!query) return friends;
    return friends.filter((friend) => friend.username.toLowerCase().includes(query) || friend.id.toLowerCase().includes(query));
  }, [friends, friendSearch]);

  const memberList = useMemo(() => {
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
  }, [messages, me]);

  const groupedChannelSections = useMemo(() => {
    const categories = categoryChannels.map((category) => ({
      category,
      channels: sortedChannels.filter((channel) => channel.parent_id === category.id && channel.type !== "category")
    }));
    const uncategorized = sortedChannels.filter((channel) => !channel.parent_id && channel.type !== "category");
    return [...categories, ...(uncategorized.length ? [{ category: { id: "uncategorized", name: "Channels" }, channels: uncategorized }] : [])];
  }, [categoryChannels, sortedChannels]);

  async function loadSession() {
    if (!accessToken) return;
    try {
      const meData = await api("/v1/me", { headers: { Authorization: `Bearer ${accessToken}` } });
      setMe(meData);

      const serverData = await api("/v1/servers", { headers: { Authorization: `Bearer ${accessToken}` } });
      const nextServers = serverData.servers || [];
      setServers(nextServers);
      if (!nextServers.length) {
        setActiveServerId("");
        setActiveGuildId("");
        setGuildState(null);
      } else if (!nextServers.some((server) => server.id === activeServerId)) {
        setActiveServerId(nextServers[0].id);
      }

      const profileData = await api(`/v1/users/${meData.id}/profile`, { headers: { Authorization: `Bearer ${accessToken}` } });
      setProfile(profileData);
      setProfileForm({
        displayName: profileData.displayName || "",
        bio: profileData.bio || "",
        pfpUrl: profileData.pfpUrl || "",
        bannerUrl: profileData.bannerUrl || ""
      });
    } catch (error) {
      setStatus(`Session error: ${error.message}`);
    }
  }

  useEffect(() => {
    loadSession();
  }, [accessToken]);

  useEffect(() => {
    if (navMode !== "servers" || !activeServer) {
      setGuilds([]);
      if (navMode !== "servers") setGuildState(null);
      return;
    }

    nodeApi(activeServer.baseUrl, "/v1/guilds", activeServer.membershipToken)
      .then((items) => {
        setGuilds(items || []);
        if (!items?.length) {
          setActiveGuildId("");
          return;
        }
        if (!items.some((guild) => guild.id === activeGuildId)) setActiveGuildId(items[0].id);
      })
      .catch((error) => {
        setGuilds([]);
        setStatus(`Guild list failed: ${error.message}`);
      });
  }, [activeServerId, servers, navMode]);

  useEffect(() => {
    if (navMode !== "servers" || !activeServer || !activeGuildId) return;
    loadGuildState(activeServer, activeGuildId);
  }, [activeGuildId, activeServerId, navMode]);

  useEffect(() => {
    if (navMode !== "servers" || !activeServer || !activeChannelId) return;
    loadMessages(activeServer, activeChannelId);
  }, [activeChannelId, activeServerId, navMode]);

  useEffect(() => {
    if (!messagesRef.current) return;
    messagesRef.current.scrollTo({ top: messagesRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, activeChannelId, activeDmId, dms]);

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

  async function loadGuildState(server, guildId) {
    try {
      const state = await nodeApi(server.baseUrl, `/v1/guilds/${guildId}/state`, server.membershipToken);
      setGuildState(state);
      setActiveChannelId((current) => {
        const exists = state.channels.some((channel) => channel.id === current && channel.type === "text");
        if (exists) return current;
        return state.channels.find((channel) => channel.type === "text")?.id || "";
      });
    } catch (error) {
      setStatus(`Guild state failed: ${error.message}`);
    }
  }

  async function loadMessages(server, channelId) {
    try {
      const data = await nodeApi(server.baseUrl, `/v1/channels/${channelId}/messages`, server.membershipToken);
      setMessages((data.messages || []).slice().reverse());
    } catch (error) {
      setStatus(`Message fetch failed: ${error.message}`);
    }
  }

  async function sendMessage() {
    if (!activeServer || !activeChannelId || !messageText.trim()) return;
    try {
      await nodeApi(activeServer.baseUrl, `/v1/channels/${activeChannelId}/messages`, activeServer.membershipToken, {
        method: "POST",
        body: JSON.stringify({ content: messageText.trim() })
      });
      setMessageText("");
      await loadMessages(activeServer, activeChannelId);
    } catch (error) {
      setStatus(`Send failed: ${error.message}`);
    }
  }

  function sendDm() {
    if (!activeDm || !dmText.trim()) return;
    setDms((current) => current.map((item) => {
      if (item.id !== activeDm.id) return item;
      return {
        ...item,
        messages: [...(item.messages || []), { id: crypto.randomUUID(), author: me?.username || "me", content: dmText.trim(), createdAt: new Date().toISOString() }]
      };
    }));
    setDmText("");
  }

  function addFriend() {
    const cleaned = friendSearch.trim();
    if (!cleaned) return;
    const exists = friends.some((friend) => friend.id === cleaned || friend.username.toLowerCase() === cleaned.toLowerCase());
    if (exists) {
      setStatus("Friend already in your list.");
      return;
    }
    const friend = { id: cleaned.toLowerCase().replace(/\s+/g, "-"), username: cleaned, status: "online" };
    setFriends((current) => [friend, ...current]);
    setDms((current) => [{ id: friend.id, name: friend.username, messages: [] }, ...current]);
    setFriendSearch("");
    setStatus(`Friend request accepted for ${friend.username}.`);
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
      await loadSession();
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
      await loadSession();
      setStatus("Server added.");
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
      setStatus("Invite created.");
    } catch (error) {
      setStatus(`Invite failed: ${error.message}`);
    }
  }

  async function previewInvite() {
    if (!joinInviteCode.trim()) return;
    try {
      const data = await api(`/v1/invites/${joinInviteCode.trim()}`);
      setInvitePreview(data);
      setStatus("Invite metadata loaded.");
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
      await loadSession();
      setJoinInviteCode("");
      setInvitePreview(null);
      setStatus("Joined server from invite.");
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
      await loadGuildState(activeServer, activeGuildId);
      setStatus("Channel created.");
    } catch (error) {
      setStatus(`Create channel failed: ${error.message}`);
    }
  }

  function toggleCategory(categoryId) {
    setCollapsedCategories((current) => ({ ...current, [categoryId]: !current[categoryId] }));
  }

  function openServerContextMenu(event, server) {
    event.preventDefault();
    setServerContextMenu({
      server,
      x: event.clientX,
      y: event.clientY
    });
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
    setToolsOpen(false);
    setServerContextMenu(null);
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
          <p className="sub">Jump back into your communities.</p>
          <form onSubmit={handleAuthSubmit}>
            <label>Email<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required /></label>
            {authMode === "register" && <label>Username<input value={username} onChange={(e) => setUsername(e.target.value)} required /></label>}
            <label>Password<input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required /></label>
            <button type="submit">{authMode === "login" ? "Login" : "Register + Login"}</button>
          </form>
          <button className="link-btn" onClick={() => setAuthMode(authMode === "login" ? "register" : "login")}>{authMode === "login" ? "Need an account? Register" : "Have an account? Login"}</button>
          <p className="status">{status}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="discord-shell">
      <aside className="server-rail">
        <div className="rail-header">OC</div>
        <button className={`server-pill nav-pill ${navMode === "friends" ? "active" : ""}`} onClick={() => setNavMode("friends")}>👥</button>
        <button className={`server-pill nav-pill ${navMode === "dms" ? "active" : ""}`} onClick={() => setNavMode("dms")}>💬</button>
        <button className={`server-pill nav-pill ${navMode === "profile" ? "active" : ""}`} onClick={() => setNavMode("profile")}>🪪</button>
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
              {server.name.slice(0, 2).toUpperCase()}
            </button>
          ))}
        </div>
      </aside>

      <aside className="channel-sidebar">
        <header className="sidebar-header">
          <h2>{navMode === "servers" ? (activeServer?.name || "No server") : navMode.toUpperCase()}</h2>
          <small>{navMode === "servers" ? (activeGuild?.name || "Select a guild") : "Discord-like social layer"}</small>
        </header>

        {navMode === "servers" && (
          <>
            <section className="sidebar-block">
              <label>Guild</label>
              <select value={activeGuildId} onChange={(e) => setActiveGuildId(e.target.value)}>
                <option value="">Select guild</option>
                {guilds.map((guild) => <option key={guild.id} value={guild.id}>{guild.name}</option>)}
              </select>
            </section>
            <section className="sidebar-block channels-container">
              {groupedChannelSections.map(({ category, channels: items }) => {
                const isCollapsed = collapsedCategories[category.id];
                return (
                  <div className="category-block" key={category.id}>
                    <button className="category-header" onClick={() => toggleCategory(category.id)}><span className="chevron">{isCollapsed ? "▸" : "▾"}</span>{category.name}</button>
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
                            <span className="channel-hash">{channel.type === "voice" ? "🔊" : "#"}</span>{channel.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
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
            {!dms.length && <p className="hint">Add friends to start DMs.</p>}
          </section>
        )}

        {navMode === "friends" && (
          <section className="sidebar-block channels-container">
            <input placeholder="Add friend by username" value={friendSearch} onChange={(e) => setFriendSearch(e.target.value)} />
            <button onClick={addFriend}>Add Friend</button>
            {filteredFriends.map((friend) => (
              <div className="friend-row" key={friend.id}>
                <strong>{friend.username}</strong>
                <span>{friend.status}</span>
              </div>
            ))}
          </section>
        )}

        {navMode === "profile" && profile && (
          <section className="sidebar-block channels-container">
            <div className="profile-preview" style={{ backgroundImage: profile.bannerUrl ? `url(${profile.bannerUrl})` : undefined }}>
              <div className="avatar">{(profile.displayName || profile.username || "U").slice(0, 1).toUpperCase()}</div>
              <strong>{profile.displayName || profile.username}</strong>
              <span>@{profile.username}</span>
              <small>{profile.platformTitle || "OpenCom Member"}</small>
            </div>
          </section>
        )}

        <footer className="self-card">
          {voiceConnectedChannelId && (
            <div className="voice-widget">
              <div className="voice-top"><strong>Voice Connected</strong><span>{voiceConnectedChannelId}</span></div>
              <div className="voice-actions">
                <button className="ghost" onClick={() => setIsScreenSharing((v) => !v)}>{isScreenSharing ? "Stop Share" : "Share Screen"}</button>
                <button className="danger" onClick={() => { setVoiceConnectedChannelId(""); setIsScreenSharing(false); }}>Disconnect</button>
              </div>
            </div>
          )}
          <div className="user-row">
            <div className="avatar">{(me?.username || "U").slice(0, 1).toUpperCase()}</div>
            <div className="user-meta"><strong>{me?.username}</strong><span>{canManageServer ? "Owner" : "Member"}</span></div>
            <div className="user-controls">
              <button className={`icon-btn ${isMuted ? "danger" : "ghost"}`} onClick={() => setIsMuted((v) => !v)}>{isMuted ? "🎙️" : "🎤"}</button>
              <button className={`icon-btn ${isDeafened ? "danger" : "ghost"}`} onClick={() => setIsDeafened((v) => !v)}>{isDeafened ? "🔇" : "🎧"}</button>
              <button className="icon-btn ghost" onClick={() => setToolsOpen((v) => !v)}>⚙️</button>
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
                <h3><span className="channel-hash">#</span> {activeChannel?.name || "general"}</h3>
                <div className="chat-actions">
                  <button className="icon-btn ghost" title="Threads">🧵</button>
                  <button className="icon-btn ghost" title="Notifications">🔔</button>
                  <button className="icon-btn ghost" title="Pinned">📌</button>
                  <button className="icon-btn ghost" title="Members">👥</button>
                  <input className="search-input" placeholder={`Search ${activeServer?.name || "server"}`} />
                  <button className="ghost" onClick={() => setToolsOpen((v) => !v)}>Server Tools</button>
                </div>
              </header>
              <div className="messages" ref={messagesRef}>
                {messages.map((message) => (
                  <article key={message.id} className="msg">
                    <div className="msg-avatar">{(message.author_id || message.authorId || "U").slice(0, 1).toUpperCase()}</div>
                    <div className="msg-body">
                      <strong>{message.author_id || message.authorId} <span className="msg-time">just now</span></strong>
                      <p>{message.content}</p>
                    </div>
                  </article>
                ))}
                {!messages.length && <p className="empty">No messages yet. Start the conversation.</p>}
              </div>
              <footer className="composer">
                <button className="ghost composer-icon">＋</button>
                <input value={messageText} onChange={(e) => setMessageText(e.target.value)} placeholder={`Message #${activeChannel?.name || "channel"}`} onKeyDown={(e) => e.key === "Enter" && sendMessage()} />
                <button className="ghost composer-icon">🎁</button>
                <button onClick={sendMessage}>Send</button>
              </footer>
            </section>

            <aside className="members-pane">
              <h4>Online — {memberList.length}</h4>
              {memberList.map((member) => (
                <div className="member-row" key={member.id}>
                  <div className="avatar member-avatar">{member.username.slice(0, 1).toUpperCase()}</div>
                  <div>
                    <strong>{member.username}</strong>
                    <span>{member.status}</span>
                  </div>
                </div>
              ))}
              {!memberList.length && <p className="hint">No visible members yet.</p>}
            </aside>
          </div>
        )}

        {navMode === "dms" && (
          <>
            <header className="chat-header"><h3>{activeDm ? `@ ${activeDm.name}` : "Direct Messages"}</h3></header>
            <div className="messages" ref={messagesRef}>
              {(activeDm?.messages || []).map((message) => <article key={message.id} className="msg"><strong>{message.author} <span className="msg-time">{new Date(message.createdAt).toLocaleTimeString()}</span></strong><p>{message.content}</p></article>)}
              {!activeDm && <p className="empty">Select a DM on the left.</p>}
            </div>
            <footer className="composer"><input value={dmText} onChange={(e) => setDmText(e.target.value)} placeholder={`Message ${activeDm?.name || "friend"}`} onKeyDown={(e) => e.key === "Enter" && sendDm()} /><button onClick={sendDm}>Send</button></footer>
          </>
        )}

        {navMode === "friends" && (
          <div className="social-panel">
            <h3>Friends</h3>
            <p className="hint">Discord-style friend management now lives directly in-app.</p>
            {filteredFriends.map((friend) => <div key={friend.id} className="friend-row"><strong>{friend.username}</strong><span>{friend.status}</span></div>)}
          </div>
        )}

        {navMode === "profile" && (
          <div className="social-panel">
            <h3>Profile Settings</h3>
            <label>Display Name<input value={profileForm.displayName} onChange={(e) => setProfileForm((c) => ({ ...c, displayName: e.target.value }))} /></label>
            <label>Bio<textarea rows={4} value={profileForm.bio} onChange={(e) => setProfileForm((c) => ({ ...c, bio: e.target.value }))} /></label>
            <label>Avatar URL<input value={profileForm.pfpUrl} onChange={(e) => setProfileForm((c) => ({ ...c, pfpUrl: e.target.value }))} /></label>
            <label>Banner URL<input value={profileForm.bannerUrl} onChange={(e) => setProfileForm((c) => ({ ...c, bannerUrl: e.target.value }))} /></label>
            <button onClick={saveProfile}>Save Profile</button>
          </div>
        )}
      </main>


      {serverContextMenu && (
        <div
          className="server-context-menu"
          style={{ top: serverContextMenu.y, left: serverContextMenu.x }}
          onClick={(event) => event.stopPropagation()}
        >
          <button onClick={() => openServerFromContext(serverContextMenu.server.id)}>Open Server</button>
          <button onClick={() => { setInviteServerId(serverContextMenu.server.id); setToolsOpen(true); setServerContextMenu(null); }}>Create Invite</button>
          <button onClick={() => copyServerId(serverContextMenu.server.id)}>Copy Server ID</button>
          <button className="danger" onClick={() => { setStatus("Server settings coming next."); setServerContextMenu(null); }}>Server Settings</button>
        </div>
      )}

      {toolsOpen && (
        <div className="tools-drawer">
          <section className="card"><h4>Join Server</h4><input placeholder="Paste invite code" value={joinInviteCode} onChange={(e) => setJoinInviteCode(e.target.value)} /><div className="row-actions"><button className="ghost" onClick={previewInvite}>Preview</button><button onClick={joinInvite}>Join</button></div>{invitePreview && <p className="hint">Invite: {invitePreview.code} · Uses: {invitePreview.uses}</p>}</section>
          <section className="card"><h4>Add Server Provider</h4><input placeholder="Server name" value={newServerName} onChange={(e) => setNewServerName(e.target.value)} /><input placeholder="https://node.provider.tld" value={newServerBaseUrl} onChange={(e) => setNewServerBaseUrl(e.target.value)} /><button onClick={createServer}>Add Server</button></section>
          <section className="card"><h4>Server Invites</h4><select value={inviteServerId} onChange={(e) => setInviteServerId(e.target.value)}><option value="">Select server</option>{servers.map((server) => <option key={server.id} value={server.id}>{server.name}</option>)}</select><button onClick={createInvite}>Generate Invite</button>{inviteCode && <p className="hint">Code: <code>{inviteCode}</code></p>}</section>
          {canManageServer && (
            <section className="card"><h4>Owner Actions</h4><input placeholder="New channel/category" value={newChannelName} onChange={(e) => setNewChannelName(e.target.value)} /><select value={newChannelType} onChange={(e) => setNewChannelType(e.target.value)}><option value="text">Text Channel</option><option value="voice">Voice Channel</option><option value="category">Category</option></select>{newChannelType !== "category" && (<select value={newChannelParentId} onChange={(e) => setNewChannelParentId(e.target.value)}><option value="">No category</option>{categoryChannels.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>)}<button onClick={createChannel}>Create Channel</button></section>
          )}
          <section className="card"><h4>Custom CSS Theme</h4><input type="file" accept="text/css,.css" onChange={onUploadTheme} /><textarea value={themeCss} onChange={(e) => setThemeCss(e.target.value)} rows={6} placeholder="Paste custom CSS" /></section>
          <p className="status">{status}</p>
        </div>
      )}
    </div>
  );
}
