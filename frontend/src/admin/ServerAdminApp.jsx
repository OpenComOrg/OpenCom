import { useEffect, useState } from "react";
import { SafeAvatar } from "../components/ui/SafeAvatar";
import {
  CORE_API,
  normalizeImageUrlInput,
  normalizeServerList,
  profileImageUrl,
} from "../lib/appCore.js";

const SERVER_TABS = [
  { id: "overview", label: "Overview" },
  { id: "channels", label: "Channels" },
  { id: "members", label: "Members" },
  { id: "roles", label: "Roles" },
  { id: "assets", label: "Assets" },
  { id: "invites", label: "Invites" },
  { id: "extensions", label: "Extensions" },
  { id: "moderation", label: "Moderation" },
];

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const PERMISSION_FLAGS = {
  VIEW_CHANNEL: { bit: 1n << 0n, name: "View Channels" },
  SEND_MESSAGES: { bit: 1n << 1n, name: "Send Messages" },
  MANAGE_CHANNELS: { bit: 1n << 2n, name: "Manage Channels" },
  MANAGE_ROLES: { bit: 1n << 3n, name: "Manage Roles" },
  KICK_MEMBERS: { bit: 1n << 4n, name: "Kick Members" },
  BAN_MEMBERS: { bit: 1n << 5n, name: "Ban Members" },
  MUTE_MEMBERS: { bit: 1n << 6n, name: "Mute Members" },
  DEAFEN_MEMBERS: { bit: 1n << 7n, name: "Deafen Members" },
  MOVE_MEMBERS: { bit: 1n << 8n, name: "Move Members" },
  CONNECT: { bit: 1n << 9n, name: "Connect" },
  SPEAK: { bit: 1n << 10n, name: "Speak" },
  ATTACH_FILES: { bit: 1n << 11n, name: "Attach Files" },
  ADMINISTRATOR: { bit: 1n << 60n, name: "Administrator" },
};

const TEXT_CHANNEL_PERMISSION_FLAGS = [
  "VIEW_CHANNEL",
  "SEND_MESSAGES",
  "ATTACH_FILES",
];

const VOICE_CHANNEL_PERMISSION_FLAGS = [
  "VIEW_CHANNEL",
  "CONNECT",
  "SPEAK",
];

const CATEGORY_PERMISSION_FLAGS = [
  "VIEW_CHANNEL",
  "SEND_MESSAGES",
  "ATTACH_FILES",
  "CONNECT",
  "SPEAK",
];

function permissionFlagsForChannel(channel) {
  if (channel?.type === "voice") return VOICE_CHANNEL_PERMISSION_FLAGS;
  if (channel?.type === "category") return CATEGORY_PERMISSION_FLAGS;
  return TEXT_CHANNEL_PERMISSION_FLAGS;
}

function overwritePermissionState(overwrite, flag) {
  const meta = PERMISSION_FLAGS[flag];
  if (!meta) return "inherit";
  const allowBits = BigInt(overwrite?.allow || "0");
  const denyBits = BigInt(overwrite?.deny || "0");
  if (denyBits & meta.bit) return "deny";
  if (allowBits & meta.bit) return "allow";
  return "inherit";
}

function nextOverwriteBits(current, flag, state) {
  const meta = PERMISSION_FLAGS[flag];
  if (!meta) return current;
  let allow = current.allow & ~meta.bit;
  let deny = current.deny & ~meta.bit;
  if (state === "allow") allow |= meta.bit;
  if (state === "deny") deny |= meta.bit;
  return { allow, deny };
}

function PermissionStatePills({ state, onChange }) {
  return (
    <div className="server-admin-state-pills" role="group" aria-label="Permission state">
      <button
        type="button"
        className={state === "inherit" ? "active" : ""}
        onClick={() => onChange("inherit")}
      >
        Inherit
      </button>
      <button
        type="button"
        className={state === "allow" ? "active is-allow" : "is-allow"}
        onClick={() => onChange("allow")}
      >
        Allow
      </button>
      <button
        type="button"
        className={state === "deny" ? "active is-deny" : "is-deny"}
        onClick={() => onChange("deny")}
      >
        Deny
      </button>
    </div>
  );
}

function MetricCard({ label, value, hint }) {
  return (
    <article className="server-admin-stat server-admin-stat-card">
      <p>{label}</p>
      <strong>{value}</strong>
      {hint ? <span>{hint}</span> : null}
    </article>
  );
}

function EmptyState({ children }) {
  return <p className="server-admin-empty-inline">{children}</p>;
}

