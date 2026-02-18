import { useEffect, useMemo, useRef, useState } from "react";
import { createSfuVoiceClient } from "./voice/sfuClient";
import { LandingPage } from "./components/LandingPage";
import { AuthShell } from "./components/AuthShell";
import { TermsPage } from "./components/TermsPage";
import { DOWNLOAD_TARGETS, getPreferredDownloadTarget } from "./lib/downloads";
import {
  APP_ROUTE_CLIENT,
  APP_ROUTE_HOME,
  APP_ROUTE_LOGIN,
  APP_ROUTE_TERMS,
  buildBoostGiftUrl,
  buildInviteJoinUrl,
  getAppRouteFromLocation,
  getBoostGiftCodeFromCurrentLocation,
  getInviteCodeFromCurrentLocation,
  isBoostGiftPath,
  isInviteJoinPath,
  normalizeAppPath,
  parseBoostGiftCodeFromInput,
  parseInviteCodeFromInput,
  writeAppRoute
} from "./lib/routing";

function resolveCoreApiBase() {
  const fromEnv = String(import.meta.env.VITE_CORE_API_URL || "").trim();
  let fromQuery = "";
  if (typeof window !== "undefined") {
    const qp = new URLSearchParams(window.location.search || "");
    fromQuery = String(qp.get("coreApi") || "").trim();
  }
  const candidate = fromQuery || fromEnv || "https://api.opencom.online";
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "https://api.opencom.online";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return "https://api.opencom.online";
  }
}

const CORE_API = resolveCoreApiBase();

/** Resolve profile image URL so it loads from the API when relative (e.g. /v1/profile-images/...) */
function profileImageUrl(url) {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed || trimmed === "null" || trimmed === "undefined" || trimmed === "[object Object]") return null;
  url = trimmed;
  if (url.startsWith("data:")) return url;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("users/")) return `${CORE_API.replace(/\/$/, "")}/v1/profile-images/${url}`;
  if (url.startsWith("/users/")) return `${CORE_API.replace(/\/$/, "")}/v1/profile-images${url}`;
  if (url.startsWith("/")) return `${CORE_API.replace(/\/$/, "")}${url}`;
  return url;
}

function createBasicFullProfile(profileData = {}) {
  const hasBio = !!String(profileData?.bio || "").trim();
  return {
    version: 1,
    mode: "basic",
    enabled: true,
    theme: {
      background: "linear-gradient(150deg, #16274b, #0f1a33 65%)",
      card: "rgba(9, 14, 28, 0.62)",
      text: "#dfe9ff"
    },
    elements: [
      { id: "banner", type: "banner", x: 0, y: 0, w: 100, h: 34, order: 0 },
      { id: "avatar", type: "avatar", x: 4, y: 21, w: 20, h: 31, order: 1 },
      { id: "name", type: "name", x: 30, y: 30, w: 66, h: 10, order: 2 },
      { id: "bio", type: "bio", x: 4, y: 54, w: 92, h: hasBio ? 30 : 18, order: 3 }
    ],
    links: []
  };
}

