import { useEffect, useMemo, useState } from "react";

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
  const [status, setStatus] = useState("");
  const [themeCss, setThemeCss] = useThemeCss();

  useEffect(() => {
    if (accessToken) localStorage.setItem("opencom_access_token", accessToken);
    else localStorage.removeItem("opencom_access_token");
  }, [accessToken]);

  const activeServer = useMemo(
    () => servers.find((server) => server.id === activeServerId) || null,
    [servers, activeServerId]
  );

  async function loadSession() {
    if (!accessToken) return;
    try {
      const meData = await api("/v1/me", { headers: { Authorization: `Bearer ${accessToken}` } });
      setMe(meData);
      const serverData = await api("/v1/servers", { headers: { Authorization: `Bearer ${accessToken}` } });
      setServers(serverData.servers || []);
      if (!activeServerId && serverData.servers?.length) {
        setActiveServerId(serverData.servers[0].id);
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
    setStatus("Creating server...");
    try {
      await api("/v1/servers", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ name: newServerName, baseUrl: newServerBaseUrl })
      });
      setNewServerName("");
      setNewServerBaseUrl("https://");
      await loadSession();
      setStatus("Server created.");
    } catch (error) {
      setStatus(`Create server failed: ${error.message}`);
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

  async function joinInvite() {
    if (!joinInviteCode) return;
    setStatus("Joining via invite...");
    try {
      await api(`/v1/invites/${joinInviteCode}/join`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      await loadSession();
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
      const firstText = state.channels.find((channel) => channel.type === "text");
      setActiveChannelId(firstText?.id || "");
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
    if (!activeServer) return;
    nodeApi(activeServer.baseUrl, "/v1/guilds", activeServer.membershipToken)
      .then((guilds) => {
        if (!activeGuildId && guilds.length) setActiveGuildId(guilds[0].id);
      })
      .catch((error) => setStatus(`Guild list failed: ${error.message}`));
  }, [activeServerId, servers]);

  useEffect(() => {
    if (!activeServer || !activeGuildId) return;
    loadGuildState(activeServer, activeGuildId);
  }, [activeGuildId, activeServerId]);

  useEffect(() => {
    if (!activeServer || !activeChannelId) return;
    loadMessages(activeServer, activeChannelId);
  }, [activeChannelId, activeServerId]);

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

  if (!accessToken) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <h1>OpenCom</h1>
          <p>Frontend URL: <code>{FRONTEND_URL}</code></p>
          <p>API URL: <code>{CORE_API}</code></p>
          <form onSubmit={handleAuthSubmit}>
            <label>Email<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required /></label>
            {authMode === "register" && (
              <label>Username<input value={username} onChange={(e) => setUsername(e.target.value)} required /></label>
            )}
            <label>Password<input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required /></label>
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

  const channels = guildState?.channels || [];
  const textChannels = channels.filter((channel) => channel.type === "text");
  const voiceChannels = channels.filter((channel) => channel.type === "voice");

  return (
    <div className="layout">
      <aside className="servers-col">
        <h2>Servers</h2>
        {servers.map((server) => (
          <button
            key={server.id}
            className={`server-pill ${server.id === activeServerId ? "active" : ""}`}
            onClick={() => {
              setActiveServerId(server.id);
              setActiveGuildId("");
              setGuildState(null);
            }}
          >
            {server.name.slice(0, 2).toUpperCase()}
          </button>
        ))}
      </aside>

      <aside className="channel-col">
        <h3>{activeServer?.name || "No server selected"}</h3>
        <section>
          <h4>Text Channels</h4>
          {textChannels.map((channel) => (
            <button key={channel.id} className="channel-btn" onClick={() => setActiveChannelId(channel.id)}>
              # {channel.name}
            </button>
          ))}
        </section>
        <section>
          <h4>Voice Channels</h4>
          {voiceChannels.map((channel) => (
            <div key={channel.id} className="voice-item">🔊 {channel.name}</div>
          ))}
        </section>
      </aside>

      <main className="chat-col">
        <header>
          <h3># {channels.find((c) => c.id === activeChannelId)?.name || "general"}</h3>
        </header>
        <div className="messages">
          {messages.map((message) => (
            <article key={message.id} className="msg">
              <strong>{message.author_id || message.authorId}</strong>
              <p>{message.content}</p>
            </article>
          ))}
        </div>
        <footer className="composer">
          <input value={messageText} onChange={(e) => setMessageText(e.target.value)} placeholder="Message channel" />
          <button onClick={sendMessage}>Send</button>
        </footer>
      </main>

      <aside className="settings-col">
        <h3>Controls</h3>
        <p>Logged in as <strong>{me?.username}</strong></p>

        <div className="card">
          <h4>Add server by provider URL / IP</h4>
          <input placeholder="Server name" value={newServerName} onChange={(e) => setNewServerName(e.target.value)} />
          <input placeholder="https://node.provider.tld" value={newServerBaseUrl} onChange={(e) => setNewServerBaseUrl(e.target.value)} />
          <button onClick={createServer}>Add Server</button>
        </div>

        <div className="card">
          <h4>Invites</h4>
          <select value={inviteServerId} onChange={(e) => setInviteServerId(e.target.value)}>
            <option value="">Select server</option>
            {servers.map((server) => (
              <option key={server.id} value={server.id}>{server.name}</option>
            ))}
          </select>
          <button onClick={createInvite}>Generate Invite</button>
          {inviteCode && <p>Invite code: <code>{inviteCode}</code></p>}
          <input placeholder="Paste invite code" value={joinInviteCode} onChange={(e) => setJoinInviteCode(e.target.value)} />
          <button onClick={joinInvite}>Join with Invite</button>
        </div>

        <div className="card">
          <h4>Custom CSS Theme</h4>
          <input type="file" accept="text/css,.css" onChange={onUploadTheme} />
          <button onClick={clearTheme}>Reset Theme</button>
          <textarea
            value={themeCss}
            onChange={(e) => setThemeCss(e.target.value)}
            rows={10}
            placeholder="You can also paste CSS directly"
          />
        </div>

        <button
          className="logout"
          onClick={() => {
            setAccessToken("");
            setServers([]);
            setGuildState(null);
            setMessages([]);
          }}
        >
          Logout
        </button>

        <p className="status">{status}</p>
      </aside>
    </div>
  );
}