function formatDateTime(value = "") {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function toDateTimeLocalValue(value = "") {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromDateTimeLocalValue(value = "") {
  const trimmed = String(value || "").trim();
  if (!trimmed) return undefined;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function hasPermission(permBits, flag) {
  try {
    const bits = BigInt(permBits || "0");
    return (bits & PERMISSION_FLAGS[flag].bit) === PERMISSION_FLAGS[flag].bit;
  } catch {
    return false;
  }
}

function permissionCount(permBits) {
  return Object.keys(PERMISSION_FLAGS).filter((flag) => hasPermission(permBits, flag)).length;
}

function roleColorHex(role) {
  if (role?.color == null || role.color === "") return "";
  if (typeof role.color === "number") {
    return `#${Number(role.color).toString(16).padStart(6, "0")}`;
  }
  const trimmed = String(role.color || "").trim();
  if (!trimmed) return "";
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

function roleColorSwatch(role) {
  return roleColorHex(role) || "#7d94d8";
}

function parseRoleColor(value = "") {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  const normalized = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return undefined;
  return Number.parseInt(normalized, 16);
}

function compareByPositionAscending(left, right) {
  return (left?.position ?? 0) - (right?.position ?? 0)
    || String(left?.created_at || left?.createdAt || "").localeCompare(String(right?.created_at || right?.createdAt || ""))
    || String(left?.name || "").localeCompare(String(right?.name || ""));
}

function compareRolesDescending(left, right) {
  return (right?.position ?? 0) - (left?.position ?? 0)
    || String(left?.name || "").localeCompare(String(right?.name || ""));
}

function groupChannels(channels = []) {
  const categories = channels
    .filter((channel) => channel.type === "category")
    .sort(compareByPositionAscending);
  const childrenByParentId = new Map();
  const uncategorized = [];

  for (const channel of [...channels].sort(compareByPositionAscending)) {
    if (channel.type === "category") continue;
    const parentId = channel.parent_id || "";
    if (!parentId) {
      uncategorized.push(channel);
      continue;
    }
    if (!childrenByParentId.has(parentId)) childrenByParentId.set(parentId, []);
    childrenByParentId.get(parentId).push(channel);
  }

  return {
    categories,
    uncategorized,
    childrenByParentId,
  };
}

function roleNamesForMember(member, roles) {
  const roleIds = new Set(member?.roleIds || []);
  return roles.filter((role) => roleIds.has(role.id));
}

function findOverwrite(overwrites, channelId, targetType, targetId) {
  return (overwrites || []).find(
    (overwrite) =>
      overwrite.channel_id === channelId
      && overwrite.target_type === targetType
      && overwrite.target_id === targetId,
  );
}

async function api(path, token, options = {}) {
  const hasBody = options.body !== undefined && options.body !== null;
  const response = await fetch(`${CORE_API}${path}`, {
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `HTTP_${response.status}`);
  }

  return response.json();
}

async function nodeApi(baseUrl, path, token, options = {}) {
  const hasBody = options.body !== undefined && options.body !== null;
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `HTTP_${response.status}`);
  }

  return response.json();
}

export function ServerAdminApp({
  embedded = false,
  preferredServerId = "",
  preferredGuildId = "",
  preferredTab = "overview",
  preferredChannelId = "",
  preferredChannelAction = "",
  intentNonce = 0,
  onSelectServer = null,
  onExit = null,
}) {
  const [token, setToken] = useState(localStorage.getItem("opencom_access_token") || "");
  const [status, setStatus] = useState({ message: "", type: "info" });
  const [servers, setServers] = useState([]);
  const [selectedServerId, setSelectedServerId] = useState("");
  const [guilds, setGuilds] = useState([]);
  const [selectedGuildId, setSelectedGuildId] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [guildState, setGuildState] = useState(null);
  const [guildStateLoading, setGuildStateLoading] = useState(false);
  const [bans, setBans] = useState([]);
  const [bansLoading, setBansLoading] = useState(false);
  const [invites, setInvites] = useState([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [extensionCatalog, setExtensionCatalog] = useState({ clientExtensions: [], serverExtensions: [] });
  const [installedExtensions, setInstalledExtensions] = useState([]);
  const [extensionsLoading, setExtensionsLoading] = useState(false);
  const [selectedExtensionId, setSelectedExtensionId] = useState("");
  const [extensionConfigDrafts, setExtensionConfigDrafts] = useState({});
  const [extensionConfigLoadingId, setExtensionConfigLoadingId] = useState("");
  const [memberQuery, setMemberQuery] = useState("");
  const [roleQuery, setRoleQuery] = useState("");
  const [channelQuery, setChannelQuery] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [memberRoleDraftId, setMemberRoleDraftId] = useState("");
  const [memberModerationNotes, setMemberModerationNotes] = useState({});
  const [newRoleName, setNewRoleName] = useState("");
  const [editingRoleId, setEditingRoleId] = useState("");
  const [editRoleName, setEditRoleName] = useState("");
  const [editRoleColor, setEditRoleColor] = useState("");
  const [editRolePermissions, setEditRolePermissions] = useState({});
  const [editingChannelId, setEditingChannelId] = useState("");
  const [channelDraft, setChannelDraft] = useState({ name: "", parentId: "", syncPermissions: true });
  const [channelPermissionChannelId, setChannelPermissionChannelId] = useState("");
  const [serverProfileForm, setServerProfileForm] = useState({ name: "", logoUrl: "", bannerUrl: "" });
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelType, setNewChannelType] = useState("text");
  const [newChannelParentId, setNewChannelParentId] = useState("");
  const [newChannelSyncPermissions, setNewChannelSyncPermissions] = useState(true);
  const [newEmoteName, setNewEmoteName] = useState("");
  const [newEmoteUrl, setNewEmoteUrl] = useState("");
  const [inviteCustomCode, setInviteCustomCode] = useState("");
  const [invitePermanent, setInvitePermanent] = useState(false);
  const [inviteMaxUses, setInviteMaxUses] = useState("25");
  const [inviteExpiresAt, setInviteExpiresAt] = useState("");

  function showStatus(message, type = "info") {
    setStatus({ message, type });
  }

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    if (embedded) return undefined;
    document.body.classList.add("server-admin-mode");
    return () => {
      document.body.classList.remove("server-admin-mode");
    };
  }, [embedded]);

  useEffect(() => {
    function syncTokenFromStorage() {
      setToken(localStorage.getItem("opencom_access_token") || "");
    }
    window.addEventListener("storage", syncTokenFromStorage);
    return () => window.removeEventListener("storage", syncTokenFromStorage);
  }, []);

  useEffect(() => {
    if (!token) {
      showStatus("Not authenticated. Please log in through the main app first.", "error");
      return;
    }
    loadServers();
    loadExtensionCatalog();
  }, [token, preferredServerId]);

  useEffect(() => {
    const selectedServer = servers.find((server) => server.id === selectedServerId);
    setServerProfileForm({
      name: selectedServer?.name || "",
      logoUrl: selectedServer?.logoUrl || "",
      bannerUrl: selectedServer?.bannerUrl || "",
    });
    setSelectedExtensionId("");
    setExtensionConfigDrafts({});
  }, [selectedServerId, servers]);

  useEffect(() => {
    if (!selectedServerId || !token) {
      setGuilds([]);
      setSelectedGuildId("");
      setGuildState(null);
      return;
    }
    loadGuilds();
    loadInstalledExtensions(selectedServerId);
  }, [selectedServerId, token, servers]);

  useEffect(() => {
    setEditingChannelId("");
    setChannelPermissionChannelId("");
    setEditingRoleId("");
    setSelectedMemberId("");
    if (!selectedGuildId || !selectedServerId) {
      setGuildState(null);
      return;
    }
    refreshGuildState();
  }, [selectedGuildId, selectedServerId]);

  useEffect(() => {
    if (activeTab === "invites" && selectedServerId && token) {
      loadInvites();
    }
  }, [activeTab, selectedServerId, token]);

  useEffect(() => {
    if (activeTab === "moderation" && selectedGuildId && selectedServerId && token) {
      loadBans();
    }
  }, [activeTab, selectedGuildId, selectedServerId, token]);

  useEffect(() => {
    if (!preferredTab) return;
    if (SERVER_TABS.some((tab) => tab.id === preferredTab)) {
      setActiveTab(preferredTab);
    }
  }, [intentNonce, preferredTab]);

  useEffect(() => {
    if (!preferredGuildId) return;
    if (guilds.some((guild) => guild.id === preferredGuildId)) {
      setSelectedGuildId(preferredGuildId);
    }
  }, [intentNonce, preferredGuildId, guilds]);

  const selectedServer = servers.find((server) => server.id === selectedServerId) || null;
  const selectedGuild = guilds.find((guild) => guild.id === selectedGuildId) || null;
  const activeScopeLabel = selectedGuild?.name || selectedServer?.name || "Server";
  const members = guildState?.members || [];
  const roles = guildState?.roles || [];
  const channels = guildState?.channels || [];
  const overwrites = guildState?.overwrites || [];
  const emotes = guildState?.emotes || [];
  const voiceStates = guildState?.voiceStates || [];
  const categoryChannels = channels.filter((channel) => channel.type === "category").sort(compareByPositionAscending);
  const voiceChannelMap = new Map(channels.filter((channel) => channel.type === "voice").map((channel) => [channel.id, channel]));
  const visibleMembers = members.filter((member) => {
    if (!memberQuery.trim()) return true;
    const query = memberQuery.trim().toLowerCase();
    return String(member.username || "").toLowerCase().includes(query)
      || String(member.displayName || "").toLowerCase().includes(query)
      || String(member.id || "").toLowerCase().includes(query);
  });
  const visibleRoles = roles.filter((role) => {
    if (!roleQuery.trim()) return true;
    return String(role.name || "").toLowerCase().includes(roleQuery.trim().toLowerCase());
  }).sort(compareRolesDescending);
  const visibleChannels = channels.filter((channel) => {
    if (!channelQuery.trim()) return true;
    return String(channel.name || "").toLowerCase().includes(channelQuery.trim().toLowerCase());
  }).sort(compareByPositionAscending);
  const enabledExtensions = installedExtensions.filter((extension) => extension.enabled);
  const groupedChannels = groupChannels(visibleChannels);
  const selectedPermissionChannel = channels.find((channel) => channel.id === channelPermissionChannelId) || null;

  useEffect(() => {
    if (!intentNonce) return;
    if (!preferredChannelId) {
      setEditingChannelId("");
      setChannelPermissionChannelId("");
      return;
    }
    const targetChannel = channels.find((channel) => channel.id === preferredChannelId);
    if (!targetChannel) return;
    if (preferredChannelAction === "permissions") {
      setChannelPermissionChannelId(targetChannel.id);
      setEditingChannelId("");
      return;
    }
    if (preferredChannelAction === "edit") {
      openChannelEditor(targetChannel);
      setChannelPermissionChannelId("");
      return;
    }
    setEditingChannelId("");
    setChannelPermissionChannelId("");
  }, [intentNonce, preferredChannelId, preferredChannelAction, channels]);

  function selectServer(serverId) {
    setSelectedServerId(serverId);
    setActiveTab("overview");
    setMemberQuery("");
    setRoleQuery("");
    setChannelQuery("");
    if (typeof onSelectServer === "function") onSelectServer(serverId);
  }

  async function loadServers() {
    try {
      const data = await api("/v1/servers", token);
      const manageableServers = normalizeServerList(data.servers || []).filter((server) => {
        const membershipRoles = Array.isArray(server?.roles) ? server.roles.map((role) => String(role).toLowerCase()) : [];
        return (
          membershipRoles.includes("owner")
          || membershipRoles.includes("platform_admin")
          || membershipRoles.includes("admin")
          || membershipRoles.includes("server_admin")
        );
      });
      setServers(manageableServers);
      setSelectedServerId((current) => {
        if (preferredServerId && manageableServers.some((server) => server.id === preferredServerId)) {
          return preferredServerId;
        }
        if (current && manageableServers.some((server) => server.id === current)) return current;
        return manageableServers[0]?.id || "";
      });
      if (!manageableServers.length) {
        showStatus("No manageable servers found yet.", "info");
      } else {
        showStatus(embedded ? "Server management ready." : "Server admin panel ready.", "success");
      }
    } catch (error) {
      showStatus(`Failed to load servers: ${error.message}`, "error");
    }
  }

  async function loadGuilds() {
    const server = servers.find((entry) => entry.id === selectedServerId);
    if (!server?.baseUrl || !server?.membershipToken) return;
    try {
      const data = await nodeApi(server.baseUrl, "/v1/guilds", server.membershipToken);
      const nextGuilds = Array.isArray(data) ? data : [];
      setGuilds(nextGuilds);
      setSelectedGuildId((current) => {
        if (current && nextGuilds.some((guild) => guild.id === current)) return current;
        if (server.defaultGuildId && nextGuilds.some((guild) => guild.id === server.defaultGuildId)) return server.defaultGuildId;
        return nextGuilds[0]?.id || "";
      });
      if (!nextGuilds.length) setGuildState(null);
    } catch (error) {
      showStatus(`Failed to load server data: ${error.message}`, "error");
      setGuilds([]);
      setSelectedGuildId("");
      setGuildState(null);
    }
  }

  async function refreshGuildState() {
    const server = servers.find((entry) => entry.id === selectedServerId);
    if (!server?.baseUrl || !server?.membershipToken || !selectedGuildId) return;
    setGuildStateLoading(true);
    try {
      const state = await nodeApi(server.baseUrl, `/v1/guilds/${selectedGuildId}/state`, server.membershipToken);
      setGuildState(state);
    } catch (error) {
      setGuildState(null);
      showStatus(`Failed to load server state: ${error.message}`, "error");
    } finally {
      setGuildStateLoading(false);
    }
  }

  async function loadBans() {
    const server = servers.find((entry) => entry.id === selectedServerId);
    if (!server?.baseUrl || !server?.membershipToken || !selectedGuildId) return;
    setBansLoading(true);
    try {
      const data = await nodeApi(server.baseUrl, `/v1/guilds/${selectedGuildId}/bans`, server.membershipToken);
      setBans(Array.isArray(data?.bans) ? data.bans : []);
    } catch (error) {
      setBans([]);
      showStatus(`Could not load bans: ${error.message}`, "error");
    } finally {
      setBansLoading(false);
    }
  }

  async function loadInvites() {
    if (!selectedServerId) return;
    setInvitesLoading(true);
    try {
      const data = await api(`/v1/invites?serverId=${encodeURIComponent(selectedServerId)}`, token);
      setInvites(Array.isArray(data?.invites) ? data.invites : []);
    } catch (error) {
      setInvites([]);
      showStatus(`Failed to load invites: ${error.message}`, "error");
    } finally {
      setInvitesLoading(false);
    }
  }

  async function loadExtensionCatalog() {
    try {
      const data = await api("/v1/extensions/catalog", token);
      setExtensionCatalog({
        clientExtensions: data.clientExtensions || [],
        serverExtensions: data.serverExtensions || [],
      });
    } catch (error) {
      showStatus(`Failed to load extension catalog: ${error.message}`, "error");
    }
  }

  async function loadInstalledExtensions(serverId) {
    if (!serverId) return;
    setExtensionsLoading(true);
    try {
      const data = await api(`/v1/servers/${serverId}/extensions`, token);
      setInstalledExtensions(Array.isArray(data?.extensions) ? data.extensions : []);
    } catch (error) {
      setInstalledExtensions([]);
      showStatus(`Failed to load extensions: ${error.message}`, "error");
    } finally {
      setExtensionsLoading(false);
    }
  }

  async function loadExtensionConfig(extensionId) {
    if (!selectedServerId || !extensionId) return;
    setExtensionConfigLoadingId(extensionId);
    try {
      const data = await api(`/v1/servers/${selectedServerId}/extensions/${encodeURIComponent(extensionId)}/config`, token);
      const config = data?.config || {};
      setExtensionConfigDrafts((current) => ({
        ...current,
        [extensionId]: JSON.stringify(config, null, 2),
      }));
      setSelectedExtensionId(extensionId);
    } catch (error) {
      showStatus(`Failed to load extension config: ${error.message}`, "error");
    } finally {
      setExtensionConfigLoadingId("");
    }
  }

  async function uploadImage(file) {
    const formData = new FormData();
    formData.append("image", file);
    const response = await fetch(`${CORE_API}/v1/images/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `HTTP_${response.status}`);
    }

    return response.json();
  }

  async function onImageFieldUpload(event, label, onUploaded) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!String(file.type || "").startsWith("image/")) {
      showStatus(`Please choose an image file for ${label}.`, "error");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      showStatus(`Image too large for ${label}. Max ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB.`, "error");
      return;
    }
    try {
      showStatus(`Uploading ${label}...`, "info");
      const data = await uploadImage(file);
      if (!data?.imageUrl) throw new Error("UPLOAD_FAILED");
      onUploaded(data.imageUrl);
      showStatus(`${label} uploaded.`, "success");
    } catch (error) {
      showStatus(`Upload failed: ${error.message}`, "error");
    }
  }

  async function saveServerProfile() {
    if (!selectedServerId) return;
    try {
      await api(`/v1/servers/${selectedServerId}/profile`, token, {
        method: "PATCH",
        body: JSON.stringify({
          name: serverProfileForm.name.trim() || undefined,
          logoUrl: normalizeImageUrlInput(serverProfileForm.logoUrl || "") || null,
          bannerUrl: normalizeImageUrlInput(serverProfileForm.bannerUrl || "") || null,
        }),
      });
      await loadServers();
      showStatus("Server profile updated.", "success");
    } catch (error) {
      showStatus(`Server profile update failed: ${error.message}`, "error");
    }
  }

  async function toggleGlobalEmotes(enabled) {
    if (!selectedServerId) return;
    try {
      await api(`/v1/servers/${selectedServerId}/global-emotes`, token, {
        method: "PUT",
        body: JSON.stringify({ enabled }),
      });
      setServers((current) => current.map((server) => (
        server.id === selectedServerId
          ? { ...server, globalEmotesEnabled: !!enabled }
          : server
      )));
      showStatus(
        enabled
          ? "Global emotes enabled for this server."
          : "Global emotes disabled for this server.",
        "success",
      );
    } catch (error) {
      showStatus(`Global emote update failed: ${error.message}`, "error");
    }
  }

  async function createChannel() {
    const server = servers.find((entry) => entry.id === selectedServerId);
    if (!server?.baseUrl || !server?.membershipToken || !selectedGuildId || !newChannelName.trim()) return;
    try {
      await nodeApi(server.baseUrl, `/v1/guilds/${selectedGuildId}/channels`, server.membershipToken, {
        method: "POST",
        body: JSON.stringify({
          name: newChannelName.trim(),
          type: newChannelType,
          parentId: newChannelType === "category" ? null : (newChannelParentId || null),
          syncPermissions:
            newChannelType !== "category" && !!newChannelParentId
              ? !!newChannelSyncPermissions
              : false,
        }),
      });
      setNewChannelName("");
      setNewChannelType("text");
      setNewChannelParentId("");
      setNewChannelSyncPermissions(true);
      await refreshGuildState();
      showStatus("Channel created.", "success");
    } catch (error) {
      showStatus(`Channel creation failed: ${error.message}`, "error");
    }
  }

  function openChannelEditor(channel) {
    setEditingChannelId(channel.id);
    setChannelDraft({
      name: channel.name || "",
      parentId: channel.parent_id || "",
      syncPermissions: !!channel.parent_id,
    });
  }

  async function saveChannel(channelId) {
    const server = servers.find((entry) => entry.id === selectedServerId);
    if (!server?.baseUrl || !server?.membershipToken || !channelId || !channelDraft.name.trim()) return;
    try {
      await nodeApi(server.baseUrl, `/v1/channels/${channelId}`, server.membershipToken, {
        method: "PATCH",
        body: JSON.stringify({
          name: channelDraft.name.trim(),
          parentId: channelDraft.parentId || null,
          syncPermissions:
            !!channelDraft.parentId && !!channelDraft.syncPermissions,
        }),
      });
      setEditingChannelId("");
      setChannelDraft({ name: "", parentId: "", syncPermissions: true });
      await refreshGuildState();
      showStatus("Channel updated.", "success");
    } catch (error) {
      showStatus(`Channel update failed: ${error.message}`, "error");
    }
  }

  async function deleteChannel(channel) {
    const server = servers.find((entry) => entry.id === selectedServerId);
    if (!server?.baseUrl || !server?.membershipToken || !channel?.id) return;
    const confirmed = window.confirm(`Delete ${channel.type} channel "${channel.name}"?`);
    if (!confirmed) return;
    try {
      await nodeApi(server.baseUrl, `/v1/channels/${channel.id}`, server.membershipToken, {
        method: "DELETE",
      });
      if (channelPermissionChannelId === channel.id) setChannelPermissionChannelId("");
      await refreshGuildState();
      showStatus("Channel deleted.", "success");
    } catch (error) {
      showStatus(`Channel deletion failed: ${error.message}`, "error");
    }
  }

  async function moveChannel(channel, direction) {
    const server = servers.find((entry) => entry.id === selectedServerId);
    if (!server?.baseUrl || !server?.membershipToken || !selectedGuildId || !channel?.id) return;
    const orderedChannels = [...channels].sort(compareByPositionAscending);
    const currentIndex = orderedChannels.findIndex((entry) => entry.id === channel.id);
    const targetIndex = currentIndex + direction;
    if (currentIndex === -1 || targetIndex < 0 || targetIndex >= orderedChannels.length) return;
    const next = [...orderedChannels];
    const [removed] = next.splice(currentIndex, 1);
    next.splice(targetIndex, 0, removed);
    try {
      await nodeApi(server.baseUrl, `/v1/guilds/${selectedGuildId}/channels/reorder`, server.membershipToken, {
        method: "POST",
        body: JSON.stringify({
          items: next.map((entry, index) => ({
            id: entry.id,
            position: index,
            parentId: entry.parent_id || null,
          })),
        }),
      });
      await refreshGuildState();
      showStatus(`Moved ${channel.name}.`, "success");
    } catch (error) {
      showStatus(`Channel reorder failed: ${error.message}`, "error");
    }
  }

  async function syncChannelPermissions(channelId) {
    const server = servers.find((entry) => entry.id === selectedServerId);
    if (!server?.baseUrl || !server?.membershipToken || !channelId) return;
    try {
      await nodeApi(server.baseUrl, `/v1/channels/${channelId}/sync-permissions`, server.membershipToken, {
        method: "POST",
        body: "{}",
      });
      await refreshGuildState();
      showStatus("Channel permissions synced from category.", "success");
    } catch (error) {
      showStatus(`Permission sync failed: ${error.message}`, "error");
    }
  }

  async function syncCategoryChildrenPermissions(channelId) {
    const server = servers.find((entry) => entry.id === selectedServerId);
    if (!server?.baseUrl || !server?.membershipToken || !channelId) return;
    try {
      const data = await nodeApi(server.baseUrl, `/v1/channels/${channelId}/sync-children-permissions`, server.membershipToken, {
        method: "POST",
        body: "{}",
      });
      await refreshGuildState();
      showStatus(
        `Applied category permissions to ${Number(data?.childCount || 0)} channel(s).`,
        "success",
      );
    } catch (error) {
      showStatus(`Category permission sync failed: ${error.message}`, "error");
    }
  }

  async function patchChannelOverwrite(channelId, targetType, targetId, mutate) {
    const server = servers.find((entry) => entry.id === selectedServerId);
    if (!server?.baseUrl || !server?.membershipToken || !channelId || !targetId) return;
    const current = findOverwrite(overwrites, channelId, targetType, targetId);
    const next = mutate({
      allow: BigInt(current?.allow || "0"),
      deny: BigInt(current?.deny || "0"),
    });

    try {
      if (!next || (next.allow === 0n && next.deny === 0n)) {
        await nodeApi(server.baseUrl, `/v1/channels/${channelId}/overwrites`, server.membershipToken, {
          method: "DELETE",
          body: JSON.stringify({ targetType, targetId }),
        });
      } else {
        await nodeApi(server.baseUrl, `/v1/channels/${channelId}/overwrites`, server.membershipToken, {
          method: "PUT",
          body: JSON.stringify({
            targetType,
            targetId,
            allow: next.allow.toString(),
            deny: next.deny.toString(),
          }),
        });
      }
      await refreshGuildState();
    } catch (error) {
      showStatus(`Channel permissions failed to update: ${error.message}`, "error");
    }
  }

  async function setChannelPermissionState(channelId, targetType, targetId, flag, state) {
    await patchChannelOverwrite(channelId, targetType, targetId, (current) =>
      nextOverwriteBits(current, flag, state),
    );
  }

  async function createRole() {
    const server = servers.find((entry) => entry.id === selectedServerId);
    if (!server?.baseUrl || !server?.membershipToken || !selectedGuildId || !newRoleName.trim()) return;
    try {
      await nodeApi(server.baseUrl, `/v1/guilds/${selectedGuildId}/roles`, server.membershipToken, {
        method: "POST",
        body: JSON.stringify({ name: newRoleName.trim(), permissions: "0" }),
      });
      setNewRoleName("");
      await refreshGuildState();
      showStatus("Role created.", "success");
    } catch (error) {
      showStatus(`Role creation failed: ${error.message}`, "error");
    }
  }

  function openRoleEditor(role) {
    setEditingRoleId(role.id);
    setEditRoleName(role.name || "");
    setEditRoleColor(roleColorHex(role));
    const nextPermissions = {};
    for (const flag of Object.keys(PERMISSION_FLAGS)) {
      nextPermissions[flag] = hasPermission(role.permissions, flag);
    }
    setEditRolePermissions(nextPermissions);
  }

  async function saveRole() {
    const server = servers.find((entry) => entry.id === selectedServerId);
    if (!server?.baseUrl || !server?.membershipToken || !editingRoleId || !editRoleName.trim()) return;
    let permBits = 0n;
    for (const [flag, enabled] of Object.entries(editRolePermissions)) {
      if (enabled) permBits |= PERMISSION_FLAGS[flag].bit;
    }

    const parsedColor = parseRoleColor(editRoleColor);
    if (parsedColor === undefined) {
      showStatus("Role color must be a hex value like #5865f2, or left blank.", "error");
      return;
    }

    try {
      await nodeApi(server.baseUrl, `/v1/roles/${editingRoleId}`, server.membershipToken, {
        method: "PATCH",
        body: JSON.stringify({
          name: editRoleName.trim(),
          permissions: permBits.toString(),
          color: parsedColor,
        }),
      });
      setEditingRoleId("");
      await refreshGuildState();
      showStatus("Role updated.", "success");
    } catch (error) {
      showStatus(`Role update failed: ${error.message}`, "error");
    }
  }

  async function deleteRole(role) {
    const server = servers.find((entry) => entry.id === selectedServerId);
    if (!server?.baseUrl || !server?.membershipToken || !role?.id) return;
    const confirmed = window.confirm(`Delete role "${role.name}"?`);
    if (!confirmed) return;
    try {
      await nodeApi(server.baseUrl, `/v1/roles/${role.id}`, server.membershipToken, {
        method: "DELETE",
      });
      await refreshGuildState();
      showStatus("Role deleted.", "success");
    } catch (error) {
      showStatus(`Role deletion failed: ${error.message}`, "error");
    }
  }

  async function moveRole(role, direction) {
    const server = servers.find((entry) => entry.id === selectedServerId);
    if (!server?.baseUrl || !server?.membershipToken || !role?.id) return;
    const orderedRoles = roles.filter((entry) => !entry.is_everyone).sort(compareRolesDescending);
    const currentIndex = orderedRoles.findIndex((entry) => entry.id === role.id);
    const targetIndex = currentIndex + direction;
    if (currentIndex === -1 || targetIndex < 0 || targetIndex >= orderedRoles.length) return;
    const currentRole = orderedRoles[currentIndex];
    const targetRole = orderedRoles[targetIndex];
    try {
      await nodeApi(server.baseUrl, `/v1/roles/${currentRole.id}`, server.membershipToken, {
        method: "PATCH",
        body: JSON.stringify({ position: targetRole.position }),
      });
      await nodeApi(server.baseUrl, `/v1/roles/${targetRole.id}`, server.membershipToken, {
        method: "PATCH",
        body: JSON.stringify({ position: currentRole.position }),
      });
      await refreshGuildState();
      showStatus(`Moved role ${role.name}.`, "success");
    } catch (error) {
      showStatus(`Role reorder failed: ${error.message}`, "error");
    }
  }

  async function assignRoleToMember(memberId) {
    const server = servers.find((entry) => entry.id === selectedServerId);
    if (!server?.baseUrl || !server?.membershipToken || !selectedGuildId || !memberId || !memberRoleDraftId) return;
    try {
      await nodeApi(
        server.baseUrl,
        `/v1/guilds/${selectedGuildId}/members/${memberId}/roles/${memberRoleDraftId}`,
        server.membershipToken,
        { method: "PUT", body: "{}" },
      );
      setMemberRoleDraftId("");
      await refreshGuildState();
      showStatus("Role assigned to member.", "success");
    } catch (error) {
      showStatus(`Role assignment failed: ${error.message}`, "error");
    }
  }

  async function removeRoleFromMember(memberId, roleId) {
    const server = servers.find((entry) => entry.id === selectedServerId);
    if (!server?.baseUrl || !server?.membershipToken || !selectedGuildId || !memberId || !roleId) return;
    try {
      await nodeApi(
        server.baseUrl,
        `/v1/guilds/${selectedGuildId}/members/${memberId}/roles/${roleId}`,
        server.membershipToken,
        { method: "DELETE" },
      );
      await refreshGuildState();
      showStatus("Role removed from member.", "success");
    } catch (error) {
      showStatus(`Role removal failed: ${error.message}`, "error");
    }
  }

  async function kickMember(member) {
    const server = servers.find((entry) => entry.id === selectedServerId);
    if (!server?.baseUrl || !server?.membershipToken || !selectedGuildId || !member?.id) return;
    const confirmed = window.confirm(`Kick ${member.username || member.id}? They can rejoin later.`);
    if (!confirmed) return;
    try {
      await nodeApi(
        server.baseUrl,
        `/v1/guilds/${selectedGuildId}/members/${member.id}/kick`,
        server.membershipToken,
        { method: "POST", body: "{}" },
      );
      await refreshGuildState();
      showStatus(`Kicked ${member.username || member.id}.`, "success");
    } catch (error) {
      showStatus(`Kick failed: ${error.message}`, "error");
    }
  }

  async function banMember(member) {
    const server = servers.find((entry) => entry.id === selectedServerId);
    if (!server?.baseUrl || !server?.membershipToken || !selectedGuildId || !member?.id) return;
    const note = String(memberModerationNotes[member.id] || "").trim();
    const confirmed = window.confirm(`Ban ${member.username || member.id}?`);
    if (!confirmed) return;
    try {
      await nodeApi(
        server.baseUrl,
        `/v1/guilds/${selectedGuildId}/members/${member.id}/ban`,
        server.membershipToken,
        {
          method: "POST",
          body: JSON.stringify({ reason: note || undefined }),
        },
      );
      await refreshGuildState();
      if (activeTab === "moderation") await loadBans();
      showStatus(`Banned ${member.username || member.id}.`, "success");
    } catch (error) {
      showStatus(`Ban failed: ${error.message}`, "error");
    }
  }

  async function unbanMember(userId) {
    const server = servers.find((entry) => entry.id === selectedServerId);
    if (!server?.baseUrl || !server?.membershipToken || !selectedGuildId || !userId) return;
    try {
      await nodeApi(
        server.baseUrl,
        `/v1/guilds/${selectedGuildId}/bans/${userId}`,
        server.membershipToken,
        { method: "DELETE" },
      );
      await loadBans();
      showStatus("Ban removed.", "success");
    } catch (error) {
      showStatus(`Unban failed: ${error.message}`, "error");
    }
  }

  async function updateVoiceMember(channelId, memberId, patch) {
    const server = servers.find((entry) => entry.id === selectedServerId);
    if (!server?.baseUrl || !server?.membershipToken || !channelId || !memberId) return;
    try {
      await nodeApi(
        server.baseUrl,
        `/v1/channels/${channelId}/voice/members/${memberId}/state`,
        server.membershipToken,
        { method: "PATCH", body: JSON.stringify(patch) },
      );
      await refreshGuildState();
      showStatus("Voice moderation updated.", "success");
    } catch (error) {
      showStatus(`Voice moderation failed: ${error.message}`, "error");
    }
  }

  async function disconnectVoiceMember(channelId, memberId) {
    const server = servers.find((entry) => entry.id === selectedServerId);
    if (!server?.baseUrl || !server?.membershipToken || !channelId || !memberId) return;
    try {
      await nodeApi(
        server.baseUrl,
        `/v1/channels/${channelId}/voice/members/${memberId}/disconnect`,
        server.membershipToken,
        { method: "POST", body: "{}" },
      );
      await refreshGuildState();
      showStatus("Member disconnected from voice.", "success");
    } catch (error) {
      showStatus(`Voice disconnect failed: ${error.message}`, "error");
    }
  }

  async function createEmote() {
    const server = servers.find((entry) => entry.id === selectedServerId);
    if (!server?.baseUrl || !server?.membershipToken || !selectedGuildId || !newEmoteName.trim() || !newEmoteUrl.trim()) return;
    try {
      await nodeApi(server.baseUrl, `/v1/guilds/${selectedGuildId}/emotes`, server.membershipToken, {
        method: "POST",
        body: JSON.stringify({
          name: newEmoteName.trim().toLowerCase(),
          imageUrl: normalizeImageUrlInput(newEmoteUrl),
        }),
      });
      setNewEmoteName("");
      setNewEmoteUrl("");
      await refreshGuildState();
      showStatus("Custom emote created.", "success");
    } catch (error) {
      showStatus(`Emote creation failed: ${error.message}`, "error");
    }
  }

  async function removeEmote(emote) {
    const server = servers.find((entry) => entry.id === selectedServerId);
    if (!server?.baseUrl || !server?.membershipToken || !selectedGuildId || !emote?.id) return;
    try {
      await nodeApi(server.baseUrl, `/v1/guilds/${selectedGuildId}/emotes/${emote.id}`, server.membershipToken, {
        method: "DELETE",
      });
      await refreshGuildState();
      showStatus("Custom emote removed.", "success");
    } catch (error) {
      showStatus(`Emote removal failed: ${error.message}`, "error");
    }
  }

  async function createInvite() {
    if (!selectedServerId) return;
    const payload = {
      serverId: selectedServerId,
      code: inviteCustomCode.trim() || undefined,
      permanent: invitePermanent,
      maxUses: invitePermanent ? undefined : (inviteMaxUses.trim() ? Number(inviteMaxUses) : undefined),
      expiresAt: invitePermanent ? undefined : fromDateTimeLocalValue(inviteExpiresAt),
    };

    if (!invitePermanent && payload.maxUses !== undefined && (!Number.isFinite(payload.maxUses) || payload.maxUses <= 0)) {
      showStatus("Invite max uses must be a positive number.", "error");
      return;
    }

    try {
      await api("/v1/invites", token, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setInviteCustomCode("");
      setInvitePermanent(false);
      setInviteMaxUses("25");
      setInviteExpiresAt("");
      await loadInvites();
      showStatus("Invite created.", "success");
    } catch (error) {
      showStatus(`Invite creation failed: ${error.message}`, "error");
    }
  }

  async function deleteInvite(code) {
    if (!code) return;
    const confirmed = window.confirm(`Delete invite "${code}"?`);
    if (!confirmed) return;
    try {
      await api(`/v1/invites/${encodeURIComponent(code)}`, token, {
        method: "DELETE",
      });
      await loadInvites();
      showStatus("Invite deleted.", "success");
    } catch (error) {
      showStatus(`Invite deletion failed: ${error.message}`, "error");
    }
  }

  async function copyInvite(url) {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      showStatus("Invite link copied.", "success");
    } catch {
      showStatus("Could not copy invite link on this browser.", "error");
    }
  }

  async function toggleExtension(extensionId, enabled) {
    if (!selectedServerId || !extensionId) return;
    try {
      await api(`/v1/servers/${selectedServerId}/extensions/${encodeURIComponent(extensionId)}`, token, {
        method: "POST",
        body: JSON.stringify({ enabled }),
      });
      await loadInstalledExtensions(selectedServerId);
      showStatus(`${enabled ? "Enabled" : "Disabled"} ${extensionId}.`, "success");
    } catch (error) {
      showStatus(`Extension update failed: ${error.message}`, "error");
    }
  }

  async function saveExtensionConfig(extensionId) {
    if (!selectedServerId || !extensionId) return;
    let parsedConfig = {};
    try {
      parsedConfig = JSON.parse(extensionConfigDrafts[extensionId] || "{}");
    } catch {
      showStatus("Extension config must be valid JSON.", "error");
      return;
    }

    try {
      await api(`/v1/servers/${selectedServerId}/extensions/${encodeURIComponent(extensionId)}/config`, token, {
        method: "PUT",
        body: JSON.stringify({ config: parsedConfig, mode: "replace" }),
      });
      showStatus("Extension config saved.", "success");
    } catch (error) {
      showStatus(`Extension config save failed: ${error.message}`, "error");
    }
  }

  function isExtensionEnabled(extensionId) {
    return installedExtensions.some((extension) => extension.extensionId === extensionId && extension.enabled);
  }

  if (!token) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <h1>Server Admin Panel</h1>
          <p>You need to log in through the main OpenCom app before this panel can manage your servers.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`server-admin-layout ${embedded ? "embedded" : ""}`}>
      {!embedded ? (
        <aside className="server-admin-sidebar">
          <div className="server-admin-brand">
            <h2>Server Ops</h2>
            <p>One place to tune up channels, moderation, assets, permissions, and extensions.</p>
          </div>

          <div className="server-admin-sidebar-body">
            <div className="server-admin-sidebar-head">
              <p>Your Servers</p>
              <span>{servers.length}</span>
            </div>

            {servers.length === 0 ? (
              <EmptyState>No manageable servers yet.</EmptyState>
            ) : (
              servers.map((server) => (
                <button
                  key={server.id}
                  className={`server-admin-server-btn ${selectedServerId === server.id ? "active" : ""}`}
                  onClick={() => selectServer(server.id)}
                >
                  <strong>{server.name}</strong>
                  <span>{server.baseUrl}</span>
                </button>
              ))
            )}
          </div>

          <div className={`server-admin-sidebar-status ${status.type}`}>
            {status.message || "Ready."}
          </div>
        </aside>
      ) : null}

      <main className="server-admin-main">
        {!selectedServer ? (
          <div className="server-admin-empty">Select a server to start managing it.</div>
        ) : (
          <>
            {embedded ? (
              <div className="server-admin-embedded-shell">
                <div className="server-admin-embedded-copy">
                  <span className="server-admin-embedded-kicker">Embedded Flow</span>
                  <strong>Server Admin</strong>
                  <p>Manage channels, permissions, roles, invites, and extensions without leaving the main app.</p>
                </div>
                <div className="server-admin-row-actions">
                  {typeof onExit === "function" ? (
                    <button type="button" className="server-admin-action-btn" onClick={onExit}>
                      Back to app
                    </button>
                  ) : null}
                </div>
                <div className={`server-admin-status-inline ${status.type}`}>
                  {status.message || "Ready."}
                </div>
              </div>
            ) : null}

            <header className="server-admin-top">
              <div className="server-admin-top-meta">
                <h1>{selectedServer.name}</h1>
                <p>{selectedServer.baseUrl}</p>
                <div className="server-admin-chip-row">
                  <span className="server-admin-chip">Management panel</span>
                  <span className="server-admin-chip">{channels.length} channels</span>
                  <span className="server-admin-chip">{enabledExtensions.length} enabled extensions</span>
                  <span className={`server-admin-chip ${selectedServer.globalEmotesEnabled ? "success" : ""}`}>
                    Global emotes {selectedServer.globalEmotesEnabled ? "on" : "off"}
                  </span>
                </div>
              </div>

              <div className="server-admin-top-actions">
                {embedded ? (
                  <div className="server-admin-guild-pick">
                    <label htmlFor="server-admin-server-select-inline">Server</label>
                    <select
                      id="server-admin-server-select-inline"
                      value={selectedServerId}
                      onChange={(event) => selectServer(event.target.value)}
                      disabled={servers.length === 0}
                    >
                      {servers.map((server) => (
                        <option key={server.id} value={server.id}>
                          {server.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </div>
            </header>

            <div className="server-admin-stats">
              <MetricCard label="Server" value={selectedServer.name} hint={selectedServer.roles?.includes("boost") ? "Boost active" : "Standard access"} />
              <MetricCard label="Members" value={members.length} hint={activeScopeLabel} />
              <MetricCard label="Roles" value={roles.filter((role) => !role.is_everyone).length} hint="Assignable roles" />
              <MetricCard label="Channels" value={channels.length} hint={guildStateLoading ? "Refreshing" : "Visible to you"} />
              <MetricCard label="Custom Emotes" value={emotes.length} hint={selectedServer.globalEmotesEnabled ? "Global sharing on" : "Server only"} />
            </div>

            <div className="server-admin-tabs">
              {SERVER_TABS.map((tab) => (
                <button
                  key={tab.id}
                  className={activeTab === tab.id ? "active" : ""}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <section className="server-admin-content">
              {activeTab === "overview" && (
                <div className="server-admin-section">
                  <div className="server-admin-panel-grid">
                    <article className="server-admin-card server-admin-hero-card">
                      <div
                        className="server-admin-hero-cover"
                        style={{
                          backgroundImage: selectedServer.bannerUrl
                            ? `linear-gradient(135deg, rgba(5, 11, 24, 0.5), rgba(9, 16, 32, 0.82)), url(${profileImageUrl(selectedServer.bannerUrl)})`
                            : undefined,
                        }}
                      />
                      <div className="server-admin-hero-body">
                        <div className="server-admin-hero-logo">
                          <SafeAvatar
                            src={profileImageUrl(selectedServer.logoUrl)}
                            alt={selectedServer.name}
                            name={selectedServer.name}
                            seed={selectedServer.id}
                            className="server-admin-member-fallback"
                            imgStyle={{
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                              display: "block",
                            }}
                          />
                        </div>
                        <div className="server-admin-hero-copy">
                          <h2>{selectedServer.name}</h2>
                          <p>Server ID: {selectedServer.id}</p>
                          <span>{selectedServer.baseUrl}</span>
                        </div>
                      </div>
                    </article>

                    <article className="server-admin-card">
                      <div className="server-admin-card-head">
                        <h2>Server Branding</h2>
                        <p>Update the public identity and art for this server.</p>
                      </div>
                      <div className="server-admin-form-grid">
                        <label>
                          <span>Name</span>
                          <input
                            value={serverProfileForm.name}
                            onChange={(event) => setServerProfileForm((current) => ({ ...current, name: event.target.value }))}
                            placeholder="Server name"
                          />
                        </label>
                        <label>
                          <span>Logo URL</span>
                          <input
                            value={serverProfileForm.logoUrl}
                            onChange={(event) => setServerProfileForm((current) => ({ ...current, logoUrl: event.target.value }))}
                            placeholder="https://..."
                          />
                        </label>
                        <label className="server-admin-upload-field">
                          <span>Upload logo</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(event) =>
                              onImageFieldUpload(event, "server logo", (imageUrl) =>
                                setServerProfileForm((current) => ({ ...current, logoUrl: imageUrl })),
                              )
                            }
                          />
                        </label>
                        <label>
                          <span>Banner URL</span>
                          <input
                            value={serverProfileForm.bannerUrl}
                            onChange={(event) => setServerProfileForm((current) => ({ ...current, bannerUrl: event.target.value }))}
                            placeholder="https://..."
                          />
                        </label>
                        <label className="server-admin-upload-field">
                          <span>Upload banner</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(event) =>
                              onImageFieldUpload(event, "server banner", (imageUrl) =>
                                setServerProfileForm((current) => ({ ...current, bannerUrl: imageUrl })),
                              )
                            }
                          />
                        </label>
                      </div>
                      <div className="server-admin-row-actions">
                        <button className="server-admin-confirm-btn" onClick={saveServerProfile}>
                          Save server profile
                        </button>
                        <button
                          className={`server-admin-action-btn ${selectedServer.globalEmotesEnabled ? "danger" : "success"}`}
                          onClick={() => toggleGlobalEmotes(!selectedServer.globalEmotesEnabled)}
                        >
                          {selectedServer.globalEmotesEnabled ? "Disable global emotes" : "Enable global emotes"}
                        </button>
                      </div>
                    </article>

                    <article className="server-admin-card">
                      <div className="server-admin-card-head">
                        <h2>Server Signals</h2>
                        <p>Quick health checks for the management surface you are editing.</p>
                      </div>
                      <div className="server-admin-detail-list">
                        <div>
                          <span>Active server</span>
                          <strong>{activeScopeLabel}</strong>
                        </div>
                        <div>
                          <span>Default space</span>
                          <strong>{guilds.find((guild) => guild.id === selectedServer.defaultGuildId)?.name || activeScopeLabel}</strong>
                        </div>
                        <div>
                          <span>Enabled extensions</span>
                          <strong>{enabledExtensions.length}</strong>
                        </div>
                        <div>
                          <span>Last refresh</span>
                          <strong>{guildStateLoading ? "Refreshing now" : "Live data loaded"}</strong>
                        </div>
                      </div>
                    </article>
                  </div>
                </div>
              )}

              {activeTab === "channels" && (
                <div className="server-admin-section">
                  {!selectedGuildId ? (
                    <div className="server-admin-empty">Server data is still loading for channel management.</div>
                  ) : (
                    <>
                      <div className="server-admin-panel-grid">
                        <article className="server-admin-card">
                          <div className="server-admin-card-head">
                            <h2>Create Channel</h2>
                            <p>Add text, voice, or category channels to this server.</p>
                          </div>
                          <div className="server-admin-form-grid">
                            <label>
                              <span>Name</span>
                              <input
                                value={newChannelName}
                                onChange={(event) => setNewChannelName(event.target.value)}
                                placeholder="new-channel"
                              />
                            </label>
                            <label>
                              <span>Type</span>
                              <select value={newChannelType} onChange={(event) => setNewChannelType(event.target.value)}>
                                <option value="text">Text</option>
                                <option value="voice">Voice</option>
                                <option value="category">Category</option>
                              </select>
                            </label>
                            {newChannelType !== "category" ? (
                              <label>
                                <span>Parent category</span>
                                <select value={newChannelParentId} onChange={(event) => setNewChannelParentId(event.target.value)}>
                                  <option value="">No category</option>
                                  {categoryChannels.map((category) => (
                                    <option key={category.id} value={category.id}>
                                      {category.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            ) : null}
                            {newChannelType !== "category" && newChannelParentId ? (
                              <label className="server-admin-checkbox">
                                <input
                                  type="checkbox"
                                  checked={newChannelSyncPermissions}
                                  onChange={(event) => setNewChannelSyncPermissions(event.target.checked)}
                                />
                                <span>Inherit the parent category permissions on create</span>
                              </label>
                            ) : null}
                          </div>
                          <button className="server-admin-confirm-btn" onClick={createChannel}>
                            Create channel
                          </button>
                        </article>

                        <article className="server-admin-card">
                          <div className="server-admin-section-head">
                            <div className="server-admin-card-head">
                              <h2>Channel Layout</h2>
                              <p>Edit, reorder, and lock down what each role can see or say.</p>
                            </div>
                            <input
                              type="search"
                              placeholder="Filter channels"
                              value={channelQuery}
                              onChange={(event) => setChannelQuery(event.target.value)}
                            />
                          </div>

                          <div className="server-admin-channel-stack">
                            {groupedChannels.categories.map((category) => (
                              <div key={category.id} className="server-admin-channel-group">
                                <div className="server-admin-channel-row category">
                                  <div className="server-admin-channel-main">
                                    <span className="server-admin-channel-type">Category</span>
                                    <strong>{category.name}</strong>
                                  </div>
                                  <div className="server-admin-row-actions">
                                    <button className="server-admin-action-btn" onClick={() => moveChannel(category, -1)}>Up</button>
                                    <button className="server-admin-action-btn" onClick={() => moveChannel(category, 1)}>Down</button>
                                    <button className="server-admin-action-btn" onClick={() => openChannelEditor(category)}>Edit</button>
                                    <button className="server-admin-action-btn" onClick={() => setChannelPermissionChannelId(category.id)}>Permissions</button>
                                    <button className="server-admin-action-btn danger" onClick={() => deleteChannel(category)}>Delete</button>
                                  </div>
                                </div>

                                {editingChannelId === category.id ? (
                                  <div className="server-admin-inline-form">
                                    <input
                                      value={channelDraft.name}
                                      onChange={(event) => setChannelDraft((current) => ({ ...current, name: event.target.value }))}
                                      placeholder="Channel name"
                                    />
                                    <button className="server-admin-confirm-btn" onClick={() => syncCategoryChildrenPermissions(category.id)}>
                                      Apply to children
                                    </button>
                                    <button className="server-admin-confirm-btn" onClick={() => saveChannel(category.id)}>
                                      Save
                                    </button>
                                    <button className="server-admin-action-btn" onClick={() => setEditingChannelId("")}>
                                      Cancel
                                    </button>
                                  </div>
                                ) : null}

                                {(groupedChannels.childrenByParentId.get(category.id) || []).map((channel) => (
                                  <div key={channel.id} className="server-admin-channel-row nested">
                                    <div className="server-admin-channel-main">
                                      <span className="server-admin-channel-type">{channel.type}</span>
                                      <strong>{channel.name}</strong>
                                    </div>
                                    <div className="server-admin-row-actions">
                                      <button className="server-admin-action-btn" onClick={() => moveChannel(channel, -1)}>Up</button>
                                      <button className="server-admin-action-btn" onClick={() => moveChannel(channel, 1)}>Down</button>
                                      <button className="server-admin-action-btn" onClick={() => openChannelEditor(channel)}>Edit</button>
                                      <button className="server-admin-action-btn" onClick={() => setChannelPermissionChannelId(channel.id)}>Permissions</button>
                                      <button className="server-admin-action-btn" onClick={() => syncChannelPermissions(channel.id)}>
                                        Sync
                                      </button>
                                      <button className="server-admin-action-btn danger" onClick={() => deleteChannel(channel)}>Delete</button>
                                    </div>
                                    {editingChannelId === channel.id ? (
                                      <div className="server-admin-inline-form server-admin-channel-editor">
                                        <input
                                          value={channelDraft.name}
                                          onChange={(event) => setChannelDraft((current) => ({ ...current, name: event.target.value }))}
                                          placeholder="Channel name"
                                        />
                                        <select
                                          value={channelDraft.parentId}
                                          onChange={(event) => setChannelDraft((current) => ({ ...current, parentId: event.target.value }))}
                                        >
                                          <option value="">No category</option>
                                          {categoryChannels.map((entry) => (
                                            <option key={entry.id} value={entry.id}>
                                              {entry.name}
                                            </option>
                                          ))}
                                        </select>
                                        {channelDraft.parentId ? (
                                          <label className="server-admin-checkbox">
                                            <input
                                              type="checkbox"
                                              checked={!!channelDraft.syncPermissions}
                                              onChange={(event) =>
                                                setChannelDraft((current) => ({
                                                  ...current,
                                                  syncPermissions: event.target.checked,
                                                }))
                                              }
                                            />
                                            <span>Sync parent permissions</span>
                                          </label>
                                        ) : null}
                                        <button className="server-admin-confirm-btn" onClick={() => saveChannel(channel.id)}>
                                          Save
                                        </button>
                                        <button className="server-admin-action-btn" onClick={() => setEditingChannelId("")}>
                                          Cancel
                                        </button>
                                      </div>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            ))}

                            {groupedChannels.uncategorized.map((channel) => (
                              <div key={channel.id} className="server-admin-channel-row">
                                <div className="server-admin-channel-main">
                                  <span className="server-admin-channel-type">{channel.type}</span>
                                  <strong>{channel.name}</strong>
                                </div>
                                <div className="server-admin-row-actions">
                                  <button className="server-admin-action-btn" onClick={() => moveChannel(channel, -1)}>Up</button>
                                  <button className="server-admin-action-btn" onClick={() => moveChannel(channel, 1)}>Down</button>
                                  <button className="server-admin-action-btn" onClick={() => openChannelEditor(channel)}>Edit</button>
                                  <button className="server-admin-action-btn" onClick={() => setChannelPermissionChannelId(channel.id)}>Permissions</button>
                                  <button className="server-admin-action-btn danger" onClick={() => deleteChannel(channel)}>Delete</button>
                                </div>
                                {editingChannelId === channel.id ? (
                                  <div className="server-admin-inline-form server-admin-channel-editor">
                                    <input
                                      value={channelDraft.name}
                                      onChange={(event) => setChannelDraft((current) => ({ ...current, name: event.target.value }))}
                                      placeholder="Channel name"
                                    />
                                    <select
                                      value={channelDraft.parentId}
                                      onChange={(event) => setChannelDraft((current) => ({ ...current, parentId: event.target.value }))}
                                    >
                                      <option value="">No category</option>
                                      {categoryChannels.map((entry) => (
                                        <option key={entry.id} value={entry.id}>
                                          {entry.name}
                                        </option>
                                      ))}
                                    </select>
                                    {channelDraft.parentId ? (
                                      <label className="server-admin-checkbox">
                                        <input
                                          type="checkbox"
                                          checked={!!channelDraft.syncPermissions}
                                          onChange={(event) =>
                                            setChannelDraft((current) => ({
                                              ...current,
                                              syncPermissions: event.target.checked,
                                            }))
                                          }
                                        />
                                        <span>Sync parent permissions</span>
                                      </label>
                                    ) : null}
                                    <button className="server-admin-confirm-btn" onClick={() => saveChannel(channel.id)}>
                                      Save
                                    </button>
                                    <button className="server-admin-action-btn" onClick={() => setEditingChannelId("")}>
                                      Cancel
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            ))}

                            {visibleChannels.length === 0 ? <EmptyState>No matching channels.</EmptyState> : null}
                          </div>
                        </article>
                      </div>

                      {selectedPermissionChannel ? (
                        <article className="server-admin-card">
                          <div className="server-admin-card-head">
                            <h2>Channel Access</h2>
                            <p>
                              Fine-tune explicit allow, deny, or inherit states for <strong>{selectedPermissionChannel.name}</strong>.
                            </p>
                          </div>

                          <div className="server-admin-row-actions">
                            {selectedPermissionChannel.parent_id ? (
                              <button
                                type="button"
                                className="server-admin-action-btn"
                                onClick={() => syncChannelPermissions(selectedPermissionChannel.id)}
                              >
                                Sync from parent category
                              </button>
                            ) : null}
                            {selectedPermissionChannel.type === "category" ? (
                              <button
                                type="button"
                                className="server-admin-action-btn success"
                                onClick={() => syncCategoryChildrenPermissions(selectedPermissionChannel.id)}
                              >
                                Apply category permissions to children
                              </button>
                            ) : null}
                          </div>

                          <div className="server-admin-toggle-list">
                            {[...roles].sort(compareRolesDescending).map((role) => {
                              const overwrite = findOverwrite(overwrites, selectedPermissionChannel.id, "role", role.id);
                              const targetFlags = permissionFlagsForChannel(selectedPermissionChannel);
                              return (
                                <div key={role.id} className="server-admin-toggle-row">
                                  <div>
                                    <strong>{role.is_everyone ? "@everyone" : role.name}</strong>
                                    <p>
                                      {role.is_everyone
                                        ? "Baseline permissions for the whole server."
                                        : selectedPermissionChannel.type === "voice"
                                          ? "Voice access overrides"
                                          : selectedPermissionChannel.type === "category"
                                            ? "Category defaults you can push down to child channels."
                                            : "Text access overrides"}
                                    </p>
                                  </div>
                                  <div className="server-admin-toggle-actions">
                                    {targetFlags.map((flag) => (
                                      <div key={`${role.id}-${flag}`} className="server-admin-permission-pill-group">
                                        <span>{PERMISSION_FLAGS[flag].name}</span>
                                        <PermissionStatePills
                                          state={overwritePermissionState(overwrite, flag)}
                                          onChange={(state) =>
                                            setChannelPermissionState(
                                              selectedPermissionChannel.id,
                                              "role",
                                              role.id,
                                              flag,
                                              state,
                                            )
                                          }
                                        />
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </article>
                      ) : null}
                    </>
                  )}
                </div>
              )}

              {activeTab === "members" && (
                <div className="server-admin-section">
                  {!selectedGuildId ? (
                    <div className="server-admin-empty">Server data is still loading for member management.</div>
                  ) : (
                    <>
                      <div className="server-admin-section-head">
                        <div className="server-admin-card-head">
                          <h2>Members</h2>
                          <p>Assign roles, remove roles, and handle moderation without leaving the panel.</p>
                        </div>
                        <input
                          type="search"
                          placeholder="Search by username, display name, or id"
                          value={memberQuery}
                          onChange={(event) => setMemberQuery(event.target.value)}
                        />
                      </div>

                      <div className="server-admin-member-grid">
                        {visibleMembers.length === 0 ? (
                          <EmptyState>No matching members found.</EmptyState>
                        ) : (
                          visibleMembers.map((member) => {
                            const memberRoles = roleNamesForMember(member, roles);
                            const voiceState = voiceStates.find((entry) => entry.userId === member.id) || null;
                            return (
                              <article key={member.id} className="server-admin-member-card">
                                <div className="server-admin-member-head">
                                  <SafeAvatar
                                    src={profileImageUrl(member.pfp_url)}
                                    alt={member.username}
                                    name={member.username}
                                    seed={member.id}
                                    className="server-admin-member-fallback"
                                    imgStyle={{
                                      width: "100%",
                                      height: "100%",
                                      objectFit: "cover",
                                      display: "block",
                                    }}
                                  />
                                  <div>
                                    <strong>{member.displayName || member.username}</strong>
                                    <p>{member.username} · {member.id}</p>
                                  </div>
                                </div>

                                {voiceState ? (
                                  <div className="server-admin-voice-pill">
                                    In voice: {voiceChannelMap.get(voiceState.channelId)?.name || voiceState.channelId}
                                  </div>
                                ) : null}

                                <div className="server-admin-role-pills">
                                  {memberRoles.length === 0 ? (
                                    <span className="server-admin-pill-muted">No assigned roles</span>
                                  ) : (
                                    memberRoles.map((role) => (
                                      <button
                                        key={role.id}
                                        className="server-admin-role-pill"
                                        onClick={() => removeRoleFromMember(member.id, role.id)}
                                        title="Remove role"
                                      >
                                        {role.name} x
                                      </button>
                                    ))
                                  )}
                                </div>

                                <button
                                  className={`server-admin-action-btn ${selectedMemberId === member.id ? "active" : ""}`}
                                  onClick={() => {
                                    setSelectedMemberId((current) => (current === member.id ? "" : member.id));
                                    setMemberRoleDraftId("");
                                  }}
                                >
                                  {selectedMemberId === member.id ? "Close actions" : "Manage member"}
                                </button>

                                {selectedMemberId === member.id ? (
                                  <div className="server-admin-member-edit">
                                    <div className="server-admin-inline-form">
                                      <select value={memberRoleDraftId} onChange={(event) => setMemberRoleDraftId(event.target.value)}>
                                        <option value="">Choose a role...</option>
                                        {roles.filter((role) => !role.is_everyone).sort(compareRolesDescending).map((role) => (
                                          <option key={role.id} value={role.id}>
                                            {role.name}
                                          </option>
                                        ))}
                                      </select>
                                      <button className="server-admin-confirm-btn" onClick={() => assignRoleToMember(member.id)}>
                                        Assign role
                                      </button>
                                    </div>

                                    <input
                                      value={memberModerationNotes[member.id] || ""}
                                      onChange={(event) =>
                                        setMemberModerationNotes((current) => ({ ...current, [member.id]: event.target.value }))
                                      }
                                      placeholder="Ban reason or moderation note (optional)"
                                    />

                                    <div className="server-admin-row-actions">
                                      <button className="server-admin-action-btn danger" onClick={() => kickMember(member)}>
                                        Kick
                                      </button>
                                      <button className="server-admin-action-btn danger" onClick={() => banMember(member)}>
                                        Ban
                                      </button>
                                    </div>
                                  </div>
                                ) : null}
                              </article>
                            );
                          })
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {activeTab === "roles" && (
                <div className="server-admin-section">
                  {!selectedGuildId ? (
                    <div className="server-admin-empty">Server data is still loading for role management.</div>
                  ) : (
                    <>
                      <div className="server-admin-role-toolbar">
                        <div className="server-admin-create-role">
                          <h3>Create Role</h3>
                          <div>
                            <input
                              value={newRoleName}
                              onChange={(event) => setNewRoleName(event.target.value)}
                              placeholder="Role name"
                            />
                            <button onClick={createRole}>Create</button>
                          </div>
                        </div>
                        <input
                          type="search"
                          placeholder="Filter roles"
                          value={roleQuery}
                          onChange={(event) => setRoleQuery(event.target.value)}
                        />
                      </div>

                      <div className="server-admin-role-grid">
                        {visibleRoles.map((role) => (
                          <article key={role.id} className="server-admin-role-card">
                            {editingRoleId === role.id ? (
                              <>
                                <input
                                  value={editRoleName}
                                  onChange={(event) => setEditRoleName(event.target.value)}
                                  placeholder="Role name"
                                  disabled={role.is_everyone}
                                />
                                <input
                                  value={editRoleColor}
                                  onChange={(event) => setEditRoleColor(event.target.value)}
                                  placeholder="#5865f2 (optional)"
                                  disabled={role.is_everyone}
                                />
                                <div className="server-admin-perm-grid">
                                  {Object.entries(PERMISSION_FLAGS).map(([flag, meta]) => (
                                    <label key={flag}>
                                      <input
                                        type="checkbox"
                                        checked={Boolean(editRolePermissions[flag])}
                                        onChange={(event) =>
                                          setEditRolePermissions((current) => ({ ...current, [flag]: event.target.checked }))
                                        }
                                        disabled={role.is_everyone}
                                      />
                                      <span>{meta.name}</span>
                                    </label>
                                  ))}
                                </div>
                                <div className="server-admin-row-actions">
                                  <button className="server-admin-confirm-btn" onClick={saveRole}>
                                    Save role
                                  </button>
                                  <button className="server-admin-action-btn" onClick={() => setEditingRoleId("")}>
                                    Cancel
                                  </button>
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="server-admin-role-header">
                                  <div className="server-admin-role-heading">
                                    <span className="server-admin-role-swatch" style={{ background: roleColorSwatch(role) }} />
                                    <div>
                                      <h3>{role.name}</h3>
                                      <span>{role.is_everyone ? "@everyone" : `Position ${role.position}`}</span>
                                    </div>
                                  </div>
                                  <span className="server-admin-role-count">{permissionCount(role.permissions)} perms</span>
                                </div>
                                <div className="server-admin-role-summary">
                                  {Object.entries(PERMISSION_FLAGS)
                                    .filter(([flag]) => hasPermission(role.permissions, flag))
                                    .slice(0, 4)
                                    .map(([, meta]) => (
                                      <span key={meta.name} className="server-admin-pill-muted">
                                        {meta.name}
                                      </span>
                                    ))}
                                  {permissionCount(role.permissions) > 4 ? (
                                    <span className="server-admin-pill-muted">+{permissionCount(role.permissions) - 4} more</span>
                                  ) : null}
                                </div>
                                <div className="server-admin-row-actions">
                                  <button className="server-admin-action-btn" onClick={() => moveRole(role, -1)} disabled={role.is_everyone}>
                                    Up
                                  </button>
                                  <button className="server-admin-action-btn" onClick={() => moveRole(role, 1)} disabled={role.is_everyone}>
                                    Down
                                  </button>
                                  <button className="server-admin-action-btn" onClick={() => openRoleEditor(role)} disabled={role.is_everyone}>
                                    Edit
                                  </button>
                                  <button className="server-admin-action-btn danger" onClick={() => deleteRole(role)} disabled={role.is_everyone}>
                                    Delete
                                  </button>
                                </div>
                              </>
                            )}
                          </article>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {activeTab === "assets" && (
                <div className="server-admin-section">
                  {!selectedGuildId ? (
                    <div className="server-admin-empty">Server data is still loading for asset management.</div>
                  ) : (
                    <div className="server-admin-panel-grid">
                      <article className="server-admin-card">
                        <div className="server-admin-card-head">
                          <h2>Global Emotes</h2>
                          <p>Let this server's custom emotes work outside this server when sharing is enabled.</p>
                        </div>
                        <div className="server-admin-toggle-row">
                          <div>
                            <strong>Global emote sharing</strong>
                            <p>Requires Boost on the server owner account.</p>
                          </div>
                          <button
                            className={`server-admin-action-btn ${selectedServer.globalEmotesEnabled ? "danger" : "success"}`}
                            onClick={() => toggleGlobalEmotes(!selectedServer.globalEmotesEnabled)}
                          >
                            {selectedServer.globalEmotesEnabled ? "Disable" : "Enable"}
                          </button>
                        </div>
                      </article>

                      <article className="server-admin-card">
                        <div className="server-admin-card-head">
                          <h2>Create Emote</h2>
                          <p>Upload or paste an image URL for this server's custom emotes.</p>
                        </div>
                        <div className="server-admin-form-grid">
                          <label>
                            <span>Name</span>
                            <input
                              value={newEmoteName}
                              onChange={(event) => setNewEmoteName(event.target.value)}
                              placeholder="wave"
                            />
                          </label>
                          <label>
                            <span>Image URL</span>
                            <input
                              value={newEmoteUrl}
                              onChange={(event) => setNewEmoteUrl(event.target.value)}
                              placeholder="https://..."
                            />
                          </label>
                          <label className="server-admin-upload-field">
                            <span>Upload image</span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(event) =>
                                onImageFieldUpload(event, "emote image", (imageUrl) => setNewEmoteUrl(imageUrl))
                              }
                            />
                          </label>
                        </div>
                        <button className="server-admin-confirm-btn" onClick={createEmote}>
                          Create emote
                        </button>
                      </article>

                      <article className="server-admin-card server-admin-card-span-2">
                        <div className="server-admin-card-head">
                          <h2>Server Emotes</h2>
                          <p>Review, remove, and verify custom emotes available on this server.</p>
                        </div>

                        <div className="server-admin-emote-grid">
                          {emotes.length === 0 ? (
                            <EmptyState>No custom emotes yet.</EmptyState>
                          ) : (
                            emotes.map((emote) => (
                              <article key={emote.id} className="server-admin-emote-card">
                                <div className="server-admin-emote-preview">
                                  <img src={profileImageUrl(emote.imageUrl)} alt={emote.name} />
                                </div>
                                <strong>{emote.name}</strong>
                                <span>Added {formatDateTime(emote.createdAt)}</span>
                                <button className="server-admin-action-btn danger" onClick={() => removeEmote(emote)}>
                                  Remove
                                </button>
                              </article>
                            ))
                          )}
                        </div>
                      </article>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "invites" && (
                <div className="server-admin-section">
                  <div className="server-admin-panel-grid">
                    <article className="server-admin-card">
                      <div className="server-admin-card-head">
                        <h2>Create Invite</h2>
                        <p>Create quick join links, permanent invites, or custom codes for this server.</p>
                      </div>
                      <div className="server-admin-form-grid">
                        <label>
                          <span>Custom code</span>
                          <input
                            value={inviteCustomCode}
                            onChange={(event) => setInviteCustomCode(event.target.value)}
                            placeholder="Optional"
                          />
                        </label>
                        <label>
                          <span>Max uses</span>
                          <input
                            value={inviteMaxUses}
                            onChange={(event) => setInviteMaxUses(event.target.value)}
                            placeholder="25"
                            disabled={invitePermanent}
                          />
                        </label>
                        <label>
                          <span>Expires at</span>
                          <input
                            type="datetime-local"
                            value={inviteExpiresAt}
                            onChange={(event) => setInviteExpiresAt(event.target.value)}
                            disabled={invitePermanent}
                          />
                        </label>
                        <label className="server-admin-checkbox">
                          <input
                            type="checkbox"
                            checked={invitePermanent}
                            onChange={(event) => setInvitePermanent(event.target.checked)}
                          />
                          <span>Permanent invite</span>
                        </label>
                      </div>
                      <button className="server-admin-confirm-btn" onClick={createInvite}>
                        Create invite
                      </button>
                    </article>

                    <article className="server-admin-card server-admin-card-span-2">
                      <div className="server-admin-card-head">
                        <h2>Active Invites</h2>
                        <p>Track usage, copy join links, or revoke old entry points.</p>
                      </div>

                      {invitesLoading ? (
                        <EmptyState>Loading invites...</EmptyState>
                      ) : invites.length === 0 ? (
                        <EmptyState>No invites created yet.</EmptyState>
                      ) : (
                        <div className="server-admin-invite-list">
                          {invites.map((invite) => (
                            <article key={invite.code} className="server-admin-invite-card">
                              <div>
                                <strong>{invite.code}</strong>
                                <p>
                                  {invite.permanent ? "Permanent" : `Uses ${invite.uses}${invite.maxUses ? ` / ${invite.maxUses}` : ""}`}
                                  {" · "}
                                  {invite.expiresAt ? `Expires ${formatDateTime(invite.expiresAt)}` : "No expiry"}
                                </p>
                                <code>{invite.joinUrl}</code>
                              </div>
                              <div className="server-admin-row-actions">
                                <button className="server-admin-action-btn" onClick={() => copyInvite(invite.joinUrl)}>
                                  Copy link
                                </button>
                                <button className="server-admin-action-btn danger" onClick={() => deleteInvite(invite.code)}>
                                  Delete
                                </button>
                              </div>
                            </article>
                          ))}
                        </div>
                      )}
                    </article>
                  </div>
                </div>
              )}

              {activeTab === "extensions" && (
                <div className="server-admin-section">
                  <article className="server-admin-card">
                    <div className="server-admin-card-head">
                      <h2>Server Extensions</h2>
                      <p>Enable approved extensions and edit their live server config.</p>
                    </div>

                    {extensionsLoading ? (
                      <EmptyState>Loading extensions...</EmptyState>
                    ) : extensionCatalog.serverExtensions.length === 0 ? (
                      <EmptyState>No server extensions found in the catalog.</EmptyState>
                    ) : (
                      <div className="server-admin-extension-list">
                        {extensionCatalog.serverExtensions.map((extension) => {
                          const enabled = isExtensionEnabled(extension.id);
                          const draft = extensionConfigDrafts[extension.id];
                          return (
                            <article key={extension.id} className="server-admin-extension-card server-admin-extension-card-stacked">
                              <div className="server-admin-extension-head">
                                <div>
                                  <strong>{extension.name}</strong>
                                  <p>{extension.description || "No description provided."}</p>
                                  <code>{extension.id}</code>
                                </div>
                                <div className="server-admin-row-actions">
                                  <button
                                    className={`server-admin-action-btn ${enabled ? "danger" : "success"}`}
                                    onClick={() => toggleExtension(extension.id, !enabled)}
                                  >
                                    {enabled ? "Disable" : "Enable"}
                                  </button>
                                  <button
                                    className="server-admin-action-btn"
                                    onClick={() => loadExtensionConfig(extension.id)}
                                  >
                                    {extensionConfigLoadingId === extension.id ? "Loading..." : "Config"}
                                  </button>
                                </div>
                              </div>

                              {selectedExtensionId === extension.id ? (
                                <div className="server-admin-extension-config">
                                  <textarea
                                    className="server-admin-json-editor"
                                    value={
                                      draft
                                      ?? JSON.stringify(extension.configDefaults || {}, null, 2)
                                    }
                                    onChange={(event) =>
                                      setExtensionConfigDrafts((current) => ({
                                        ...current,
                                        [extension.id]: event.target.value,
                                      }))
                                    }
                                    rows={14}
                                  />
                                  <div className="server-admin-row-actions">
                                    <button className="server-admin-confirm-btn" onClick={() => saveExtensionConfig(extension.id)}>
                                      Save config
                                    </button>
                                    <button className="server-admin-action-btn" onClick={() => setSelectedExtensionId("")}>
                                      Close
                                    </button>
                                  </div>
                                </div>
                              ) : null}
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </article>
                </div>
              )}

              {activeTab === "moderation" && (
                <div className="server-admin-section">
                  {!selectedGuildId ? (
                    <div className="server-admin-empty">Server data is still loading for moderation controls.</div>
                  ) : (
                    <div className="server-admin-panel-grid">
                      <article className="server-admin-card">
                        <div className="server-admin-card-head">
                          <h2>Voice Moderation</h2>
                          <p>Mute, deafen, or disconnect members currently in voice channels.</p>
                        </div>
                        {voiceStates.length === 0 ? (
                          <EmptyState>No one is currently connected to voice.</EmptyState>
                        ) : (
                          <div className="server-admin-voice-list">
                            {voiceStates.map((voiceState) => (
                              <article key={`${voiceState.userId}:${voiceState.channelId}`} className="server-admin-voice-card">
                                <div>
                                  <strong>{voiceState.username}</strong>
                                  <p>{voiceChannelMap.get(voiceState.channelId)?.name || voiceState.channelId}</p>
                                  <span>{voiceState.muted ? "Muted" : "Unmuted"} · {voiceState.deafened ? "Deafened" : "Hearing"}</span>
                                </div>
                                <div className="server-admin-row-actions">
                                  <button
                                    className="server-admin-action-btn"
                                    onClick={() => updateVoiceMember(voiceState.channelId, voiceState.userId, { muted: !voiceState.muted })}
                                  >
                                    {voiceState.muted ? "Unmute" : "Mute"}
                                  </button>
                                  <button
                                    className="server-admin-action-btn"
                                    onClick={() => updateVoiceMember(voiceState.channelId, voiceState.userId, { deafened: !voiceState.deafened })}
                                  >
                                    {voiceState.deafened ? "Undeafen" : "Deafen"}
                                  </button>
                                  <button
                                    className="server-admin-action-btn danger"
                                    onClick={() => disconnectVoiceMember(voiceState.channelId, voiceState.userId)}
                                  >
                                    Disconnect
                                  </button>
                                </div>
                              </article>
                            ))}
                          </div>
                        )}
                      </article>

                      <article className="server-admin-card">
                        <div className="server-admin-card-head">
                          <h2>Banned Users</h2>
                          <p>Review bans on this server and reverse them when needed.</p>
                        </div>
                        {bansLoading ? (
                          <EmptyState>Loading bans...</EmptyState>
                        ) : bans.length === 0 ? (
                          <EmptyState>No banned users on this server.</EmptyState>
                        ) : (
                          <div className="server-admin-ban-list">
                            {bans.map((ban) => (
                              <article key={ban.userId} className="server-admin-ban-card">
                                <div className="server-admin-member-head">
                                  <SafeAvatar
                                    src={profileImageUrl(ban.pfp_url)}
                                    alt={ban.username}
                                    name={ban.username}
                                    seed={ban.userId}
                                    className="server-admin-member-fallback"
                                    imgStyle={{
                                      width: "100%",
                                      height: "100%",
                                      objectFit: "cover",
                                      display: "block",
                                    }}
                                  />
                                  <div>
                                    <strong>{ban.displayName || ban.username}</strong>
                                    <p>{ban.username} · {ban.userId}</p>
                                  </div>
                                </div>
                                <p className="server-admin-note">
                                  {ban.reason || "No reason recorded."}
                                </p>
                                <span className="server-admin-meta-line">
                                  Banned by {ban.bannedByUsername} on {formatDateTime(ban.createdAt)}
                                </span>
                                <button className="server-admin-action-btn success" onClick={() => unbanMember(ban.userId)}>
                                  Unban
                                </button>
                              </article>
                            ))}
                          </div>
                        )}
                      </article>
                    </div>
                  )}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
