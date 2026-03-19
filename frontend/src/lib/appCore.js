import { useEffect, useState } from "react";
import {
  VOICE_NOISE_SUPPRESSION_DEFAULT_PRESET,
  VOICE_NOISE_SUPPRESSION_PRESETS,
} from "../voice/sfuClient";

export function resolveCoreApiBase() {
  const fromEnv = String(import.meta.env.VITE_CORE_API_URL || "").trim();
  let fromQuery = "";
  if (typeof window !== "undefined") {
    const qp = new URLSearchParams(window.location.search || "");
    fromQuery = String(qp.get("coreApi") || "").trim();
  }
  const candidate = fromEnv || fromQuery || "https://api.opencom.online";
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      return "https://api.opencom.online";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return "https://api.opencom.online";
  }
}

export const CORE_API = resolveCoreApiBase();

export function isLoopbackHostname(hostname = "") {
  const normalized = String(hostname || "")
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
  if (!normalized) return false;
  return (
    normalized === "localhost" ||
    normalized === "::1" ||
    normalized === "0:0:0:0:0:0:0:1" ||
    normalized === "0.0.0.0" ||
    normalized.startsWith("127.")
  );
}

export function shouldAllowLoopbackTargets() {
  if (typeof window === "undefined") return true;
  if (window.location.protocol === "file:") return true;
  const currentHost = String(window.location.hostname || "")
    .trim()
    .toLowerCase();
  return isLoopbackHostname(currentHost) || currentHost.endsWith(".localhost");
}

export function normalizeHttpBaseUrl(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

export function gatewayUrlToHttpBaseUrl(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === "ws:") parsed.protocol = "http:";
    else if (parsed.protocol === "wss:") parsed.protocol = "https:";
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    parsed.search = "";
    parsed.hash = "";
    parsed.pathname = parsed.pathname.replace(/\/gateway\/?$/i, "");
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

export function resolvePublicNodeBaseUrl() {
  const explicit = normalizeHttpBaseUrl(
    import.meta.env.VITE_OFFICIAL_NODE_BASE_URL ||
      import.meta.env.OFFICIAL_NODE_BASE_URL ||
      "",
  );
  if (explicit) return explicit;
  const wsCandidates = [
    import.meta.env.VITE_NODE_GATEWAY_WS_URL,
    import.meta.env.VITE_VOICE_GATEWAY_URL,
  ];
  for (const candidate of wsCandidates) {
    const derived = gatewayUrlToHttpBaseUrl(candidate);
    if (derived) return derived;
  }
  return "";
}

export const PUBLIC_NODE_BASE_URL = resolvePublicNodeBaseUrl();

export function normalizeServerBaseUrl(baseUrl = "") {
  const normalized = normalizeHttpBaseUrl(baseUrl);
  if (!normalized) return "";
  try {
    const parsed = new URL(normalized);
    if (isLoopbackHostname(parsed.hostname)) {
      if (PUBLIC_NODE_BASE_URL) return PUBLIC_NODE_BASE_URL;
      if (!shouldAllowLoopbackTargets()) return "";
    }
  } catch {
    return normalized;
  }
  return normalized;
}

export function normalizeServerRecord(server) {
  if (!server || typeof server !== "object") return server;
  const currentBaseUrl = String(server.baseUrl ?? server.base_url ?? "").trim();
  if (!currentBaseUrl) return server;
  const normalizedBaseUrl = normalizeServerBaseUrl(currentBaseUrl);
  if (normalizedBaseUrl === currentBaseUrl) return server;
  if (!normalizedBaseUrl) {
    const next = { ...server, baseUrl: "" };
    if (Object.prototype.hasOwnProperty.call(server, "base_url")) {
      next.base_url = "";
    }
    return next;
  }
  const next = { ...server, baseUrl: normalizedBaseUrl };
  if (Object.prototype.hasOwnProperty.call(server, "base_url")) {
    next.base_url = normalizedBaseUrl;
  }
  return next;
}

export function normalizeServerList(list) {
  if (!Array.isArray(list)) return [];
  return list.map((server) => normalizeServerRecord(server)).filter(Boolean);
}

export function profileImageUrl(url) {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (
    !trimmed ||
    trimmed === "null" ||
    trimmed === "undefined" ||
    trimmed === "[object Object]"
  )
    return null;
  url = trimmed;
  if (url.startsWith("data:")) return url;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("users/"))
    return `${CORE_API.replace(/\/$/, "")}/v1/profile-images/${url}`;
  if (url.startsWith("/users/"))
    return `${CORE_API.replace(/\/$/, "")}/v1/profile-images${url}`;
  if (url.startsWith("/")) return `${CORE_API.replace(/\/$/, "")}${url}`;
  return url;
}

export function createBasicFullProfile(profileData = {}) {
  const hasBio = !!String(profileData?.bio || "").trim();
  return {
    version: 1,
    mode: "basic",
    enabled: true,
    theme: {
      background: "linear-gradient(150deg, #16274b, #0f1a33 65%)",
      card: "rgba(9, 14, 28, 0.62)",
      text: "#dfe9ff",
      accent: "#9bb6ff",
      fontPreset: "sans",
    },
    elements: [
      {
        id: "banner",
        type: "banner",
        x: 0,
        y: 0,
        w: 100,
        h: 34,
        order: 0,
        radius: 0,
        opacity: 100,
        fontSize: 16,
        align: "left",
        color: "",
      },
      {
        id: "avatar",
        type: "avatar",
        x: 4,
        y: 21,
        w: 20,
        h: 31,
        order: 1,
        radius: 18,
        opacity: 100,
        fontSize: 16,
        align: "left",
        color: "",
      },
      {
        id: "name",
        type: "name",
        x: 30,
        y: 30,
        w: 66,
        h: 10,
        order: 2,
        radius: 8,
        opacity: 100,
        fontSize: 22,
        align: "left",
        color: "",
      },
      {
        id: "bio",
        type: "bio",
        x: 4,
        y: 54,
        w: 92,
        h: hasBio ? 30 : 18,
        order: 3,
        radius: 8,
        opacity: 100,
        fontSize: 14,
        align: "left",
        color: "",
      },
    ],
    links: [],
    music: { url: "", autoplay: false, loop: true, volume: 60 },
  };
}