function clampProfilePercent(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

function normalizeFullProfile(profileData = {}, fullProfileCandidate) {
  const basic = createBasicFullProfile(profileData);
  const raw = fullProfileCandidate && typeof fullProfileCandidate === "object" ? fullProfileCandidate : {};

  const themeInput = raw.theme && typeof raw.theme === "object" ? raw.theme : {};
  const theme = {
    background: typeof themeInput.background === "string" && themeInput.background.trim() ? themeInput.background.trim().slice(0, 300) : basic.theme.background,
    card: typeof themeInput.card === "string" && themeInput.card.trim() ? themeInput.card.trim().slice(0, 120) : basic.theme.card,
    text: typeof themeInput.text === "string" && themeInput.text.trim() ? themeInput.text.trim().slice(0, 40) : basic.theme.text
  };

  const rawElements = Array.isArray(raw.elements) ? raw.elements : [];
  const elements = rawElements
    .filter((item) => item && typeof item === "object")
    .slice(0, 24)
    .map((item, index) => {
      const type = String(item.type || "").toLowerCase();
      if (!["avatar", "banner", "name", "bio", "links", "text"].includes(type)) return null;
      return {
        id: String(item.id || `${type}-${index + 1}`).slice(0, 40),
        type,
        x: clampProfilePercent(item.x, 0, 100, type === "banner" ? 0 : 5),
        y: clampProfilePercent(item.y, 0, 100, type === "banner" ? 0 : 5 + index * 8),
        w: clampProfilePercent(item.w, 1, 100, type === "banner" ? 100 : (type === "avatar" ? 20 : 80)),
        h: clampProfilePercent(item.h, 1, 100, type === "banner" ? 34 : (type === "avatar" ? 31 : 12)),
        order: Math.max(0, Math.min(100, Number.isFinite(Number(item.order)) ? Math.round(Number(item.order)) : index)),
        text: typeof item.text === "string" ? item.text.slice(0, 500) : ""
      };
    })
    .filter(Boolean);

  const rawLinks = Array.isArray(raw.links) ? raw.links : [];
  const links = rawLinks
    .filter((item) => item && typeof item === "object")
    .slice(0, 16)
    .map((item, index) => {
      const label = String(item.label || "").trim().slice(0, 40);
      const url = String(item.url || "").trim().slice(0, 500);
      if (!label || !/^https?:\/\//i.test(url)) return null;
      return {
        id: String(item.id || `link-${index + 1}`).slice(0, 40),
        label,
        url,
        x: clampProfilePercent(item.x, 0, 100, 0),
        y: clampProfilePercent(item.y, 0, 100, 0)
      };
    })
    .filter(Boolean);

  return {
    version: 1,
    mode: raw.mode === "custom" ? "custom" : "basic",
    enabled: raw.enabled !== false,
    theme,
    elements: elements.length ? elements : basic.elements,
    links
  };
}

const THEME_STORAGE_KEY = "opencom_custom_theme_css";
const THEME_ENABLED_STORAGE_KEY = "opencom_custom_theme_enabled";
const SELF_STATUS_KEY = "opencom_self_status";
const PINNED_DM_KEY = "opencom_pinned_dm_messages";
const ACTIVE_DM_KEY = "opencom_active_dm";
const GATEWAY_DEVICE_ID_KEY = "opencom_gateway_device_id";
const MIC_GAIN_KEY = "opencom_mic_gain";
const MIC_SENSITIVITY_KEY = "opencom_mic_sensitivity";
const AUDIO_INPUT_DEVICE_KEY = "opencom_audio_input_device";
const AUDIO_OUTPUT_DEVICE_KEY = "opencom_audio_output_device";
const NOISE_SUPPRESSION_KEY = "opencom_noise_suppression";
const VOICE_MEMBER_AUDIO_PREFS_KEY = "opencom_voice_member_audio_prefs";
// Kept for backward compatibility with any persisted/runtime references from older bundles.
const SERVER_VOICE_GATEWAY_PREFS_KEY = "opencom_server_voice_gateway_prefs";
const LAST_CORE_GATEWAY_KEY = "opencom_last_core_gateway";
const LAST_SERVER_GATEWAY_KEY = "opencom_last_server_gateway";
const FALLBACK_CORE_GATEWAY_WS_URL = "wss://ws.opencom.online/gateway";
const DEBUG_VOICE_STORAGE_KEY = "opencom_debug_voice";
const CLIENT_EXTENSIONS_ENABLED_KEY = "opencom_client_extensions_enabled";
const CLIENT_EXTENSIONS_DEV_MODE_KEY = "opencom_client_extensions_dev_mode";
const CLIENT_EXTENSIONS_DEV_URLS_KEY = "opencom_client_extensions_dev_urls";
const ACCESS_TOKEN_KEY = "opencom_access_token";
const REFRESH_TOKEN_KEY = "opencom_refresh_token";
const PENDING_INVITE_CODE_KEY = "opencom_pending_invite_code";
const PENDING_INVITE_AUTO_JOIN_KEY = "opencom_pending_invite_auto_join";

const BUILTIN_EMOTES = {
  smile: "😄",
  grin: "😁",
  joy: "😂",
  rofl: "🤣",
  wink: "😉",
  heart: "❤️",
  thumbs_up: "👍",
  fire: "🔥",
  tada: "🎉",
  eyes: "👀",
  thinking: "🤔",
  sob: "😭"
};

const GUILD_PERM = {
  VIEW_CHANNEL: 1n << 0n,
  SEND_MESSAGES: 1n << 1n,
  MANAGE_CHANNELS: 1n << 2n,
  MANAGE_ROLES: 1n << 3n,
  KICK_MEMBERS: 1n << 4n,
  BAN_MEMBERS: 1n << 5n,
  MUTE_MEMBERS: 1n << 6n,
  DEAFEN_MEMBERS: 1n << 7n,
  MOVE_MEMBERS: 1n << 8n,
  CONNECT: 1n << 9n,
  SPEAK: 1n << 10n,
  ATTACH_FILES: 1n << 11n,
  ADMINISTRATOR: 1n << 60n
};

function parsePermissionBits(value) {
  try {
    if (typeof value === "bigint") return value;
    if (typeof value === "number") return BigInt(value);
    if (typeof value === "string" && value.trim()) return BigInt(value.trim());
    return 0n;
  } catch {
    return 0n;
  }
}

function isVoiceDebugEnabled() {
  const envEnabled = String(import.meta.env.VITE_DEBUG_VOICE || "").trim() === "1";
  const storageEnabled = typeof window !== "undefined" && localStorage.getItem(DEBUG_VOICE_STORAGE_KEY) === "1";
  return envEnabled || storageEnabled;
}

function decodeJwtPayload(token = "") {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(normalized);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

async function refreshAccessTokenWithRefreshToken() {
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY) || "";
  if (!refreshToken) return null;
  const response = await fetch(`${CORE_API}/v1/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken })
  });
  if (!response.ok) return null;
  const data = await response.json().catch(() => null);
  const accessToken = data?.accessToken;
  if (!accessToken) return null;
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  if (data?.refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("opencom-access-token-refresh", {
      detail: {
        accessToken,
        refreshToken: data?.refreshToken || refreshToken
      }
    }));
  }
  return {
    accessToken,
    refreshToken: data?.refreshToken || refreshToken
  };
}

async function refreshMembershipTokenForNode(baseUrl, membershipToken) {
  if (!membershipToken) return null;
  const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY) || "";
  if (!accessToken) return null;
  const claims = decodeJwtPayload(membershipToken);
  const serverId = claims?.core_server_id || claims?.server_id;
  if (!serverId) return null;

  const response = await fetch(`${CORE_API}/v1/servers/${encodeURIComponent(serverId)}/membership-token`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) return null;
  const data = await response.json().catch(() => null);
  const nextToken = data?.membershipToken;
  if (!nextToken) return null;

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("opencom-membership-token-refresh", {
      detail: { serverId, membershipToken: nextToken }
    }));
  }
  return nextToken;
}

function getLastSuccessfulGateway(candidates, storageKey) {
  return prioritizeLastSuccessfulGateway(candidates, storageKey);
}

function normalizeGatewayWsUrl(value) {
  if (!value || typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";

  // In desktop file:// mode, never allow relative/implicit URLs to resolve against file origin.
  if (typeof window !== "undefined" && window.location.protocol === "file:") {
    if (trimmed.startsWith("/") || !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
      return FALLBACK_CORE_GATEWAY_WS_URL;
    }
  }

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
  if (window.location.protocol === "file:") return FALLBACK_CORE_GATEWAY_WS_URL;
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

function getDesktopBridge() {
  if (typeof window === "undefined") return null;
  return window.opencomDesktopBridge || null;
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

  useEffect(() => {
    const onThemeUpdated = (event) => {
      const nextCss = String(event?.detail?.css ?? localStorage.getItem(THEME_STORAGE_KEY) || "");
      const nextEnabled = event?.detail?.enabled !== undefined
        ? !!event.detail.enabled
        : localStorage.getItem(THEME_ENABLED_STORAGE_KEY) !== "0";
      setCss(nextCss);
      setEnabled(nextEnabled);
    };
    const onStorage = (event) => {
      if (!event || (event.key !== THEME_STORAGE_KEY && event.key !== THEME_ENABLED_STORAGE_KEY)) return;
      onThemeUpdated({});
    };

    window.addEventListener("opencom-theme-updated", onThemeUpdated);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("opencom-theme-updated", onThemeUpdated);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

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
  const retried = options.__retried === true;
  const nextOptions = { ...options };
  delete nextOptions.__retried;
  const response = await fetch(`${CORE_API}${path}`, {
    headers: { "Content-Type": "application/json", ...(nextOptions.headers || {}) },
    ...nextOptions
  });

  if (!response.ok) {
    if (response.status === 401 && !retried && path !== "/v1/auth/refresh") {
      const refreshed = await refreshAccessTokenWithRefreshToken().catch(() => null);
      if (refreshed?.accessToken) {
        const mergedHeaders = {
          ...(nextOptions.headers || {}),
          Authorization: `Bearer ${refreshed.accessToken}`
        };
        return api(path, { ...nextOptions, headers: mergedHeaders, __retried: true });
      }
    }
    const errorData = await response.json().catch(() => ({}));
    const err = new Error(errorData.error || `HTTP_${response.status}`);
    err.status = response.status;
    throw err;
  }

  return response.json();
}

async function nodeApi(baseUrl, path, token, options = {}) {
  const retried = options.__retried === true;
  const nextOptions = { ...options };
  delete nextOptions.__retried;
  const hasBody = nextOptions.body !== undefined && nextOptions.body !== null;
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${token}`,
      ...(nextOptions.headers || {})
    },
    ...nextOptions
  });

  if (!response.ok) {
    if (response.status === 401 && !retried) {
      const nextMembershipToken = await refreshMembershipTokenForNode(baseUrl, token).catch(() => null);
      if (nextMembershipToken) {
        return nodeApi(baseUrl, path, nextMembershipToken, { ...nextOptions, __retried: true });
      }
    }
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

function getStoredStringArray(key) {
  const value = getStoredJson(key, []);
  return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim()) : [];
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

function getSlashQuery(value = "") {
  const trimmed = value.trimStart();
  if (!trimmed.startsWith("/")) return null;
  const commandToken = trimmed.slice(1).split(/\s+/)[0] || "";
  return commandToken.toLowerCase();
}

function parseCommandArgs(raw = "") {
  const tokens = [];
  const regex = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|(\S+)/g;
  let match = regex.exec(raw);
  while (match) {
    tokens.push((match[1] ?? match[2] ?? match[3] ?? "").replace(/\\(["'\\])/g, "$1"));
    match = regex.exec(raw);
  }
  return tokens;
}

function coerceCommandArg(value, optionType) {
  if (optionType === "number") {
    const num = Number(value);
    if (Number.isNaN(num)) throw new Error(`Invalid number: ${value}`);
    return num;
  }
  if (optionType === "boolean") {
    const normalized = String(value).toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
    throw new Error(`Invalid boolean: ${value}`);
  }
  return value;
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

function rpcFormFromActivity(activity = null) {
  return {
    name: activity?.name || "",
    details: activity?.details || "",
    state: activity?.state || "",
    largeImageUrl: activity?.largeImageUrl || "",
    largeImageText: activity?.largeImageText || "",
    smallImageUrl: activity?.smallImageUrl || "",
    smallImageText: activity?.smallImageText || "",
    button1Label: activity?.buttons?.[0]?.label || "",
    button1Url: activity?.buttons?.[0]?.url || "",
    button2Label: activity?.buttons?.[1]?.label || "",
    button2Url: activity?.buttons?.[1]?.url || ""
  };
}

function rpcActivityFromForm(form) {
  const buttons = [];
  if (form.button1Label.trim() && form.button1Url.trim()) buttons.push({ label: form.button1Label.trim(), url: form.button1Url.trim() });
  if (form.button2Label.trim() && form.button2Url.trim()) buttons.push({ label: form.button2Label.trim(), url: form.button2Url.trim() });
  return {
    name: form.name.trim() || undefined,
    details: form.details.trim() || undefined,
    state: form.state.trim() || undefined,
    largeImageUrl: form.largeImageUrl.trim() || undefined,
    largeImageText: form.largeImageText.trim() || undefined,
    smallImageUrl: form.smallImageUrl.trim() || undefined,
    smallImageText: form.smallImageText.trim() || undefined,
    buttons: buttons.length ? buttons : undefined
  };
}

function getMessageDayKey(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function formatMessageDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });
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

function extensionForMimeType(mimeType = "") {
  if (!mimeType) return ".bin";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/gif") return ".gif";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "image/svg+xml") return ".svg";
  if (mimeType === "image/bmp") return ".bmp";
  if (mimeType === "image/heic") return ".heic";
  if (mimeType === "video/mp4") return ".mp4";
  if (mimeType === "video/webm") return ".webm";
  if (mimeType === "application/pdf") return ".pdf";
  return ".bin";
}

function normalizeAttachmentFile(file, prefix = "upload") {
  if (!file) return null;
  if (file.name && file.name.trim()) return file;
  const ext = extensionForMimeType(file.type || "");
  const fallbackName = `${prefix}-${Date.now()}${ext}`;
  try {
    return new File([file], fallbackName, { type: file.type || "application/octet-stream" });
  } catch {
    return file;
  }
}

function normalizeImageUrlInput(value = "") {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed) || /^data:image\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/")) return trimmed;
  if (trimmed.startsWith("users/")) return `/v1/profile-images/${trimmed}`;
  return trimmed;
}

function extractHttpUrls(value = "") {
  const text = String(value || "");
  if (!text) return [];
  const regex = /https?:\/\/[^\s<>"'`)\]]+/gi;
  const out = new Set();
  let match = regex.exec(text);
  while (match) {
    const raw = String(match[0] || "").trim();
    if (raw) out.add(raw);
    match = regex.exec(text);
  }
  return [...out];
}

export function App() {
  const voiceDebugEnabled = isVoiceDebugEnabled();
  const voiceDebug = (message, context = {}) => {
    if (!voiceDebugEnabled) return;
    console.debug(`[voice-debug] ${message}`, context);
  };
  const storedActiveDmId = localStorage.getItem(ACTIVE_DM_KEY) || "";
  const [accessToken, setAccessToken] = useState(localStorage.getItem(ACCESS_TOKEN_KEY) || "");
  const [refreshToken, setRefreshToken] = useState(localStorage.getItem(REFRESH_TOKEN_KEY) || "");
  const [authMode, setAuthMode] = useState("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState("");
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
  const [showEmotePicker, setShowEmotePicker] = useState(false);
  const [newServerEmoteName, setNewServerEmoteName] = useState("");
  const [newServerEmoteUrl, setNewServerEmoteUrl] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const [invitePendingCode, setInvitePendingCode] = useState(() => {
    try {
      return sessionStorage.getItem(PENDING_INVITE_CODE_KEY) || "";
    } catch {
      return "";
    }
  });
  const [invitePendingAutoJoin, setInvitePendingAutoJoin] = useState(() => {
    try {
      return sessionStorage.getItem(PENDING_INVITE_AUTO_JOIN_KEY) === "1";
    } catch {
      return false;
    }
  });

  const [friends, setFriends] = useState([]);
  const [friendQuery, setFriendQuery] = useState("");
  const [friendAddInput, setFriendAddInput] = useState("");
  const [friendView, setFriendView] = useState("online");

  const [dms, setDms] = useState([]);
  const [activeDmId, setActiveDmId] = useState(storedActiveDmId);
  const [dmText, setDmText] = useState("");

  const [profile, setProfile] = useState(null);
  const [profileForm, setProfileForm] = useState({ displayName: "", bio: "", pfpUrl: "", bannerUrl: "" });
  const [fullProfileDraft, setFullProfileDraft] = useState(createBasicFullProfile({}));
  const [fullProfileViewer, setFullProfileViewer] = useState(null);
  const [fullProfileDraggingElementId, setFullProfileDraggingElementId] = useState("");
  const fullProfileDragOffsetRef = useRef({ x: 0, y: 0 });
  const fullProfileEditorCanvasRef = useRef(null);
  const [rpcForm, setRpcForm] = useState({
    name: "",
    details: "",
    state: "",
    largeImageUrl: "",
    largeImageText: "",
    smallImageUrl: "",
    smallImageText: "",
    button1Label: "",
    button1Url: "",
    button2Label: "",
    button2Url: ""
  });
  const [serverProfileForm, setServerProfileForm] = useState({ name: "", logoUrl: "", bannerUrl: "" });

  const [newServerName, setNewServerName] = useState("");
  const [newServerBaseUrl, setNewServerBaseUrl] = useState("https://");
  const [newServerLogoUrl, setNewServerLogoUrl] = useState("");
  const [newServerBannerUrl, setNewServerBannerUrl] = useState("");
  const [inviteServerId, setInviteServerId] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [inviteJoinUrl, setInviteJoinUrl] = useState("");
  const [inviteCustomCode, setInviteCustomCode] = useState("");
  const [invitePermanent, setInvitePermanent] = useState(false);
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
  const [noiseSuppressionEnabled, setNoiseSuppressionEnabled] = useState(localStorage.getItem(NOISE_SUPPRESSION_KEY) !== "0");
  const [localAudioProcessingInfo, setLocalAudioProcessingInfo] = useState(null);
  const [audioInputDevices, setAudioInputDevices] = useState([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState([]);
  const [selfStatus, setSelfStatus] = useState(localStorage.getItem(SELF_STATUS_KEY) || "online");
  const [showPinned, setShowPinned] = useState(false);
  const [newOfficialServerName, setNewOfficialServerName] = useState("");
  const [newOfficialServerLogoUrl, setNewOfficialServerLogoUrl] = useState("");
  const [newOfficialServerBannerUrl, setNewOfficialServerBannerUrl] = useState("");
  const [pinnedServerMessages, setPinnedServerMessages] = useState({});
  const [pinnedDmMessages, setPinnedDmMessages] = useState(getStoredJson(PINNED_DM_KEY, {}));
  const [newRoleName, setNewRoleName] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [moderationMemberId, setModerationMemberId] = useState("");
  const [moderationBanReason, setModerationBanReason] = useState("");
  const [moderationUnbanUserId, setModerationUnbanUserId] = useState("");
  const [moderationBusy, setModerationBusy] = useState(false);
  const [profileCardPosition, setProfileCardPosition] = useState({ x: 26, y: 26 });
  const [draggingProfileCard, setDraggingProfileCard] = useState(false);
  const [invertProfileDrag, setInvertProfileDrag] = useState(false);
  const [dmReplyTarget, setDmReplyTarget] = useState(null);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState("profile");
  const [boostStatus, setBoostStatus] = useState(null);
  const [boostLoading, setBoostLoading] = useState(false);
  const [boostUpsell, setBoostUpsell] = useState(null);
  const [boostGiftCode, setBoostGiftCode] = useState("");
  const [boostGiftPreview, setBoostGiftPreview] = useState(null);
  const [boostGiftPrompt, setBoostGiftPrompt] = useState(null);
  const [boostGiftLoading, setBoostGiftLoading] = useState(false);
  const [boostGiftRedeeming, setBoostGiftRedeeming] = useState(false);
  const [boostGiftCheckoutBusy, setBoostGiftCheckoutBusy] = useState(false);
  const [boostGiftSent, setBoostGiftSent] = useState([]);
  const [linkPreviewByUrl, setLinkPreviewByUrl] = useState({});
  const [attachmentPreviewUrlById, setAttachmentPreviewUrlById] = useState({});
  const [addServerModalOpen, setAddServerModalOpen] = useState(false);
  const [addServerTab, setAddServerTab] = useState("create");
  const [serverContextMenu, setServerContextMenu] = useState(null);
  const [messageContextMenu, setMessageContextMenu] = useState(null);
  const [memberContextMenu, setMemberContextMenu] = useState(null);
  const [channelContextMenu, setChannelContextMenu] = useState(null);
  const [categoryContextMenu, setCategoryContextMenu] = useState(null);
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
  const [routePath, setRoutePath] = useState(getAppRouteFromLocation);
  const [downloadsMenuOpen, setDownloadsMenuOpen] = useState(false);
  const [dialogModal, setDialogModal] = useState(null);
  const [gatewayConnected, setGatewayConnected] = useState(false);
  const [nodeGatewayConnected, setNodeGatewayConnected] = useState(false);
  const [nodeGatewayServerId, setNodeGatewayServerId] = useState("");
  const [dmNotification, setDmNotification] = useState(null);
  const [voiceStatesByGuild, setVoiceStatesByGuild] = useState({});
  const [voiceSpeakingByGuild, setVoiceSpeakingByGuild] = useState({});
  const [remoteScreenSharesByProducerId, setRemoteScreenSharesByProducerId] = useState({});
  const [voiceMemberAudioPrefsByGuild, setVoiceMemberAudioPrefsByGuild] = useState(getStoredJson(VOICE_MEMBER_AUDIO_PREFS_KEY, {}));
  const [serverVoiceGatewayPrefs, setServerVoiceGatewayPrefs] = useState(getStoredJson(SERVER_VOICE_GATEWAY_PREFS_KEY, {}));
  const [nodeGatewayUnavailableByServer, setNodeGatewayUnavailableByServer] = useState({});
  const [clientExtensionCatalog, setClientExtensionCatalog] = useState([]);
  const [enabledClientExtensions, setEnabledClientExtensions] = useState(getStoredStringArray(CLIENT_EXTENSIONS_ENABLED_KEY));
  const [clientExtensionDevMode, setClientExtensionDevMode] = useState(localStorage.getItem(CLIENT_EXTENSIONS_DEV_MODE_KEY) === "1");
  const [clientExtensionDevUrls, setClientExtensionDevUrls] = useState(getStoredStringArray(CLIENT_EXTENSIONS_DEV_URLS_KEY));
  const [newClientExtensionDevUrl, setNewClientExtensionDevUrl] = useState("");
  const [clientExtensionLoadState, setClientExtensionLoadState] = useState({});
  const [serverExtensionCommands, setServerExtensionCommands] = useState([]);
  const [slashSelectionIndex, setSlashSelectionIndex] = useState(0);

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
  const voiceMemberAudioPrefsByGuildRef = useRef(voiceMemberAudioPrefsByGuild);
  voiceMemberAudioPrefsByGuildRef.current = voiceMemberAudioPrefsByGuild;
  selfUserIdRef.current = me?.id || "";
  const voiceSfuRef = useRef(null);
  if (!voiceSfuRef.current) {
    voiceSfuRef.current = createSfuVoiceClient({
      getSelfUserId: () => selfUserIdRef.current,
      sendDispatch: (type, data) => sendNodeVoiceDispatch(type, data),
      waitForEvent: waitForVoiceEvent,
      onLocalAudioProcessingInfo: (info) => {
        setLocalAudioProcessingInfo(info || null);
      },
      onRemoteVideoAdded: ({ producerId, userId, stream }) => {
        if (!producerId || !stream) return;
        setRemoteScreenSharesByProducerId((prev) => ({
          ...prev,
          [producerId]: { producerId, userId: userId || "", stream }
        }));
      },
      onRemoteAudioAdded: ({ guildId, userId }) => {
        const uid = String(userId || "").trim();
        if (!guildId || !uid) return;
        const guildPrefs = voiceMemberAudioPrefsByGuildRef.current?.[guildId] || {};
        const pref = guildPrefs[uid] || { muted: false, volume: 100 };
        voiceSfuRef.current?.setUserAudioPreference(uid, pref);
      },
      onRemoteVideoRemoved: ({ producerId }) => {
        if (!producerId) return;
        setRemoteScreenSharesByProducerId((prev) => {
          if (!prev[producerId]) return prev;
          const next = { ...prev };
          delete next[producerId];
          return next;
        });
      },
      onScreenShareStateChange: (nextState) => {
        setIsScreenSharing(!!nextState);
      }
    });
  }
  const selfStatusRef = useRef(selfStatus);
  selfStatusRef.current = selfStatus;

  function getPresence(userId) {
    if (!userId) return "offline";
    if (userId === me?.id) return selfStatus;
    const status = String(presenceByUserId[userId]?.status ?? "offline").toLowerCase();
    return status === "invisible" ? "offline" : status;
  }
  function getRichPresence(userId) {
    if (!userId) return null;
    return presenceByUserId[userId]?.richPresence ?? null;
  }
  const presenceLabels = { online: "Online", idle: "Idle", dnd: "Do Not Disturb", offline: "Offline", invisible: "Invisible" };
  function presenceLabel(status) {
    return presenceLabels[status] || status || "Offline";
  }
  function presenceIndicatorClass(status) {
    const normalized = String(status || "offline").toLowerCase();
    if (normalized === "online") return "presence-online";
    if (normalized === "idle") return "presence-idle";
    if (normalized === "dnd") return "presence-dnd";
    return "presence-offline";
  }
  function renderPresenceAvatar({ userId, username, pfpUrl, size = 28 }) {
    const avatarStatus = getPresence(userId);
    const seed = String(userId || username || "?");
    const seedCode = seed.charCodeAt(0) || 0;
    const resolvedUrl = profileImageUrl(pfpUrl);
    return (
      <div className="avatar-with-presence" style={{ width: `${size}px`, height: `${size}px` }}>
        {resolvedUrl && (
          <img
            src={resolvedUrl}
            alt={username}
            className="avatar-presence-image"
            onError={(event) => {
              event.currentTarget.style.display = "none";
              const fallback = event.currentTarget.parentElement?.querySelector(".avatar-presence-fallback");
              if (fallback) fallback.style.display = "grid";
            }}
          />
        )}
        <div
          className="avatar-presence-fallback"
          style={{
            background: `hsl(${Math.abs(seedCode * 7) % 360}, 70%, 60%)`,
            display: resolvedUrl ? "none" : "grid"
          }}
        >
          {String(username || "?").substring(0, 1).toUpperCase()}
        </div>
        <span className={`presence-indicator-dot ${presenceIndicatorClass(avatarStatus)}`} />
      </div>
    );
  }

  const dmMessagesRef = useRef(null);
  const composerInputRef = useRef(null);
  const attachmentInputRef = useRef(null);
  const dmComposerInputRef = useRef(null);
  const isAtBottomRef = useRef(true);
  const lastDmMessageCountRef = useRef(0);
  const linkPreviewFetchInFlightRef = useRef(new Set());
  const attachmentPreviewFetchInFlightRef = useRef(new Set());
  const attachmentPreviewUrlByIdRef = useRef({});
  const autoJoinInviteAttemptRef = useRef("");
  const previousDmIdRef = useRef("");
  const dialogResolverRef = useRef(null);
  const dialogInputRef = useRef(null);
  const activeServerIdRef = useRef("");
  const activeChannelIdRef = useRef("");
  const activeGuildIdRef = useRef("");
  const profileCardDragOffsetRef = useRef({ x: 0, y: 0 });
  const downloadMenuRef = useRef(null);
  const preferredDownloadTarget = useMemo(() => getPreferredDownloadTarget(DOWNLOAD_TARGETS), []);
  const loadedClientExtensionIdsRef = useRef(new Set());
  const desktopSessionLoadedRef = useRef(false);
  const extensionPanelsRef = useRef([]);
  const serversRef = useRef([]);
  const dragEasterEggBufferRef = useRef("");
  const storageScope = me?.id || "anonymous";

  function resolveDialog(value) {
    const resolver = dialogResolverRef.current;
    dialogResolverRef.current = null;
    setDialogModal(null);
    if (resolver) resolver(value);
  }

  function openDialog({ type = "alert", title = "OpenCom", message = "", defaultValue = "", confirmLabel = "OK", cancelLabel = "Cancel" }) {
    if (dialogResolverRef.current) {
      // If another dialog was open, safely resolve it first.
      dialogResolverRef.current(type === "confirm" ? false : null);
      dialogResolverRef.current = null;
    }
    setDialogModal({
      type,
      title,
      message: String(message || ""),
      value: String(defaultValue || ""),
      confirmLabel,
      cancelLabel
    });
    return new Promise((resolve) => {
      dialogResolverRef.current = resolve;
    });
  }

  async function promptText(message, defaultValue = "") {
    return openDialog({
      type: "prompt",
      title: "Input",
      message,
      defaultValue,
      confirmLabel: "Continue",
      cancelLabel: "Cancel"
    });
  }

  async function confirmDialog(message, title = "Confirm") {
    const result = await openDialog({
      type: "confirm",
      title,
      message,
      confirmLabel: "Confirm",
      cancelLabel: "Cancel"
    });
    return !!result;
  }

  async function alertDialog(message, title = "Notice") {
    await openDialog({
      type: "alert",
      title,
      message,
      confirmLabel: "OK"
    });
  }

  function navigateAppRoute(nextRoute, { replace = false } = {}) {
    writeAppRoute(nextRoute, { replace });
    setRoutePath(getAppRouteFromLocation());
  }

  useEffect(() => {
    serversRef.current = servers;
  }, [servers]);

  useEffect(() => {
    if (!dialogModal || dialogModal.type !== "prompt") return;
    const timer = window.setTimeout(() => {
      dialogInputRef.current?.focus();
      dialogInputRef.current?.select?.();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [dialogModal]);

  useEffect(() => {
    return () => {
      if (dialogResolverRef.current) {
        dialogResolverRef.current(null);
        dialogResolverRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    attachmentPreviewUrlByIdRef.current = attachmentPreviewUrlById || {};
  }, [attachmentPreviewUrlById]);

  useEffect(() => {
    const onPopState = () => setRoutePath(getAppRouteFromLocation());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.protocol === "file:") return;
    if (isInviteJoinPath(window.location.pathname || "")) return;
    if (isBoostGiftPath(window.location.pathname || "")) return;
    const canonical = normalizeAppPath(window.location.pathname || "");
    if (canonical !== (window.location.pathname || "")) {
      navigateAppRoute(canonical, { replace: true });
    }
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    if (routePath === APP_ROUTE_TERMS) return;
    if (routePath === APP_ROUTE_CLIENT) return;
    navigateAppRoute(APP_ROUTE_CLIENT, { replace: true });
  }, [accessToken, routePath]);

  useEffect(() => {
    if (!accessToken || !settingsOpen || settingsTab !== "billing") return;
    loadBoostStatus().catch(() => {});
    loadSentBoostGifts().catch(() => {});
  }, [accessToken, settingsOpen, settingsTab]);

  useEffect(() => {
    if (accessToken) return;
    if (routePath !== APP_ROUTE_CLIENT) return;
    navigateAppRoute(APP_ROUTE_LOGIN, { replace: true });
  }, [accessToken, routePath]);

  useEffect(() => {
    function closeDownloadsMenuOnOutsideClick(event) {
      if (downloadMenuRef.current && !downloadMenuRef.current.contains(event.target)) {
        setDownloadsMenuOpen(false);
      }
    }

    function closeDownloadsMenuOnEscape(event) {
      if (event.key === "Escape") setDownloadsMenuOpen(false);
    }

    document.addEventListener("mousedown", closeDownloadsMenuOnOutsideClick);
    document.addEventListener("keydown", closeDownloadsMenuOnEscape);

    return () => {
      document.removeEventListener("mousedown", closeDownloadsMenuOnOutsideClick);
      document.removeEventListener("keydown", closeDownloadsMenuOnEscape);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(CLIENT_EXTENSIONS_ENABLED_KEY, JSON.stringify(enabledClientExtensions));
  }, [enabledClientExtensions]);

  useEffect(() => {
    try {
      if (invitePendingCode) sessionStorage.setItem(PENDING_INVITE_CODE_KEY, invitePendingCode);
      else sessionStorage.removeItem(PENDING_INVITE_CODE_KEY);
    } catch {}
  }, [invitePendingCode]);

  useEffect(() => {
    try {
      if (invitePendingAutoJoin) sessionStorage.setItem(PENDING_INVITE_AUTO_JOIN_KEY, "1");
      else sessionStorage.removeItem(PENDING_INVITE_AUTO_JOIN_KEY);
    } catch {}
  }, [invitePendingAutoJoin]);

  useEffect(() => {
    localStorage.setItem(CLIENT_EXTENSIONS_DEV_MODE_KEY, clientExtensionDevMode ? "1" : "0");
  }, [clientExtensionDevMode]);

  useEffect(() => {
    localStorage.setItem(CLIENT_EXTENSIONS_DEV_URLS_KEY, JSON.stringify(clientExtensionDevUrls));
  }, [clientExtensionDevUrls]);

  useEffect(() => {
    const active = servers.find((server) => server.id === activeServerId);
    if (!active) {
      setServerProfileForm({ name: "", logoUrl: "", bannerUrl: "" });
      return;
    }
    setServerProfileForm({
      name: active.name || "",
      logoUrl: active.logoUrl || "",
      bannerUrl: active.bannerUrl || ""
    });
  }, [activeServerId, servers]);

  useEffect(() => {
    if (!accessToken || !me?.id) {
      setClientExtensionCatalog([]);
      return;
    }

    api("/v1/extensions/catalog", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((data) => setClientExtensionCatalog(data.clientExtensions || []))
      .catch(() => setClientExtensionCatalog([]));
  }, [accessToken, me?.id]);

  useEffect(() => {
    const selectedServer = servers.find((server) => server.id === activeServerId) || null;
    if (!accessToken || !selectedServer) {
      setServerExtensionCommands([]);
      return;
    }

    nodeApi(selectedServer.baseUrl, "/v1/extensions/commands", selectedServer.membershipToken)
      .then((data) => setServerExtensionCommands(Array.isArray(data.commands) ? data.commands : []))
      .catch(() => setServerExtensionCommands([]));
  }, [accessToken, activeServerId, servers]);

  useEffect(() => {
    if (!accessToken || servers.length === 0) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const currentServers = serversRef.current || [];
        const updates = await Promise.all(currentServers.map(async (server) => {
          try {
            const refreshed = await api(`/v1/servers/${server.id}/membership-token`, {
              method: "POST",
              headers: { Authorization: `Bearer ${accessToken}` }
            });
            return { id: server.id, membershipToken: refreshed.membershipToken };
          } catch {
            return null;
          }
        }));
        if (cancelled) return;
        const byId = new Map(updates.filter(Boolean).map((item) => [item.id, item.membershipToken]));
        if (byId.size) {
          setServers((current) => current.map((server) => {
            const token = byId.get(server.id);
            return token ? { ...server, membershipToken: token } : server;
          }));
        }
      } catch {
        // no-op
      }
    };
    refresh();
    const timer = window.setInterval(refresh, 8 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [accessToken, servers.length]);

  useEffect(() => {
    if (!refreshToken) return;
    let cancelled = false;

    const refreshAuth = async () => {
      const refreshed = await refreshAccessTokenWithRefreshToken().catch(() => null);
      if (cancelled) return;
      if (!refreshed?.accessToken) {
        setStatus("Session expired. Please sign in again.");
        setAccessToken("");
        setRefreshToken("");
      }
    };

    const timer = window.setInterval(refreshAuth, 10 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [refreshToken]);

  useEffect(() => {
    setSlashSelectionIndex(0);
  }, [messageText, serverExtensionCommands]);

  async function loadClientExtensionSource({ extensionId, extensionName, devUrl }) {
    if (devUrl) {
      const response = await fetch(devUrl);
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
      return response.text();
    }

    const response = await fetch(`${CORE_API}/v1/extensions/client/${encodeURIComponent(extensionId)}/source`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    return response.text();
  }

  async function loadClientExtensionRuntime({ extensionId, extensionName, devUrl }) {
    const source = await loadClientExtensionSource({ extensionId, extensionName, devUrl });
    const blob = new Blob([source], { type: "application/javascript" });
    const moduleUrl = URL.createObjectURL(blob);

    try {
      const extensionModule = await import(/* @vite-ignore */ moduleUrl);
      const activate = extensionModule?.activateClient || extensionModule?.default;
      if (typeof activate !== "function") throw new Error("Missing activateClient export");

      const extensionApi = {
        registerPanel: (panel) => {
          extensionPanelsRef.current.push(panel);
        },
        coreApi: (path, options = {}) => api(path, {
          ...options,
          headers: { Authorization: `Bearer ${accessToken}`, ...(options.headers || {}) }
        }),
        getSelf: () => me,
        setStatus,
        voice: {
          getState: () => ({
            connected: !!voiceSession.channelId,
            guildId: voiceSession.guildId || "",
            channelId: voiceSession.channelId || "",
            muted: !!isMuted,
            deafened: !!isDeafened,
            screenSharing: !!isScreenSharing
          }),
          join: async (channelId) => {
            const channel = (channels || []).find((item) => item?.id === channelId && item?.type === "voice");
            if (!channel) throw new Error("VOICE_CHANNEL_NOT_FOUND");
            await joinVoiceChannel(channel);
          },
          leave: async () => {
            await leaveVoiceChannel();
          },
          setMuted: (nextMuted) => setIsMuted(!!nextMuted),
          setDeafened: (nextDeafened) => setIsDeafened(!!nextDeafened),
          toggleScreenShare: async () => {
            await toggleScreenShare();
          },
          onStateChange: (handler) => {
            if (typeof handler !== "function") return () => {};
            const listener = (event) => {
              try {
                handler(event?.detail || {});
              } catch {}
            };
            window.addEventListener("opencom-voice-state-change", listener);
            return () => window.removeEventListener("opencom-voice-state-change", listener);
          }
        }
      };

      await Promise.resolve(activate(extensionApi));
    } finally {
      URL.revokeObjectURL(moduleUrl);
    }
  }

  useEffect(() => {
    if (!accessToken) return;

    const requested = [
      ...enabledClientExtensions.map((id) => ({ id, extensionId: id, extensionName: id, devUrl: null })),
      ...(clientExtensionDevMode
        ? clientExtensionDevUrls.map((url, index) => ({
            id: `dev:${url}` ,
            extensionId: `dev-extension-${index + 1}` ,
            extensionName: `Developer Extension ${index + 1}` ,
            devUrl: url
          }))
        : [])
    ];

    requested.forEach((entry) => {
      if (loadedClientExtensionIdsRef.current.has(entry.id)) return;
      loadedClientExtensionIdsRef.current.add(entry.id);
      setClientExtensionLoadState((current) => ({ ...current, [entry.id]: "loading" }));

      loadClientExtensionRuntime(entry)
        .then(() => setClientExtensionLoadState((current) => ({ ...current, [entry.id]: "loaded" })))
        .catch((error) => setClientExtensionLoadState((current) => ({ ...current, [entry.id]: `error:${error.message}` })));
    });
  }, [accessToken, enabledClientExtensions, clientExtensionDevMode, clientExtensionDevUrls, me]);

  function toggleClientExtension(extensionId, enabled) {
    setEnabledClientExtensions((current) => {
      if (enabled) return current.includes(extensionId) ? current : [...current, extensionId];
      return current.filter((id) => id !== extensionId);
    });
  }

  function addClientDevExtensionUrl() {
    const trimmed = newClientExtensionDevUrl.trim();
    if (!trimmed) return;
    setClientExtensionDevUrls((current) => (current.includes(trimmed) ? current : [...current, trimmed]));
    setNewClientExtensionDevUrl("");
  }

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
  const workingGuildId = useMemo(() => (
    activeGuildId
    || activeGuild?.id
    || guildState?.guild?.id
    || activeServer?.defaultGuildId
    || ""
  ), [activeGuildId, activeGuild?.id, guildState?.guild?.id, activeServer?.defaultGuildId]);
  const voiceConnectedChannelId = voiceSession.channelId;
  const voiceConnectedGuildId = voiceSession.guildId;
  const isInVoiceChannel = !!voiceConnectedChannelId;
  const voiceConnectedServer = useMemo(
    () => servers.find((server) => server.defaultGuildId === voiceConnectedGuildId) || null,
    [servers, voiceConnectedGuildId]
  );
  const nodeGatewayTargetServer = useMemo(() => {
    if (voiceConnectedServer?.baseUrl && voiceConnectedServer?.membershipToken) return voiceConnectedServer;
    return activeServer;
  }, [voiceConnectedServer, activeServer]);
  const nodeGatewayConnectedForActiveServer = !!(
    nodeGatewayConnected
    && activeServer?.id
    && nodeGatewayServerId === activeServer.id
  );
  const channels = guildState?.channels || [];
  const voiceConnectedChannelName = useMemo(() => {
    if (!voiceConnectedChannelId) return "";
    const connectedChannel = channels.find((channel) => channel.id === voiceConnectedChannelId);
    return connectedChannel?.name || voiceConnectedChannelId;
  }, [channels, voiceConnectedChannelId]);
  const activeChannel = useMemo(() => channels.find((channel) => channel.id === activeChannelId) || null, [channels, activeChannelId]);
  const activeDm = useMemo(() => dms.find((dm) => dm.id === activeDmId) || null, [dms, activeDmId]);

  const myGuildPermissions = useMemo(() => {
    const roles = guildState?.roles || [];
    const myRoleIds = new Set(guildState?.me?.roleIds || []);
    let total = 0n;
    for (const role of roles) {
      if (!role) continue;
      if (role.is_everyone || myRoleIds.has(role.id)) {
        total |= parsePermissionBits(role.permissions);
      }
    }
    return total;
  }, [guildState?.roles, guildState?.me?.roleIds]);

  const hasGuildPermission = useMemo(() => {
    return (bit) => {
      if ((myGuildPermissions & GUILD_PERM.ADMINISTRATOR) === GUILD_PERM.ADMINISTRATOR) return true;
      return (myGuildPermissions & bit) === bit;
    };
  }, [myGuildPermissions]);

  const canManageServer = useMemo(() => {
    if (!activeServer) return false;
    const coreManage = (activeServer.roles || []).includes("owner") || (activeServer.roles || []).includes("platform_admin");
    return coreManage || hasGuildPermission(GUILD_PERM.MANAGE_CHANNELS) || hasGuildPermission(GUILD_PERM.MANAGE_ROLES);
  }, [activeServer, hasGuildPermission]);

  const canKickMembers = useMemo(() => {
    if (!activeServer) return false;
    return (activeServer.roles || []).includes("owner")
      || (activeServer.roles || []).includes("platform_admin")
      || hasGuildPermission(GUILD_PERM.KICK_MEMBERS);
  }, [activeServer, hasGuildPermission]);

  const canBanMembers = useMemo(() => {
    if (!activeServer) return false;
    return (activeServer.roles || []).includes("owner")
      || (activeServer.roles || []).includes("platform_admin")
      || hasGuildPermission(GUILD_PERM.BAN_MEMBERS);
  }, [activeServer, hasGuildPermission]);

  const canServerMuteMembers = useMemo(() => {
    if (!activeServer) return false;
    return (activeServer.roles || []).includes("owner")
      || (activeServer.roles || []).includes("platform_admin")
      || hasGuildPermission(GUILD_PERM.MUTE_MEMBERS);
  }, [activeServer, hasGuildPermission]);

  const canServerDeafenMembers = useMemo(() => {
    if (!activeServer) return false;
    return (activeServer.roles || []).includes("owner")
      || (activeServer.roles || []).includes("platform_admin")
      || hasGuildPermission(GUILD_PERM.DEAFEN_MEMBERS);
  }, [activeServer, hasGuildPermission]);

  const canMoveVoiceMembers = useMemo(() => {
    if (!activeServer) return false;
    return (activeServer.roles || []).includes("owner")
      || (activeServer.roles || []).includes("platform_admin")
      || hasGuildPermission(GUILD_PERM.MOVE_MEMBERS);
  }, [activeServer, hasGuildPermission]);

  const canModerateMembers = canKickMembers || canBanMembers;
  const hasBoostForFullProfiles = !!(boostStatus?.active || profile?.boostActive || profile?.badges?.includes?.("boost"));
  const canAccessServerAdminPanel = useMemo(() => {
    return servers.some((server) => {
      const roles = Array.isArray(server?.roles) ? server.roles : [];
      return roles.includes("owner") || roles.includes("platform_admin") || roles.includes("admin") || roles.includes("server_admin");
    });
  }, [servers]);

  const sortedChannels = useMemo(() => [...(channels || [])].filter(Boolean).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)), [channels]);
  const categoryChannels = useMemo(() => sortedChannels.filter((channel) => channel && channel.type === "category"), [sortedChannels]);
  const serverEmoteByName = useMemo(() => {
    const map = new Map();
    for (const emote of (guildState?.emotes || [])) {
      const name = String(emote?.name || "").toLowerCase();
      if (!name) continue;
      map.set(name, emote);
    }
    return map;
  }, [guildState?.emotes]);

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

  const slashQuery = useMemo(() => {
    if (navMode !== "servers") return null;
    return getSlashQuery(messageText);
  }, [messageText, navMode]);

  const slashCommandSuggestions = useMemo(() => {
    if (slashQuery == null) return [];
    const catalog = [...serverExtensionCommands].sort((a, b) => a.name.localeCompare(b.name));
    if (!slashQuery) return catalog.slice(0, 10);
    return catalog.filter((command) => command.name.toLowerCase().includes(slashQuery)).slice(0, 10);
  }, [slashQuery, serverExtensionCommands]);
  const showingSlash = slashQuery != null;

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
  const remoteScreenShares = useMemo(
    () => Object.values(remoteScreenSharesByProducerId),
    [remoteScreenSharesByProducerId]
  );
  const activeVoiceMemberAudioPrefs = useMemo(() => {
    if (!activeGuildId) return {};
    const scoped = voiceMemberAudioPrefsByGuild?.[activeGuildId];
    return scoped && typeof scoped === "object" ? scoped : {};
  }, [voiceMemberAudioPrefsByGuild, activeGuildId]);

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
  const voiceStateByUserId = useMemo(() => {
    const map = new Map();
    for (const item of mergedVoiceStates || []) {
      if (!item?.userId) continue;
      map.set(item.userId, item);
    }
    return map;
  }, [mergedVoiceStates]);

  function getVoiceMemberAudioPref(userId) {
    const id = String(userId || "").trim();
    const pref = activeVoiceMemberAudioPrefs[id] || {};
    const volume = Number(pref.volume);
    return {
      muted: !!pref.muted,
      volume: Number.isFinite(volume) ? Math.max(0, Math.min(100, volume)) : 100
    };
  }

  function setVoiceMemberAudioPref(userId, patch = {}) {
    const id = String(userId || "").trim();
    if (!id || !activeGuildId) return;
    setVoiceMemberAudioPrefsByGuild((current) => {
      const guildPrefs = current?.[activeGuildId] || {};
      const existing = guildPrefs[id] || { muted: false, volume: 100 };
      const next = {
        muted: patch.muted === undefined ? !!existing.muted : !!patch.muted,
        volume: patch.volume === undefined
          ? (Number.isFinite(Number(existing.volume)) ? Math.max(0, Math.min(100, Number(existing.volume))) : 100)
          : Math.max(0, Math.min(100, Number(patch.volume)))
      };
      return {
        ...(current || {}),
        [activeGuildId]: {
          ...guildPrefs,
          [id]: next
        }
      };
    });
  }

  async function promptSetVoiceMemberLocalVolume(userId) {
    const current = getVoiceMemberAudioPref(userId);
    const raw = await promptText("Set local user volume (0-100):", String(current.volume));
    if (raw == null) return;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      setStatus("Invalid volume value.");
      return;
    }
    const clamped = Math.max(0, Math.min(100, Math.round(parsed)));
    setVoiceMemberAudioPref(userId, { volume: clamped });
    setStatus(`Local voice volume set to ${clamped}%.`);
  }
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
    if (accessToken) localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    else localStorage.removeItem(ACCESS_TOKEN_KEY);
  }, [accessToken]);

  useEffect(() => {
    let cancelled = false;
    const bridge = getDesktopBridge();
    if (!bridge?.getSession) {
      desktopSessionLoadedRef.current = true;
      return;
    }
    bridge.getSession()
      .then((data) => {
        if (cancelled || !data) return;
        const nextAccess = typeof data.accessToken === "string" ? data.accessToken : "";
        const nextRefresh = typeof data.refreshToken === "string" ? data.refreshToken : "";
        if (nextAccess && !accessToken) setAccessToken(nextAccess);
        if (nextRefresh && !refreshToken) setRefreshToken(nextRefresh);
      })
      .catch(() => {})
      .finally(() => {
        desktopSessionLoadedRef.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    try {
      window.opencomDesktopBridge?.setPresenceAuth?.({
        accessToken: accessToken || "",
        coreApi: CORE_API
      });
    } catch {}
  }, [accessToken]);

  useEffect(() => {
    if (accessToken || !refreshToken) return;
    refreshAccessTokenWithRefreshToken()
      .then((data) => {
        if (!data?.accessToken) return;
        setAccessToken(data.accessToken);
        if (data.refreshToken) setRefreshToken(data.refreshToken);
      })
      .catch(() => {});
  }, [accessToken, refreshToken]);

  const selfRichPresenceSnapshot = useMemo(
    () => JSON.stringify((me?.id ? presenceByUserId[me.id]?.richPresence : null) || null),
    [me?.id, presenceByUserId]
  );

  useEffect(() => {
    if (!me?.id) return;
    let parsed = null;
    try { parsed = JSON.parse(selfRichPresenceSnapshot); } catch {}
    setRpcForm(rpcFormFromActivity(parsed));
  }, [me?.id, selfRichPresenceSnapshot]);

  useEffect(() => {
    if (refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    else localStorage.removeItem(REFRESH_TOKEN_KEY);
  }, [refreshToken]);

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge?.setSession) return;
    if (!desktopSessionLoadedRef.current) return;
    bridge.setSession({
      accessToken: accessToken || "",
      refreshToken: refreshToken || ""
    }).catch(() => {});
  }, [accessToken, refreshToken]);

  useEffect(() => {
    const onAccessRefresh = (event) => {
      const nextAccess = event?.detail?.accessToken || "";
      const nextRefresh = event?.detail?.refreshToken || "";
      if (nextAccess) setAccessToken(nextAccess);
      if (nextRefresh) setRefreshToken(nextRefresh);
    };
    const onMembershipRefresh = (event) => {
      const serverId = event?.detail?.serverId;
      const membershipToken = event?.detail?.membershipToken;
      if (!serverId || !membershipToken) return;
      setServers((current) => current.map((server) => (
        server.id === serverId ? { ...server, membershipToken } : server
      )));
    };
    window.addEventListener("opencom-access-token-refresh", onAccessRefresh);
    window.addEventListener("opencom-membership-token-refresh", onMembershipRefresh);
    return () => {
      window.removeEventListener("opencom-access-token-refresh", onAccessRefresh);
      window.removeEventListener("opencom-membership-token-refresh", onMembershipRefresh);
    };
  }, []);

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
    localStorage.setItem(PINNED_DM_KEY, JSON.stringify(pinnedDmMessages));
  }, [pinnedDmMessages]);

  useEffect(() => {
    localStorage.setItem(VOICE_MEMBER_AUDIO_PREFS_KEY, JSON.stringify(voiceMemberAudioPrefsByGuild || {}));
  }, [voiceMemberAudioPrefsByGuild]);

  useEffect(() => {
    if (activeDmId) localStorage.setItem(ACTIVE_DM_KEY, activeDmId);
    setDmReplyTarget(null);
  }, [activeDmId]);

  useEffect(() => {
    if (!draggingProfileCard) return;
    const onMove = (event) => {
      const rawX = invertProfileDrag
        ? profileCardDragOffsetRef.current.x - event.clientX
        : event.clientX - profileCardDragOffsetRef.current.x;
      const rawY = invertProfileDrag
        ? profileCardDragOffsetRef.current.y - event.clientY
        : event.clientY - profileCardDragOffsetRef.current.y;
      const x = Math.max(8, Math.min(window.innerWidth - 340, rawX));
      const y = Math.max(8, Math.min(window.innerHeight - 280, rawY));
      setProfileCardPosition({ x, y });
    };
    const onUp = () => setDraggingProfileCard(false);

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [draggingProfileCard, invertProfileDrag]);

  useEffect(() => {
    if (!fullProfileDraggingElementId) return;
    const onMove = (event) => {
      const canvas = fullProfileEditorCanvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const px = ((event.clientX - rect.left) / rect.width) * 100;
      const py = ((event.clientY - rect.top) / rect.height) * 100;
      const x = Math.max(0, Math.min(100, px - fullProfileDragOffsetRef.current.x));
      const y = Math.max(0, Math.min(100, py - fullProfileDragOffsetRef.current.y));
      updateFullProfileElement(fullProfileDraggingElementId, { x, y });
    };
    const onUp = () => setFullProfileDraggingElementId("");
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [fullProfileDraggingElementId, fullProfileDraft.elements]);

  useEffect(() => {
    const onGlobalClick = () => {
      setServerContextMenu(null);
      setMessageContextMenu(null);
      setMemberContextMenu(null);
      setChannelContextMenu(null);
      setCategoryContextMenu(null);
      if (!settingsOpen) setMemberProfileCard(null);
    };
    const onEscape = (event) => {
      if (event.key === "Escape") {
        setServerContextMenu(null);
        setMessageContextMenu(null);
        setMemberContextMenu(null);
        setChannelContextMenu(null);
        setCategoryContextMenu(null);
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
    const secret = "invert";
    const onSecretKey = (event) => {
      if (!event?.key || event.ctrlKey || event.metaKey || event.altKey) return;
      const key = String(event.key).toLowerCase();
      if (!/^[a-z]$/.test(key)) {
        dragEasterEggBufferRef.current = "";
        return;
      }
      const next = (dragEasterEggBufferRef.current + key).slice(-secret.length);
      dragEasterEggBufferRef.current = next;
      if (next === secret) {
        setInvertProfileDrag((current) => {
          const updated = !current;
          setStatus(updated ? "Easter egg enabled: profile drag is inverted." : "Easter egg disabled: profile drag restored.");
          return updated;
        });
        dragEasterEggBufferRef.current = "";
      }
    };

    window.addEventListener("keydown", onSecretKey);
    return () => window.removeEventListener("keydown", onSecretKey);
  }, []);

  useEffect(() => {
    const isTypingTarget = (target) => {
      if (!target) return false;
      const tag = String(target.tagName || "").toLowerCase();
      return tag === "input" || tag === "textarea" || tag === "select" || !!target.isContentEditable;
    };

    const onHotkey = (event) => {
      if (!(event.ctrlKey || event.metaKey) || !event.shiftKey) return;
      if (isTypingTarget(event.target)) return;
      const key = String(event.key || "").toLowerCase();

      if (key === "m") {
        event.preventDefault();
        setIsMuted((value) => !value);
      } else if (key === "d") {
        event.preventDefault();
        setIsDeafened((value) => !value);
      } else if (key === "v") {
        event.preventDefault();
        if (isInVoiceChannel) toggleScreenShare().catch(() => {});
      } else if (key === "x") {
        event.preventDefault();
        if (isInVoiceChannel) leaveVoiceChannel().catch(() => {});
      } else if (key === ",") {
        event.preventDefault();
        setSettingsOpen(true);
      }
    };

    window.addEventListener("keydown", onHotkey);
    return () => window.removeEventListener("keydown", onHotkey);
  }, [isInVoiceChannel]);

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
        setFullProfileDraft(normalizeFullProfile(profileData, profileData.fullProfile));
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
        const msg = String(error?.message || "");
        if (msg.includes("UNAUTHORIZED") || msg.includes("HTTP_401") || msg.includes("INVALID_REFRESH") || msg.includes("REFRESH_")) {
          setAccessToken("");
          setRefreshToken("");
          setServers([]);
          setGuildState(null);
          setMessages([]);
          setStatus("Session expired. Please sign in again.");
          return;
        }
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
        if (msg.op === "DISPATCH" && msg.t === "PRESENCE_SYNC_REQUEST") {
          if (gatewayWsRef.current?.readyState === WebSocket.OPEN) {
            gatewayWsRef.current.send(JSON.stringify({ op: "DISPATCH", t: "SET_PRESENCE", d: { status: selfStatusRef.current, customStatus: null } }));
          }
        }
        if (msg.op === "DISPATCH" && msg.t === "PRESENCE_UPDATE" && msg.d?.userId) {
          setPresenceByUserId((prev) => ({
            ...prev,
            [msg.d.userId]: {
              status: msg.d.status ?? "offline",
              customStatus: msg.d.customStatus ?? null,
              richPresence: msg.d.richPresence ?? null
            }
          }));
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
    const server = nodeGatewayTargetServer;

    // Keep node gateway alive for the active server. If we're currently connected
    // to voice in another server, pin the gateway to that voice server so VC stays alive.
    if (!server?.baseUrl || !server?.membershipToken) {
      voiceGatewayCandidatesRef.current = [];
      nodeGatewayReadyRef.current = false;
      setNodeGatewayConnected(false);
      setNodeGatewayServerId("");

      if (nodeGatewayHeartbeatRef.current) {
        clearInterval(nodeGatewayHeartbeatRef.current);
        nodeGatewayHeartbeatRef.current = null;
      }

      if (nodeGatewayWsRef.current) {
        try { nodeGatewayWsRef.current.close(); } catch {}
        nodeGatewayWsRef.current = null;
      }

      return;
    }

    if (nodeGatewayUnavailableByServer[server.id]) {
      voiceGatewayCandidatesRef.current = [];
      nodeGatewayReadyRef.current = false;
      setNodeGatewayConnected(false);
      setNodeGatewayServerId("");

      if (nodeGatewayHeartbeatRef.current) {
        clearInterval(nodeGatewayHeartbeatRef.current);
        nodeGatewayHeartbeatRef.current = null;
      }

      if (nodeGatewayWsRef.current) {
        try { nodeGatewayWsRef.current.close(); } catch {}
        nodeGatewayWsRef.current = null;
      }

      return;
    }

    const wsCandidates = getLastSuccessfulGateway(
      getVoiceGatewayWsCandidates(server.baseUrl, true),
      LAST_SERVER_GATEWAY_KEY
    );
    voiceGatewayCandidatesRef.current = wsCandidates;
    if (!wsCandidates.length) {
      setNodeGatewayConnected(false);
      setNodeGatewayServerId("");
      return;
    }

    let disposed = false;
    let connected = false;
    let hasEverConnected = false;
    let reconnectTimer = null;
    let candidateIndex = 0;
    let reconnectAttempts = 0;
    let guildRefreshTimer = null;

    const applyGuildState = (state) => {
      if (activeServerIdRef.current !== server.id) return;
      const allChannels = state.channels || [];
      setGuildState(state);

      const activeExists = allChannels.some((channel) => channel.id === activeChannelIdRef.current && channel.type === "text");
      if (activeExists) return;

      const firstTextChannel = allChannels.find((channel) => channel.type === "text")?.id || "";
      setActiveChannelId(firstTextChannel);
    };

    const refreshActiveGuildStateFromNode = () => {
      if (activeServerIdRef.current !== server.id) return;
      const guildId = activeGuildIdRef.current;
      if (!guildId) return;
      nodeApi(server.baseUrl, `/v1/guilds/${guildId}/state`, server.membershipToken)
        .then((state) => {
          if (disposed) return;
          applyGuildState(state);
        })
        .catch(() => {});
    };

    const scheduleGuildRefresh = (delay = 150) => {
      if (guildRefreshTimer) clearTimeout(guildRefreshTimer);
      guildRefreshTimer = setTimeout(refreshActiveGuildStateFromNode, delay);
    };

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
            setNodeGatewayConnected(true);
            setNodeGatewayServerId(server.id || "");
            localStorage.setItem(LAST_SERVER_GATEWAY_KEY, wsUrl);

            // Subscribe to whatever context we have right now.
            if (activeServerIdRef.current === server.id && activeGuildIdRef.current) {
              ws.send(JSON.stringify({ op: "DISPATCH", t: "SUBSCRIBE_GUILD", d: { guildId: activeGuildIdRef.current } }));
            }
            if (activeServerIdRef.current === server.id && activeChannelIdRef.current) {
              ws.send(JSON.stringify({ op: "DISPATCH", t: "SUBSCRIBE_CHANNEL", d: { channelId: activeChannelIdRef.current } }));
            }
            return;
          }

          if (msg.op === "ERROR" && msg.d?.error) {
            if (typeof msg.d.error === "string" && msg.d.error.startsWith("VOICE_UPSTREAM_UNAVAILABLE") && server?.id) {
              setNodeGatewayUnavailableByServer((prev) => (prev[server.id] ? prev : { ...prev, [server.id]: true }));
              setStatus("Realtime voice gateway unavailable for this server. Falling back to REST voice controls.");
              try { ws.close(); } catch {}
              return;
            }
            setStatus(`Voice gateway error: ${msg.d.error}`);
            return;
          }

          // Everything else stays the same as your existing handler:
          // MESSAGE_* + VOICE_* dispatches, etc.
          if (msg.op === "DISPATCH" && typeof msg.t === "string") {
            if (msg.t === "MESSAGE_CREATE") {
              const channelId = msg.d?.channelId || "";
              const created = msg.d?.message || null;
              const deleted = msg.d?.messageDelete || null;

              if (channelId && deleted?.id && channelId === activeChannelIdRef.current) {
                setMessages((current) => current.filter((message) => message.id !== deleted.id));
              }

              if (channelId && created && channelId === activeChannelIdRef.current) {
                setMessages((current) => {
                  if (current.some((message) => message.id === created.id)) return current;
                  const normalized = {
                    id: created.id,
                    author_id: created.authorId,
                    authorId: created.authorId,
                    content: created.content || "",
                    embeds: created.embeds || [],
                    linkEmbeds: created.linkEmbeds || [],
                    attachments: created.attachments || [],
                    mentionEveryone: !!created.mentionEveryone,
                    mentions: created.mentions || [],
                    created_at: created.createdAt,
                    createdAt: created.createdAt
                  };
                  return [...current, normalized];
                });
              } else if (channelId && created && server?.id) {
                setServerPingCounts((prev) => ({ ...prev, [server.id]: (prev[server.id] || 0) + 1 }));
              }
              return;
            }

            if (msg.t === "MESSAGE_MENTION" && server?.id) {
              const channelId = msg.d?.channelId || "";
              if (!activeChannelIdRef.current || channelId !== activeChannelIdRef.current) {
                setServerPingCounts((prev) => ({ ...prev, [server.id]: (prev[server.id] || 0) + 1 }));
              }
              return;
            }

            if (msg.t === "VOICE_STATE_UPDATE" && msg.d?.guildId && msg.d?.userId) {
              const guildId = msg.d.guildId;
              const userId = msg.d.userId;
              const channelId = msg.d.channelId || null;
              setVoiceStatesByGuild((prev) => {
                const nextGuild = { ...(prev[guildId] || {}) };
                if (channelId) {
                  nextGuild[userId] = {
                    guildId,
                    channelId,
                    userId,
                    muted: !!msg.d.muted,
                    deafened: !!msg.d.deafened
                  };
                } else {
                  delete nextGuild[userId];
                }
                return { ...prev, [guildId]: nextGuild };
              });
            } else if (msg.t === "VOICE_STATE_REMOVE" && msg.d?.guildId && msg.d?.userId) {
              const guildId = msg.d.guildId;
              const userId = msg.d.userId;
              setVoiceStatesByGuild((prev) => {
                if (!prev[guildId]?.[userId]) return prev;
                const nextGuild = { ...(prev[guildId] || {}) };
                delete nextGuild[userId];
                return { ...prev, [guildId]: nextGuild };
              });
            } else if (msg.t === "VOICE_SPEAKING" && msg.d?.guildId && msg.d?.userId) {
              const guildId = msg.d.guildId;
              const userId = msg.d.userId;
              const speaking = !!msg.d.speaking;
              setVoiceSpeakingByGuild((prev) => ({
                ...prev,
                [guildId]: { ...(prev[guildId] || {}), [userId]: speaking }
              }));
            }

            if (
              activeServerIdRef.current === server.id
              && (
                msg.t === "CHANNEL_CREATE"
                || msg.t === "CHANNEL_UPDATE"
                || msg.t === "CHANNEL_DELETE"
                || msg.t === "CHANNEL_REORDER"
                || msg.t === "ROLE_CREATE"
                || msg.t === "ROLE_UPDATE"
                || msg.t === "ROLE_DELETE"
                || msg.t === "CHANNEL_OVERWRITE_UPDATE"
                || msg.t === "CHANNEL_OVERWRITE_DELETE"
                || msg.t === "CHANNEL_SYNC_PERMISSIONS"
                || msg.t === "GUILD_MEMBER_UPDATE"
                || msg.t === "GUILD_MEMBER_KICK"
                || msg.t === "GUILD_MEMBER_BAN"
              )
            ) {
              scheduleGuildRefresh();
            }

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
        setNodeGatewayConnected(false);
        setNodeGatewayServerId("");

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
      if (guildRefreshTimer) clearTimeout(guildRefreshTimer);

      nodeGatewayReadyRef.current = false;
      setNodeGatewayConnected(false);
      setNodeGatewayServerId("");

      if (nodeGatewayHeartbeatRef.current) {
        clearInterval(nodeGatewayHeartbeatRef.current);
        nodeGatewayHeartbeatRef.current = null;
      }

      if (nodeGatewayWsRef.current) {
        try { nodeGatewayWsRef.current.close(); } catch {}
        nodeGatewayWsRef.current = null;
      }
    };
  }, [
    nodeGatewayTargetServer?.id,
    nodeGatewayTargetServer?.baseUrl,
    nodeGatewayTargetServer?.membershipToken,
    nodeGatewayUnavailableByServer
  ]);


  useEffect(() => {
    if (!activeGuildId || !activeChannelId) return;
    if (!nodeGatewayConnectedForActiveServer) return;
    const ws = nodeGatewayWsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !nodeGatewayReadyRef.current) return;
    ws.send(JSON.stringify({ op: "DISPATCH", t: "SUBSCRIBE_GUILD", d: { guildId: activeGuildId } }));
    ws.send(JSON.stringify({ op: "DISPATCH", t: "SUBSCRIBE_CHANNEL", d: { channelId: activeChannelId } }));
  }, [activeGuildId, activeChannelId, nodeGatewayConnectedForActiveServer]);

  useEffect(() => {
    if (navMode !== "servers" || !activeGuildId || !guildState?.channels?.length) return;
    if (!nodeGatewayConnectedForActiveServer) return;
    const ws = nodeGatewayWsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !nodeGatewayReadyRef.current) return;
    for (const channel of guildState.channels) {
      if (!channel?.id || channel.type !== "text") continue;
      ws.send(JSON.stringify({ op: "DISPATCH", t: "SUBSCRIBE_CHANNEL", d: { channelId: channel.id } }));
    }
  }, [navMode, activeGuildId, guildState?.channels, nodeGatewayConnectedForActiveServer]);

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

  // Handle invite links from /join/:code (plus legacy ?join=CODE).
  // External links auto-join once after auth; manual invite previews still require explicit accept.
  useEffect(() => {
    const codeFromLocation = getInviteCodeFromCurrentLocation();
    const pendingCode = parseInviteCodeFromInput(codeFromLocation || invitePendingCode || "");
    if (!pendingCode) return;

    if (joinInviteCode !== pendingCode) setJoinInviteCode(pendingCode);
    if (invitePendingCode !== pendingCode) setInvitePendingCode(pendingCode);
    if (codeFromLocation && !invitePendingAutoJoin) setInvitePendingAutoJoin(true);

    if (!accessToken) {
      if (codeFromLocation) {
        setStatus("Log in to join this server invite.");
        navigateAppRoute(APP_ROUTE_LOGIN, { replace: true });
      }
      return;
    }

    if (!invitePendingAutoJoin) return;
    if (autoJoinInviteAttemptRef.current === pendingCode) return;

    autoJoinInviteAttemptRef.current = pendingCode;
    setInvitePendingAutoJoin(false);

    joinInvite(pendingCode)
      .catch(() => {})
      .finally(() => {
        if (autoJoinInviteAttemptRef.current === pendingCode) {
          autoJoinInviteAttemptRef.current = "";
        }
      });

    if (routePath !== APP_ROUTE_CLIENT) {
      navigateAppRoute(APP_ROUTE_CLIENT, { replace: true });
    }
  }, [accessToken, invitePendingCode, invitePendingAutoJoin, joinInviteCode, routePath]);

  // Handle boost gift link: /gift/:code — prompt preview and require explicit redeem confirmation.
  useEffect(() => {
    const code = getBoostGiftCodeFromCurrentLocation();
    if (!code) return;
    setBoostGiftCode(code);
    if (accessToken) {
      previewBoostGift(code);
    }
    const nextRoute = accessToken ? APP_ROUTE_CLIENT : APP_ROUTE_LOGIN;
    navigateAppRoute(nextRoute, { replace: true });
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    const visibleMessages = [
      ...(messages || []),
      ...((dms.find((item) => item.id === activeDmId)?.messages) || [])
    ];
    const candidateUrls = new Set();
    for (const message of visibleMessages) {
      for (const url of extractHttpUrls(message?.content || "")) candidateUrls.add(url);
      if (Array.isArray(message?.linkEmbeds)) {
        for (const embed of message.linkEmbeds) {
          if (embed?.url) candidateUrls.add(embed.url);
        }
      }
    }

    for (const url of candidateUrls) {
      if (linkPreviewByUrl[url] !== undefined) continue;
      if (linkPreviewFetchInFlightRef.current.has(url)) continue;
      linkPreviewFetchInFlightRef.current.add(url);
      api(`/v1/link-preview?url=${encodeURIComponent(url)}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      })
        .then((data) => {
          setLinkPreviewByUrl((current) => ({ ...current, [url]: data || null }));
        })
        .catch(() => {
          setLinkPreviewByUrl((current) => ({ ...current, [url]: null }));
        })
        .finally(() => {
          linkPreviewFetchInFlightRef.current.delete(url);
        });
    }
  }, [accessToken, messages, dms, activeDmId, linkPreviewByUrl]);

  useEffect(() => {
    if (!activeServer?.baseUrl || !activeServer?.membershipToken) return;
    const candidates = [];
    for (const message of messages || []) {
      for (const attachment of message?.attachments || []) {
        if (!attachment?.id || !isImageMimeType(attachment.contentType)) continue;
        if (attachmentPreviewUrlById[attachment.id]) continue;
        if (attachmentPreviewFetchInFlightRef.current.has(attachment.id)) continue;
        candidates.push(attachment);
      }
    }

    for (const attachment of candidates) {
      attachmentPreviewFetchInFlightRef.current.add(attachment.id);
      const source = String(attachment.url || "");
      const requestUrl = source.startsWith("http")
        ? source
        : `${activeServer.baseUrl}${source.startsWith("/") ? "" : "/"}${source}`;

      fetch(requestUrl, {
        headers: { Authorization: `Bearer ${activeServer.membershipToken}` }
      })
        .then((response) => response.ok ? response.blob() : null)
        .then((blob) => {
          if (!blob || !isImageMimeType(blob.type || attachment.contentType || "")) return;
          const objectUrl = URL.createObjectURL(blob);
          setAttachmentPreviewUrlById((current) => {
            const existing = current[attachment.id];
            if (existing) URL.revokeObjectURL(objectUrl);
            return existing ? current : { ...current, [attachment.id]: objectUrl };
          });
        })
        .catch(() => {})
        .finally(() => {
          attachmentPreviewFetchInFlightRef.current.delete(attachment.id);
        });
    }
  }, [messages, activeServer?.baseUrl, activeServer?.membershipToken, attachmentPreviewUrlById]);

  useEffect(() => {
    const old = attachmentPreviewUrlByIdRef.current || {};
    Object.values(old).forEach((url) => {
      try { URL.revokeObjectURL(url); } catch {}
    });
    attachmentPreviewFetchInFlightRef.current.clear();
    setAttachmentPreviewUrlById({});
  }, [activeServerId]);

  useEffect(() => {
    return () => {
      const urls = attachmentPreviewUrlByIdRef.current || {};
      Object.values(urls).forEach((url) => {
        try { URL.revokeObjectURL(url); } catch {}
      });
    };
  }, []);

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
    const timer = nodeGatewayConnectedForActiveServer ? null : window.setInterval(loadGuildState, 3000);
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [activeServer, activeGuildId, navMode, activeChannelId, nodeGatewayConnectedForActiveServer]);

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
          audio: {
            echoCancellation: true,
            noiseSuppression: !!noiseSuppressionEnabled,
            autoGainControl: true,
            ...(audioInputDeviceId ? { deviceId: { exact: audioInputDeviceId } } : {})
          }
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
  }, [isInVoiceChannel, isVoiceSessionSynced, voiceConnectedGuildId, voiceConnectedChannelId, isMuted, isDeafened, micSensitivity, audioInputDeviceId, noiseSuppressionEnabled, me?.id]);

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
    localStorage.setItem(NOISE_SUPPRESSION_KEY, noiseSuppressionEnabled ? "1" : "0");
  }, [noiseSuppressionEnabled]);

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
    if (!activeGuildId) return;
    const guildPrefs = voiceMemberAudioPrefsByGuild?.[activeGuildId] || {};
    for (const [userId, pref] of Object.entries(guildPrefs)) {
      voiceSfuRef.current?.setUserAudioPreference(userId, pref);
    }
  }, [activeGuildId, voiceMemberAudioPrefsByGuild, isDeafened]);

  useEffect(() => {
    if (!isInVoiceChannel) setLocalAudioProcessingInfo(null);
  }, [isInVoiceChannel]);


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
  activeGuildIdRef.current = activeGuildId;
  activeServerIdRef.current = activeServerId;

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("opencom-voice-state-change", {
      detail: {
        connected: !!voiceSession.channelId,
        guildId: voiceSession.guildId || "",
        channelId: voiceSession.channelId || "",
        muted: !!isMuted,
        deafened: !!isDeafened,
        screenSharing: !!isScreenSharing
      }
    }));
  }, [voiceSession.guildId, voiceSession.channelId, isMuted, isDeafened, isScreenSharing]);

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
        if (error?.message?.startsWith("HTTP_403")) {
          setMessages([]);
          setStatus("You no longer have access to that channel.");
          setActiveChannelId("");
          return;
        }
        if (error?.message?.startsWith("HTTP_404")) {
          setMessages([]);
          setStatus("That channel no longer exists. Switching to an available channel.");
          setActiveChannelId("");
          return;
        }
        setStatus(`Message fetch failed: ${error.message}`);
      });

    loadChannelMessages();
    const timer = nodeGatewayConnectedForActiveServer ? null : window.setInterval(loadChannelMessages, 2000);

    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [activeServer, activeChannelId, navMode, nodeGatewayConnectedForActiveServer]);

  useEffect(() => {
    if (navMode !== "servers" || !activeServer || !activeChannelId) return;
    loadServerPins(activeChannelId).catch(() => {});
  }, [navMode, activeServer, activeChannelId]);

  useEffect(() => {
    setPendingAttachments([]);
    if (attachmentInputRef.current) attachmentInputRef.current.value = "";
  }, [activeServerId, activeChannelId]);

  useEffect(() => {
    if (navMode !== "servers" || !accessToken || !activeGuildId || gatewayConnected) return;

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
  }, [navMode, accessToken, activeGuildId, guildState?.members, gatewayConnected]);

  // Fallback polling for social presence/RPC only when core gateway websocket is unavailable.
  useEffect(() => {
    if (!accessToken || gatewayConnected || (navMode !== "friends" && navMode !== "dms")) return;

    let cancelled = false;

    const loadSocialPresence = () => {
      const ids = new Set();
      (friends || []).forEach((friend) => friend?.id && ids.add(friend.id));
      (dms || []).forEach((dm) => dm?.participantId && ids.add(dm.participantId));
      const userIds = [...ids];
      if (!userIds.length) return;

      const params = new URLSearchParams({ userIds: userIds.join(",") });
      fetch(`${CORE_API}/v1/presence?${params}`, { headers: { Authorization: `Bearer ${accessToken}` } })
        .then((r) => r.ok ? r.json() : {})
        .then((data) => {
          if (cancelled || !data || typeof data !== "object") return;
          setPresenceByUserId((prev) => ({ ...prev, ...data }));
        })
        .catch(() => {});
    };

    loadSocialPresence();
    const timer = window.setInterval(loadSocialPresence, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [accessToken, gatewayConnected, navMode, friends, dms]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search || "");
    const verifyEmailToken = params.get("verifyEmailToken");
    if (!verifyEmailToken) return;
    if (getAppRouteFromLocation() === APP_ROUTE_HOME) {
      navigateAppRoute(APP_ROUTE_LOGIN, { replace: true });
    }

    setStatus("Verifying your email...");
    api("/v1/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token: verifyEmailToken })
    })
      .then(() => {
        setAuthMode("login");
        setStatus("Email verified. You can now log in.");
      })
      .catch((error) => {
        setStatus(`Email verification failed: ${error.message}`);
      })
      .finally(() => {
        params.delete("verifyEmailToken");
        const next = params.toString();
        const nextUrl = `${window.location.pathname}${next ? `?${next}` : ""}${window.location.hash || ""}`;
        window.history.replaceState({}, "", nextUrl);
      });
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    const params = new URLSearchParams(window.location.search || "");
    const action = params.get("boostGiftCheckout");
    const giftId = params.get("giftId");
    const sessionId = params.get("session_id");
    if (!action) return;

    if (action === "success" && giftId && sessionId) {
      completeBoostGiftCheckout(giftId, sessionId).catch(() => {});
    } else if (action === "cancel") {
      setStatus("Boost gift checkout canceled.");
    }

    params.delete("boostGiftCheckout");
    params.delete("giftId");
    params.delete("session_id");
    const next = params.toString();
    const nextUrl = `${window.location.pathname}${next ? `?${next}` : ""}${window.location.hash || ""}`;
    window.history.replaceState({}, "", nextUrl);
  }, [accessToken]);

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setStatus("Authenticating...");

    try {
      if (authMode === "register") {
        await api("/v1/auth/register", { method: "POST", body: JSON.stringify({ email, username, password }) });
        setPendingVerificationEmail(email.trim());
        setAuthMode("login");
        setPassword("");
        setStatus("Account created. Check your email for a verification link before logging in.");
        return;
      }

      const loginData = await api("/v1/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      setAccessToken(loginData.accessToken);
      setRefreshToken(loginData.refreshToken || "");
      setMe(loginData.user);
      setPendingVerificationEmail("");
      setStatus("Authenticated.");
    } catch (error) {
      if (error?.message === "EMAIL_NOT_VERIFIED") {
        setPendingVerificationEmail(email.trim());
        setStatus("Auth failed: EMAIL_NOT_VERIFIED. Use the resend button below if needed.");
        return;
      }
      if (error?.message === "SMTP_NOT_CONFIGURED") {
        setStatus("Auth failed: SMTP is not configured on the API server, so verification emails cannot be sent yet.");
        return;
      }
      if (error?.message === "SMTP_AUTH_FAILED") {
        setStatus("Auth failed: SMTP auth failed. Check Zoho SMTP username/app password.");
        return;
      }
      if (error?.message === "SMTP_CONNECTION_FAILED") {
        setStatus("Auth failed: SMTP connection failed. Check server network + SMTP host/port/TLS.");
        return;
      }
      setStatus(`Auth failed: ${error.message}`);
    }
  }

  async function handleResendVerification() {
    const targetEmail = (pendingVerificationEmail || email || "").trim();
    if (!targetEmail) {
      setStatus("Enter your email first, then resend verification.");
      return;
    }
    setStatus("Sending verification email...");
    try {
      await api("/v1/auth/resend-verification", {
        method: "POST",
        body: JSON.stringify({ email: targetEmail })
      });
      setPendingVerificationEmail(targetEmail);
      setStatus("If the account exists and is unverified, a new verification email has been sent.");
    } catch (error) {
      if (error?.message === "SMTP_NOT_CONFIGURED") {
        setStatus("Resend failed: SMTP is not configured on the API server. Set SMTP_* (or Zoho SMTP envs) and restart backend.");
        return;
      }
      if (error?.message === "SMTP_AUTH_FAILED") {
        setStatus("Resend failed: SMTP auth failed. Check Zoho username and app password.");
        return;
      }
      if (error?.message === "SMTP_CONNECTION_FAILED") {
        setStatus("Resend failed: could not connect to SMTP server. Check host/port/TLS/firewall.");
        return;
      }
      setStatus(`Resend failed: ${error.message}`);
    }
  }

  async function executeSlashCommand(rawInput) {
    const trimmed = rawInput.trim();
    const withoutPrefix = trimmed.replace(/^\//, "").trim();
    const [commandName, ...argPieces] = withoutPrefix.split(/\s+/);
    if (!commandName) return false;

    const command = serverExtensionCommands.find((item) => item.name === commandName);
    if (!command) {
      setStatus(`Unknown command: /${commandName}`);
      return true;
    }

    const optionDefs = Array.isArray(command.options) ? command.options : [];
    const rawArgs = parseCommandArgs(argPieces.join(" "));
    const args = {};

    try {
      optionDefs.forEach((option, index) => {
        const value = rawArgs[index];
        if ((value == null || value === "") && option.required) {
          throw new Error(`Missing required option: ${option.name}`);
        }
        if (value == null || value === "") return;
        args[option.name] = coerceCommandArg(value, option.type || "string");
      });
    } catch (error) {
      setStatus(`/${commandName}: ${error.message}`);
      return true;
    }

    try {
      setMessageText("");
      const result = await nodeApi(activeServer.baseUrl, `/v1/extensions/commands/${encodeURIComponent(commandName)}/execute`, activeServer.membershipToken, {
        method: "POST",
        body: JSON.stringify({ args })
      });
      const commandResult = result?.result;
      if (commandResult && typeof commandResult === "object" && (commandResult.content || Array.isArray(commandResult.embeds))) {
        await nodeApi(activeServer.baseUrl, `/v1/channels/${activeChannelId}/messages`, activeServer.membershipToken, {
          method: "POST",
          body: JSON.stringify({
            content: String(commandResult.content || `/${commandName}`),
            embeds: Array.isArray(commandResult.embeds) ? commandResult.embeds : []
          })
        });
        const data = await nodeApi(activeServer.baseUrl, `/v1/channels/${activeChannelId}/messages`, activeServer.membershipToken);
        setMessages((data.messages || []).slice().reverse());
        setStatus(`Executed /${commandName}`);
      } else {
        setStatus(`Executed /${commandName}${result?.result != null ? ` → ${typeof result.result === "string" ? result.result : JSON.stringify(result.result)}` : ""}`);
      }
    } catch (error) {
      setMessageText(rawInput);
      setStatus(`Command failed: ${error.message}`);
    }

    return true;
  }

  async function uploadAttachment(file) {
    if (!activeServer || !activeGuildId || !activeChannelId || !file) return null;
    const nextFile = normalizeAttachmentFile(file, "attachment") || file;
    const form = new FormData();
    form.append("guildId", activeGuildId);
    form.append("channelId", activeChannelId);
    form.append("file", nextFile, nextFile.name || "upload.bin");
    const response = await fetch(`${activeServer.baseUrl}/v1/attachments/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${activeServer.membershipToken}` },
      body: form
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `HTTP_${response.status}`);
    }
    return response.json();
  }

  async function uploadAttachments(files, source = "files") {
    const selected = Array.from(files || []).filter(Boolean);
    if (!selected.length) return;

    const availableSlots = Math.max(0, 10 - pendingAttachments.length);
    if (!availableSlots) {
      setStatus("You can attach up to 10 files per message.");
      return;
    }

    const queue = selected.slice(0, availableSlots);
    let uploaded = 0;
    let failed = 0;

    for (const file of queue) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const data = await uploadAttachment(file);
        if (data) {
          setPendingAttachments((current) => [...current, data]);
          uploaded += 1;
        }
      } catch (error) {
        failed += 1;
        console.warn("Attachment upload failed", error);
      }
    }

    if (uploaded > 0 && failed === 0) {
      setStatus(`Attached ${uploaded} file${uploaded === 1 ? "" : "s"} from ${source}.`);
      return;
    }
    if (uploaded > 0) {
      setStatus(`Attached ${uploaded} file${uploaded === 1 ? "" : "s"} from ${source}; ${failed} failed.`);
      return;
    }
    setStatus(`Attachment upload failed from ${source}.`);
  }

  async function openMessageAttachment(attachment) {
    if (!attachment?.url || !activeServer?.baseUrl || !activeServer?.membershipToken) return;
    try {
      const url = attachment.url.startsWith("http")
        ? attachment.url
        : `${activeServer.baseUrl}${attachment.url}`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${activeServer.membershipToken}` }
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `HTTP_${response.status}`);
      }
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const popup = window.open(blobUrl, "_blank", "noopener,noreferrer");
      if (!popup) {
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = attachment.fileName || "attachment";
        a.click();
      }
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch (error) {
      setStatus(`Attachment open failed: ${error.message || "UNKNOWN_ERROR"}`);
    }
  }

  async function sendMessage() {
    if (!activeServer || !activeChannelId) return;
    if (!messageText.trim() && pendingAttachments.length === 0) return;

    if (messageText.trimStart().startsWith("/")) {
      await executeSlashCommand(messageText);
      return;
    }

    const content = `${replyTarget ? `> replying to ${replyTarget.author}: ${replyTarget.content}\n` : ""}${messageText.trim()}`;

    try {
      setMessageText("");
      setShowEmotePicker(false);
      await nodeApi(activeServer.baseUrl, `/v1/channels/${activeChannelId}/messages`, activeServer.membershipToken, {
        method: "POST",
        body: JSON.stringify({
          content: content || "Attachment",
          attachmentIds: pendingAttachments.map((attachment) => attachment.attachmentId || attachment.id).filter(Boolean)
        })
      });

      const data = await nodeApi(activeServer.baseUrl, `/v1/channels/${activeChannelId}/messages`, activeServer.membershipToken);
      setMessages((data.messages || []).slice().reverse());
      setReplyTarget(null);
      setPendingAttachments([]);
      if (attachmentInputRef.current) attachmentInputRef.current.value = "";
    } catch (error) {
      setMessageText(content);
      setStatus(`Send failed: ${error.message}`);
    }
  }
  async function sendDm() {
    if (!activeDm || !dmText.trim()) return;

    const content = `${dmReplyTarget ? `> replying to ${dmReplyTarget.author}: ${dmReplyTarget.content}\n` : ""}${dmText.trim()}`;
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
      setDmReplyTarget(null);
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

  async function loadBoostStatus() {
    if (!accessToken) return;
    setBoostLoading(true);
    try {
      const data = await api("/v1/billing/boost", {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      setBoostStatus(data);
    } catch (error) {
      setStatus(`Could not load billing status: ${error.message}`);
    } finally {
      setBoostLoading(false);
    }
  }

  async function startBoostCheckout() {
    if (!accessToken) return;
    try {
      const data = await api("/v1/billing/boost/checkout", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (data?.url) window.location.href = data.url;
    } catch (error) {
      setStatus(`Could not start checkout: ${error.message}`);
    }
  }

  async function openBoostPortal() {
    if (!accessToken) return;
    try {
      const data = await api("/v1/billing/boost/portal", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (data?.url) window.location.href = data.url;
    } catch (error) {
      setStatus(`Could not open billing portal: ${error.message}`);
    }
  }

  async function loadSentBoostGifts() {
    if (!accessToken) return;
    try {
      const data = await api("/v1/billing/boost/gifts", {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      setBoostGiftSent(data.gifts || []);
    } catch (error) {
      setStatus(`Could not load boost gifts: ${error.message}`);
    }
  }

  async function startBoostGiftCheckout() {
    if (!accessToken) return;
    setBoostGiftCheckoutBusy(true);
    try {
      const data = await api("/v1/billing/boost/gifts/checkout", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (data?.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      setStatus("Gift checkout URL missing.");
    } catch (error) {
      setStatus(`Could not start gift checkout: ${error.message}`);
    } finally {
      setBoostGiftCheckoutBusy(false);
    }
  }

  async function completeBoostGiftCheckout(giftId, sessionId) {
    if (!accessToken || !giftId || !sessionId) return;
    try {
      const data = await api("/v1/billing/boost/gifts/complete-purchase", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ giftId, sessionId })
      });
      if (data?.giftCode) {
        setBoostGiftCode(data.giftCode);
      }
      await loadSentBoostGifts();
      setSettingsOpen(true);
      setSettingsTab("billing");
      setStatus("Boost gift purchased. Copy and send your gift link.");
    } catch (error) {
      setStatus(`Could not complete gift purchase: ${error.message}`);
    }
  }

  async function previewBoostGift(rawCode) {
    if (!accessToken) return;
    const code = parseBoostGiftCodeFromInput(rawCode);
    if (!code) {
      setStatus("Invalid boost gift code/link.");
      return;
    }
    setBoostGiftLoading(true);
    try {
      const data = await api(`/v1/billing/boost/gifts/${encodeURIComponent(code)}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      setBoostGiftCode(code);
      setBoostGiftPreview(data);
      setBoostGiftPrompt(data);
      setSettingsOpen(true);
      setSettingsTab("billing");
      setStatus(`Boost gift from ${data?.from?.username || "someone"} is ready to redeem.`);
    } catch (error) {
      setBoostGiftPreview(null);
      setBoostGiftPrompt(null);
      setStatus(`Could not load boost gift: ${error.message}`);
    } finally {
      setBoostGiftLoading(false);
    }
  }

  async function redeemBoostGift(codeInput = boostGiftCode) {
    if (!accessToken) return;
    const code = parseBoostGiftCodeFromInput(codeInput);
    if (!code) {
      setStatus("Invalid boost gift code.");
      return;
    }
    setBoostGiftRedeeming(true);
    try {
      const data = await api(`/v1/billing/boost/gifts/${encodeURIComponent(code)}/redeem`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      setBoostGiftPrompt(null);
      setBoostGiftPreview(null);
      await Promise.all([loadBoostStatus(), loadSentBoostGifts()]);
      setStatus(`Boost gift redeemed (${data?.grantDays || 30} days).`);
    } catch (error) {
      setStatus(`Could not redeem boost gift: ${error.message}`);
    } finally {
      setBoostGiftRedeeming(false);
    }
  }

  function showBoostUpsell(reason = "This action requires OpenCom Boost.") {
    setBoostUpsell({
      title: "Hold up",
      reason,
      cta: "Open Boost Settings"
    });
  }

  function openBoostSettingsFromUpsell() {
    setBoostUpsell(null);
    setSettingsOpen(true);
    setSettingsTab("billing");
    loadBoostStatus().catch(() => {});
    loadSentBoostGifts().catch(() => {});
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

  async function disable2FA() {
    const approved = await confirmDialog("Are you sure? You will lose 2FA protection.", "Disable 2FA");
    if (!approved) return;
    setSecuritySettings((current) => ({ ...current, twoFactorEnabled: false }));
    setTwoFactorSecret("");
    setBackupCodes([]);
    setTwoFactorVerified(false);
    setShow2FASetup(false);
    setStatus("2FA has been disabled.");
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
          pfpUrl: normalizeImageUrlInput(profileForm.pfpUrl) || null,
          bannerUrl: normalizeImageUrlInput(profileForm.bannerUrl) || null
        })
      });
      if (me?.id) {
        const updated = await api(`/v1/users/${me.id}/profile`, { headers: { Authorization: `Bearer ${accessToken}` } });
        setProfile(updated);
        setFullProfileDraft(normalizeFullProfile(updated, updated.fullProfile));
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
      if (msg.includes("INVALID_IMAGE") || msg.includes("Invalid image format")) {
        setStatus("Invalid image URL. Use uploaded image paths (/v1/profile-images/...), users/... paths, or valid http(s) image URLs.");
      }
      else setStatus(`Profile update failed: ${msg}`);
    }
  }

  function updateFullProfileElement(elementId, patch) {
    setFullProfileDraft((current) => ({
      ...current,
      mode: "custom",
      elements: (current.elements || []).map((item) => item.id === elementId ? { ...item, ...patch } : item)
    }));
  }

  function addFullProfileTextBlock() {
    setFullProfileDraft((current) => {
      const nextIndex = (current.elements || []).filter((item) => item.type === "text").length + 1;
      const textBlock = {
        id: `text-${Date.now()}`,
        type: "text",
        x: 8,
        y: Math.min(92, 14 + nextIndex * 10),
        w: 58,
        h: 12,
        order: 10 + nextIndex,
        text: `Custom text ${nextIndex}`
      };
      return {
        ...current,
        mode: "custom",
        enabled: true,
        elements: [...(current.elements || []), textBlock]
      };
    });
  }

  function removeFullProfileElement(elementId) {
    setFullProfileDraft((current) => ({
      ...current,
      mode: "custom",
      elements: (current.elements || []).filter((item) => item.id !== elementId)
    }));
  }

  function addFullProfileLink() {
    setFullProfileDraft((current) => {
      const nextIndex = (current.links || []).length + 1;
      return {
        ...current,
        mode: "custom",
        links: [
          ...(current.links || []),
          {
            id: `link-${Date.now()}`,
            label: `Link ${nextIndex}`,
            url: "https://",
            x: 0,
            y: 0
          }
        ].slice(0, 16)
      };
    });
  }

  function updateFullProfileLink(linkId, patch) {
    setFullProfileDraft((current) => ({
      ...current,
      mode: "custom",
      links: (current.links || []).map((item) => item.id === linkId ? { ...item, ...patch } : item)
    }));
  }

  function removeFullProfileLink(linkId) {
    setFullProfileDraft((current) => ({
      ...current,
      mode: "custom",
      links: (current.links || []).filter((item) => item.id !== linkId)
    }));
  }

  function resetFullProfileDraftToBasic() {
    setFullProfileDraft(createBasicFullProfile(profile || {}));
  }

  async function saveFullProfileDraft() {
    if (!hasBoostForFullProfiles) {
      openBoostUpsell("Boost required", "Custom full profiles are a Boost perk. Without Boost you get the default profile layout.", "Open billing");
      return;
    }
    try {
      const payload = normalizeFullProfile(profile || {}, { ...fullProfileDraft, mode: "custom", enabled: true });
      const data = await api("/v1/me/profile/full", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(payload)
      });
      const nextProfile = {
        ...(profile || {}),
        fullProfile: normalizeFullProfile(profile || {}, data?.fullProfile || payload),
        hasCustomFullProfile: true
      };
      setProfile(nextProfile);
      setFullProfileDraft(nextProfile.fullProfile);
      setStatus("Full profile updated.");
    } catch (error) {
      const message = String(error?.message || "");
      if (message.includes("BOOST_REQUIRED")) {
        openBoostUpsell("Boost required", "Custom full profiles are a Boost perk. Activate Boost to save your layout.", "Open billing");
      } else {
        setStatus(`Full profile update failed: ${message}`);
      }
    }
  }

  function onFullProfileElementMouseDown(event, elementId) {
    if (!fullProfileEditorCanvasRef.current) return;
    const element = (fullProfileDraft.elements || []).find((item) => item.id === elementId);
    if (!element) return;
    const rect = fullProfileEditorCanvasRef.current.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * 100;
    const py = ((event.clientY - rect.top) / rect.height) * 100;
    fullProfileDragOffsetRef.current = {
      x: px - Number(element.x || 0),
      y: py - Number(element.y || 0)
    };
    setFullProfileDraggingElementId(elementId);
  }

  async function saveRichPresence() {
    if (!accessToken) return;
    const activity = rpcActivityFromForm(rpcForm);
    if (!activity.name && !activity.details && !activity.state && !activity.largeImageUrl && !activity.smallImageUrl && !activity.buttons) {
      setStatus("Add at least one rich presence field before saving.");
      return;
    }
    try {
      await api("/v1/presence/rpc", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ activity })
      });
      if (me?.id) {
        setPresenceByUserId((prev) => ({
          ...prev,
          [me.id]: { ...(prev[me.id] || {}), status: prev[me.id]?.status || selfStatus, customStatus: prev[me.id]?.customStatus ?? null, richPresence: activity }
        }));
      }
      setStatus("Rich presence updated.");
    } catch (error) {
      setStatus(`Rich presence update failed: ${error.message}`);
    }
  }

  async function clearRichPresence() {
    if (!accessToken) return;
    try {
      await api("/v1/presence/rpc", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (me?.id) {
        setPresenceByUserId((prev) => ({
          ...prev,
          [me.id]: { ...(prev[me.id] || {}), status: prev[me.id]?.status || selfStatus, customStatus: prev[me.id]?.customStatus ?? null, richPresence: null }
        }));
      }
      setRpcForm(rpcFormFromActivity(null));
      setStatus("Rich presence cleared.");
    } catch (error) {
      setStatus(`Clear rich presence failed: ${error.message}`);
    }
  }

  async function saveActiveServerProfile() {
    if (!activeServer || !canManageServer) return;
    try {
      await api(`/v1/servers/${activeServer.id}/profile`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          name: serverProfileForm.name?.trim() || undefined,
          logoUrl: normalizeImageUrlInput(serverProfileForm.logoUrl || "") || null,
          bannerUrl: normalizeImageUrlInput(serverProfileForm.bannerUrl || "") || null
        })
      });
      const refreshed = await api("/v1/servers", { headers: { Authorization: `Bearer ${accessToken}` } });
      const next = refreshed.servers || [];
      setServers(next);
      setStatus("Server profile updated.");
    } catch (error) {
      const msg = error?.message || "";
      if (msg.includes("LOGO_REQUIRED")) setStatus("Server logo is required.");
      else if (msg.includes("INVALID_LOGO_URL")) setStatus("Invalid server logo URL. Use uploaded paths (/v1/profile-images/... or users/...) or valid http(s) URLs.");
      else if (msg.includes("INVALID_BANNER_URL")) setStatus("Invalid server banner URL. Use uploaded paths (/v1/profile-images/... or users/...) or valid http(s) URLs.");
      else if (msg.includes("VALIDATION_ERROR")) setStatus("Server profile data is invalid. Check name, logo URL, and banner URL.");
      else setStatus(`Server profile update failed: ${msg}`);
    }
  }

  async function createServer() {
    if (!newServerName.trim() || !newServerBaseUrl.trim() || !newServerLogoUrl.trim()) return;
    try {
      await api("/v1/servers", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          name: newServerName.trim(),
          baseUrl: newServerBaseUrl.trim(),
          logoUrl: normalizeImageUrlInput(newServerLogoUrl),
          bannerUrl: normalizeImageUrlInput(newServerBannerUrl) || null
        })
      });
      setNewServerName("");
      setNewServerBaseUrl("https://");
      setNewServerLogoUrl("");
      setNewServerBannerUrl("");
      setStatus("Server provider added.");
      const refreshed = await api("/v1/servers", { headers: { Authorization: `Bearer ${accessToken}` } });
      setServers(refreshed.servers || []);
      setAddServerModalOpen(false);
    } catch (error) {
      const msg = error?.message || "";
      if (msg.includes("LOGO_REQUIRED")) setStatus("Server logo is required.");
      else if (msg.includes("INVALID_LOGO_URL")) setStatus("Invalid server logo URL. Use uploaded paths (/v1/profile-images/... or users/...) or valid http(s) URLs.");
      else if (msg.includes("INVALID_BANNER_URL")) setStatus("Invalid server banner URL. Use uploaded paths (/v1/profile-images/... or users/...) or valid http(s) URLs.");
      else setStatus(`Add server failed: ${msg}`);
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
    const wantsBoostPerk = invitePermanent || inviteCustomCode.trim().length > 0;
    if (wantsBoostPerk && boostStatus && !boostStatus.active) {
      showBoostUpsell("Custom invite codes and permanent invite links require OpenCom Boost.");
      return;
    }
    try {
      const payload = {
        serverId: inviteServerId,
        code: inviteCustomCode.trim() || undefined,
        permanent: invitePermanent
      };
      const data = await api("/v1/invites", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(payload)
      });
      setInviteCode(data.code);
      setInviteJoinUrl(data.joinUrl || "");
      setInviteCustomCode("");
      setStatus("Invite code generated.");
    } catch (error) {
      if (String(error?.message || "").includes("BOOST_REQUIRED")) {
        showBoostUpsell("Custom invite codes and permanent invite links require OpenCom Boost.");
        return;
      }
      setStatus(`Invite failed: ${error.message}`);
    }
  }

  async function previewInvite(value = null) {
    const code = parseInviteCodeFromInput(value ?? joinInviteCode ?? "");
    if (!code) {
      setInvitePreview(null);
      setStatus("Invalid invite code/link.");
      return;
    }
    try {
      const data = await api(`/v1/invites/${code}`);
      setInvitePreview(data);
      setJoinInviteCode(code);
      setInvitePendingCode(code);
      setStatus("Invite preview loaded.");
    } catch (error) {
      setInvitePreview(null);
      setStatus(`Invite lookup failed: ${error.message}`);
    }
  }

  async function joinInvite(codeToUse = null) {
    const code = parseInviteCodeFromInput(codeToUse || joinInviteCode || "");
    if (!code) return;

    try {
      const data = await api(`/v1/invites/${code}/join`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ accept: true })
      });
      setJoinInviteCode("");
      setInvitePreview(null);
      setInvitePendingCode("");
      setInvitePendingAutoJoin(false);
      const joinedServerName = data?.serverName || data?.server?.name || invitePreview?.serverName || "";
      setStatus(joinedServerName ? `Joined ${joinedServerName}.` : "Joined server from invite.");

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

  const VIEW_CHANNEL_BIT = 1;
  const SEND_MESSAGES_BIT = 2;

  function parseRoleInputToIds(raw = "") {
    const tokens = raw.split(",").map((item) => item.trim()).filter(Boolean);
    if (!tokens.length) return [];
    const rolePool = (guildState?.roles || []).filter((role) => !role.is_everyone);
    const byId = new Map(rolePool.map((role) => [String(role.id).toLowerCase(), role.id]));
    const byName = new Map(rolePool.map((role) => [String(role.name || "").toLowerCase(), role.id]));
    const picked = [];
    for (const token of tokens) {
      const key = token.toLowerCase();
      const roleId = byId.get(key) || byName.get(key);
      if (roleId && !picked.includes(roleId)) picked.push(roleId);
    }
    return picked;
  }

  async function applyPrivateVisibilityToChannel(channelId, allowedRoleIds = [], server = activeServer, guildId = workingGuildId) {
    if (!server || !guildId || !channelId) return;
    const everyoneRole = (guildState?.roles || []).find((role) => role.is_everyone);
    if (!everyoneRole) throw new Error("EVERYONE_ROLE_NOT_FOUND");

    await nodeApi(server.baseUrl, `/v1/channels/${channelId}/overwrites`, server.membershipToken, {
      method: "PUT",
      body: JSON.stringify({
        targetType: "role",
        targetId: everyoneRole.id,
        allow: "0",
        deny: String(VIEW_CHANNEL_BIT)
      })
    });

    for (const roleId of allowedRoleIds) {
      await nodeApi(server.baseUrl, `/v1/channels/${channelId}/overwrites`, server.membershipToken, {
        method: "PUT",
        body: JSON.stringify({
          targetType: "role",
          targetId: roleId,
          allow: String(VIEW_CHANNEL_BIT),
          deny: "0"
        })
      });
    }
  }

  async function createChannelWithOptions({ server = activeServer, guildId = workingGuildId, name, type = "text", parentId = "", privateRoleIds = null }) {
    if (!server || !guildId || !name?.trim()) return null;

    const payload = { name: name.trim(), type };
    if (type !== "category" && parentId) payload.parentId = parentId;

    const created = await nodeApi(server.baseUrl, `/v1/guilds/${guildId}/channels`, server.membershipToken, {
      method: "POST",
      body: JSON.stringify(payload)
    });

    const channelId = created?.channelId;
    if (channelId && Array.isArray(privateRoleIds)) {
      await applyPrivateVisibilityToChannel(channelId, privateRoleIds, server, guildId);
    }

    if (server.id === activeServerId && guildId === workingGuildId) {
      const state = await nodeApi(server.baseUrl, `/v1/guilds/${guildId}/state`, server.membershipToken);
      setGuildState(state);
    }

    return channelId;
  }

  async function promptCreateChannelFlow({ server = activeServer, guildId = workingGuildId, fixedType = "", fixedParentId = "" } = {}) {
    if (!server || !guildId) {
      setStatus("No active guild selected yet. Open a channel first, then try again.");
      return;
    }

    const type = fixedType || ((await promptText("Channel type: text, voice, or category", "text")) || "").trim().toLowerCase();
    if (!["text", "voice", "category"].includes(type)) {
      setStatus("Invalid channel type.");
      return;
    }

    const suggestedName = type === "category" ? "New Category" : `new-${type}`;
    const name = ((await promptText(`Name for the new ${type}:`, suggestedName)) || "").trim();
    if (!name) return;

    let parentId = fixedParentId || "";
    if (type !== "category" && !fixedParentId) {
      const parentName = ((await promptText("Optional category name/ID (leave blank for none):", "")) || "").trim();
      if (parentName) {
        const parent = (categoryChannels || []).find((cat) => cat.id === parentName || String(cat.name || "").toLowerCase() === parentName.toLowerCase());
        if (!parent) {
          setStatus("Category not found.");
          return;
        }
        parentId = parent.id;
      }
    }

    let privateRoleIds = null;
    if (type === "category") {
      const makePrivate = await confirmDialog("Make this category private?", "Category Privacy");
      if (makePrivate) {
        const roleList = (guildState?.roles || []).filter((role) => !role.is_everyone).map((role) => role.name).join(", ");
        const rawRoles = (await promptText(`Allowed roles (comma-separated names or IDs).\nAvailable: ${roleList}`, "")) || "";
        privateRoleIds = parseRoleInputToIds(rawRoles);
      }
    }

    try {
      await createChannelWithOptions({ server, guildId, name, type, parentId, privateRoleIds });
      setStatus(`${type === "category" ? "Category" : "Channel"} created.`);
    } catch (error) {
      setStatus(`Create channel failed: ${error.message}`);
    }
  }

  async function createChannel() {
    if (!activeServer || !workingGuildId || !newChannelName.trim()) return;
    try {
      await createChannelWithOptions({
        server: activeServer,
        guildId: workingGuildId,
        name: newChannelName,
        type: newChannelType,
        parentId: newChannelType !== "category" ? newChannelParentId : ""
      });
      setNewChannelName("");
      setNewChannelParentId("");
      setStatus("Channel created.");
    } catch (error) {
      setStatus(`Create channel failed: ${error.message}`);
    }
  }

  async function createServerEmote() {
    if (!activeServer || !activeGuildId || !newServerEmoteName.trim() || !newServerEmoteUrl.trim()) return;
    try {
      await nodeApi(activeServer.baseUrl, `/v1/guilds/${activeGuildId}/emotes`, activeServer.membershipToken, {
        method: "POST",
        body: JSON.stringify({
          name: newServerEmoteName.trim().toLowerCase(),
          imageUrl: newServerEmoteUrl.trim()
        })
      });
      setNewServerEmoteName("");
      setNewServerEmoteUrl("");
      const state = await nodeApi(activeServer.baseUrl, `/v1/guilds/${activeGuildId}/state`, activeServer.membershipToken);
      setGuildState(state);
      setStatus("Custom emote created.");
    } catch (error) {
      setStatus(`Create emote failed: ${error.message}`);
    }
  }

  async function removeServerEmote(emoteId) {
    if (!activeServer || !activeGuildId || !emoteId) return;
    try {
      await nodeApi(activeServer.baseUrl, `/v1/guilds/${activeGuildId}/emotes/${emoteId}`, activeServer.membershipToken, {
        method: "DELETE"
      });
      const state = await nodeApi(activeServer.baseUrl, `/v1/guilds/${activeGuildId}/state`, activeServer.membershipToken);
      setGuildState(state);
      setStatus("Custom emote removed.");
    } catch (error) {
      setStatus(`Remove emote failed: ${error.message}`);
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

  async function refreshActiveGuildState() {
    if (!activeServer || !activeGuildId) return;
    const state = await nodeApi(activeServer.baseUrl, `/v1/guilds/${activeGuildId}/state`, activeServer.membershipToken);
    setGuildState(state);
  }

  async function kickMember(memberId) {
    if (!activeServer || !activeGuildId || !memberId || !canKickMembers || moderationBusy) return;
    const member = resolvedMemberList.find((item) => item.id === memberId);
    const label = member?.username || memberId;
    if (!await confirmDialog(`Kick ${label}? They can rejoin with an invite.`, "Kick Member")) return;

    setModerationBusy(true);
    try {
      await nodeApi(activeServer.baseUrl, `/v1/guilds/${activeGuildId}/members/${memberId}/kick`, activeServer.membershipToken, { method: "POST", body: "{}" });
      await refreshActiveGuildState();
      if (memberProfileCard?.id === memberId) setMemberProfileCard(null);
      setStatus(`Kicked ${label}.`);
    } catch (error) {
      setStatus(`Kick failed: ${error.message}`);
    } finally {
      setModerationBusy(false);
    }
  }

  async function banMember(memberId, reason = "") {
    if (!activeServer || !activeGuildId || !memberId || !canBanMembers || moderationBusy) return;
    const member = resolvedMemberList.find((item) => item.id === memberId);
    const label = member?.username || memberId;
    if (!await confirmDialog(`Ban ${label}? This removes them and blocks rejoin until unbanned.`, "Ban Member")) return;

    setModerationBusy(true);
    try {
      const payload = {};
      if (reason.trim()) payload.reason = reason.trim().slice(0, 256);
      await nodeApi(activeServer.baseUrl, `/v1/guilds/${activeGuildId}/members/${memberId}/ban`, activeServer.membershipToken, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      await refreshActiveGuildState();
      if (memberProfileCard?.id === memberId) setMemberProfileCard(null);
      setStatus(`Banned ${label}.`);
    } catch (error) {
      setStatus(`Ban failed: ${error.message}`);
    } finally {
      setModerationBusy(false);
    }
  }

  async function unbanMember(memberId) {
    if (!activeServer || !activeGuildId || !memberId || !canBanMembers || moderationBusy) return;
    setModerationBusy(true);
    try {
      await nodeApi(activeServer.baseUrl, `/v1/guilds/${activeGuildId}/bans/${memberId}`, activeServer.membershipToken, { method: "DELETE" });
      setStatus(`Unbanned ${memberId}.`);
      setModerationUnbanUserId("");
    } catch (error) {
      setStatus(`Unban failed: ${error.message}`);
    } finally {
      setModerationBusy(false);
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
    profileCardDragOffsetRef.current = invertProfileDrag
      ? {
          x: event.clientX + profileCardPosition.x,
          y: event.clientY + profileCardPosition.y
        }
      : {
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
    setMessageContextMenu(null);
    setMemberContextMenu(null);
    setChannelContextMenu(null);
    setCategoryContextMenu(null);
    setServerContextMenu({ server, x: event.clientX, y: event.clientY });
  }

  function openChannelContextMenu(event, channel) {
    event.preventDefault();
    setServerContextMenu(null);
    setMessageContextMenu(null);
    setMemberContextMenu(null);
    setCategoryContextMenu(null);
    setChannelContextMenu({ channel, x: event.clientX, y: event.clientY });
  }

  function openCategoryContextMenu(event, category) {
    event.preventDefault();
    setServerContextMenu(null);
    setMessageContextMenu(null);
    setMemberContextMenu(null);
    setChannelContextMenu(null);
    setCategoryContextMenu({ category, x: event.clientX, y: event.clientY });
  }

  async function saveChannelName(channelId, currentName) {
    if (!activeServer || !workingGuildId) return;
    const nextName = ((await promptText("Channel name:", currentName || "")) || "").trim();
    if (!nextName || nextName === currentName) return;
    await nodeApi(activeServer.baseUrl, `/v1/channels/${channelId}`, activeServer.membershipToken, {
      method: "PATCH",
      body: JSON.stringify({ name: nextName })
    });
  }

  async function setChannelVisibilityByRoles(channelId) {
    if (!activeServer || !workingGuildId || !channelId) return;
    const roleList = (guildState?.roles || []).filter((role) => !role.is_everyone).map((role) => role.name).join(", ");
    const rawRoles = await promptText(`Visible to roles (comma-separated names or IDs). Leave blank to keep private for admins only.\nAvailable: ${roleList}`, "");
    if (rawRoles == null) return;
    const allowedRoleIds = parseRoleInputToIds(rawRoles);
    await applyPrivateVisibilityToChannel(channelId, allowedRoleIds, activeServer, workingGuildId);
  }

  async function openChannelSettings(channel) {
    if (!channel || !canManageServer || !activeServer || !workingGuildId) return;
    try {
      await saveChannelName(channel.id, channel.name);
      if (await confirmDialog("Configure visibility (private roles) for this channel/category?", "Channel Visibility")) {
        await setChannelVisibilityByRoles(channel.id);
      }
      const state = await nodeApi(activeServer.baseUrl, `/v1/guilds/${workingGuildId}/state`, activeServer.membershipToken);
      setGuildState(state);
      setStatus("Channel settings updated.");
    } catch (error) {
      setStatus(`Update channel failed: ${error.message}`);
    } finally {
      setChannelContextMenu(null);
      setCategoryContextMenu(null);
    }
  }

  async function deleteChannelById(channel) {
    if (!channel || !canManageServer || !activeServer || !workingGuildId) return;
    const kind = channel.type === "category" ? "category" : "channel";
    if (!await confirmDialog(`Delete ${kind} "${channel.name}"?`, "Delete Channel")) return;

    try {
      if (channel.type === "category") {
        const children = (guildState?.channels || []).filter((item) => item.parent_id === channel.id);
        for (const child of children) {
          await nodeApi(activeServer.baseUrl, `/v1/channels/${child.id}`, activeServer.membershipToken, {
            method: "PATCH",
            body: JSON.stringify({ parentId: null })
          });
        }
      }

      await nodeApi(activeServer.baseUrl, `/v1/channels/${channel.id}`, activeServer.membershipToken, {
        method: "DELETE"
      });

      if (activeChannelId === channel.id) setActiveChannelId("");
      const state = await nodeApi(activeServer.baseUrl, `/v1/guilds/${workingGuildId}/state`, activeServer.membershipToken);
      setGuildState(state);
      setStatus(`${kind[0].toUpperCase()}${kind.slice(1)} deleted.`);
    } catch (error) {
      setStatus(`Delete channel failed: ${error.message}`);
    } finally {
      setChannelContextMenu(null);
      setCategoryContextMenu(null);
    }
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

  async function moveServerInRail(serverId, direction) {
    const index = servers.findIndex((server) => server.id === serverId);
    if (index < 0) return;
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= servers.length) return;
    const reordered = servers.slice();
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);
    setServers(reordered);
    setServerContextMenu(null);
    try {
      await api("/v1/servers/reorder", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ serverIds: reordered.map((server) => server.id) })
      });
      setStatus("Server order updated.");
    } catch (error) {
      setStatus(`Server reorder failed: ${error.message}`);
    }
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
    if (!await confirmDialog(`Delete "${server.name}"? This cannot be undone. All members will lose access.`, "Delete Server")) return;
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

  async function loadServerPins(channelId = activeChannelId) {
    if (!activeServer || !channelId) return;
    try {
      const data = await nodeApi(activeServer.baseUrl, `/v1/channels/${channelId}/pins`, activeServer.membershipToken);
      setPinnedServerMessages((current) => ({
        ...current,
        [channelId]: Array.isArray(data?.pins) ? data.pins : []
      }));
    } catch (error) {
      setStatus(`Failed to load pinned messages: ${error.message}`);
    }
  }

  async function togglePinMessage(message) {
    if (!message?.id) return;

    if (message.kind === "server") {
      if (!activeServer || !activeChannelId) return;
      const existing = pinnedServerMessages[activeChannelId] || [];
      const isPinned = existing.some((item) => item.id === message.id);
      try {
        await nodeApi(
          activeServer.baseUrl,
          `/v1/channels/${activeChannelId}/pins/${message.id}`,
          activeServer.membershipToken,
          { method: isPinned ? "DELETE" : "PUT", body: "{}" }
        );
        await loadServerPins(activeChannelId);
        setStatus("Updated pinned messages.");
      } catch (error) {
        setStatus(`Pin update failed: ${error.message}`);
      }
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
    setIsScreenSharing(false);
    setRemoteScreenSharesByProducerId({});
  }

  async function waitForVoiceGatewayReady(timeoutMs = 15000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const ws = nodeGatewayWsRef.current;

      // If ws is open AND we’ve seen READY, we’re good
      if (ws && ws.readyState === WebSocket.OPEN && nodeGatewayReadyRef.current) return ws;

      await new Promise((resolve) => setTimeout(resolve, 120));
    }

    const wsState = nodeGatewayWsRef.current?.readyState;
    const wsStateName =
      wsState === WebSocket.CONNECTING ? "CONNECTING" :
      wsState === WebSocket.OPEN ? "OPEN" :
      wsState === WebSocket.CLOSING ? "CLOSING" :
      wsState === WebSocket.CLOSED ? "CLOSED" :
      "MISSING";

    const candidates = voiceGatewayCandidatesRef.current?.length
      ? voiceGatewayCandidatesRef.current.join(",")
      : "none";

    throw new Error(
      `VOICE_GATEWAY_UNAVAILABLE:ready=${nodeGatewayReadyRef.current ? "1" : "0"},ws=${wsStateName},candidates=${candidates}`
    );
  }


  async function sendNodeVoiceDispatch(type, data) {
    const ws = await waitForVoiceGatewayReady();
    ws.send(JSON.stringify({ op: "DISPATCH", t: type, d: data }));
  }

  function canUseRealtimeVoiceGateway() {
    const ws = nodeGatewayWsRef.current;
    const usable = !!(ws && ws.readyState === WebSocket.OPEN && nodeGatewayReadyRef.current);
    if (voiceDebugEnabled) {
      const wsState = ws?.readyState;
      const wsStateName = wsState === WebSocket.CONNECTING
        ? "CONNECTING"
        : wsState === WebSocket.OPEN
          ? "OPEN"
          : wsState === WebSocket.CLOSING
            ? "CLOSING"
            : wsState === WebSocket.CLOSED
              ? "CLOSED"
              : "MISSING";
      voiceDebug("canUseRealtimeVoiceGateway", {
        usable,
        readyState: wsStateName,
        gatewayReady: nodeGatewayReadyRef.current,
        activeGuildId,
        activeChannelId
      });
    }
    return usable;
  }

  async function enterShareFullscreen(event) {
    const node = event?.currentTarget;
    if (!node) return;
    const requestFullscreen = node.requestFullscreen || node.webkitRequestFullscreen || node.msRequestFullscreen;
    if (typeof requestFullscreen !== "function") {
      setStatus("Fullscreen is not supported in this browser.");
      return;
    }
    try {
      await requestFullscreen.call(node);
    } catch (error) {
      setStatus(`Could not open fullscreen: ${error.message || "FULLSCREEN_FAILED"}`);
    }
  }

  async function setServerVoiceMemberState(channelId, memberId, patch = {}) {
    if (!activeServer?.baseUrl || !activeServer?.membershipToken || !channelId || !memberId) return;
    const hasMuted = patch.muted !== undefined;
    const hasDeafened = patch.deafened !== undefined;
    if (!hasMuted && !hasDeafened) return;
    try {
      await nodeApi(
        activeServer.baseUrl,
        `/v1/channels/${channelId}/voice/members/${memberId}/state`,
        activeServer.membershipToken,
        { method: "PATCH", body: JSON.stringify(patch) }
      );
      const actionParts = [];
      if (hasMuted) actionParts.push(patch.muted ? "muted" : "unmuted");
      if (hasDeafened) actionParts.push(patch.deafened ? "deafened" : "undeafened");
      setStatus(`Voice member ${actionParts.join(" and ")}.`);
    } catch (error) {
      setStatus(`Voice moderation failed: ${error.message || "VOICE_MODERATION_FAILED"}`);
    }
  }

  async function disconnectVoiceMember(channelId, memberId) {
    if (!activeServer?.baseUrl || !activeServer?.membershipToken || !channelId || !memberId) return;
    try {
      await nodeApi(
        activeServer.baseUrl,
        `/v1/channels/${channelId}/voice/members/${memberId}/disconnect`,
        activeServer.membershipToken,
        { method: "POST" }
      );
      setStatus("Voice member disconnected.");
    } catch (error) {
      setStatus(`Disconnect failed: ${error.message || "VOICE_DISCONNECT_FAILED"}`);
    }
  }

  async function joinVoiceChannel(channel) {
    if (!channel?.id || !activeGuildId || !activeServer?.baseUrl || !activeServer?.membershipToken) return;
    let sfuError = null;
    try {
      setStatus(`Joining ${channel.name}...`);
      await voiceSfuRef.current?.join({
        guildId: activeGuildId,
        channelId: channel.id,
        audioInputDeviceId,
        noiseSuppression: noiseSuppressionEnabled,
        isMuted,
        isDeafened,
        audioOutputDeviceId
      });
      setVoiceSession({ guildId: activeGuildId, channelId: channel.id });
      setStatus(`Joined ${channel.name}.`);
      return;
    } catch (error) {
      sfuError = error;
    }

    const allowRestFallback = String(import.meta.env.VITE_ENABLE_REST_VOICE_FALLBACK || "").trim() === "1";
    if (!allowRestFallback) {
      const reason = sfuError?.message || "VOICE_GATEWAY_UNAVAILABLE";
      const message = `Voice connection failed: ${reason}. Realtime voice gateway is required; set VITE_ENABLE_REST_VOICE_FALLBACK=1 only for diagnostics.`;
      setStatus(message);
      await alertDialog(message, "Voice Error");
      return;
    }

    try {
      await nodeApi(activeServer.baseUrl, `/v1/channels/${channel.id}/voice/join`, activeServer.membershipToken, { method: "POST" });
      setVoiceSession({ guildId: activeGuildId, channelId: channel.id });
      const fallbackReason = sfuError?.message ? ` (gateway fallback: ${sfuError.message})` : "";
      setStatus(`Joined ${channel.name} (REST voice mode, no SFU playback).${fallbackReason}`);
    } catch (error) {
      const message = `Voice connection failed: ${error.message || "VOICE_JOIN_FAILED"}`;
      setStatus(message);
      await alertDialog(message, "Voice Error");
    }
  }

  async function toggleScreenShare() {
    if (!isInVoiceChannel) return;
    try {
      if (isScreenSharing) {
        await voiceSfuRef.current?.stopScreenShare();
        setStatus("Screen sharing stopped.");
      } else {
        await voiceSfuRef.current?.startScreenShare();
        setStatus("Screen sharing started.");
      }
    } catch (error) {
      const message = `Screen sharing failed: ${error.message || "SCREEN_SHARE_FAILED"}`;
      setStatus(message);
      await alertDialog(message, "Screen Share Error");
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
      setRemoteScreenSharesByProducerId({});
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

      if (!targetGuildId || !targetChannelId) {
        if (!connectedServer?.baseUrl || !connectedServer?.membershipToken) return;
        try {
          await nodeApi(connectedServer.baseUrl, "/v1/me/voice-disconnect", connectedServer.membershipToken, { method: "POST" });
        } catch (error) {
          const message = `Disconnected locally. Server voice leave failed: ${error.message || "VOICE_LEAVE_FAILED"}`;
          setStatus(message);
          console.warn(message);
        }
        return;
      }

      if (canUseRealtimeVoiceGateway()) {
        try {
          await sendNodeVoiceDispatch("VOICE_LEAVE", { guildId: targetGuildId, channelId: targetChannelId });
          return;
        } catch {}
      }

      if (!connectedServer?.baseUrl || !connectedServer?.membershipToken) return;

      try {
        if (targetChannelId) {
          await nodeApi(connectedServer.baseUrl, `/v1/channels/${targetChannelId}/voice/leave`, connectedServer.membershipToken, { method: "POST" });
          return;
        }
        await nodeApi(connectedServer.baseUrl, "/v1/me/voice-disconnect", connectedServer.membershipToken, { method: "POST" });
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
    if (!name || !accessToken || !newOfficialServerLogoUrl.trim()) return;
    try {
      const data = await api("/v1/servers/official", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          name,
          logoUrl: normalizeImageUrlInput(newOfficialServerLogoUrl),
          bannerUrl: normalizeImageUrlInput(newOfficialServerBannerUrl) || null
        })
      });
      setNewOfficialServerName("");
      setNewOfficialServerLogoUrl("");
      setNewOfficialServerBannerUrl("");
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
      else if (msg.includes("LOGO_REQUIRED")) setStatus("Server logo is required.");
      else if (msg.includes("INVALID_LOGO_URL")) setStatus("Invalid server logo URL. Use uploaded paths (/v1/profile-images/... or users/...) or valid http(s) URLs.");
      else if (msg.includes("INVALID_BANNER_URL")) setStatus("Invalid server banner URL. Use uploaded paths (/v1/profile-images/... or users/...) or valid http(s) URLs.");
      else if (msg.includes("OFFICIAL_SERVER_NOT_CONFIGURED")) setStatus("Server creation isn’t set up yet. The site admin needs to set OFFICIAL_NODE_SERVER_ID on the API server (same value as NODE_SERVER_ID on the node).");
      else if (msg.includes("OFFICIAL_SERVER_UNAVAILABLE")) setStatus("Official server is unavailable. Please try again later.");
      else setStatus(`Failed: ${msg}`);
    }
  }

  function openMessageContextMenu(event, message) {
    event.preventDefault();
    const x = Math.min(event.clientX, window.innerWidth - 240);
    const y = Math.min(event.clientY, window.innerHeight - 180);
    setChannelContextMenu(null);
    setCategoryContextMenu(null);
    setMemberContextMenu(null);
    setMessageContextMenu({ x, y, message: { ...message, pinned: isMessagePinned(message) } });
  }

  function openMemberContextMenu(event, member) {
    if (!member?.id) return;
    event.preventDefault();
    event.stopPropagation();
    const x = Math.min(event.clientX, window.innerWidth - 250);
    const y = Math.min(event.clientY, window.innerHeight - 420);
    setServerContextMenu(null);
    setChannelContextMenu(null);
    setCategoryContextMenu(null);
    setMessageContextMenu(null);
    setMemberContextMenu({ x, y, member });
  }

  const MAX_IMAGE_BYTES = 25 * 1024 * 1024; // 25MB for raw image upload

  function isAcceptedImage(file) {
    if (!file?.type) return false;
    return file.type.startsWith("image/");
  }

  async function uploadProfileImage(file, endpoint) {
    if (!accessToken) throw new Error("AUTH_REQUIRED");
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

  async function onImageFieldUpload(event, label, onUploaded) {
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
      setStatus(`Uploading ${label}...`);
      const data = await uploadProfileImage(file, "/v1/images/upload");
      if (!data?.imageUrl) throw new Error("UPLOAD_FAILED");
      onUploaded(data.imageUrl);
      setStatus(`${label} uploaded.`);
    } catch (error) {
      setStatus(error?.message || "Upload failed.");
    }
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
        fullProfile: normalizeFullProfile(profileData, profileData.fullProfile),
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
        badgeDetails: [],
        status: getPresence(member.id) || "offline",
        platformTitle: null,
        createdAt: null,
        fullProfile: createBasicFullProfile({ username: member.username || member.id }),
        roleIds: member.roleIds || []
      });
    }
  }

  function getBadgePresentation(badge) {
    if (badge && typeof badge === "object" && (badge.bgColor || badge.icon || badge.name)) {
      return {
        icon: badge.icon || "🏷️",
        name: badge.name || String(badge.id || "Badge"),
        bgColor: badge.bgColor || "#3a4f72",
        fgColor: badge.fgColor || "#ffffff"
      };
    }
    const id = String(badge?.id || badge || "").toLowerCase();
    if (id === "platform_owner") return { icon: "👑", name: "Platform Owner", bgColor: "#2d6cdf", fgColor: "#ffffff" };
    if (id === "platform_admin") return { icon: "🔨", name: "Platform Admin", bgColor: "#2d6cdf", fgColor: "#ffffff" };
    if (id === "boost") return { icon: "➕", name: "Boost", bgColor: "#4f7ecf", fgColor: "#ffffff" };
    return {
      icon: badge?.icon || "🏷️",
      name: badge?.name || id || "Badge",
      bgColor: badge?.bgColor || "#3a4f72",
      fgColor: badge?.fgColor || "#ffffff"
    };
  }

  function renderFullProfileElement(element, viewerProfile) {
    if (!element || !viewerProfile) return null;
    const type = String(element.type || "").toLowerCase();
    if (type === "banner") {
      const banner = profileImageUrl(viewerProfile.bannerUrl || profile?.bannerUrl);
      return banner ? <img src={banner} alt="Banner" className="full-profile-banner-image" /> : <div className="full-profile-banner-fallback" />;
    }
    if (type === "avatar") {
      const avatar = profileImageUrl(viewerProfile.pfpUrl || profile?.pfpUrl);
      return (
        <div className="full-profile-avatar-element">
          {avatar ? <img src={avatar} alt="Avatar" className="full-profile-avatar-image" /> : getInitials(viewerProfile.displayName || viewerProfile.username || "U")}
        </div>
      );
    }
    if (type === "name") {
      return <strong>{viewerProfile.displayName || viewerProfile.username || "User"}</strong>;
    }
    if (type === "bio") {
      return <span>{viewerProfile.bio || "No bio set."}</span>;
    }
    if (type === "links") {
      const links = Array.isArray(viewerProfile.fullProfile?.links) ? viewerProfile.fullProfile.links : [];
      return (
        <div className="full-profile-links-list">
          {links.length === 0 && <span className="hint">No links configured.</span>}
          {links.map((link) => (
            <a key={link.id || link.url} href={link.url} target="_blank" rel="noreferrer">{link.label}</a>
          ))}
        </div>
      );
    }
    return <span>{element.text || "Custom text"}</span>;
  }

  function insertEmoteToken(name) {
    const token = `:${name}:`;
    setMessageText((current) => {
      const trimmed = current || "";
      const spacer = trimmed.length > 0 && !/\s$/.test(trimmed) ? " " : "";
      return `${trimmed}${spacer}${token} `;
    });
    setShowEmotePicker(false);
    composerInputRef.current?.focus();
  }

  function renderContentWithMentions(message) {
    const content = message?.content || "";
    const nodes = [];
    const renderInlineMarkdown = (text, keyPrefix) => {
      if (!text) return [];
      const out = [];
      const inlineRegex = /(\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]+)\)|https?:\/\/[^\s<>"'`]+|`([^`\n]+)`|\*\*([^*\n]+)\*\*|__([^_\n]+)__|~~([^~\n]+)~~|\*([^*\n]+)\*|_([^_\n]+)_|\n|:([a-zA-Z0-9_+-]{2,32}):)/g;
      let cursorLocal = 0;
      let match = inlineRegex.exec(text);
      let localIndex = 0;

      while (match) {
        const start = match.index ?? 0;
        if (start > cursorLocal) {
          out.push(<span key={`${keyPrefix}-plain-${localIndex}`}>{text.slice(cursorLocal, start)}</span>);
          localIndex += 1;
        }

        const full = match[0] || "";
        const markdownLabel = match[2];
        const markdownUrl = match[3];
        const inlineCode = match[4];
        const boldA = match[5];
        const boldB = match[6];
        const strike = match[7];
        const italicA = match[8];
        const italicB = match[9];
        const emoteToken = match[10];

        if (markdownLabel && markdownUrl) {
          out.push(
            <a key={`${keyPrefix}-md-link-${localIndex}`} href={markdownUrl} target="_blank" rel="noreferrer">
              {renderInlineMarkdown(markdownLabel, `${keyPrefix}-md-link-label-${localIndex}`)}
            </a>
          );
        } else if (/^https?:\/\//i.test(full)) {
          out.push(<a key={`${keyPrefix}-link-${localIndex}`} href={full} target="_blank" rel="noreferrer">{full}</a>);
        } else if (inlineCode) {
          out.push(<code key={`${keyPrefix}-code-${localIndex}`} className="message-inline-code">{inlineCode}</code>);
        } else if (boldA || boldB) {
          const inner = boldA || boldB;
          out.push(<strong key={`${keyPrefix}-bold-${localIndex}`}>{renderInlineMarkdown(inner, `${keyPrefix}-bold-inner-${localIndex}`)}</strong>);
        } else if (strike) {
          out.push(<s key={`${keyPrefix}-strike-${localIndex}`}>{renderInlineMarkdown(strike, `${keyPrefix}-strike-inner-${localIndex}`)}</s>);
        } else if (italicA || italicB) {
          const inner = italicA || italicB;
          out.push(<em key={`${keyPrefix}-italic-${localIndex}`}>{renderInlineMarkdown(inner, `${keyPrefix}-italic-inner-${localIndex}`)}</em>);
        } else if (full === "\n") {
          out.push(<br key={`${keyPrefix}-br-${localIndex}`} />);
        } else if (emoteToken) {
          const token = String(emoteToken || "").toLowerCase();
          const emote = BUILTIN_EMOTES[token];
          if (emote) {
            out.push(<span key={`${keyPrefix}-emote-${localIndex}`} className="message-emote" title={`:${token}:`}>{emote}</span>);
          } else if (serverEmoteByName.has(token)) {
            const custom = serverEmoteByName.get(token);
            out.push(
              <img
                key={`${keyPrefix}-custom-emote-${localIndex}`}
                className="message-custom-emote"
                src={custom.imageUrl || custom.image_url}
                alt={`:${token}:`}
                title={`:${token}:`}
              />
            );
          } else {
            out.push(<span key={`${keyPrefix}-raw-emote-${localIndex}`}>{full}</span>);
          }
        } else {
          out.push(<span key={`${keyPrefix}-raw-${localIndex}`}>{full}</span>);
        }

        localIndex += 1;
        cursorLocal = start + full.length;
        match = inlineRegex.exec(text);
      }

      if (cursorLocal < text.length) {
        out.push(<span key={`${keyPrefix}-tail-${localIndex}`}>{text.slice(cursorLocal)}</span>);
      }
      return out;
    };

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
        nodes.push(...renderInlineMarkdown(content.slice(cursor, index), `text-${cursor}`));
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
      nodes.push(...renderInlineMarkdown(content.slice(cursor), `tail-${cursor}`));
    }

    return nodes.length ? nodes : content;
  }

  function normalizedLinkKey(value) {
    try {
      const parsed = new URL(String(value || ""));
      parsed.hash = "";
      return parsed.toString();
    } catch {
      return String(value || "");
    }
  }

  function isImageMimeType(value = "") {
    return /^image\//i.test(String(value || ""));
  }

  function isLikelyImageUrl(value = "") {
    const raw = String(value || "").trim();
    if (!raw) return false;
    if (/^data:image\//i.test(raw)) return true;
    try {
      const parsed = new URL(raw);
      return /\.(png|jpe?g|gif|webp|bmp|svg|heic|avif)(?:[?#]|$)/i.test(parsed.pathname || "");
    } catch {
      return /\.(png|jpe?g|gif|webp|bmp|svg|heic|avif)(?:[?#]|$)/i.test(raw);
    }
  }

  function getLinkPreviewForUrl(value) {
    const raw = String(value || "");
    if (!raw) return null;
    if (linkPreviewByUrl[raw] !== undefined) return linkPreviewByUrl[raw];
    const normalized = normalizedLinkKey(raw);
    for (const [candidate, preview] of Object.entries(linkPreviewByUrl)) {
      if (normalizedLinkKey(candidate) === normalized) return preview;
    }
    return null;
  }

  function getDerivedLinkEmbeds(message) {
    const urls = extractHttpUrls(message?.content || "");
    if (!urls.length) return [];

    const existing = new Set((message?.linkEmbeds || []).map((embed) => normalizedLinkKey(embed?.url)));
    const out = [];
    for (const rawUrl of urls) {
      const key = normalizedLinkKey(rawUrl);
      if (!key || existing.has(key)) continue;
      const preview = getLinkPreviewForUrl(rawUrl);
      if (!preview) continue;
      if (!preview.hasMeta && !preview.action) continue;
      out.push({
        url: preview.url || rawUrl,
        title: preview.title || preview.siteName || "Link",
        description: preview.description || "",
        imageUrl: preview.imageUrl || "",
        siteName: preview.siteName || "",
        action: preview.action || null,
        kind: preview.kind || "",
        invite: preview.invite || null
      });
    }
    return out;
  }

  function formatInviteEstablishedDate(value) {
    if (!value) return "";
    try {
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return "";
      return parsed.toLocaleDateString(undefined, { month: "short", year: "numeric" });
    } catch {
      return "";
    }
  }

  function renderMessageLinkEmbedCard(embed, key) {
    const preview = getLinkPreviewForUrl(embed?.url);
    const inviteEmbed = embed?.kind === "opencom_invite" && embed?.invite?.code
      ? embed
      : (preview?.kind === "opencom_invite" && preview?.invite?.code
        ? {
            url: preview.url || embed?.url || "",
            invite: preview.invite
          }
        : null);

    if (inviteEmbed?.invite?.code) {
      const invite = inviteEmbed.invite;
      const joinUrl = inviteEmbed.url || buildInviteJoinUrl(invite.code);
      const onlineCount = Number(invite.onlineCount || 0);
      const memberCount = Number(invite.memberCount || 0);
      const established = formatInviteEstablishedDate(invite.serverCreatedAt);
      const serverName = invite.serverName || "Server";
      const iconSource = profileImageUrl(invite.serverLogoUrl || "");

      return (
        <div key={key} className="message-invite-embed">
          <div className="message-invite-hero" style={iconSource ? { backgroundImage: `linear-gradient(180deg, rgba(12, 16, 27, 0.3), rgba(12, 16, 27, 0.95)), url(${iconSource})` } : undefined} />
          <div className="message-invite-body">
            <div className="message-invite-header">
              <div className="message-invite-icon">
                {iconSource ? <img src={iconSource} alt={serverName} /> : <span>{getInitials(serverName)}</span>}
              </div>
              <div className="message-invite-title-wrap">
                <strong>{serverName}</strong>
                <p className="message-invite-stats">
                  <span className="dot online" /> {onlineCount} Online
                  <span className="dot members" /> {memberCount} Members
                </p>
                {established && <p className="message-invite-established">Est. {established}</p>}
              </div>
            </div>
            <button
              type="button"
              className="message-invite-cta"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                joinInvite(invite.code);
              }}
            >
              Go to Server
            </button>
            <a className="message-invite-link" href={joinUrl} target="_blank" rel="noreferrer">{joinUrl}</a>
          </div>
        </div>
      );
    }

    const imageUrl = String(embed?.imageUrl || preview?.imageUrl || "").trim();
    const fallbackImageUrl = !imageUrl && isLikelyImageUrl(embed?.url) ? String(embed.url) : "";
    const resolvedImageUrl = imageUrl || fallbackImageUrl;
    if (resolvedImageUrl) {
      return (
        <a key={key} className="message-image-link-embed" href={embed.url} target="_blank" rel="noreferrer">
          <img src={resolvedImageUrl} alt={embed.title || "Image"} loading="lazy" />
          <div className="message-image-link-meta">
            <strong>{embed.title || "Image"}</strong>
            <p>{embed.url}</p>
          </div>
        </a>
      );
    }

    return (
      <a key={key} className="message-embed-card" href={embed.url} target="_blank" rel="noreferrer">
        <strong>{embed.title || "Link"}</strong>
        {embed.description && <p>{embed.description}</p>}
        <p>{embed.url}</p>
        {embed.action?.label && <small>{embed.action.label}</small>}
      </a>
    );
  }

  function renderMessageAttachmentCard(attachment, key) {
    const imagePreviewUrl = attachmentPreviewUrlById[attachment?.id] || "";
    const directUrl = String(attachment?.url || "");
    const directImageUrl = isLikelyImageUrl(directUrl) ? directUrl : "";
    const imageUrl = imagePreviewUrl || directImageUrl;
    const isImage = isImageMimeType(attachment?.contentType || "") || Boolean(imageUrl);

    if (isImage && imageUrl) {
      return (
        <button
          key={key}
          type="button"
          className="message-image-attachment"
          onClick={(event) => {
            event.stopPropagation();
            openMessageAttachment(attachment);
          }}
        >
          <img src={imageUrl} alt={attachment?.fileName || "Image attachment"} loading="lazy" />
          <div className="message-image-attachment-meta">
            <strong>{attachment?.fileName || "Image"}</strong>
            <p>{attachment?.contentType || "image"}</p>
          </div>
        </button>
      );
    }

    return (
      <button
        key={key}
        type="button"
        className="message-embed-card message-embed-card-btn"
        onClick={(event) => {
          event.stopPropagation();
          openMessageAttachment(attachment);
        }}
      >
        <strong>{attachment?.fileName || "Attachment"}</strong>
        <p>{attachment?.contentType || "file"}</p>
      </button>
    );
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

  function logout() {
    cleanupVoiceRtc().catch(() => {});
    setAccessToken("");
    setRefreshToken("");
    setServers([]);
    setGuildState(null);
    setMessages([]);
    setSettingsOpen(false);
    setStatus("Logged out.");
  }

  if (routePath === APP_ROUTE_TERMS) {
    return (
      <TermsPage
        onBack={() => navigateAppRoute(accessToken ? APP_ROUTE_CLIENT : APP_ROUTE_HOME)}
      />
    );
  }

  if (!accessToken) {
    if (routePath === APP_ROUTE_HOME) {
      return (
        <LandingPage
          downloadMenuRef={downloadMenuRef}
          downloadsMenuOpen={downloadsMenuOpen}
          setDownloadsMenuOpen={setDownloadsMenuOpen}
          downloadTargets={DOWNLOAD_TARGETS}
          preferredDownloadTarget={preferredDownloadTarget}
          onOpenClient={() => navigateAppRoute(APP_ROUTE_LOGIN)}
          onOpenTerms={() => navigateAppRoute(APP_ROUTE_TERMS)}
        />
      );
    }
    return (
      <AuthShell
        authMode={authMode}
        setAuthMode={setAuthMode}
        email={email}
        setEmail={setEmail}
        username={username}
        setUsername={setUsername}
        password={password}
        setPassword={setPassword}
        pendingVerificationEmail={pendingVerificationEmail}
        status={status}
        onSubmit={handleAuthSubmit}
        onResendVerification={handleResendVerification}
        onBackHome={() => navigateAppRoute(APP_ROUTE_HOME)}
        onOpenTerms={() => navigateAppRoute(APP_ROUTE_TERMS)}
      />
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
              {server.logoUrl ? (
                <img src={profileImageUrl(server.logoUrl)} alt={server.name} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }} />
              ) : (
                getInitials(server.name)
              )}
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
        <header
          className="sidebar-header"
          style={activeServer?.bannerUrl ? {
            backgroundImage: `linear-gradient(rgba(10,16,30,0.72), rgba(10,16,30,0.86)), url(${profileImageUrl(activeServer.bannerUrl)})`,
            backgroundSize: "cover",
            backgroundPosition: "center"
          } : undefined}
        >
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
                    <div className="category-header-row">
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
                        onContextMenu={(event) => category.id !== "uncategorized" && canManageServer && openCategoryContextMenu(event, category)}
                      >
                        <span className="chevron">{isCollapsed ? "▸" : "▾"}</span>{category.name}
                      </button>
                      {canManageServer && category.id !== "uncategorized" && (
                        <div className="category-actions">
                          <button
                            type="button"
                            className="channel-action-btn"
                            title="Create channel in category"
                            onClick={(event) => { event.stopPropagation(); promptCreateChannelFlow({ fixedType: "text", fixedParentId: category.id }); }}
                          >
                            ＋
                          </button>
                          <button
                            type="button"
                            className="channel-action-btn"
                            title="Category settings"
                            onClick={(event) => { event.stopPropagation(); openChannelSettings(category); }}
                          >
                            ⚙
                          </button>
                        </div>
                      )}
                    </div>
                    {!isCollapsed && (
                      <div className="category-items">
                        {items.map((channel) => (
                          <div key={channel.id}>
                            <div className="channel-row-wrap">
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
                                onContextMenu={(event) => canManageServer && openChannelContextMenu(event, channel)}
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
                              {canManageServer && (
                              <button
                                type="button"
                                className="channel-action-btn channel-row-cog"
                                title="Channel settings"
                                onClick={(event) => { event.stopPropagation(); openChannelSettings(channel); }}
                              >
                                ⚙
                              </button>
                              )}
                            </div>
                            {channel.type === "voice" && (voiceMembersByChannel.get(channel.id)?.length || 0) > 0 && (
                              <div className="voice-channel-members">
                                {voiceMembersByChannel.get(channel.id).map((member) => {
                                  const speaking = !!voiceSpeakingByGuild[activeGuildId]?.[member.userId];
                                  const audioPref = getVoiceMemberAudioPref(member.userId);
                                  const canModerateThisMember = member.userId !== me?.id;
                                  return (
                                    <div key={`${channel.id}-${member.userId}`} className="voice-channel-member-row">
                                      <div className="voice-channel-member-main">
                                        <div className={`avatar member-avatar vc-avatar ${speaking ? "speaking" : ""}`}>
                                          {member.pfp_url ? <img src={profileImageUrl(member.pfp_url)} alt={member.username} className="avatar-image" /> : getInitials(member.username)}
                                        </div>
                                        <span className="voice-channel-member-name">{member.username}</span>
                                        <span className="voice-channel-member-icons">{member.deafened ? "🔇" : member.muted ? "🎙️" : "🎤"}</span>
                                      </div>
                                      <div className="voice-channel-member-controls">
                                        <button
                                          type="button"
                                          className={`voice-mini-btn ${audioPref.muted ? "danger" : "ghost"}`}
                                          onClick={() => setVoiceMemberAudioPref(member.userId, { muted: !audioPref.muted })}
                                        >
                                          {audioPref.muted ? "Unmute local" : "Mute local"}
                                        </button>
                                        <label className="voice-volume-control">
                                          <span>{audioPref.volume}%</span>
                                          <input
                                            type="range"
                                            min={0}
                                            max={100}
                                            step={1}
                                            value={audioPref.volume}
                                            onChange={(event) => setVoiceMemberAudioPref(member.userId, { volume: Number(event.target.value) })}
                                          />
                                        </label>
                                        {canModerateThisMember && canServerMuteMembers && (
                                          <button
                                            type="button"
                                            className={`voice-mini-btn ${member.muted ? "danger" : "ghost"}`}
                                            onClick={() => setServerVoiceMemberState(channel.id, member.userId, { muted: !member.muted })}
                                          >
                                            {member.muted ? "Server Unmute" : "Server Mute"}
                                          </button>
                                        )}
                                        {canModerateThisMember && canServerDeafenMembers && (
                                          <button
                                            type="button"
                                            className={`voice-mini-btn ${member.deafened ? "danger" : "ghost"}`}
                                            onClick={() => setServerVoiceMemberState(channel.id, member.userId, { deafened: !member.deafened })}
                                          >
                                            {member.deafened ? "Server Undeafen" : "Server Deafen"}
                                          </button>
                                        )}
                                        {canModerateThisMember && canMoveVoiceMembers && (
                                          <button
                                            type="button"
                                            className="voice-mini-btn danger"
                                            onClick={() => disconnectVoiceMember(channel.id, member.userId)}
                                          >
                                            Disconnect
                                          </button>
                                        )}
                                      </div>
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
                  {renderPresenceAvatar({ userId: dm.participantId || dm.id, username: dm.name, pfpUrl: dm.pfp_url, size: 28 })}
                  <span className="channel-hash">@</span> 
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{dm.name}</span>
                </button>
              ))}
            {!dms.length && <p className="hint">Add friends to open direct message threads.</p>}
          </section>
        )}

        {navMode === "friends" && (
          <section className="sidebar-block channels-container friend-sidebar-list">
            {friends.map((friend) => (
              <button className="friend-row friend-sidebar-row" key={friend.id} onClick={() => openDmFromFriend(friend)} title={`Open ${friend.username}`} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {renderPresenceAvatar({ userId: friend.id, username: friend.username, pfpUrl: friend.pfp_url, size: 28 })}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong>{friend.username}</strong>
                  <span className="hint">{presenceLabel(getPresence(friend.id))}</span>
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
              <div className="voice-top"><strong>Voice Connected</strong><span title={voiceConnectedChannelName}>{voiceConnectedChannelName}</span></div>
              <div className="voice-actions voice-actions-modern">
                <button className={`voice-action-pill ${isMuted ? "active danger" : ""}`} title={isMuted ? "Unmute" : "Mute"} onClick={() => setIsMuted((value) => !value)}>
                  {isMuted ? "🔇" : "🎤"}
                </button>
                <button className={`voice-action-pill ${isDeafened ? "active danger" : ""}`} title={isDeafened ? "Undeafen" : "Deafen"} onClick={() => setIsDeafened((value) => !value)}>
                  {isDeafened ? "🔕" : "🎧"}
                </button>
                <button className={`voice-action-pill ${isScreenSharing ? "active" : ""}`} title={isScreenSharing ? "Stop screen share" : "Start screen share"} onClick={toggleScreenShare}>
                  {isScreenSharing ? "🖥️" : "📺"}
                </button>
                <button className="voice-action-pill danger" title="Disconnect from voice" onClick={leaveVoiceChannel} disabled={isDisconnectingVoice}>
                  {isDisconnectingVoice ? "…" : "📞"}
                </button>
                <button className="voice-action-pill" title="Voice settings" onClick={() => { setSettingsOpen(true); setSettingsTab("voice"); }}>
                  ⚙️
                </button>
              </div>
              {!!remoteScreenShares.length && (
                <div className="voice-screen-grid">
                  {remoteScreenShares.map((share) => (
                    <div className="voice-screen-tile" key={share.producerId}>
                      <video
                        autoPlay
                        playsInline
                        title="Click to view fullscreen"
                        onClick={enterShareFullscreen}
                        ref={(node) => {
                          if (!node || !share.stream) return;
                          if (node.srcObject !== share.stream) node.srcObject = share.stream;
                        }}
                      />
                      <span>{memberNameById.get(share.userId) || share.userId || "Screen Share"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="user-row">
            {renderPresenceAvatar({ userId: me?.id, username: me?.username || "OpenCom User", pfpUrl: profile?.pfpUrl, size: 36 })}
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
            <input
              type="text"
              value={newOfficialServerLogoUrl}
              onChange={(e) => setNewOfficialServerLogoUrl(e.target.value)}
              placeholder="Logo URL (.png/.jpg/.webp/.svg)"
              style={{ width: "100%", marginBottom: "0.75rem", padding: "0.5rem" }}
            />
            <label style={{ display: "block", marginBottom: "0.75rem" }}>
              Upload Logo
              <input type="file" accept="image/*" onChange={(event) => onImageFieldUpload(event, "server logo", setNewOfficialServerLogoUrl)} style={{ width: "100%", marginTop: "0.35rem" }} />
            </label>
            <input
              type="text"
              value={newOfficialServerBannerUrl}
              onChange={(e) => setNewOfficialServerBannerUrl(e.target.value)}
              placeholder="Banner URL (optional)"
              style={{ width: "100%", marginBottom: "0.75rem", padding: "0.5rem" }}
            />
            <label style={{ display: "block", marginBottom: "0.75rem" }}>
              Upload Banner
              <input type="file" accept="image/*" onChange={(event) => onImageFieldUpload(event, "server banner", setNewOfficialServerBannerUrl)} style={{ width: "100%", marginTop: "0.35rem" }} />
            </label>
            <button onClick={createOfficialServer} disabled={!newOfficialServerName.trim() || !newOfficialServerLogoUrl.trim()}>Create your server</button>
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
                {(() => {
                  let lastDayKey = "";
                  return groupedServerMessages.map((group) => {
                    const member = resolvedMemberList.find((m) => m.id === group.authorId);
                    const roles = (guildState?.roles || []).filter((r) => (member?.roleIds || []).includes(r.id)).sort((a, b) => (b.position ?? 0) - (a.position ?? 0));
                    const topRole = roles[0];
                    const roleColor = topRole?.color != null && topRole.color !== "" ? (typeof topRole.color === "number" ? `#${Number(topRole.color).toString(16).padStart(6, "0")}` : topRole.color) : null;
                    const groupDayKey = getMessageDayKey(group.firstMessageTime);
                    const showDateDivider = !!groupDayKey && groupDayKey !== lastDayKey;
                    if (groupDayKey) lastDayKey = groupDayKey;

                    return (
                      <div key={`group-wrap-${group.id}`}>
                        {showDateDivider && (
                          <div className="message-date-divider">
                            <span>{formatMessageDate(group.firstMessageTime)}</span>
                          </div>
                        )}
                        <article className="msg grouped-msg">
                          <div className="msg-avatar">
                            {group.pfpUrl ? (
                              <img src={profileImageUrl(group.pfpUrl)} alt={group.author} />
                            ) : (
                              getInitials(group.author || "User")
                            )}
                          </div>
                          <div className="msg-body">
                            <strong className="msg-author">
                              <button
                                className="name-btn"
                                style={roleColor ? { color: roleColor } : undefined}
                                onClick={() => openMemberProfile({ id: group.authorId, username: group.author, status: getPresence(group.authorId), pfp_url: group.pfpUrl })}
                                onContextMenu={(event) => openMemberContextMenu(event, { id: group.authorId, username: group.author, pfp_url: group.pfpUrl, roleIds: member?.roleIds || [] })}
                              >
                                {group.author}
                              </button>
                              {topRole && <span className="msg-role-tag">{topRole.name}</span>}
                              <span className="msg-time">{formatMessageTime(group.firstMessageTime)}</span>
                            </strong>
                            {group.messages.map((message) => {
                              const derivedLinkEmbeds = getDerivedLinkEmbeds(message);
                              return (
                              <div key={message.id} onContextMenu={(event) => openMessageContextMenu(event, {
                                id: message.id,
                                kind: "server",
                                author: group.author,
                                content: message.content,
                                mine: (message.author_id || message.authorId) === me?.id
                              })}>
                                <p>
                                  {activePinnedServerMessages.some((item) => item.id === message.id) ? "📌 " : ""}{renderContentWithMentions(message)}
                                </p>
                                {Array.isArray(message?.embeds) && message.embeds.length > 0 && (
                                  <div className="message-embeds">
                                    {message.embeds.map((embed, index) => (
                                      <div key={`${message.id}-embed-${index}`} className="message-embed-card">
                                        {embed.title && <strong>{embed.title}</strong>}
                                        {embed.description && <p>{embed.description}</p>}
                                        {embed.url && <a href={embed.url} target="_blank" rel="noreferrer">{embed.url}</a>}
                                        {embed.footer?.text && <small>{embed.footer.text}</small>}
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {Array.isArray(message?.linkEmbeds) && message.linkEmbeds.length > 0 && (
                                  <div className="message-embeds">
                                    {message.linkEmbeds.map((embed, index) => renderMessageLinkEmbedCard(embed, `${message.id}-link-${index}`))}
                                  </div>
                                )}
                                {derivedLinkEmbeds.length > 0 && (
                                  <div className="message-embeds">
                                    {derivedLinkEmbeds.map((embed, index) => renderMessageLinkEmbedCard(embed, `${message.id}-derived-link-${index}`))}
                                  </div>
                                )}
                                {Array.isArray(message?.attachments) && message.attachments.length > 0 && (
                                  <div className="message-embeds">
                                    {message.attachments.map((attachment, index) => renderMessageAttachmentCard(attachment, `${message.id}-att-${index}`))}
                                  </div>
                                )}
                              </div>
                            )})}
                          </div>
                        </article>
                      </div>
                    );
                  });
                })()}
                {!messages.length && <p className="empty">No messages yet. Start the conversation.</p>}
              </div>

              {replyTarget && (
                <div className="reply-banner">
                  <span>Replying to {replyTarget.author}</span>
                  <button className="ghost" onClick={() => setReplyTarget(null)}>Cancel</button>
                </div>
              )}

              <footer className="composer server-composer" onClick={() => composerInputRef.current?.focus()}>
                <button
                  className="ghost composer-icon"
                  onClick={(event) => {
                    event.stopPropagation();
                    attachmentInputRef.current?.click();
                  }}
                >
                  ＋
                </button>
                <input
                  ref={attachmentInputRef}
                  type="file"
                  multiple
                  style={{ display: "none" }}
                  onChange={async (event) => {
                    const files = Array.from(event.target.files || []);
                    await uploadAttachments(files, "file picker");
                  }}
                />
                <div className="composer-input-wrap">
                  {pendingAttachments.length > 0 && (
                    <div className="mention-suggestions">
                      {pendingAttachments.map((attachment, index) => (
                        <div key={`pending-att-${index}`} className="mention-suggestion" style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
                          <span>{attachment.fileName || "attachment"}</span>
                          <button
                            type="button"
                            className="ghost"
                            onClick={(event) => {
                              event.stopPropagation();
                              setPendingAttachments((current) => current.filter((_, i) => i !== index));
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <textarea
                    ref={composerInputRef}
                    value={messageText}
                    onChange={(event) => setMessageText(event.target.value)}
                    onPaste={(event) => {
                      const files = Array.from(event.clipboardData?.files || []).filter((file) => file && file.size > 0);
                      if (!files.length) return;
                      event.preventDefault();
                      uploadAttachments(files, "clipboard").catch(() => {});
                    }}
                    placeholder={`Message #${activeChannel?.name || "channel"}`}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowDown" && slashCommandSuggestions.length > 0) {
                        event.preventDefault();
                        setSlashSelectionIndex((current) => (current + 1) % slashCommandSuggestions.length);
                        return;
                      }
                      if (event.key === "ArrowUp" && slashCommandSuggestions.length > 0) {
                        event.preventDefault();
                        setSlashSelectionIndex((current) => (current - 1 + slashCommandSuggestions.length) % slashCommandSuggestions.length);
                        return;
                      }
                      if (event.key === "Escape" && showingSlash) {
                        event.preventDefault();
                        setMessageText("");
                        return;
                      }
                      if ((event.key === "Tab" || (event.key === "Enter" && !event.shiftKey)) && slashCommandSuggestions.length > 0) {
                        event.preventDefault();
                        const selected = slashCommandSuggestions[Math.min(slashSelectionIndex, slashCommandSuggestions.length - 1)] || slashCommandSuggestions[0];
                        if (!selected) return;
                        setMessageText(`/${selected.name} `);
                        return;
                      }
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
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
                  {showingSlash && (
                    <div className="slash-command-suggestions">
                      <div className="slash-command-header">COMMANDS MATCHING /{(slashQuery || "").toUpperCase()}</div>
                      {slashCommandSuggestions.length === 0 ? (
                        <div className="slash-command-empty">No commands found for this server.</div>
                      ) : (
                        slashCommandSuggestions.map((command, index) => (
                          <button
                            key={command.name}
                            type="button"
                            className={`slash-command-item ${index === slashSelectionIndex ? "active" : ""}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              setMessageText(`/${command.name} `);
                              setSlashSelectionIndex(index);
                              composerInputRef.current?.focus();
                            }}
                          >
                            <div>
                              <strong>/{command.name}</strong>
                              <p>{command.description || "No description provided."}</p>
                            </div>
                            <span>{command.extensionName || command.extensionId}</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                  {mentionSuggestions.length > 0 && !showingSlash && (
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
                  {showEmotePicker && !showingSlash && (
                    <div className="emote-picker">
                      {Object.entries(BUILTIN_EMOTES).map(([name, value]) => (
                        <button
                          key={name}
                          type="button"
                          className="emote-item"
                          onClick={(event) => {
                            event.stopPropagation();
                            insertEmoteToken(name);
                          }}
                          title={`:${name}:`}
                        >
                          <span>{value}</span>
                          <small>:{name}:</small>
                        </button>
                      ))}
                      {(guildState?.emotes || []).map((emote) => (
                        <button
                          key={emote.id || emote.name}
                          type="button"
                          className="emote-item"
                          onClick={(event) => {
                            event.stopPropagation();
                            insertEmoteToken(String(emote.name || "").toLowerCase());
                          }}
                          title={`:${emote.name}:`}
                        >
                          <img className="message-custom-emote" src={emote.imageUrl || emote.image_url} alt={`:${emote.name}:`} />
                          <small>:{emote.name}:</small>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  className="ghost composer-icon"
                  onClick={(event) => {
                    event.stopPropagation();
                    setShowEmotePicker((current) => !current);
                  }}
                  title="Open emotes"
                >
                  😀
                </button>
                <button className="send-btn" onClick={sendMessage} disabled={!activeChannelId || (!messageText.trim() && pendingAttachments.length === 0)}>Send</button>
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
                          <button
                            className="member-row"
                            key={member.id}
                            title={`View ${member.username}`}
                            onClick={(event) => { event.stopPropagation(); openMemberProfile(member); }}
                            onContextMenu={(event) => openMemberContextMenu(event, member)}
                          >
                            <div className={speaking ? "speaking" : ""}>
                              {renderPresenceAvatar({ userId: member.id, username: member.username, pfpUrl: member.pfp_url, size: 32 })}
                            </div>
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
              {(() => {
                let lastDayKey = "";
                return groupedDmMessages.map((group) => {
                  const groupDayKey = getMessageDayKey(group.firstMessageTime);
                  const showDateDivider = !!groupDayKey && groupDayKey !== lastDayKey;
                  if (groupDayKey) lastDayKey = groupDayKey;

                  return (
                    <div key={`dm-group-wrap-${group.id}`}>
                      {showDateDivider && (
                        <div className="message-date-divider">
                          <span>{formatMessageDate(group.firstMessageTime)}</span>
                        </div>
                      )}
                      <article className="msg dm-msg grouped-msg">
                        <div className="msg-avatar">
                          {group.pfpUrl ? (
                            <img src={profileImageUrl(group.pfpUrl)} alt={group.author} />
                          ) : (
                            getInitials(group.author)
                          )}
                        </div>
                        <div className="msg-body">
                          <strong className="msg-author">
                            <button
                              className="name-btn"
                              onClick={() => openMemberProfile({ id: group.authorId, username: group.author, status: getPresence(group.authorId), pfp_url: group.pfpUrl })}
                              onContextMenu={(event) => openMemberContextMenu(event, { id: group.authorId, username: group.author, pfp_url: group.pfpUrl })}
                            >
                              {group.author}
                            </button>
                            <span className="msg-time">{formatMessageTime(group.firstMessageTime)}</span>
                          </strong>
                          {group.messages.map((message) => {
                            const derivedLinkEmbeds = getDerivedLinkEmbeds(message);
                            return (
                            <div key={message.id} onContextMenu={(event) => openMessageContextMenu(event, {
                              id: message.id,
                              kind: "dm",
                              author: message.author,
                              content: message.content,
                              mine: message.authorId === me?.id
                            })}>
                              <p>
                                {activePinnedDmMessages.some((item) => item.id === message.id) ? "📌 " : ""}{renderContentWithMentions(message)}
                              </p>
                              {derivedLinkEmbeds.length > 0 && (
                                <div className="message-embeds">
                                  {derivedLinkEmbeds.map((embed, index) => renderMessageLinkEmbedCard(embed, `${message.id}-dm-derived-link-${index}`))}
                                </div>
                              )}
                              {Array.isArray(message?.attachments) && message.attachments.length > 0 && (
                                <div className="message-embeds">
                                  {message.attachments.map((attachment, index) => renderMessageAttachmentCard(attachment, `${message.id}-dm-att-${index}`))}
                                </div>
                              )}
                            </div>
                          )})}
                        </div>
                      </article>
                    </div>
                  );
                });
              })()}
              {!activeDm && <p className="empty">Select a DM on the left.</p>}
            </div>
            {dmReplyTarget && (
              <div className="reply-banner">
                <span>Replying to {dmReplyTarget.author}</span>
                <button className="ghost" onClick={() => setDmReplyTarget(null)}>Cancel</button>
              </div>
            )}
            <footer className="composer dm-composer" onClick={() => dmComposerInputRef.current?.focus()}>
              <textarea
                ref={dmComposerInputRef}
                value={dmText}
                onChange={(event) => setDmText(event.target.value)}
                placeholder={`Message ${activeDm?.name || "friend"}`}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    sendDm();
                  }
                }}
              />
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
                  <div className="friend-row-main">
                    {renderPresenceAvatar({ userId: friend.id, username: friend.username, pfpUrl: friend.pfp_url, size: 32 })}
                    <div className="friend-meta">
                      <strong>{friend.username}</strong>
                      <span>{presenceLabel(getPresence(friend.id))}</span>
                    </div>
                  </div>
                  <button className="ghost" onClick={(event) => { event.stopPropagation(); openDmFromFriend(friend); }}>Message</button>
                </div>
              ))}
            </section>

            <aside className="active-now">
              <h4>Active Now</h4>
              {filteredFriends.slice(0, 5).map((friend) => (
                <button key={`active-${friend.id}`} className="active-card" onClick={(event) => { event.stopPropagation(); openMemberProfile(friend); }}>
                  <div className="friend-row-main">
                    {renderPresenceAvatar({ userId: friend.id, username: friend.username, pfpUrl: friend.pfp_url, size: 30 })}
                    <div className="friend-meta">
                      <strong>{friend.username}</strong>
                      <span>{getPresence(friend.id) === "online" ? "Available now" : presenceLabel(getPresence(friend.id))}</span>
                    </div>
                  </div>
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
          {messageContextMenu.message.kind === "dm" && (
            <button onClick={() => { setDmReplyTarget({ author: messageContextMenu.message.author, content: messageContextMenu.message.content }); setMessageContextMenu(null); }}>Reply</button>
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

      {memberContextMenu && (
        <div className="server-context-menu" style={{ top: memberContextMenu.y, left: memberContextMenu.x }} onClick={(event) => event.stopPropagation()}>
          {(() => {
            const memberId = memberContextMenu.member?.id;
            const memberVoice = memberId ? voiceStateByUserId.get(memberId) : null;
            const localVoicePref = getVoiceMemberAudioPref(memberId);
            return (
              <>
                {memberVoice?.channelId && (
                  <button className="ghost" disabled>
                    In voice: {memberVoice.channelId}
                  </button>
                )}
                <button onClick={() => {
                  setVoiceMemberAudioPref(memberId, { muted: !localVoicePref.muted });
                  setStatus(localVoicePref.muted ? "Local voice unmuted for member." : "Local voice muted for member.");
                  setMemberContextMenu(null);
                }}>
                  {localVoicePref.muted ? "Local Unmute" : "Local Mute"}
                </button>
                <button onClick={async () => {
                  await promptSetVoiceMemberLocalVolume(memberId);
                  setMemberContextMenu(null);
                }}>
                  Local Volume ({localVoicePref.volume}%)
                </button>
                {memberVoice?.channelId && memberId !== me?.id && canServerMuteMembers && (
                  <button
                    className={memberVoice.muted ? "danger" : "ghost"}
                    onClick={async () => {
                      await setServerVoiceMemberState(memberVoice.channelId, memberId, { muted: !memberVoice.muted });
                      setMemberContextMenu(null);
                    }}
                  >
                    {memberVoice.muted ? "Server Unmute" : "Server Mute"}
                  </button>
                )}
                {memberVoice?.channelId && memberId !== me?.id && canServerDeafenMembers && (
                  <button
                    className={memberVoice.deafened ? "danger" : "ghost"}
                    onClick={async () => {
                      await setServerVoiceMemberState(memberVoice.channelId, memberId, { deafened: !memberVoice.deafened });
                      setMemberContextMenu(null);
                    }}
                  >
                    {memberVoice.deafened ? "Server Undeafen" : "Server Deafen"}
                  </button>
                )}
                {memberVoice?.channelId && memberId !== me?.id && canMoveVoiceMembers && (
                  <button
                    className="danger"
                    onClick={async () => {
                      await disconnectVoiceMember(memberVoice.channelId, memberId);
                      setMemberContextMenu(null);
                    }}
                  >
                    Disconnect From VC
                  </button>
                )}
              </>
            );
          })()}
          <button onClick={() => { openMemberProfile(memberContextMenu.member); setMemberContextMenu(null); }}>View Profile</button>
          <button onClick={() => { openDmFromFriend({ id: memberContextMenu.member.id, username: memberContextMenu.member.username || memberContextMenu.member.id }); setMemberContextMenu(null); }}>
            Message
          </button>
          <button onClick={async () => {
            try {
              await navigator.clipboard.writeText(memberContextMenu.member.id || "");
              setStatus("User ID copied.");
            } catch {
              setStatus("Could not copy user ID.");
            }
            setMemberContextMenu(null);
          }}>
            Copy User ID
          </button>
          {canKickMembers && memberContextMenu.member.id !== me?.id && (
            <button className="danger" onClick={async () => {
              await kickMember(memberContextMenu.member.id);
              setMemberContextMenu(null);
            }}>
              Kick Member
            </button>
          )}
          {canBanMembers && memberContextMenu.member.id !== me?.id && (
            <button className="danger" onClick={async () => {
              await banMember(memberContextMenu.member.id, "");
              setMemberContextMenu(null);
            }}>
              Ban Member
            </button>
          )}
          {canModerateMembers && (
            <button onClick={() => {
              setModerationMemberId(memberContextMenu.member.id || "");
              setSettingsOpen(true);
              setSettingsTab("moderation");
              setMemberContextMenu(null);
            }}>
              Open Moderation Panel
            </button>
          )}
        </div>
      )}

      {serverContextMenu && (
        <div className="server-context-menu" style={{ top: serverContextMenu.y, left: serverContextMenu.x }} onClick={(event) => event.stopPropagation()}>
          <button onClick={() => openServerFromContext(serverContextMenu.server.id)}>Open Server</button>
          {canManageServer && serverContextMenu.server.id === activeServerId && !!workingGuildId && (
            <>
              <button onClick={() => { promptCreateChannelFlow({ fixedType: "text" }); setServerContextMenu(null); }}>Create Text Channel</button>
              <button onClick={() => { promptCreateChannelFlow({ fixedType: "voice" }); setServerContextMenu(null); }}>Create Voice Channel</button>
              <button onClick={() => { promptCreateChannelFlow({ fixedType: "category" }); setServerContextMenu(null); }}>Create Category</button>
            </>
          )}
          <button onClick={() => moveServerInRail(serverContextMenu.server.id, "up")}>Move Up</button>
          <button onClick={() => moveServerInRail(serverContextMenu.server.id, "down")}>Move Down</button>
          <button onClick={() => { setInviteServerId(serverContextMenu.server.id); setSettingsOpen(true); setSettingsTab("invites"); setServerContextMenu(null); }}>Create Invite</button>
          <button onClick={() => copyServerId(serverContextMenu.server.id)}>Copy Server ID</button>
          <button onClick={() => { setSettingsOpen(true); setSettingsTab("server"); setServerContextMenu(null); }}>Server Settings</button>
          <button className="danger" onClick={() => leaveServer(serverContextMenu.server)}>Leave Server</button>
          {(serverContextMenu.server.roles || []).includes("owner") && (
            <button className="danger" onClick={() => deleteServer(serverContextMenu.server)}>Delete Server</button>
          )}
        </div>
      )}

      {channelContextMenu && (
        <div className="server-context-menu" style={{ top: channelContextMenu.y, left: channelContextMenu.x }} onClick={(event) => event.stopPropagation()}>
          {canManageServer && (
            <>
              <button onClick={() => openChannelSettings(channelContextMenu.channel)}>Edit Channel</button>
              <button onClick={() => { setChannelPermsChannelId(channelContextMenu.channel.id); setSettingsOpen(true); setSettingsTab("server"); setChannelContextMenu(null); }}>Permissions</button>
            </>
          )}
          <button onClick={() => { setActiveChannelId(channelContextMenu.channel.id); setChannelContextMenu(null); }}>Open</button>
          {canManageServer && <button className="danger" onClick={() => deleteChannelById(channelContextMenu.channel)}>Delete</button>}
        </div>
      )}

      {categoryContextMenu && (
        <div className="server-context-menu" style={{ top: categoryContextMenu.y, left: categoryContextMenu.x }} onClick={(event) => event.stopPropagation()}>
          {canManageServer && (
            <>
              <button onClick={() => { promptCreateChannelFlow({ fixedType: "text", fixedParentId: categoryContextMenu.category.id }); setCategoryContextMenu(null); }}>Create Text Channel</button>
              <button onClick={() => { promptCreateChannelFlow({ fixedType: "voice", fixedParentId: categoryContextMenu.category.id }); setCategoryContextMenu(null); }}>Create Voice Channel</button>
              <button onClick={() => openChannelSettings(categoryContextMenu.category)}>Edit Category</button>
              <button className="danger" onClick={() => deleteChannelById(categoryContextMenu.category)}>Delete Category</button>
            </>
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
                {canAccessServerAdminPanel && (
                  <a href="/server-admin.html" target="_blank" rel="noopener noreferrer" className="add-server-admin-link" onClick={(e) => e.stopPropagation()}>🔧 Admin</a>
                )}
              </div>
            </header>

            <div className="add-server-content">
              {addServerTab === "join" && (
                <section className="card">
                  <p className="hint" style={{ marginBottom: "0.5rem" }}>Paste an invite code or full join link. Invite links are previewed and need explicit accept.</p>
                  <input placeholder="Invite code or join link" value={joinInviteCode ?? ""} onChange={(e) => setJoinInviteCode(e.target.value)} style={{ width: "100%", marginBottom: "0.5rem", padding: "0.5rem" }} />
                  <div className="row-actions" style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    <button className="ghost" onClick={previewInvite}>Preview</button>
                    <button onClick={() => joinInvite(invitePendingCode || joinInviteCode)}>Accept Invite</button>
                  </div>
                  {invitePreview && <p className="hint" style={{ marginTop: "0.5rem" }}>Invite: {invitePreview.code} · Server: {invitePreview.serverName || invitePreview.server_id} · Uses: {invitePreview.uses}</p>}
                </section>
              )}

              {addServerTab === "custom" && (
                <section className="card">
                  <p className="hint" style={{ marginBottom: "0.5rem" }}>Connect to a server node by URL (self-hosted or provider).</p>
                  <input placeholder="Server name" value={newServerName ?? ""} onChange={(e) => setNewServerName(e.target.value)} style={{ width: "100%", marginBottom: "0.5rem", padding: "0.5rem" }} />
                  <input placeholder="https://node.example.com" value={newServerBaseUrl ?? "https://"} onChange={(e) => setNewServerBaseUrl(e.target.value)} style={{ width: "100%", marginBottom: "0.5rem", padding: "0.5rem" }} />
                  <input placeholder="Logo URL (.png/.jpg/.webp/.svg)" value={newServerLogoUrl ?? ""} onChange={(e) => setNewServerLogoUrl(e.target.value)} style={{ width: "100%", marginBottom: "0.5rem", padding: "0.5rem" }} />
                  <label style={{ display: "block", marginBottom: "0.5rem" }}>
                    Upload Logo
                    <input type="file" accept="image/*" onChange={(event) => onImageFieldUpload(event, "server logo", setNewServerLogoUrl)} style={{ width: "100%", marginTop: "0.35rem" }} />
                  </label>
                  <input placeholder="Banner URL (optional)" value={newServerBannerUrl ?? ""} onChange={(e) => setNewServerBannerUrl(e.target.value)} style={{ width: "100%", marginBottom: "0.5rem", padding: "0.5rem" }} />
                  <label style={{ display: "block", marginBottom: "0.5rem" }}>
                    Upload Banner
                    <input type="file" accept="image/*" onChange={(event) => onImageFieldUpload(event, "server banner", setNewServerBannerUrl)} style={{ width: "100%", marginTop: "0.35rem" }} />
                  </label>
                  <button onClick={createServer} disabled={!newServerName.trim() || !newServerBaseUrl.trim() || !newServerLogoUrl.trim()}>Add Server</button>
                </section>
              )}

              {addServerTab === "create" && (
                <section className="card">
                  <p className="hint" style={{ marginBottom: "0.5rem" }}>One server hosted by us—name it and customize channels and roles.</p>
                  <input placeholder="Server name" value={newOfficialServerName ?? ""} onChange={(e) => setNewOfficialServerName(e.target.value)} style={{ width: "100%", marginBottom: "0.5rem", padding: "0.5rem" }} />
                  <input placeholder="Logo URL (.png/.jpg/.webp/.svg)" value={newOfficialServerLogoUrl ?? ""} onChange={(e) => setNewOfficialServerLogoUrl(e.target.value)} style={{ width: "100%", marginBottom: "0.5rem", padding: "0.5rem" }} />
                  <label style={{ display: "block", marginBottom: "0.5rem" }}>
                    Upload Logo
                    <input type="file" accept="image/*" onChange={(event) => onImageFieldUpload(event, "server logo", setNewOfficialServerLogoUrl)} style={{ width: "100%", marginTop: "0.35rem" }} />
                  </label>
                  <input placeholder="Banner URL (optional)" value={newOfficialServerBannerUrl ?? ""} onChange={(e) => setNewOfficialServerBannerUrl(e.target.value)} style={{ width: "100%", marginBottom: "0.5rem", padding: "0.5rem" }} />
                  <label style={{ display: "block", marginBottom: "0.5rem" }}>
                    Upload Banner
                    <input type="file" accept="image/*" onChange={(event) => onImageFieldUpload(event, "server banner", setNewOfficialServerBannerUrl)} style={{ width: "100%", marginTop: "0.35rem" }} />
                  </label>
                  <button onClick={createOfficialServer} disabled={!newOfficialServerName?.trim() || !newOfficialServerLogoUrl?.trim()}>Create your server</button>
                </section>
              )}
            </div>

            <button type="button" className="danger" style={{ width: "100%", marginTop: "0.5rem" }} onClick={() => setAddServerModalOpen(false)}>Close</button>
          </div>
        </div>
      )}

      {memberProfileCard && (
        <div
          className="member-profile-popout"
          style={{ right: profileCardPosition.x, bottom: profileCardPosition.y }}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => openMemberContextMenu(event, memberProfileCard)}
        >
          <div className="popout-drag-handle" onMouseDown={startDraggingProfileCard}>Drag</div>
          <div className="popout-banner" style={{ backgroundImage: memberProfileCard.bannerUrl ? `url(${profileImageUrl(memberProfileCard.bannerUrl)})` : undefined }} />
          <div className="popout-content">
            <div className="avatar popout-avatar">{memberProfileCard.pfpUrl ? <img src={profileImageUrl(memberProfileCard.pfpUrl)} alt="Profile avatar" className="avatar-image" /> : getInitials(memberProfileCard.displayName || memberProfileCard.username || "User")}</div>
            <h4>{memberProfileCard.displayName || memberProfileCard.username}</h4>
            <p className="hint">@{memberProfileCard.username} · {presenceLabel(getPresence(memberProfileCard?.id) || memberProfileCard?.status || "offline")}</p>
            {memberProfileCard.platformTitle && <p className="hint">{memberProfileCard.platformTitle}</p>}
            {formatAccountCreated(memberProfileCard.createdAt) && <p className="hint">Account created: {formatAccountCreated(memberProfileCard.createdAt)}</p>}
            {Array.isArray(memberProfileCard.badgeDetails) && memberProfileCard.badgeDetails.length > 0 && (
              <div className="popout-roles">
                {memberProfileCard.badgeDetails.map((badge, index) => {
                  const display = getBadgePresentation(badge);
                  return (
                    <span
                      key={`${badge.id || badge.name || "badge"}-${index}`}
                      className="popout-role-tag"
                      title={display.name}
                      style={{ backgroundColor: display.bgColor, color: display.fgColor, borderColor: display.bgColor }}
                    >
                      {display.icon}
                    </span>
                  );
                })}
              </div>
            )}
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
            {(() => {
              const rich = getRichPresence(memberProfileCard.id);
              return rich ? (
                <div className="message-embed-card" style={{ marginTop: "8px", marginBottom: "8px" }}>
                  {rich.largeImageUrl && <img src={rich.largeImageUrl} alt={rich.largeImageText || "Activity"} style={{ width: "100%", borderRadius: "8px", marginBottom: "6px" }} />}
                  <strong>{rich.name || "Activity"}</strong>
                  {rich.details && <p>{rich.details}</p>}
                  {rich.state && <p>{rich.state}</p>}
                  {Array.isArray(rich.buttons) && rich.buttons.length > 0 && (
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "6px" }}>
                      {rich.buttons.map((button, index) => (
                        <a key={`${button.url}-${index}`} href={button.url} target="_blank" rel="noreferrer" className="ghost" style={{ padding: "4px 8px", borderRadius: "8px", border: "1px solid var(--border-subtle)", textDecoration: "none", color: "var(--text-soft)" }}>
                          {button.label}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ) : null;
            })()}
            <div className="popout-actions">
              <button className="ghost" onClick={() => openDmFromFriend({ id: memberProfileCard.id, username: memberProfileCard.username })}>Message</button>
              <button className="ghost" onClick={() => setFullProfileViewer(memberProfileCard)}>View Full Profile</button>
              {canKickMembers && memberProfileCard.id !== me?.id && (
                <button className="ghost" onClick={() => kickMember(memberProfileCard.id)}>Kick</button>
              )}
              {canBanMembers && memberProfileCard.id !== me?.id && (
                <button className="danger" onClick={() => banMember(memberProfileCard.id, "")}>Ban</button>
              )}
              <button onClick={() => setMemberProfileCard(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {fullProfileViewer && (
        <div className="settings-overlay" onClick={() => setFullProfileViewer(null)}>
          <div className="add-server-modal full-profile-viewer-modal" onClick={(event) => event.stopPropagation()}>
            <h3>{fullProfileViewer.displayName || fullProfileViewer.username}'s Full Profile</h3>
            <div
              className="full-profile-canvas full-profile-canvas-readonly"
              style={{
                background: fullProfileViewer.fullProfile?.theme?.background || "linear-gradient(150deg, #16274b, #0f1a33 65%)",
                color: fullProfileViewer.fullProfile?.theme?.text || "#dfe9ff"
              }}
            >
              <div
                className="full-profile-canvas-card"
                style={{ background: fullProfileViewer.fullProfile?.theme?.card || "rgba(9, 14, 28, 0.62)" }}
              >
                {(fullProfileViewer.fullProfile?.elements || [])
                  .slice()
                  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                  .map((element) => (
                    <div
                      key={element.id}
                      className={`full-profile-element full-profile-element-${element.type}`}
                      style={{
                        left: `${element.x}%`,
                        top: `${element.y}%`,
                        width: `${element.w}%`,
                        height: `${element.h}%`
                      }}
                    >
                      {renderFullProfileElement(element, fullProfileViewer)}
                    </div>
                  ))}
              </div>
            </div>
            <button className="danger" style={{ width: "100%", marginTop: "0.65rem" }} onClick={() => setFullProfileViewer(null)}>Close</button>
          </div>
        </div>
      )}

      {dialogModal && (
        <div
          className="settings-overlay"
          onClick={() => resolveDialog(dialogModal.type === "confirm" ? false : null)}
        >
          <div className="add-server-modal opencom-dialog-modal" onClick={(event) => event.stopPropagation()}>
            <h3>{dialogModal.title}</h3>
            <p className="hint opencom-dialog-message">{dialogModal.message}</p>
            {dialogModal.type === "prompt" && (
              <input
                ref={dialogInputRef}
                value={dialogModal.value}
                onChange={(event) => setDialogModal((current) => (current ? { ...current, value: event.target.value } : current))}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    resolveDialog(null);
                  }
                  if (event.key === "Enter") {
                    event.preventDefault();
                    resolveDialog(dialogModal.value);
                  }
                }}
              />
            )}
            <div className="row-actions opencom-dialog-actions">
              {dialogModal.type !== "alert" && (
                <button className="ghost" onClick={() => resolveDialog(dialogModal.type === "confirm" ? false : null)}>
                  {dialogModal.cancelLabel || "Cancel"}
                </button>
              )}
              <button
                onClick={() => resolveDialog(dialogModal.type === "prompt" ? dialogModal.value : true)}
              >
                {dialogModal.confirmLabel || "OK"}
              </button>
            </div>
          </div>
        </div>
      )}

      {boostUpsell && (
        <div className="settings-overlay" onClick={() => setBoostUpsell(null)}>
          <div className="add-server-modal boost-upsell-modal" onClick={(event) => event.stopPropagation()}>
            <h3>{boostUpsell.title}</h3>
            <p className="hint">{boostUpsell.reason}</p>
            <div className="row-actions boost-actions">
              <button onClick={openBoostSettingsFromUpsell}>{boostUpsell.cta}</button>
              <button className="ghost" onClick={() => setBoostUpsell(null)}>Maybe later</button>
            </div>
          </div>
        </div>
      )}

      {boostGiftPrompt && (
        <div className="settings-overlay" onClick={() => setBoostGiftPrompt(null)}>
          <div className="add-server-modal boost-upsell-modal" onClick={(event) => event.stopPropagation()}>
            <h3>Redeem Boost Gift?</h3>
            <p className="hint">
              <strong>{boostGiftPrompt.from?.username || "Someone"}</strong> sent you {boostGiftPrompt.grantDays || 30} days of Boost.
            </p>
            <p className="hint">This gift expires on {boostGiftPrompt.expiresAt ? new Date(boostGiftPrompt.expiresAt).toLocaleDateString() : "soon"}.</p>
            <div className="row-actions boost-actions">
              <button onClick={() => redeemBoostGift(boostGiftPrompt.code)} disabled={boostGiftRedeeming}>
                {boostGiftRedeeming ? "Redeeming…" : "Accept Gift"}
              </button>
              <button className="ghost" onClick={() => setBoostGiftPrompt(null)}>Not now</button>
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
              <button className={settingsTab === "billing" ? "active" : "ghost"} onClick={() => { setSettingsTab("billing"); loadBoostStatus(); loadSentBoostGifts(); }}>💳 Billing</button>
              <button className={settingsTab === "server" ? "active" : "ghost"} onClick={() => setSettingsTab("server")}>Server</button>
              <button className={settingsTab === "roles" ? "active" : "ghost"} onClick={() => setSettingsTab("roles")}>Roles</button>
              {canModerateMembers && (
                <button className={settingsTab === "moderation" ? "active" : "ghost"} onClick={() => setSettingsTab("moderation")}>Moderation</button>
              )}
              <button className={settingsTab === "invites" ? "active" : "ghost"} onClick={() => setSettingsTab("invites")}>Invites</button>
              <button className={settingsTab === "appearance" ? "active" : "ghost"} onClick={() => setSettingsTab("appearance")}>Appearance</button>
              <button className={settingsTab === "extensions" ? "active" : "ghost"} onClick={() => setSettingsTab("extensions")}>Extensions</button>
              <button className={settingsTab === "voice" ? "active" : "ghost"} onClick={() => setSettingsTab("voice")}>Voice</button>
              {canAccessServerAdminPanel && (
                <a href="/server-admin.html" target="_blank" style={{ display: "block", padding: "var(--space-sm) var(--space-md)", background: "rgba(149, 168, 205, 0.12)", border: "1px solid rgba(125, 164, 255, 0.25)", borderRadius: "calc(var(--radius) * 0.9)", color: "var(--text-main)", textDecoration: "none", textAlign: "center", fontWeight: "500", cursor: "pointer", fontSize: "0.95em" }}>🔧 Server Admin Panel</a>
              )}
              <button className="danger" onClick={() => setSettingsOpen(false)}>Close</button>
              <button className="danger" onClick={logout}>Log out</button>
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

                  <hr style={{ borderColor: "var(--border-subtle)", width: "100%" }} />
                  <h4>Full Profile (Boost)</h4>
                  <p className="hint">
                    Non-boost users automatically use avatar + banner + bio. Boost lets you fully customize layout, links, and text blocks.
                  </p>
                  <div
                    ref={fullProfileEditorCanvasRef}
                    className={`full-profile-canvas ${hasBoostForFullProfiles ? "" : "locked"}`}
                    style={{
                      background: fullProfileDraft?.theme?.background || "linear-gradient(150deg, #16274b, #0f1a33 65%)",
                      color: fullProfileDraft?.theme?.text || "#dfe9ff"
                    }}
                  >
                    <div
                      className="full-profile-canvas-card"
                      style={{ background: fullProfileDraft?.theme?.card || "rgba(9, 14, 28, 0.62)" }}
                    >
                      {(fullProfileDraft?.elements || [])
                        .slice()
                        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                        .map((element) => (
                          <div
                            key={element.id}
                            className={`full-profile-element full-profile-element-${element.type} ${fullProfileDraggingElementId === element.id ? "dragging" : ""}`}
                            style={{
                              left: `${element.x}%`,
                              top: `${element.y}%`,
                              width: `${element.w}%`,
                              height: `${element.h}%`
                            }}
                            onMouseDown={(event) => {
                              if (!hasBoostForFullProfiles) return;
                              onFullProfileElementMouseDown(event, element.id);
                            }}
                          >
                            {renderFullProfileElement(element, { ...(profile || {}), fullProfile: fullProfileDraft })}
                          </div>
                        ))}
                    </div>
                    {!hasBoostForFullProfiles && (
                      <div className="full-profile-lock-overlay">
                        <p>Boost required for full customization.</p>
                        <button type="button" onClick={() => openBoostUpsell("Boost required", "Custom full profiles are a Boost perk.", "Open billing")}>See Boost</button>
                      </div>
                    )}
                  </div>

                  <label>Canvas Background<input value={fullProfileDraft?.theme?.background || ""} onChange={(event) => setFullProfileDraft((current) => ({ ...current, mode: "custom", theme: { ...(current.theme || {}), background: event.target.value } }))} /></label>
                  <label>Card Surface<input value={fullProfileDraft?.theme?.card || ""} onChange={(event) => setFullProfileDraft((current) => ({ ...current, mode: "custom", theme: { ...(current.theme || {}), card: event.target.value } }))} /></label>
                  <label>Text Color<input value={fullProfileDraft?.theme?.text || ""} onChange={(event) => setFullProfileDraft((current) => ({ ...current, mode: "custom", theme: { ...(current.theme || {}), text: event.target.value } }))} /></label>

                  <div className="full-profile-editor-grid">
                    {(fullProfileDraft?.elements || []).map((element) => (
                      <div key={`editor-${element.id}`} className="full-profile-editor-item">
                        <div className="full-profile-editor-item-head">
                          <strong>{element.type}</strong>
                          {element.type === "text" && <button type="button" className="danger" onClick={() => removeFullProfileElement(element.id)}>Remove</button>}
                        </div>
                        {element.type === "text" && (
                          <input value={element.text || ""} onChange={(event) => updateFullProfileElement(element.id, { text: event.target.value })} placeholder="Text content" />
                        )}
                        <div className="full-profile-editor-item-row">
                          <label>X<input type="number" min={0} max={100} value={Math.round(element.x)} onChange={(event) => updateFullProfileElement(element.id, { x: clampProfilePercent(event.target.value, 0, 100, element.x) })} /></label>
                          <label>Y<input type="number" min={0} max={100} value={Math.round(element.y)} onChange={(event) => updateFullProfileElement(element.id, { y: clampProfilePercent(event.target.value, 0, 100, element.y) })} /></label>
                          <label>W<input type="number" min={1} max={100} value={Math.round(element.w)} onChange={(event) => updateFullProfileElement(element.id, { w: clampProfilePercent(event.target.value, 1, 100, element.w) })} /></label>
                          <label>H<input type="number" min={1} max={100} value={Math.round(element.h)} onChange={(event) => updateFullProfileElement(element.id, { h: clampProfilePercent(event.target.value, 1, 100, element.h) })} /></label>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="row-actions" style={{ width: "100%" }}>
                    <button type="button" className="ghost" onClick={addFullProfileTextBlock}>Add Text Block</button>
                    <button type="button" className="ghost" onClick={resetFullProfileDraftToBasic}>Reset to Default</button>
                  </div>

                  <h5 style={{ margin: "0.25rem 0" }}>Links</h5>
                  {(fullProfileDraft?.links || []).map((link) => (
                    <div key={link.id} className="full-profile-link-editor">
                      <input value={link.label || ""} placeholder="Label" onChange={(event) => updateFullProfileLink(link.id, { label: event.target.value })} />
                      <input value={link.url || ""} placeholder="https://..." onChange={(event) => updateFullProfileLink(link.id, { url: event.target.value })} />
                      <button type="button" className="danger" onClick={() => removeFullProfileLink(link.id)}>Remove</button>
                    </div>
                  ))}
                  <div className="row-actions" style={{ width: "100%" }}>
                    <button type="button" className="ghost" onClick={addFullProfileLink}>Add Link</button>
                    <button type="button" onClick={saveFullProfileDraft}>Save Full Profile</button>
                  </div>

                  <hr style={{ borderColor: "var(--border-subtle)", width: "100%" }} />
                  <h4>Rich Presence (RPC-style)</h4>
                  <p className="hint">No app ID needed. Set activity text, image URLs, and optional buttons.</p>
                  <label>Activity Name<input value={rpcForm.name} onChange={(event) => setRpcForm((current) => ({ ...current, name: event.target.value }))} placeholder="Playing OpenCom" /></label>
                  <label>Details<input value={rpcForm.details} onChange={(event) => setRpcForm((current) => ({ ...current, details: event.target.value }))} placeholder="In a voice channel" /></label>
                  <label>State<input value={rpcForm.state} onChange={(event) => setRpcForm((current) => ({ ...current, state: event.target.value }))} placeholder="With friends" /></label>
                  <label>Large Image URL<input value={rpcForm.largeImageUrl} onChange={(event) => setRpcForm((current) => ({ ...current, largeImageUrl: event.target.value }))} placeholder="https://..." /></label>
                  <label>Upload Large Image<input type="file" accept="image/*" onChange={(event) => onImageFieldUpload(event, "large image", (imageUrl) => setRpcForm((current) => ({ ...current, largeImageUrl: imageUrl })))} /></label>
                  <label>Large Image Text<input value={rpcForm.largeImageText} onChange={(event) => setRpcForm((current) => ({ ...current, largeImageText: event.target.value }))} placeholder="Tooltip text" /></label>
                  <label>Small Image URL<input value={rpcForm.smallImageUrl} onChange={(event) => setRpcForm((current) => ({ ...current, smallImageUrl: event.target.value }))} placeholder="https://..." /></label>
                  <label>Upload Small Image<input type="file" accept="image/*" onChange={(event) => onImageFieldUpload(event, "small image", (imageUrl) => setRpcForm((current) => ({ ...current, smallImageUrl: imageUrl })))} /></label>
                  <label>Small Image Text<input value={rpcForm.smallImageText} onChange={(event) => setRpcForm((current) => ({ ...current, smallImageText: event.target.value }))} placeholder="Tooltip text" /></label>
                  <label>Button 1 Label<input value={rpcForm.button1Label} onChange={(event) => setRpcForm((current) => ({ ...current, button1Label: event.target.value }))} placeholder="Watch" /></label>
                  <label>Button 1 URL<input value={rpcForm.button1Url} onChange={(event) => setRpcForm((current) => ({ ...current, button1Url: event.target.value }))} placeholder="https://..." /></label>
                  <label>Button 2 Label<input value={rpcForm.button2Label} onChange={(event) => setRpcForm((current) => ({ ...current, button2Label: event.target.value }))} placeholder="Join" /></label>
                  <label>Button 2 URL<input value={rpcForm.button2Url} onChange={(event) => setRpcForm((current) => ({ ...current, button2Url: event.target.value }))} placeholder="https://..." /></label>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <button onClick={saveRichPresence}>Save Rich Presence</button>
                    <button className="ghost" onClick={clearRichPresence}>Clear</button>
                  </div>
                </div>
              )}

              {settingsTab === "server" && (
                <>
                  {activeServer && canManageServer && (
                    <section className="card">
                      <h4>Server Branding</h4>
                      <input
                        placeholder="Server name"
                        value={serverProfileForm.name ?? ""}
                        onChange={(e) => setServerProfileForm((current) => ({ ...current, name: e.target.value }))}
                      />
                      <input
                        placeholder="Logo URL"
                        value={serverProfileForm.logoUrl ?? ""}
                        onChange={(e) => setServerProfileForm((current) => ({ ...current, logoUrl: e.target.value }))}
                      />
                      <label>Upload Logo<input type="file" accept="image/*" onChange={(event) => onImageFieldUpload(event, "server logo", (imageUrl) => setServerProfileForm((current) => ({ ...current, logoUrl: imageUrl })))} /></label>
                      <input
                        placeholder="Banner URL"
                        value={serverProfileForm.bannerUrl ?? ""}
                        onChange={(e) => setServerProfileForm((current) => ({ ...current, bannerUrl: e.target.value }))}
                      />
                      <label>Upload Banner<input type="file" accept="image/*" onChange={(event) => onImageFieldUpload(event, "server banner", (imageUrl) => setServerProfileForm((current) => ({ ...current, bannerUrl: imageUrl })))} /></label>
                      <button onClick={saveActiveServerProfile}>Save Server Profile</button>
                    </section>
                  )}

                  <section className="card">
                    <h4>Add Server Provider</h4>
                    <input placeholder="Server name" value={newServerName ?? ""} onChange={(e) => setNewServerName(e.target.value)} />
                    <input placeholder="https://node.provider.tld" value={newServerBaseUrl ?? "https://"} onChange={(e) => setNewServerBaseUrl(e.target.value)} />
                    <input placeholder="Logo URL (.png/.jpg/.webp/.svg)" value={newServerLogoUrl ?? ""} onChange={(e) => setNewServerLogoUrl(e.target.value)} />
                    <label>Upload Logo<input type="file" accept="image/*" onChange={(event) => onImageFieldUpload(event, "server logo", setNewServerLogoUrl)} /></label>
                    <input placeholder="Banner URL (optional)" value={newServerBannerUrl ?? ""} onChange={(e) => setNewServerBannerUrl(e.target.value)} />
                    <label>Upload Banner<input type="file" accept="image/*" onChange={(event) => onImageFieldUpload(event, "server banner", setNewServerBannerUrl)} /></label>
                    <button onClick={createServer} disabled={!newServerName.trim() || !newServerBaseUrl.trim() || !newServerLogoUrl.trim()}>Add Server</button>
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
                      <h4>Custom Emotes</h4>
                      <p className="hint">Use emotes in chat with <code>:name:</code>.</p>
                      <input
                        placeholder="Emote name (example: hype)"
                        value={newServerEmoteName}
                        onChange={(event) => setNewServerEmoteName(event.target.value)}
                      />
                      <input
                        placeholder="Emote image URL (.png/.gif/.webp/.svg)"
                        value={newServerEmoteUrl}
                        onChange={(event) => setNewServerEmoteUrl(event.target.value)}
                      />
                      <label>Upload Emote Image<input type="file" accept="image/*" onChange={(event) => onImageFieldUpload(event, "emote image", setNewServerEmoteUrl)} /></label>
                      <button onClick={createServerEmote}>Create Emote</button>
                      <ul className="channel-perms-role-list" style={{ marginTop: "10px" }}>
                        {(guildState?.emotes || []).map((emote) => (
                          <li key={emote.id}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                              <img className="message-custom-emote" src={emote.imageUrl || emote.image_url} alt={emote.name} />
                              <code>:{emote.name}:</code>
                            </span>
                            <button className="ghost" style={{ marginLeft: "8px" }} onClick={() => removeServerEmote(emote.id)}>Remove</button>
                          </li>
                        ))}
                      </ul>
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

              {settingsTab === "moderation" && canModerateMembers && (
                <>
                  <section className="card">
                    <h4>Member moderation</h4>
                    <p className="hint">Kick removes a member from this guild. Ban removes and blocks rejoin until unbanned.</p>
                    <select value={moderationMemberId} onChange={(event) => setModerationMemberId(event.target.value)}>
                      <option value="">Select member</option>
                      {resolvedMemberList
                        .filter((member) => member.id !== me?.id)
                        .map((member) => <option key={member.id} value={member.id}>{member.username}</option>)}
                    </select>
                    {canBanMembers && (
                      <input
                        placeholder="Ban reason (optional)"
                        value={moderationBanReason}
                        onChange={(event) => setModerationBanReason(event.target.value)}
                      />
                    )}
                    <div className="row-actions">
                      {canKickMembers && <button disabled={!moderationMemberId || moderationBusy} onClick={() => kickMember(moderationMemberId)}>Kick Member</button>}
                      {canBanMembers && <button className="danger" disabled={!moderationMemberId || moderationBusy} onClick={() => banMember(moderationMemberId, moderationBanReason)}>Ban Member</button>}
                    </div>
                  </section>

                  {canBanMembers && (
                    <section className="card">
                      <h4>Unban user</h4>
                      <p className="hint">Paste a user ID and remove their ban record.</p>
                      <input
                        placeholder="User ID to unban"
                        value={moderationUnbanUserId}
                        onChange={(event) => setModerationUnbanUserId(event.target.value)}
                      />
                      <button disabled={!moderationUnbanUserId.trim() || moderationBusy} onClick={() => unbanMember(moderationUnbanUserId.trim())}>Unban User</button>
                    </section>
                  )}
                </>
              )}

              {settingsTab === "invites" && (
                <>
                  <section className="card">
                    <h4>Join Server</h4>
                    <input placeholder="Paste invite code or join link" value={joinInviteCode} onChange={(event) => setJoinInviteCode(event.target.value)} />
                    <div className="row-actions">
                      <button className="ghost" onClick={previewInvite}>Preview</button>
                      <button onClick={() => joinInvite(invitePendingCode || joinInviteCode)}>Accept Invite</button>
                    </div>
                    {invitePreview && <p className="hint">Invite: {invitePreview.code} · Server: {invitePreview.serverName || invitePreview.server_id} · Uses: {invitePreview.uses}</p>}
                  </section>

                  <section className="card">
                    <h4>Create Invite</h4>
                    <p className="hint">Boost perk: custom code + permanent invite links (example: <code>/join/Open</code>).</p>
                    <select value={inviteServerId} onChange={(event) => setInviteServerId(event.target.value)}>
                      <option value="">Select server</option>
                      {servers.map((server) => <option key={server.id} value={server.id}>{server.name}</option>)}
                    </select>
                    <input
                      placeholder="Custom code (Boost perk, optional)"
                      value={inviteCustomCode}
                      onChange={(event) => setInviteCustomCode(event.target.value)}
                      onFocus={() => {
                        if (boostStatus && !boostStatus.active) {
                          showBoostUpsell("Custom invite codes require OpenCom Boost.");
                        }
                      }}
                    />
                    <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <input
                        type="checkbox"
                        checked={invitePermanent}
                        onChange={(event) => {
                          if (event.target.checked && boostStatus && !boostStatus.active) {
                            showBoostUpsell("Permanent invite links require OpenCom Boost.");
                            return;
                          }
                          setInvitePermanent(event.target.checked);
                        }}
                      />
                      Permanent invite (Boost perk)
                    </label>
                    <button onClick={createInvite}>Generate Invite</button>
                    {inviteCode && (
                      <>
                        <p className="hint">Code: <code>{inviteCode}</code></p>
                        <p className="hint">Invite link (share this):</p>
                        <div className="invite-link-row">
                          <input readOnly className="invite-link-input" value={inviteJoinUrl || buildInviteJoinUrl(inviteCode)} />
                          <button type="button" onClick={() => { const u = inviteJoinUrl || buildInviteJoinUrl(inviteCode); navigator.clipboard.writeText(u).then(() => setStatus("Invite link copied.")).catch(() => setStatus("Could not copy.")); }}>Copy link</button>
                        </div>
                      </>
                    )}
                  </section>
                </>
              )}

              {settingsTab === "extensions" && (
                <>
                  <section className="card">
                    <h4>Client Extensions</h4>
                    <p className="hint">Enable reviewed client-only extensions from the catalog. Extensions run in your client session.</p>
                    {!clientExtensionCatalog.length ? (
                      <p className="hint">No client extensions found in the catalog.</p>
                    ) : (
                      <ul className="channel-perms-role-list">
                        {clientExtensionCatalog.map((ext) => {
                          const checked = enabledClientExtensions.includes(ext.id);
                          return (
                            <li key={ext.id}>
                              <label>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(event) => toggleClientExtension(ext.id, event.target.checked)}
                                />
                                <strong>{ext.name}</strong>
                                <span className="hint"> · {ext.id} · {ext.version || "0.1.0"}</span>
                                <span className="hint" style={{ marginLeft: "6px", color: checked ? "#4ec97e" : "#f0a4a4" }}>
                                  {checked ? "Enabled" : "Disabled"}
                                </span>
                              </label>
                              {ext.description && <p className="hint" style={{ margin: "4px 0 0 24px" }}>{ext.description}</p>}
                              {clientExtensionLoadState[ext.id] && <p className="hint" style={{ margin: "2px 0 0 24px" }}>Status: {clientExtensionLoadState[ext.id]}</p>}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>

                  <section className="card">
                    <h4>Developer Mode</h4>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <input
                        type="checkbox"
                        checked={clientExtensionDevMode}
                        onChange={(event) => setClientExtensionDevMode(event.target.checked)}
                      />
                      Enable local/testing extension URLs
                    </label>
                    <p className="hint">Use this while developing extensions. Add one URL per extension entry script.</p>

                    {clientExtensionDevMode && (
                      <>
                        <div className="row-actions" style={{ marginTop: "8px" }}>
                          <input
                            placeholder="http://localhost:5174/my-extension.js"
                            value={newClientExtensionDevUrl}
                            onChange={(event) => setNewClientExtensionDevUrl(event.target.value)}
                            style={{ flex: 1 }}
                          />
                          <button onClick={addClientDevExtensionUrl}>Add URL</button>
                        </div>

                        <ul className="channel-perms-role-list" style={{ marginTop: "10px" }}>
                          {clientExtensionDevUrls.map((url) => (
                            <li key={url}>
                              <span style={{ wordBreak: "break-all" }}>{url}</span>
                              <button
                                className="ghost"
                                style={{ marginLeft: "8px" }}
                                onClick={() => setClientExtensionDevUrls((current) => current.filter((item) => item !== url))}
                              >
                                Remove
                              </button>
                              {clientExtensionLoadState[`dev:${url}`] && <p className="hint" style={{ margin: "4px 0 0 0" }}>Status: {clientExtensionLoadState[`dev:${url}`]}</p>}
                            </li>
                          ))}
                        </ul>
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
                  <div className="row-actions" style={{ width: "100%", marginTop: "0.5rem" }}>
                    <button type="button" className="ghost" onClick={() => window.open("/theme-catalog.html", "_blank", "noopener,noreferrer")}>
                      Open Theme Catalogue
                    </button>
                    <button type="button" className="ghost" onClick={() => window.open("/theme-creator.html", "_blank", "noopener,noreferrer")}>
                      Open Theme Creator
                    </button>
                  </div>
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
                  <label>
                    <input
                      type="checkbox"
                      checked={noiseSuppressionEnabled}
                      onChange={(event) => setNoiseSuppressionEnabled(event.target.checked)}
                    />
                    {" "}
                    Noise Suppression
                  </label>
                  {localAudioProcessingInfo && (
                    <p className="hint">
                      Noise suppression requested: {localAudioProcessingInfo.requested?.noiseSuppression ? "On" : "Off"}
                      {" · "}
                      applied: {localAudioProcessingInfo.applied?.noiseSuppression == null ? "Unknown" : localAudioProcessingInfo.applied.noiseSuppression ? "On" : "Off"}
                      {!localAudioProcessingInfo.supported?.noiseSuppression ? " (not supported by this browser/device)" : ""}
                    </p>
                  )}
                  <p className="hint">Hotkeys: Ctrl/Cmd+Shift+M mute, Ctrl/Cmd+Shift+D deafen, Ctrl/Cmd+Shift+V screen share, Ctrl/Cmd+Shift+X disconnect, Ctrl/Cmd+Shift+, settings.</p>
                  <p className="hint">Tip: allow microphone permissions so device names show properly.</p>
                </section>
              )}

              {settingsTab === "billing" && (
                <section className="card boost-card">
                  <div className="boost-hero">
                    <span className={`boost-pill ${boostStatus?.active ? "active" : ""}`}>
                      {boostStatus?.active ? "BOOST ACTIVE" : "BOOST INACTIVE"}
                    </span>
                    <h4>OpenCom Boost</h4>
                    <p className="hint">Unlock custom invite codes, permanent invite links, and higher limits.</p>
                  </div>
                  <div className="boost-grid">
                    <div className="boost-price">
                      <strong>£10</strong>
                      <span>/ month</span>
                    </div>
                    <ul className="boost-perks">
                      <li>Custom invite code slugs</li>
                      <li>Permanent invite links</li>
                      <li>100MB upload limit</li>
                      <li>Unlimited servers</li>
                    </ul>
                  </div>
                  {boostLoading && <p className="hint">Loading billing status…</p>}
                  {boostStatus && (
                    <p className="hint">
                      Status: {boostStatus.active ? "Active" : "Inactive"}
                      {boostStatus.currentPeriodEnd ? ` · Renews ${new Date(boostStatus.currentPeriodEnd).toLocaleDateString()}` : ""}
                    </p>
                  )}
                  {boostStatus && !boostStatus.stripeConfigured && (
                    <p className="hint">Stripe is not configured on this server yet.</p>
                  )}
                  <div className="row-actions boost-actions">
                    <button onClick={startBoostCheckout}>Get Boost</button>
                    <button className="ghost" onClick={openBoostPortal}>Manage</button>
                    <button className="ghost" onClick={loadBoostStatus}>Refresh</button>
                  </div>

                  <hr className="boost-divider" />
                  <div className="boost-gift-head">
                    <h5>Gift Boost (1 month)</h5>
                    <p className="hint">Buy a one-month gift link and send it to a friend.</p>
                  </div>
                  <div className="row-actions boost-actions boost-gift-actions">
                    <button onClick={startBoostGiftCheckout} disabled={boostGiftCheckoutBusy}>
                      {boostGiftCheckoutBusy ? "Opening checkout…" : "Buy Gift (£10)"}
                    </button>
                    <button className="ghost" onClick={loadSentBoostGifts}>Refresh Gifts</button>
                  </div>

                  <div className="invite-link-row">
                    <input
                      className="invite-link-input"
                      placeholder="Paste boost gift link or code"
                      value={boostGiftCode}
                      onChange={(event) => setBoostGiftCode(event.target.value)}
                    />
                    <button type="button" onClick={() => previewBoostGift(boostGiftCode)} disabled={boostGiftLoading}>
                      {boostGiftLoading ? "Checking…" : "Preview"}
                    </button>
                  </div>

                  {boostGiftPreview && (
                    <div className="boost-gift-preview">
                      <p className="hint">
                        Gift from <strong>{boostGiftPreview.from?.username || "someone"}</strong> · {boostGiftPreview.grantDays} day(s)
                      </p>
                      <p className="hint">Expires {new Date(boostGiftPreview.expiresAt).toLocaleDateString()}</p>
                      <button onClick={() => setBoostGiftPrompt(boostGiftPreview)}>Redeem Gift</button>
                    </div>
                  )}

                  {boostGiftSent.length > 0 && (
                    <div className="boost-gift-list">
                      <p className="hint">Your recent gifts</p>
                      {boostGiftSent.slice(0, 5).map((gift) => (
                        <div key={gift.id} className="boost-gift-row">
                          <span>{gift.status.toUpperCase()}</span>
                          <input readOnly value={gift.joinUrl || buildBoostGiftUrl(gift.code)} />
                          <button
                            type="button"
                            onClick={() => {
                              const link = gift.joinUrl || buildBoostGiftUrl(gift.code);
                              navigator.clipboard.writeText(link).then(() => setStatus("Gift link copied.")).catch(() => setStatus("Could not copy gift link."));
                            }}
                          >
                            Copy
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
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
                    <button
                      className="danger"
                      onClick={async () => {
                        const approved = await confirmDialog("Are you absolutely sure? This cannot be undone.", "Delete Account");
                        if (approved) setStatus("Account deletion request submitted for review.");
                      }}
                    >
                      Delete Account Permanently
                    </button>
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
