import { useEffect, useMemo, useRef, useState } from "react";

const CORE_API = import.meta.env.VITE_CORE_API_URL || "https://openapi.donskyblock.xyz";
const FRONTEND_URL = import.meta.env.VITE_FRONTEND_URL || "https://opencom.donskyblock.xyz";
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

export function App() {
  const [accessToken, setAccessToken] = useState(localStorage.getItem("opencom_access_token") || "");
  const [authMode, setAuthMode] = useState("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [me, setMe] = useState(null);
  const [servers, setServers] = useState([]);
  const [guilds, setGuilds] = useState([]);
  const [activeServerId, setActiveServerId] = useState("");
  const [activeGuildId, setActiveGuildId] = useState("");
  const [activeChannelId, setActiveChannelId] = useState("");
  const [guildState, setGuildState] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState("");
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
  const [status, setStatus] = useState("");
  const [themeCss, setThemeCss] = useThemeCss();
  const messagesRef = useRef(null);

  useEffect(() => {
    if (accessToken) localStorage.setItem("opencom_access_token", accessToken);
    else localStorage.removeItem("opencom_access_token");
  }, [accessToken]);

  const activeServer = useMemo(
    () => servers.find((server) => server.id === activeServerId) || null,
    [servers, activeServerId]
  );

  const activeGuild = useMemo(
    () => guilds.find((guild) => guild.id === activeGuildId) || null,
    [guilds, activeGuildId]
  );

  const channels = guildState?.channels || [];

  const activeChannel = useMemo(
    () => channels.find((channel) => channel.id === activeChannelId) || null,
    [channels, activeChannelId]
  );

  const canManageServer = useMemo(() => {
    if (!activeServer) return false;
    return (activeServer.roles || []).includes("owner") || (activeServer.roles || []).includes("platform_admin");
  }, [activeServer]);

  const sortedChannels = useMemo(
    () => [...channels].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [channels]
  );

  const categoryChannels = useMemo(
    () => sortedChannels.filter((channel) => channel.type === "category"),
    [sortedChannels]
  );

  const groupedChannelSections = useMemo(() => {
    const categories = categoryChannels.map((category) => ({
      type: "category",
      category,
      channels: sortedChannels.filter((channel) => channel.parent_id === category.id && channel.type !== "category")
    }));

    const uncategorized = sortedChannels.filter((channel) => !channel.parent_id && channel.type !== "category");

    return [
      ...categories,
      ...(uncategorized.length
        ? [{ type: "category", category: { id: "uncategorized", name: "Text & Voice Channels" }, channels: uncategorized }]
        : [])
    ];
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
        return;
      }

      if (!nextServers.some((server) => server.id === activeServerId)) {
        setActiveServerId(nextServers[0].id);
      }
    } catch (error) {
      setStatus(`Session error: ${error.message}`);
    }
  }

  useEffect(() => {
    loadSession();
  }, [accessToken]);

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setStatus("Authenticating...");

    try {
      if (authMode === "register") {
        await api("/v1/auth/register", {
          method: "POST",
          body: JSON.stringify({ email, username, password })
        });
      }

      const loginData = await api("/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });

      setAccessToken(loginData.accessToken);
      setMe(loginData.user);
      setStatus("Authenticated.");
    } catch (error) {
      setStatus(`Auth failed: ${error.message}`);
    }
  }

  async function createServer() {
    if (!newServerName.trim() || !newServerBaseUrl.trim()) return;
    setStatus("Adding server provider...");
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
    setStatus("Creating invite...");
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
    setStatus("Checking invite metadata...");
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
    setStatus("Joining via invite...");
    try {
      await api(`/v1/invites/${code}/join`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      await loadSession();
      setJoinInviteCode("");
      setInvitePreview(null);
      setStatus("Joined server from invite.");
    } catch (error) {
      setStatus(`Join failed: ${error.message}`);
    }
  }

  async function loadGuildState(server, guildId) {
    if (!server || !guildId) return;
    try {
      const state = await nodeApi(server.baseUrl, `/v1/guilds/${guildId}/state`, server.membershipToken);
      setGuildState(state);
      setActiveChannelId((current) => {
        const exists = state.channels.some((channel) => channel.id === current && channel.type === "text");
        if (exists) return current;
        const firstText = state.channels.find((channel) => channel.type === "text");
        return firstText?.id || "";
      });
    } catch (error) {
      setStatus(`Guild state failed: ${error.message}`);
    }
  }

  async function loadMessages(server, channelId) {
    if (!server || !channelId) return;
    try {
      const data = await nodeApi(server.baseUrl, `/v1/channels/${channelId}/messages`, server.membershipToken);
      setMessages((data.messages || []).slice().reverse());
    } catch (error) {
      setStatus(`Message fetch failed: ${error.message}`);
    }
  }

  useEffect(() => {
    if (!activeServer) {
      setGuilds([]);
      setGuildState(null);
      return;
    }

    nodeApi(activeServer.baseUrl, "/v1/guilds", activeServer.membershipToken)
      .then((items) => {
        setGuilds(items || []);
        if (!items?.length) {
          setActiveGuildId("");
          return;
        }

        if (!items.some((guild) => guild.id === activeGuildId)) {
          setActiveGuildId(items[0].id);
        }
      })
      .catch((error) => {
        setGuilds([]);
        setStatus(`Guild list failed: ${error.message}`);
      });
  }, [activeServerId, servers]);

  useEffect(() => {
    if (!activeServer || !activeGuildId) return;
    loadGuildState(activeServer, activeGuildId);
  }, [activeGuildId, activeServerId]);

  useEffect(() => {
    if (!activeServer || !activeChannelId) return;
    loadMessages(activeServer, activeChannelId);
  }, [activeChannelId, activeServerId]);

  useEffect(() => {
    if (!messagesRef.current) return;
    messagesRef.current.scrollTo({ top: messagesRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, activeChannelId]);

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

  async function createChannel() {
    if (!activeServer || !activeGuildId || !newChannelName.trim()) return;
    setStatus("Creating channel...");
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

  async function onUploadTheme(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const css = await file.text();
    setThemeCss(css);
    setStatus(`Theme loaded: ${file.name}`);
  }

  function clearTheme() {
    setThemeCss("");
    setStatus("Theme reset to default.");
  }

  function toggleCategory(categoryId) {
    setCollapsedCategories((current) => ({ ...current, [categoryId]: !current[categoryId] }));
  }

  function handleVoiceJoin(channelId) {
    setVoiceConnectedChannelId(channelId);
    setStatus("Voice channel connected.");
  }

  function handleDisconnectVoice() {
    setVoiceConnectedChannelId("");
    setIsScreenSharing(false);
    setStatus("Disconnected from voice.");
  }

  if (!accessToken) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <h1>Welcome back</h1>
          <p className="sub">Discord-style private communities, on your own infrastructure.</p>
          <p>Frontend URL: <code>{FRONTEND_URL}</code></p>
          <p>API URL: <code>{CORE_API}</code></p>
          <form onSubmit={handleAuthSubmit}>
            <label>Email<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@example.com" required /></label>
            {authMode === "register" && (
              <label>Username<input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="choose a handle" required /></label>
            )}
            <label>Password<input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="••••••••" required /></label>
            <button type="submit">{authMode === "login" ? "Login" : "Register + Login"}</button>
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
    <div className="discord-shell">
      <aside className="server-rail">
        <div className="rail-header">OC</div>
        <div className="server-list">
          {servers.map((server) => (
            <button
              key={server.id}
              className={`server-pill ${server.id === activeServerId ? "active" : ""}`}
              title={server.name}
              onClick={() => {
                setActiveServerId(server.id);
                setActiveGuildId("");
                setGuildState(null);
                setMessages([]);
              }}
            >
              {server.name.slice(0, 2).toUpperCase()}
            </button>
          ))}
        </div>
      </aside>

      <aside className="channel-sidebar">
        <header className="sidebar-header">
          <h2>{activeServer?.name || "No server"}</h2>
          <small>{activeGuild?.name || "Select a guild"}</small>
        </header>

        <section className="sidebar-block">
          <label>Guild</label>
          <select value={activeGuildId} onChange={(e) => setActiveGuildId(e.target.value)}>
            <option value="">Select guild</option>
            {guilds.map((guild) => (
              <option key={guild.id} value={guild.id}>{guild.name}</option>
            ))}
          </select>
        </section>

        <section className="sidebar-block channels-container">
          {groupedChannelSections.map(({ category, channels: items }) => {
            const isCollapsed = collapsedCategories[category.id];
            return (
              <div className="category-block" key={category.id}>
                <button type="button" className="category-header" onClick={() => toggleCategory(category.id)}>
                  <span className="chevron">{isCollapsed ? "▸" : "▾"}</span>
                  {category.name}
                </button>
                {!isCollapsed && (
                  <div className="category-items">
                    {items.map((channel) => (
                      <button
                        key={channel.id}
                        className={`channel-row ${channel.id === activeChannelId ? "active" : ""}`}
                        onClick={() => {
                          if (channel.type === "text") setActiveChannelId(channel.id);
                          if (channel.type === "voice") handleVoiceJoin(channel.id);
                        }}
                      >
                        <span className="channel-hash">{channel.type === "voice" ? "🔊" : "#"}</span> {channel.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </section>

        <footer className="self-card">
          <div>
            <strong>{me?.username}</strong>
            <span>{canManageServer ? "Owner tools enabled" : "Member"}</span>
          </div>
          <button
            className="danger ghost"
            onClick={() => {
              setAccessToken("");
              setServers([]);
              setGuildState(null);
              setMessages([]);
            }}
          >
            Logout
          </button>
        </footer>
      </aside>

      <main className="chat-pane">
        <header className="chat-header">
          <h3><span className="channel-hash">#</span> {activeChannel?.name || "general"}</h3>
          <span>{activeGuild?.name || "No guild selected"}</span>
        </header>

        <div className="messages" ref={messagesRef}>
          {messages.map((message) => (
            <article key={message.id} className="msg">
              <strong>{message.author_id || message.authorId} <span className="msg-time">just now</span></strong>
              <p>{message.content}</p>
            </article>
          ))}
          {!messages.length && <p className="empty">No messages yet. Start the conversation.</p>}
        </div>

        <footer className="composer">
          <input
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            placeholder={`Message #${activeChannel?.name || "channel"}`}
            onKeyDown={(event) => {
              if (event.key === "Enter") sendMessage();
            }}
          />
          <button onClick={sendMessage}>Send</button>
        </footer>
      </main>

      <aside className="control-pane">
        <section className="card voice-card">
          <h4>Voice & Screen Share</h4>
          <p className="hint">{voiceConnectedChannelId ? `Connected to ${voiceConnectedChannelId}` : "Join any voice channel to start."}</p>
          <div className="row-actions">
            <button className={isMuted ? "danger" : "ghost"} onClick={() => setIsMuted((v) => !v)}>{isMuted ? "Unmute" : "Mute"}</button>
            <button className={isDeafened ? "danger" : "ghost"} onClick={() => setIsDeafened((v) => !v)}>{isDeafened ? "Undeafen" : "Deafen"}</button>
          </div>
          <button
            onClick={() => setIsScreenSharing((v) => !v)}
            disabled={!voiceConnectedChannelId}
          >
            {isScreenSharing ? "Stop Screen Share" : "Start Screen Share"}
          </button>
          <button className="danger" onClick={handleDisconnectVoice} disabled={!voiceConnectedChannelId}>Disconnect Voice</button>
        </section>

        <section className="card">
          <h4>Join Server (Metadata Flow)</h4>
          <input
            placeholder="Paste invite code"
            value={joinInviteCode}
            onChange={(e) => setJoinInviteCode(e.target.value)}
          />
          <div className="row-actions">
            <button className="ghost" onClick={previewInvite}>Preview</button>
            <button onClick={joinInvite}>Join</button>
          </div>
          {invitePreview && (
            <div className="preview">
              <p><strong>Server ID:</strong> <code>{invitePreview.serverId}</code></p>
              <p><strong>Invite:</strong> {invitePreview.code}</p>
              <p><strong>Uses:</strong> {invitePreview.uses}{invitePreview.maxUses ? ` / ${invitePreview.maxUses}` : ""}</p>
              <p><strong>Expires:</strong> {invitePreview.expiresAt || "Never"}</p>
            </div>
          )}
        </section>

        <section className="card">
          <h4>Add Server Provider</h4>
          <input placeholder="Server name" value={newServerName} onChange={(e) => setNewServerName(e.target.value)} />
          <input placeholder="https://node.provider.tld" value={newServerBaseUrl} onChange={(e) => setNewServerBaseUrl(e.target.value)} />
          <button onClick={createServer}>Add Server</button>
          <p className="hint">For explicit owner assignment, use <code>scripts/create-server.sh</code>.</p>
        </section>

        <section className="card">
          <h4>Server Invites</h4>
          <select value={inviteServerId} onChange={(e) => setInviteServerId(e.target.value)}>
            <option value="">Select server</option>
            {servers.map((server) => (
              <option key={server.id} value={server.id}>{server.name}</option>
            ))}
          </select>
          <button onClick={createInvite}>Generate Invite</button>
          {inviteCode && <p>Invite code: <code>{inviteCode}</code></p>}
        </section>

        {canManageServer && (
          <section className="card">
            <h4>Owner Actions</h4>
            <p className="hint">Create categories, text channels, and voice channels.</p>
            <input
              placeholder="New channel/category name"
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
            />
            <select value={newChannelType} onChange={(e) => setNewChannelType(e.target.value)}>
              <option value="text">Text Channel</option>
              <option value="voice">Voice Channel</option>
              <option value="category">Category</option>
            </select>
            {newChannelType !== "category" && (
              <select value={newChannelParentId} onChange={(e) => setNewChannelParentId(e.target.value)}>
                <option value="">No category</option>
                {categoryChannels.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            )}
            <button onClick={createChannel}>Create Channel</button>
          </section>
        )}

        <section className="card">
          <h4>Custom CSS Theme</h4>
          <input type="file" accept="text/css,.css" onChange={onUploadTheme} />
          <button className="ghost" onClick={clearTheme}>Reset Theme</button>
          <textarea
            value={themeCss}
            onChange={(e) => setThemeCss(e.target.value)}
            rows={8}
            placeholder="Paste custom CSS"
          />
        </section>

        <p className="status">{status}</p>
      </aside>
    </div>
  );
}