export function clampProfilePercent(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

export function clampProfileElementRect(rect = {}, fallback = {}) {
  const fallbackWidth = clampProfilePercent(fallback.w, 1, 100, 20);
  const fallbackHeight = clampProfilePercent(fallback.h, 1, 100, 12);
  const w = clampProfilePercent(rect.w, 1, 100, fallbackWidth);
  const h = clampProfilePercent(rect.h, 1, 100, fallbackHeight);
  const maxX = Math.max(0, 100 - w);
  const maxY = Math.max(0, 100 - h);
  const fallbackX = clampProfilePercent(fallback.x, 0, maxX, 0);
  const fallbackY = clampProfilePercent(fallback.y, 0, maxY, 0);
  const x = clampProfilePercent(rect.x, 0, maxX, fallbackX);
  const y = clampProfilePercent(rect.y, 0, maxY, fallbackY);
  return { x, y, w, h };
}

export function getContextMenuPoint(clientX, clientY, options = {}) {
  const padding = Number.isFinite(Number(options.padding))
    ? Math.max(0, Number(options.padding))
    : 8;
  const menuWidth = Number.isFinite(Number(options.width))
    ? Math.max(1, Number(options.width))
    : 240;
  const menuHeight = Number.isFinite(Number(options.height))
    ? Math.max(1, Number(options.height))
    : 240;
  const viewportWidth =
    typeof window !== "undefined" ? window.innerWidth : 1280;
  const viewportHeight =
    typeof window !== "undefined" ? window.innerHeight : 720;
  const maxX = Math.max(padding, viewportWidth - menuWidth - padding);
  const maxY = Math.max(padding, viewportHeight - menuHeight - padding);
  return {
    x: Math.max(padding, Math.min(Number(clientX) || 0, maxX)),
    y: Math.max(padding, Math.min(Number(clientY) || 0, maxY)),
  };
}

export function clampProfileCardPosition(left, top, options = {}) {
  const padding = Number.isFinite(Number(options.padding))
    ? Math.max(0, Number(options.padding))
    : 8;
  const cardWidth = Number.isFinite(Number(options.width))
    ? Math.max(1, Number(options.width))
    : 320;
  const cardHeight = Number.isFinite(Number(options.height))
    ? Math.max(1, Number(options.height))
    : 280;
  const viewportWidth =
    typeof window !== "undefined" ? window.innerWidth : 1280;
  const viewportHeight =
    typeof window !== "undefined" ? window.innerHeight : 720;
  const maxX = Math.max(padding, viewportWidth - cardWidth - padding);
  const maxY = Math.max(padding, viewportHeight - cardHeight - padding);
  return {
    x: Math.max(padding, Math.min(Number(left) || 0, maxX)),
    y: Math.max(padding, Math.min(Number(top) || 0, maxY)),
  };
}

export function normalizeFullProfile(profileData = {}, fullProfileCandidate) {
  const basic = createBasicFullProfile(profileData);
  const raw =
    fullProfileCandidate && typeof fullProfileCandidate === "object"
      ? fullProfileCandidate
      : {};

  const themeInput =
    raw.theme && typeof raw.theme === "object" ? raw.theme : {};
  const fontPresetRaw = String(themeInput.fontPreset || "")
    .trim()
    .toLowerCase();
  const fontPreset = ["sans", "serif", "mono", "display"].includes(
    fontPresetRaw,
  )
    ? fontPresetRaw
    : basic.theme.fontPreset;
  const theme = {
    background:
      typeof themeInput.background === "string" && themeInput.background.trim()
        ? themeInput.background.trim().slice(0, 300)
        : basic.theme.background,
    card:
      typeof themeInput.card === "string" && themeInput.card.trim()
        ? themeInput.card.trim().slice(0, 120)
        : basic.theme.card,
    text:
      typeof themeInput.text === "string" && themeInput.text.trim()
        ? themeInput.text.trim().slice(0, 40)
        : basic.theme.text,
    accent:
      typeof themeInput.accent === "string" && themeInput.accent.trim()
        ? themeInput.accent.trim().slice(0, 40)
        : basic.theme.accent,
    fontPreset,
  };

  const rawElements = Array.isArray(raw.elements) ? raw.elements : [];
  const elements = rawElements
    .filter((item) => item && typeof item === "object")
    .slice(0, 24)
    .map((item, index) => {
      const type = String(item.type || "").toLowerCase();
      if (
        !["avatar", "banner", "name", "bio", "links", "text", "music"].includes(
          type,
        )
      )
        return null;
      const defaults = {
        x: type === "banner" ? 0 : type === "music" ? 74 : 5,
        y: type === "banner" ? 0 : 5 + index * 8,
        w:
          type === "banner"
            ? 100
            : type === "avatar"
              ? 20
              : type === "music"
                ? 22
                : 80,
        h:
          type === "banner"
            ? 34
            : type === "avatar"
              ? 31
              : type === "music"
                ? 9
                : 12,
      };
      const rect = clampProfileElementRect(
        { x: item.x, y: item.y, w: item.w, h: item.h },
        defaults,
      );
      const alignRaw = String(item.align || "")
        .trim()
        .toLowerCase();
      const align =
        alignRaw === "center" || alignRaw === "right" ? alignRaw : "left";
      const defaultFontSize =
        type === "name"
          ? 22
          : type === "bio"
            ? 14
            : type === "links"
              ? 14
              : type === "music"
                ? 12
                : 16;
      return {
        id: String(item.id || `${type}-${index + 1}`).slice(0, 40),
        type,
        ...rect,
        order: Math.max(
          0,
          Math.min(
            100,
            Number.isFinite(Number(item.order))
              ? Math.round(Number(item.order))
              : index,
          ),
        ),
        text: typeof item.text === "string" ? item.text.slice(0, 500) : "",
        radius: Math.round(
          clampProfilePercent(
            item.radius,
            0,
            40,
            type === "avatar" ? 18 : type === "banner" ? 0 : 8,
          ),
        ),
        opacity: Math.round(clampProfilePercent(item.opacity, 20, 100, 100)),
        fontSize: Math.round(
          clampProfilePercent(item.fontSize, 10, 72, defaultFontSize),
        ),
        align,
        color:
          typeof item.color === "string" && item.color.trim()
            ? item.color.trim().slice(0, 40)
            : "",
      };
    })
    .filter(Boolean);

  const rawLinks = Array.isArray(raw.links) ? raw.links : [];
  const links = rawLinks
    .filter((item) => item && typeof item === "object")
    .slice(0, 16)
    .map((item, index) => {
      const label = String(item.label || "")
        .trim()
        .slice(0, 40);
      const url = String(item.url || "")
        .trim()
        .slice(0, 500);
      if (!label || !/^https?:\/\//i.test(url)) return null;
      return {
        id: String(item.id || `link-${index + 1}`).slice(0, 40),
        label,
        url,
        x: clampProfilePercent(item.x, 0, 100, 0),
        y: clampProfilePercent(item.y, 0, 100, 0),
      };
    })
    .filter(Boolean);

  const rawMusic = raw.music && typeof raw.music === "object" ? raw.music : {};
  const candidateMusicUrl = String(rawMusic.url || "")
    .trim()
    .slice(0, 500);
  const music = {
    url: /^(https?:\/\/|\/|users\/)/i.test(candidateMusicUrl)
      ? candidateMusicUrl
      : "",
    autoplay: !!rawMusic.autoplay,
    loop: rawMusic.loop !== false,
    volume: Math.max(
      0,
      Math.min(
        100,
        Number.isFinite(Number(rawMusic.volume))
          ? Math.round(Number(rawMusic.volume))
          : 60,
      ),
    ),
  };

  return {
    version: 1,
    mode: raw.mode === "custom" ? "custom" : "basic",
    enabled: raw.enabled !== false,
    theme,
    elements: elements.length ? elements : basic.elements,
    links,
    music,
  };
}

export const THEME_STORAGE_KEY = "opencom_custom_theme_css";
export const THEME_ENABLED_STORAGE_KEY = "opencom_custom_theme_enabled";
export const SELF_STATUS_KEY = "opencom_self_status";
export const PINNED_DM_KEY = "opencom_pinned_dm_messages";
export const ACTIVE_DM_KEY = "opencom_active_dm";
export const GATEWAY_DEVICE_ID_KEY = "opencom_gateway_device_id";
export const MIC_GAIN_KEY = "opencom_mic_gain";
export const MIC_SENSITIVITY_KEY = "opencom_mic_sensitivity";
export const AUDIO_INPUT_DEVICE_KEY = "opencom_audio_input_device";
export const AUDIO_OUTPUT_DEVICE_KEY = "opencom_audio_output_device";
export const NOISE_SUPPRESSION_KEY = "opencom_noise_suppression";
export const NOISE_SUPPRESSION_PRESET_KEY = "opencom_noise_suppression_preset";
export const NOISE_SUPPRESSION_CONFIG_KEY = "opencom_noise_suppression_config";
export const VOICE_NOISE_CANCELLATION_MODE_KEY =
  "opencom_noise_cancellation_mode";
export const VOICE_MEMBER_AUDIO_PREFS_KEY = "opencom_voice_member_audio_prefs";
// Kept for backward compatibility with any persisted/runtime references from older bundles.
export const SERVER_VOICE_GATEWAY_PREFS_KEY =
  "opencom_server_voice_gateway_prefs";
export const LAST_CORE_GATEWAY_KEY = "opencom_last_core_gateway";
export const LAST_SERVER_GATEWAY_KEY = "opencom_last_server_gateway";
export const FALLBACK_CORE_GATEWAY_WS_URL = "wss://ws.opencom.online/gateway";
export const DEBUG_VOICE_STORAGE_KEY = "opencom_debug_voice";
export const CLIENT_EXTENSIONS_ENABLED_KEY = "opencom_client_extensions_enabled";
export const CLIENT_EXTENSIONS_DEV_MODE_KEY =
  "opencom_client_extensions_dev_mode";
export const CLIENT_EXTENSIONS_DEV_URLS_KEY =
  "opencom_client_extensions_dev_urls";
export const ACCESS_TOKEN_KEY = "opencom_access_token";
export const REFRESH_TOKEN_KEY = "opencom_refresh_token";
export const PENDING_INVITE_CODE_KEY = "opencom_pending_invite_code";
export const PENDING_INVITE_AUTO_JOIN_KEY = "opencom_pending_invite_auto_join";
export const MESSAGE_PAGE_SIZE = 50;
export const MESSAGE_HISTORY_PREFETCH_REMAINING_COUNT = 10;
export const MESSAGE_HISTORY_PREFETCH_THRESHOLD_PX =
  MESSAGE_HISTORY_PREFETCH_REMAINING_COUNT * 56;

export const GUILD_PERM = {
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
  ADMINISTRATOR: 1n << 60n,
};

export function parsePermissionBits(value) {
  try {
    if (typeof value === "bigint") return value;
    if (typeof value === "number") return BigInt(value);
    if (typeof value === "string" && value.trim()) return BigInt(value.trim());
    return 0n;
  } catch {
    return 0n;
  }
}

export function toIsoTimestamp(value) {
  if (value == null || value === "") return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
}

export function toTimestampMs(value) {
  const ms = new Date(value || "").getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export function mergeMessagesChronologically(
  existing = [],
  incoming = [],
  getTimestamp,
) {
  const byId = new Map();
  for (const message of existing || []) {
    if (!message?.id) continue;
    byId.set(message.id, message);
  }
  for (const message of incoming || []) {
    if (!message?.id) continue;
    byId.set(message.id, { ...(byId.get(message.id) || {}), ...message });
  }
  return [...byId.values()].sort((a, b) => {
    const aTime = toTimestampMs(getTimestamp(a));
    const bTime = toTimestampMs(getTimestamp(b));
    if (aTime !== bTime) return aTime - bTime;
    return String(a.id || "").localeCompare(String(b.id || ""));
  });
}

export function buildUnicodeReactionKey(value = "") {
  const chars = Array.from(String(value || ""));
  return chars
    .map((char) => Number(char.codePointAt(0) || 0).toString(16))
    .join("-");
}

export function getReactionUserIds(reaction) {
  if (!Array.isArray(reaction?.userIds)) return [];
  return Array.from(
    new Set(
      reaction.userIds
        .map((userId) => String(userId || "").trim())
        .filter(Boolean),
    ),
  );
}

export function messageHasReactionFromUser(reaction, userId) {
  const id = String(userId || "").trim();
  if (!id) return false;
  return getReactionUserIds(reaction).includes(id);
}

export function buildPaginatedPath(
  basePath,
  { limit = MESSAGE_PAGE_SIZE, before = "" } = {},
) {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (before) params.set("before", before);
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function isVoiceDebugEnabled() {
  const envEnabled =
    String(import.meta.env.VITE_DEBUG_VOICE || "").trim() === "1";
  const storageEnabled =
    typeof window !== "undefined" &&
    localStorage.getItem(DEBUG_VOICE_STORAGE_KEY) === "1";
  return envEnabled || storageEnabled;
}

export function decodeJwtPayload(token = "") {
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

export const MEMBERSHIP_TOKEN_REFRESH_LEEWAY_MS = 90 * 1000;
const pendingMembershipTokenRefreshByServerId = new Map();

export function getMembershipTokenServerId(membershipToken = "") {
  const claims = decodeJwtPayload(membershipToken);
  return String(claims?.core_server_id || claims?.server_id || "").trim();
}

export function getMembershipTokenExpiryMs(membershipToken = "") {
  const claims = decodeJwtPayload(membershipToken);
  const expSeconds = Number(claims?.exp || 0);
  if (!Number.isFinite(expSeconds) || expSeconds <= 0) return 0;
  return expSeconds * 1000;
}

export async function refreshAccessTokenWithRefreshToken() {
  const refreshToken = localStorage.getItem(ACCESS_TOKEN_KEY) || "";
  if (!refreshToken) return null;
  const response = await fetch(`${CORE_API}/v1/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!response.ok) return null;
  const data = await response.json().catch(() => null);
  const accessToken = data?.accessToken;
  if (!accessToken) return null;
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  if (data?.refreshToken)
    localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("opencom-access-token-refresh", {
        detail: {
          accessToken,
          refreshToken: data?.refreshToken || refreshToken,
        },
      }),
    );
  }
  return {
    accessToken,
    refreshToken: data?.refreshToken || refreshToken,
  };
}

export async function refreshMembershipTokenForNode(baseUrl, membershipToken) {
  if (!membershipToken) return null;
  const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY) || "";
  const serverId = getMembershipTokenServerId(membershipToken);
  if (!serverId) return null;

  const existingRefresh = pendingMembershipTokenRefreshByServerId.get(serverId);
  if (existingRefresh) return existingRefresh;

  const refreshPromise = (async () => {
    const data = await api(
      `/v1/servers/${encodeURIComponent(serverId)}/membership-token`,
      {
        method: "POST",
        headers: accessToken
          ? { Authorization: `Bearer ${accessToken}` }
          : undefined,
      },
    ).catch(() => null);
    const nextToken = data?.membershipToken;
    if (!nextToken) return null;

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("opencom-membership-token-refresh", {
          detail: { serverId, membershipToken: nextToken },
        }),
      );
    }
    return nextToken;
  })();

  pendingMembershipTokenRefreshByServerId.set(serverId, refreshPromise);
  try {
    return await refreshPromise;
  } finally {
    if (
      pendingMembershipTokenRefreshByServerId.get(serverId) === refreshPromise
    ) {
      pendingMembershipTokenRefreshByServerId.delete(serverId);
    }
  }
}

export async function ensureFreshMembershipToken(
  baseUrl,
  membershipToken,
  { minValidityMs = MEMBERSHIP_TOKEN_REFRESH_LEEWAY_MS } = {},
) {
  if (!membershipToken) return null;
  const expiresAtMs = getMembershipTokenExpiryMs(membershipToken);
  if (expiresAtMs && expiresAtMs - Date.now() > minValidityMs) {
    return membershipToken;
  }
  return (
    (await refreshMembershipTokenForNode(baseUrl, membershipToken).catch(
      () => null,
    )) || membershipToken
  );
}

export function getLastSuccessfulGateway(candidates, storageKey) {
  return prioritizeLastSuccessfulGateway(candidates, storageKey);
}

export function normalizeGatewayWsUrl(value) {
  if (!value || typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";

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
    if (!shouldAllowLoopbackTargets() && isLoopbackHostname(url.hostname))
      return "";
    url.pathname = "/gateway";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    const normalized = trimmed.replace(/\/$/, "");
    const withPath = normalized.endsWith("/gateway")
      ? normalized
      : `${normalized}/gateway`;
    try {
      const url = new URL(withPath);
      if (!shouldAllowLoopbackTargets() && isLoopbackHostname(url.hostname))
        return "";
    } catch {
      // Keep fallback behavior for unparsable strings.
    }
    return withPath;
  }
}

export function getDefaultCoreGatewayWsUrl() {
  if (typeof window === "undefined") return FALLBACK_CORE_GATEWAY_WS_URL;
  if (window.location.protocol === "file:") return FALLBACK_CORE_GATEWAY_WS_URL;
  const hostname = window.location.hostname || "";
  if (hostname === "opencom.online" || hostname.endsWith(".opencom.online")) {
    return FALLBACK_CORE_GATEWAY_WS_URL;
  }
  return normalizeGatewayWsUrl("/gateway");
}

export function formatCallDurationLabel(totalSeconds = 0) {
  const safe = Math.max(0, Number(totalSeconds || 0));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function getCoreGatewayWsCandidates() {
  const explicit =
    import.meta.env.VITE_CORE_GATEWAY_URL ||
    import.meta.env.VITE_GATEWAY_WS_URL;
  const candidates = [];

  const push = (value) => {
    const normalized = normalizeGatewayWsUrl(value);
    if (!normalized) return;
    if (!candidates.includes(normalized)) candidates.push(normalized);
  };

  if (explicit && typeof explicit === "string" && explicit.trim()) {
    push(explicit);
  }
  push(getDefaultCoreGatewayWsUrl());

  return candidates;
}

export function getDesktopBridge() {
  if (typeof window === "undefined") return null;
  return window.opencomDesktopBridge || null;
}

export async function requestSystemNotificationPermission() {
  const bridge = getDesktopBridge();
  if (bridge?.notify) return "granted";
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return "unsupported";
  }
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  try {
    return await Notification.requestPermission();
  } catch {
    return "default";
  }
}

export async function showSystemNotification(input = {}) {
  const title = String(input?.title || "").trim() || "OpenCom";
  const body = String(input?.body || "").trim();
  const tag = String(input?.tag || "").trim() || undefined;
  const silent = input?.silent === true;
  const onClick =
    typeof input?.onClick === "function" ? input.onClick : undefined;

  if (typeof window !== "undefined" && typeof Notification !== "undefined") {
    let permission = Notification.permission;
    if (permission === "default") {
      permission = await requestSystemNotificationPermission();
    }
    if (permission === "granted") {
      try {
        const notification = new Notification(title, { body, silent, tag });
        notification.onclick = () => {
          try {
            window.focus();
          } catch {}
          notification.close();
          onClick?.();
        };
        return true;
      } catch {}
    }
  }

  const bridge = getDesktopBridge();
  if (bridge?.notify) {
    try {
      await bridge.notify({ title, body, silent, tag });
      return true;
    } catch {}
  }

  return false;
}

export function getVoiceGatewayWsCandidates(
  serverBaseUrl,
  includeDirectNodeWsFallback = false,
) {
  const explicitVoiceGateway = import.meta.env.VITE_VOICE_GATEWAY_URL;
  const candidates = [];
  const push = (value) => {
    const normalized = normalizeGatewayWsUrl(value);
    if (!normalized) return;
    if (!candidates.includes(normalized)) candidates.push(normalized);
  };

  if (
    explicitVoiceGateway &&
    typeof explicitVoiceGateway === "string" &&
    explicitVoiceGateway.trim()
  ) {
    push(explicitVoiceGateway);
  }

  for (const wsUrl of getCoreGatewayWsCandidates()) push(wsUrl);

  const allowDirectNodeWsFallback =
    includeDirectNodeWsFallback ||
    String(import.meta.env.VITE_ENABLE_DIRECT_NODE_WS_FALLBACK || "").trim() ===
      "1";
  if (allowDirectNodeWsFallback) {
    push(serverBaseUrl);
  }

  return candidates;
}

export function prioritizeLastSuccessfulGateway(candidates, storageKey) {
  const last = localStorage.getItem(storageKey);
  if (!last) return candidates;
  const idx = candidates.indexOf(last);
  if (idx <= 0) return candidates;
  return [
    candidates[idx],
    ...candidates.slice(0, idx),
    ...candidates.slice(idx + 1),
  ];
}

export function useThemeCss() {
  const [css, setCss] = useState(localStorage.getItem(THEME_STORAGE_KEY) || "");
  const [enabled, setEnabled] = useState(
    localStorage.getItem(THEME_ENABLED_STORAGE_KEY) !== "0",
  );

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
      const nextCss = String(
        (event?.detail?.css ?? localStorage.getItem(THEME_STORAGE_KEY)) || "",
      );
      const nextEnabled =
        event?.detail?.enabled !== undefined
          ? !!event.detail.enabled
          : localStorage.getItem(THEME_ENABLED_STORAGE_KEY) !== "0";
      setCss(nextCss);
      setEnabled(nextEnabled);
    };
    const onStorage = (event) => {
      if (
        !event ||
        (event.key !== THEME_STORAGE_KEY &&
          event.key !== THEME_ENABLED_STORAGE_KEY)
      ) {
        return;
      }
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

export function groupMessages(
  messages = [],
  getAuthor,
  getTimestamp,
  getAuthorId = null,
  getPfpUrl = null,
) {
  const groups = [];

  for (const message of messages) {
    const author = getAuthor(message);
    const authorId = getAuthorId ? getAuthorId(message) : author;
    const pfpUrl = getPfpUrl ? getPfpUrl(message) : null;
    const createdRaw = getTimestamp(message);
    const createdAt = createdRaw ? new Date(createdRaw) : null;
    const createdMs =
      createdAt && !Number.isNaN(createdAt.getTime())
        ? createdAt.getTime()
        : null;

    const previousGroup = groups[groups.length - 1];
    const canGroup =
      previousGroup &&
      previousGroup.authorId === authorId &&
      createdMs !== null &&
      previousGroup.lastMessageMs !== null &&
      createdMs - previousGroup.lastMessageMs <= 120000;

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
      messages: [message],
    });
  }

  return groups;
}

export async function api(path, options = {}) {
  const retried = options.__retried === true;
  const nextOptions = { ...options };
  delete nextOptions.__retried;
  const hasBody = nextOptions.body !== undefined && nextOptions.body !== null;
  const response = await fetch(`${CORE_API}${path}`, {
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...(nextOptions.headers || {}),
    },
    ...nextOptions,
  });

  if (!response.ok) {
    if (response.status === 401 && !retried && path !== "/v1/auth/refresh") {
      const refreshed = await refreshAccessTokenWithRefreshToken().catch(
        () => null,
      );
      if (refreshed?.accessToken) {
        const mergedHeaders = {
          ...(nextOptions.headers || {}),
          Authorization: `Bearer ${refreshed.accessToken}`,
        };
        return api(path, {
          ...nextOptions,
          headers: mergedHeaders,
          __retried: true,
        });
      }
    }
    const errorData = await response.json().catch(() => ({}));
    const err = new Error(errorData.error || `HTTP_${response.status}`);
    err.status = response.status;
    err.payload = errorData;
    err.issues = Array.isArray(errorData.issues) ? errorData.issues : [];
    throw err;
  }

  return response.json();
}

function formatValidationPath(path = []) {
  if (!Array.isArray(path) || !path.length) return "";
  const cleaned = path.filter((part) => part !== "activity");
  if (!cleaned.length) return "";
  if (cleaned[0] === "buttons" && Number.isInteger(cleaned[1])) {
    const buttonLabel = `Button ${Number(cleaned[1]) + 1}`;
    if (cleaned[2] === "label") return `${buttonLabel} label`;
    if (cleaned[2] === "url") return `${buttonLabel} URL`;
    return buttonLabel;
  }
  return cleaned
    .map((part) =>
      String(part)
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/[_-]+/g, " ")
        .trim(),
    )
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatValidationIssue(issue, fallback = "Invalid value.") {
  const label = formatValidationPath(issue?.path || []);
  const message = String(issue?.message || fallback).trim() || fallback;
  if (/invalid url/i.test(message)) {
    if (label === "Large Image Url" || label === "Small Image Url") {
      return `${label.replace("Url", "URL")} must use an uploaded image path or a valid http(s) URL.`;
    }
    if (/URL$/.test(label)) {
      return `${label} must use a valid http(s) URL.`;
    }
  }
  if (!label) return message;
  if (
    label === "Large Image Url" ||
    label === "Small Image Url"
  ) {
    return `${label.replace("Url", "URL")}: ${message}`;
  }
  return `${label}: ${message}`;
}

export function describeValidationIssues(issues = [], fallback = "Invalid value.") {
  if (!Array.isArray(issues) || !issues.length) return fallback;
  return issues
    .slice(0, 2)
    .map((issue) => formatValidationIssue(issue, fallback))
    .join(" ");
}

export function describeApiError(error, fallback = "Request failed.") {
  if (Array.isArray(error?.issues) && error.issues.length) {
    return describeValidationIssues(error.issues, fallback);
  }
  return String(error?.message || fallback);
}

export async function nodeApi(baseUrl, path, token, options = {}) {
  const retried = options.__retried === true;
  const nextOptions = { ...options };
  delete nextOptions.__retried;
  const hasBody = nextOptions.body !== undefined && nextOptions.body !== null;
  const normalizedBaseUrl = normalizeServerBaseUrl(baseUrl);
  if (!normalizedBaseUrl) throw new Error("NODE_BASE_URL_INVALID");
  const usableToken = await ensureFreshMembershipToken(
    normalizedBaseUrl,
    token,
  ).catch(() => token);
  const response = await fetch(`${normalizedBaseUrl}${path}`, {
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${usableToken || token}`,
      ...(nextOptions.headers || {}),
    },
    ...nextOptions,
  });

  if (!response.ok) {
    if (response.status === 401 && !retried) {
      const nextMembershipToken = await refreshMembershipTokenForNode(
        normalizedBaseUrl,
        usableToken || token,
      ).catch(() => null);
      if (nextMembershipToken) {
        return nodeApi(normalizedBaseUrl, path, nextMembershipToken, {
          ...nextOptions,
          __retried: true,
        });
      }
    }
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP_${response.status}`);
  }

  return response.json();
}

export function getStoredJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function getStoredStringArray(key) {
  const value = getStoredJson(key, []);
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string" && item.trim())
    : [];
}

export function clampVoiceNoiseValue(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

export function normalizeNoiseSuppressionPresetForUi(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase();
  if (key === "custom") return "custom";
  if (VOICE_NOISE_SUPPRESSION_PRESETS[key]) return key;
  return VOICE_NOISE_SUPPRESSION_DEFAULT_PRESET;
}

export function getNoiseSuppressionPresetConfigForUi(preset) {
  const key = normalizeNoiseSuppressionPresetForUi(preset);
  if (key === "custom") {
    return VOICE_NOISE_SUPPRESSION_PRESETS[
      VOICE_NOISE_SUPPRESSION_DEFAULT_PRESET
    ];
  }
  return (
    VOICE_NOISE_SUPPRESSION_PRESETS[key] ||
    VOICE_NOISE_SUPPRESSION_PRESETS[VOICE_NOISE_SUPPRESSION_DEFAULT_PRESET]
  );
}

export function normalizeVoiceNoiseCancellationMode(value) {
  return String(value || "").trim().toLowerCase() === "advanced"
    ? "advanced"
    : "smart";
}

function clampUnitInterval(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function interpolateNoiseValue(a, b, t, digits = 3) {
  const mixed = Number(a) + (Number(b) - Number(a)) * clampUnitInterval(t);
  const scale = 10 ** digits;
  return Math.round(mixed * scale) / scale;
}

function interpolateNoiseConfig(fromConfig, toConfig, t) {
  return {
    gateOpenRms: interpolateNoiseValue(
      fromConfig.gateOpenRms,
      toConfig.gateOpenRms,
      t,
      3,
    ),
    gateCloseRms: interpolateNoiseValue(
      fromConfig.gateCloseRms,
      toConfig.gateCloseRms,
      t,
      3,
    ),
    gateAttack: interpolateNoiseValue(
      fromConfig.gateAttack,
      toConfig.gateAttack,
      t,
      2,
    ),
    gateRelease: interpolateNoiseValue(
      fromConfig.gateRelease,
      toConfig.gateRelease,
      t,
      2,
    ),
    highpassHz: Math.round(
      interpolateNoiseValue(fromConfig.highpassHz, toConfig.highpassHz, t, 0),
    ),
    lowpassHz: Math.round(
      interpolateNoiseValue(fromConfig.lowpassHz, toConfig.lowpassHz, t, 0),
    ),
    compressorThreshold: Math.round(
      interpolateNoiseValue(
        fromConfig.compressorThreshold,
        toConfig.compressorThreshold,
        t,
        0,
      ),
    ),
    compressorKnee: Math.round(
      interpolateNoiseValue(fromConfig.compressorKnee, toConfig.compressorKnee, t, 0),
    ),
    compressorRatio: interpolateNoiseValue(
      fromConfig.compressorRatio,
      toConfig.compressorRatio,
      t,
      1,
    ),
    compressorAttack: interpolateNoiseValue(
      fromConfig.compressorAttack,
      toConfig.compressorAttack,
      t,
      3,
    ),
    compressorRelease: interpolateNoiseValue(
      fromConfig.compressorRelease,
      toConfig.compressorRelease,
      t,
      3,
    ),
  };
}

export function buildSmartNoiseSuppressionProfile({
  micGain = 100,
  micSensitivity = 50,
  localAudioProcessingInfo = null,
} = {}) {
  const supported = !!localAudioProcessingInfo?.supported?.noiseSuppression;
  const applied = localAudioProcessingInfo?.applied?.noiseSuppression === true;

  let intensity = 0.5;
  intensity += Math.max(-0.14, Math.min(0.28, (Number(micGain || 100) - 100) / 120));
  intensity += Math.max(
    -0.16,
    Math.min(0.22, (50 - Number(micSensitivity || 50)) / 90),
  );
  if (!supported) intensity += 0.12;
  if (applied) intensity -= 0.06;
  intensity = clampUnitInterval(intensity);

  const light = getNoiseSuppressionPresetConfigForUi("light");
  const balanced = getNoiseSuppressionPresetConfigForUi("balanced");
  const strict = getNoiseSuppressionPresetConfigForUi("strict");

  let preset = "balanced";
  let label = "Balanced cleanup";
  let summary =
    "Auto-tuned to keep voices natural while trimming steady room noise.";
  let config = balanced;

  if (intensity >= 0.5) {
    config = interpolateNoiseConfig(
      balanced,
      strict,
      (intensity - 0.5) / 0.5,
    );
  } else {
    config = interpolateNoiseConfig(light, balanced, intensity / 0.5);
  }

  if (intensity >= 0.68) {
    preset = "strict";
    label = "Max cleanup";
    summary =
      "Auto-tuned for louder mics or noisier rooms, with stronger gating and filtering.";
  } else if (intensity <= 0.34) {
    preset = "light";
    label = "Voice-first cleanup";
    summary =
      "Auto-tuned to preserve more ambience when your mic setup already sounds fairly clean.";
  }

  if (!supported) {
    summary += " Browser-level noise suppression is unavailable, so the client filter is doing more of the work.";
  }

  return {
    preset,
    label,
    summary,
    intensity,
    config: normalizeNoiseSuppressionConfigForUi(config, preset),
  };
}

export function isNoiseSuppressionConfigEquivalent(a, b) {
  const keys = [
    ["gateOpenRms", 0.0005],
    ["gateCloseRms", 0.0005],
    ["gateAttack", 0.005],
    ["gateRelease", 0.005],
    ["highpassHz", 1],
    ["lowpassHz", 1],
    ["compressorThreshold", 1],
    ["compressorKnee", 1],
    ["compressorRatio", 0.05],
    ["compressorAttack", 0.0005],
    ["compressorRelease", 0.0005],
  ];
  return keys.every(
    ([key, epsilon]) =>
      Math.abs(Number(a?.[key] || 0) - Number(b?.[key] || 0)) <= epsilon,
  );
}

export function normalizeNoiseSuppressionConfigForUi(
  config = {},
  preset = VOICE_NOISE_SUPPRESSION_DEFAULT_PRESET,
) {
  const base = getNoiseSuppressionPresetConfigForUi(preset);
  const normalized = {
    gateOpenRms: clampVoiceNoiseValue(
      config.gateOpenRms,
      0.004,
      0.06,
      base.gateOpenRms,
    ),
    gateCloseRms: clampVoiceNoiseValue(
      config.gateCloseRms,
      0.002,
      0.05,
      base.gateCloseRms,
    ),
    gateAttack: clampVoiceNoiseValue(
      config.gateAttack,
      0.05,
      0.95,
      base.gateAttack,
    ),
    gateRelease: clampVoiceNoiseValue(
      config.gateRelease,
      0.01,
      0.8,
      base.gateRelease,
    ),
    highpassHz: clampVoiceNoiseValue(
      config.highpassHz,
      40,
      300,
      base.highpassHz,
    ),
    lowpassHz: clampVoiceNoiseValue(
      config.lowpassHz,
      4200,
      14000,
      base.lowpassHz,
    ),
    compressorThreshold: clampVoiceNoiseValue(
      config.compressorThreshold,
      -70,
      -8,
      base.compressorThreshold,
    ),
    compressorKnee: clampVoiceNoiseValue(
      config.compressorKnee,
      0,
      40,
      base.compressorKnee,
    ),
    compressorRatio: clampVoiceNoiseValue(
      config.compressorRatio,
      1,
      20,
      base.compressorRatio,
    ),
    compressorAttack: clampVoiceNoiseValue(
      config.compressorAttack,
      0.001,
      0.05,
      base.compressorAttack,
    ),
    compressorRelease: clampVoiceNoiseValue(
      config.compressorRelease,
      0.04,
      0.8,
      base.compressorRelease,
    ),
  };
  if (normalized.gateCloseRms >= normalized.gateOpenRms) {
    normalized.gateCloseRms = Math.max(0.002, normalized.gateOpenRms * 0.8);
  }
  if (normalized.lowpassHz <= normalized.highpassHz + 250) {
    normalized.lowpassHz = Math.min(14000, normalized.highpassHz + 250);
  }
  return normalized;
}

export function getInitials(value = "") {
  const cleaned = value.trim();
  if (!cleaned) return "OC";
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

export function escapeRegex(value = "") {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function getMentionQuery(value = "") {
  const match = value.match(/(?:^|\s)(@\{?)([^\s{}@]*)$/);
  if (!match) return null;
  const marker = match[1] || "@";
  const query = match[2] || "";
  const start = value.length - marker.length - query.length;
  return { query: query.toLowerCase(), start };
}

export function getSlashQuery(value = "") {
  const trimmed = value.trimStart();
  if (!trimmed.startsWith("/")) return null;
  const withoutPrefix = trimmed.slice(1);
  if (!withoutPrefix.length) return "";
  if (/\s/.test(withoutPrefix)) return null;
  return withoutPrefix.toLowerCase();
}

export function getEmoteQuery(value = "") {
  const match = String(value || "").match(/(?:^|\s):([a-zA-Z0-9_+-]*)$/);
  if (!match) return null;
  const query = match[1] || "";
  const start = value.length - query.length - 1;
  return { query: query.toLowerCase(), start };
}

export function splitSlashInput(value = "") {
  const trimmed = String(value || "").trim();
  const withoutPrefix = trimmed.replace(/^\//, "").trim();
  if (!withoutPrefix) return { commandToken: "", argText: "" };
  const parts = withoutPrefix.split(/\s+/);
  const commandToken = parts.shift() || "";
  return { commandToken, argText: parts.join(" ") };
}

export function resolveSlashCommand(commandName = "", commands = []) {
  const normalized = String(commandName || "").trim();
  if (!normalized) return { command: null, ambiguousMatches: [] };

  let command = commands.find((item) => item?.name === normalized) || null;
  if (command) return { command, ambiguousMatches: [] };

  if (!normalized.includes(".")) {
    const suffixMatches = commands.filter(
      (item) =>
        String(item?.name || "")
          .split(".")
          .pop() === normalized,
    );
    if (suffixMatches.length === 1) command = suffixMatches[0];
    if (suffixMatches.length > 1) {
      return { command: null, ambiguousMatches: suffixMatches };
    }
  }

  return { command, ambiguousMatches: [] };
}

export function parseCommandArgs(raw = "") {
  const tokens = [];
  const regex = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|(\S+)/g;
  let match = regex.exec(raw);
  while (match) {
    tokens.push(
      (match[1] ?? match[2] ?? match[3] ?? "").replace(/\\(["'\\])/g, "$1"),
    );
    match = regex.exec(raw);
  }
  return tokens;
}

export function coerceCommandArg(value, optionType) {
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

export function parseCommandArgsByOptions(rawArgText = "", optionDefs = []) {
  const tokens = parseCommandArgs(rawArgText || "");
  const knownOptionNames = new Set(
    (optionDefs || []).map((option) => String(option?.name || "")),
  );
  const namedTokens = {};
  const positionalTokens = [];

  for (const token of tokens) {
    const match = String(token).match(/^([a-zA-Z0-9_-]+)=(.*)$/);
    if (match && knownOptionNames.has(match[1])) {
      namedTokens[match[1]] = match[2];
      continue;
    }
    positionalTokens.push(token);
  }

  const args = {};
  let positionalIndex = 0;
  for (const option of optionDefs || []) {
    if (!option?.name) continue;
    const hasNamed = Object.prototype.hasOwnProperty.call(
      namedTokens,
      option.name,
    );
    const rawValue = hasNamed
      ? namedTokens[option.name]
      : positionalTokens[positionalIndex++];
    if (rawValue == null || rawValue === "") continue;
    args[option.name] = coerceCommandArg(rawValue, option.type || "string");
  }

  return args;
}

export function buildSlashCommandTemplate(command = null) {
  if (!command?.name) return { text: "/", cursor: 1 };
  const options = Array.isArray(command.options) ? command.options : [];
  if (!options.length) {
    const text = `/${command.name} `;
    return { text, cursor: text.length };
  }

  const tokens = options
    .filter((option) => option?.name)
    .map((option) => `${option.name}=`);
  const text = `/${command.name} ${tokens.join(" ")}`;
  const firstEquals = text.indexOf("=");
  return { text, cursor: firstEquals >= 0 ? firstEquals + 1 : text.length };
}

export function contentMentionsSelf(content = "", selfId, selfNames = []) {
  if (!content || !selfId) return false;
  if (/@everyone\b/i.test(content)) return true;
  if (new RegExp(`@\\{${escapeRegex(selfId)}\\}`, "i").test(content)) {
    return true;
  }
  if (new RegExp(`(^|\\s)@${escapeRegex(selfId)}\\b`, "i").test(content)) {
    return true;
  }
  for (const name of selfNames) {
    if (!name || typeof name !== "string") continue;
    const trimmed = name.trim();
    if (!trimmed) continue;
    if (new RegExp(`@\\{${escapeRegex(trimmed)}\\}`, "i").test(content)) {
      return true;
    }
    if (new RegExp(`(^|\\s)@${escapeRegex(trimmed)}\\b`, "i").test(content)) {
      return true;
    }
  }
  return false;
}

export function formatMessageTime(value) {
  if (!value) return "just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "just now";
  const timeLabel = date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());
  const dateWithTimeLabel = `${day}/${month}/${year} {${timeLabel}}`;
  const now = new Date();
  const todayDayIndex = Math.floor(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000,
  );
  const messageDayIndex = Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000,
  );
  const dayDiff = todayDayIndex - messageDayIndex;
  if (dayDiff >= 1) return dateWithTimeLabel;
  return timeLabel;
}

export function rpcFormFromActivity(activity = null) {
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
    button2Url: activity?.buttons?.[1]?.url || "",
  };
}

export function rpcActivityFromForm(form) {
  const buttons = [];
  if (form.button1Label.trim() && form.button1Url.trim()) {
    buttons.push({
      label: form.button1Label.trim(),
      url: form.button1Url.trim(),
    });
  }
  if (form.button2Label.trim() && form.button2Url.trim()) {
    buttons.push({
      label: form.button2Label.trim(),
      url: form.button2Url.trim(),
    });
  }
  return {
    name: form.name.trim() || undefined,
    details: form.details.trim() || undefined,
    state: form.state.trim() || undefined,
    largeImageUrl: normalizeImageUrlInput(form.largeImageUrl || "") || undefined,
    largeImageText: form.largeImageText.trim() || undefined,
    smallImageUrl: normalizeImageUrlInput(form.smallImageUrl || "") || undefined,
    smallImageText: form.smallImageText.trim() || undefined,
    buttons: buttons.length ? buttons : undefined,
  };
}

export function getMessageDayKey(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

export function formatMessageDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

let activeNotificationSoundAudio = null;

function playSyntheticNotificationBeep() {
  try {
    if (typeof window === "undefined") return;
    const AudioContextCtor =
      window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return;
    const audioCtx = new AudioContextCtor();
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
    osc1.onended = () => {
      osc2.onended = () => audioCtx.close();
    };
  } catch {}
}

export function playNotificationBeep(input = false) {
  const options =
    input && typeof input === "object" ? input : { mute: !!input };
  const mute = options?.mute === true;
  const soundUrl = String(options?.soundUrl || "").trim();
  if (mute) return;
  if (!soundUrl) {
    playSyntheticNotificationBeep();
    return;
  }
  try {
    if (typeof window === "undefined" || typeof Audio === "undefined") {
      return;
    }
    if (activeNotificationSoundAudio) {
      try {
        activeNotificationSoundAudio.pause();
        activeNotificationSoundAudio.currentTime = 0;
      } catch {}
    }
    const audio = new Audio(soundUrl);
    let settled = false;
    const clearActiveAudio = () => {
      if (settled) return;
      settled = true;
      if (activeNotificationSoundAudio === audio) {
        activeNotificationSoundAudio = null;
      }
    };
    activeNotificationSoundAudio = audio;
    audio.preload = "auto";
    audio.volume = 1;
    audio.onended = clearActiveAudio;
    audio.onerror = clearActiveAudio;
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(clearActiveAudio);
    }
  } catch {}
}

export function extensionForMimeType(mimeType = "") {
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

export function normalizeAttachmentFile(file, prefix = "upload") {
  if (!file) return null;
  if (file.name && file.name.trim()) return file;
  const ext = extensionForMimeType(file.type || "");
  const fallbackName = `${prefix}-${Date.now()}${ext}`;
  try {
    return new File([file], fallbackName, {
      type: file.type || "application/octet-stream",
    });
  } catch {
    return file;
  }
}

export function formatByteCount(bytes = 0) {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let amount = value;
  let unitIndex = 0;
  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024;
    unitIndex += 1;
  }
  const precision = amount >= 10 || unitIndex === 0 ? 0 : 1;
  return `${amount.toFixed(precision)} ${units[unitIndex]}`;
}

export function extractFilesFromClipboardData(clipboardData) {
  if (!clipboardData) return [];

  const filesFromList = Array.from(clipboardData.files || []).filter(
    (file) => file && file.size > 0,
  );
  const filesFromItems = Array.from(clipboardData.items || [])
    .filter((item) => item && item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file) => file && file.size > 0);

  const out = [];
  const seen = new Set();
  for (const file of [...filesFromList, ...filesFromItems]) {
    const key = `${file.name || ""}:${file.size}:${file.type || ""}:${file.lastModified || 0}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(file);
  }
  return out;
}

export function normalizeImageUrlInput(value = "") {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed) || /^data:image\//i.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.startsWith("/")) return trimmed;
  if (trimmed.startsWith("users/")) return `/v1/profile-images/${trimmed}`;
  return trimmed;
}

export function extractHttpUrls(value = "") {
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

export function normalizeFavouriteMediaUrl(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return raw;
  }
}

export function buildFavouriteMediaKey(sourceKind = "", sourceUrl = "") {
  const normalizedKind = String(sourceKind || "").trim();
  const normalizedUrl = normalizeFavouriteMediaUrl(sourceUrl);
  if (!normalizedKind || !normalizedUrl) return "";
  return `${normalizedKind}:${normalizedUrl}`;
}

export function guessFileNameFromUrl(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    const lastSegment = (parsed.pathname || "")
      .split("/")
      .filter(Boolean)
      .pop();
    return lastSegment ? decodeURIComponent(lastSegment) : "";
  } catch {
    const lastSegment = raw.split("/").filter(Boolean).pop();
    return lastSegment ? decodeURIComponent(lastSegment) : "";
  }
}
