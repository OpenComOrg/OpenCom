import { useEffect, useMemo, useRef, useState } from "react";
import {
  createSfuVoiceClient,
  VOICE_NOISE_SUPPRESSION_DEFAULT_PRESET,
  VOICE_NOISE_SUPPRESSION_PRESETS,
} from "./voice/sfuClient";
import { LandingPage } from "./components/LandingPage";
import { AuthShell } from "./components/AuthShell";
import { TermsPage } from "./components/TermsPage";
import { BlogsPage } from "./components/BlogsPage";
import { BlogPostPage } from "./components/BlogPostPage";
import {
  IncomingCallToast,
  ActiveCallBar,
  CallMessageCard,
  OutgoingCallToast,
} from "./components/PrivateCallOverlay";
import { ServerRailNav } from "./components/app/ServerRailNav";
import { FriendsSurface } from "./components/app/FriendsSurface";
import { ProfileStudioPage } from "./components/app/ProfileStudioPage";
import { VoiceShareOverlay } from "./components/app/VoiceShareOverlay";
import { AppContextMenus } from "./components/app/AppContextMenus";
import { AddServerModal } from "./components/app/AddServerModal";
import { FavouriteMediaModal } from "./components/app/FavouriteMediaModal";
import { MediaViewerModal } from "./components/app/MediaViewerModal";
import { MemberProfilePopout } from "./components/app/MemberProfilePopout";
import { FullProfileViewerModal } from "./components/app/FullProfileViewerModal";
import { AppDialogModal } from "./components/app/AppDialogModal";
import {
  BoostUpsellModal,
  BoostGiftPromptModal,
} from "./components/app/BoostModals";
import { SettingsOverlay } from "./components/settings/SettingsOverlay";
import { ServerSettingsSection } from "./components/settings/ServerSettingsSection";
import { ProfileSettingsSection } from "./components/settings/ProfileSettingsSection";
import { RolesSettingsSection } from "./components/settings/RolesSettingsSection";
import { ModerationSettingsSection } from "./components/settings/ModerationSettingsSection";
import { InvitesSettingsSection } from "./components/settings/InvitesSettingsSection";
import { ExtensionsSettingsSection } from "./components/settings/ExtensionsSettingsSection";
import { AppearanceSettingsSection } from "./components/settings/AppearanceSettingsSection";
import { VoiceSettingsSection } from "./components/settings/VoiceSettingsSection";
import { BillingSettingsSection } from "./components/settings/BillingSettingsSection";
import { SecuritySettingsSection } from "./components/settings/SecuritySettingsSection";
import { DOWNLOAD_TARGETS, getPreferredDownloadTarget } from "./lib/downloads";
import {
  APP_ROUTE_CLIENT,
  APP_ROUTE_BLOGS,
  APP_ROUTE_HOME,
  APP_ROUTE_LOGIN,
  APP_ROUTE_PANEL,
  APP_ROUTE_TERMS,
  buildBoostGiftUrl,
  buildInviteJoinUrl,
  getBlogSlugFromPath,
  getAppRouteFromLocation,
  getBoostGiftCodeFromCurrentLocation,
  getInviteCodeFromCurrentLocation,
  isBlogPostPath,
  isBoostGiftPath,
  isInviteJoinPath,
  normalizeAppPath,
  openStaticPage,
  shouldSkipLandingPage,
  parseBoostGiftCodeFromInput,
  parseInviteCodeFromInput,
  resolveStaticPageHref,
  writeAppRoute,
} from "./lib/routing";
import { AdminApp } from "./admin/AdminApp.jsx";

function resolveCoreApiBase() {
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

const CORE_API = resolveCoreApiBase();

function isLoopbackHostname(hostname = "") {
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

function shouldAllowLoopbackTargets() {
  if (typeof window === "undefined") return true;
  if (window.location.protocol === "file:") return true;
  const currentHost = String(window.location.hostname || "")
    .trim()
    .toLowerCase();
  return isLoopbackHostname(currentHost) || currentHost.endsWith(".localhost");
}

function normalizeHttpBaseUrl(value = "") {
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

function gatewayUrlToHttpBaseUrl(value = "") {
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

function resolvePublicNodeBaseUrl() {
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

const PUBLIC_NODE_BASE_URL = resolvePublicNodeBaseUrl();

function normalizeServerBaseUrl(baseUrl = "") {
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

function normalizeServerRecord(server) {
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

function normalizeServerList(list) {
  if (!Array.isArray(list)) return [];
  return list.map((server) => normalizeServerRecord(server)).filter(Boolean);
}

/** Resolve profile image URL so it loads from the API when relative (e.g. /v1/profile-images/...) */
function profileImageUrl(url) {
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

function createBasicFullProfile(profileData = {}) {
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

function clampProfilePercent(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

function clampProfileElementRect(rect = {}, fallback = {}) {
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

function getContextMenuPoint(clientX, clientY, options = {}) {
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

function clampProfileCardPosition(left, top, options = {}) {
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

function normalizeFullProfile(profileData = {}, fullProfileCandidate) {
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
const NOISE_SUPPRESSION_PRESET_KEY = "opencom_noise_suppression_preset";
const NOISE_SUPPRESSION_CONFIG_KEY = "opencom_noise_suppression_config";
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
const MESSAGE_PAGE_SIZE = 50;
const MESSAGE_HISTORY_PREFETCH_REMAINING_COUNT = 10;
const MESSAGE_HISTORY_PREFETCH_THRESHOLD_PX =
  MESSAGE_HISTORY_PREFETCH_REMAINING_COUNT * 56;

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
  sob: "😭",
  skull: "💀",
  star: "⭐",
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
  ADMINISTRATOR: 1n << 60n,
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

function toIsoTimestamp(value) {
  if (value == null || value === "") return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
}

function toTimestampMs(value) {
  const ms = new Date(value || "").getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function mergeMessagesChronologically(
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

function buildPaginatedPath(
  basePath,
  { limit = MESSAGE_PAGE_SIZE, before = "" } = {},
) {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (before) params.set("before", before);
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

function isVoiceDebugEnabled() {
  const envEnabled =
    String(import.meta.env.VITE_DEBUG_VOICE || "").trim() === "1";
  const storageEnabled =
    typeof window !== "undefined" &&
    localStorage.getItem(DEBUG_VOICE_STORAGE_KEY) === "1";
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

async function refreshMembershipTokenForNode(baseUrl, membershipToken) {
  if (!membershipToken) return null;
  const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY) || "";
  if (!accessToken) return null;
  const claims = decodeJwtPayload(membershipToken);
  const serverId = claims?.core_server_id || claims?.server_id;
  if (!serverId) return null;

  const response = await fetch(
    `${CORE_API}/v1/servers/${encodeURIComponent(serverId)}/membership-token`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!response.ok) return null;
  const data = await response.json().catch(() => null);
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
      // keep fallback behavior for unparsable strings
    }
    return withPath;
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
  const explicit =
    import.meta.env.VITE_CORE_GATEWAY_URL ||
    import.meta.env.VITE_GATEWAY_WS_URL;
  const candidates = [];

  const push = (value) => {
    const normalized = normalizeGatewayWsUrl(value);
    if (!normalized) return;
    if (!candidates.includes(normalized)) candidates.push(normalized);
  };

  // Explicit endpoint first when provided.
  if (explicit && typeof explicit === "string" && explicit.trim())
    push(explicit);
  push(getDefaultCoreGatewayWsUrl());

  return candidates;
}

function getDesktopBridge() {
  if (typeof window === "undefined") return null;
  return window.opencomDesktopBridge || null;
}

function getVoiceGatewayWsCandidates(
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

  // Optional explicit voice gateway override for direct-node deployments.
  if (
    explicitVoiceGateway &&
    typeof explicitVoiceGateway === "string" &&
    explicitVoiceGateway.trim()
  ) {
    push(explicitVoiceGateway);
  }

  // Prefer core gateway routing by default so clients don't guess node addresses.
  for (const wsUrl of getCoreGatewayWsCandidates()) push(wsUrl);

  const allowDirectNodeWsFallback =
    includeDirectNodeWsFallback ||
    String(import.meta.env.VITE_ENABLE_DIRECT_NODE_WS_FALLBACK || "").trim() ===
      "1";
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
  return [
    candidates[idx],
    ...candidates.slice(0, idx),
    ...candidates.slice(idx + 1),
  ];
}

function useThemeCss() {
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
      )
        return;
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

function groupMessages(
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

async function api(path, options = {}) {
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
    throw err;
  }

  return response.json();
}

async function nodeApi(baseUrl, path, token, options = {}) {
  const retried = options.__retried === true;
  const nextOptions = { ...options };
  delete nextOptions.__retried;
  const hasBody = nextOptions.body !== undefined && nextOptions.body !== null;
  const normalizedBaseUrl = normalizeServerBaseUrl(baseUrl);
  if (!normalizedBaseUrl) throw new Error("NODE_BASE_URL_INVALID");
  const response = await fetch(`${normalizedBaseUrl}${path}`, {
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${token}`,
      ...(nextOptions.headers || {}),
    },
    ...nextOptions,
  });

  if (!response.ok) {
    if (response.status === 401 && !retried) {
      const nextMembershipToken = await refreshMembershipTokenForNode(
        normalizedBaseUrl,
        token,
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
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string" && item.trim())
    : [];
}

function clampVoiceNoiseValue(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

function normalizeNoiseSuppressionPresetForUi(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase();
  if (key === "custom") return "custom";
  if (VOICE_NOISE_SUPPRESSION_PRESETS[key]) return key;
  return VOICE_NOISE_SUPPRESSION_DEFAULT_PRESET;
}

function getNoiseSuppressionPresetConfigForUi(preset) {
  const key = normalizeNoiseSuppressionPresetForUi(preset);
  if (key === "custom")
    return VOICE_NOISE_SUPPRESSION_PRESETS[
      VOICE_NOISE_SUPPRESSION_DEFAULT_PRESET
    ];
  return (
    VOICE_NOISE_SUPPRESSION_PRESETS[key] ||
    VOICE_NOISE_SUPPRESSION_PRESETS[VOICE_NOISE_SUPPRESSION_DEFAULT_PRESET]
  );
}

function normalizeNoiseSuppressionConfigForUi(
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
  const withoutPrefix = trimmed.slice(1);
  if (!withoutPrefix.length) return "";
  if (/\s/.test(withoutPrefix)) return null;
  return withoutPrefix.toLowerCase();
}

function splitSlashInput(value = "") {
  const trimmed = String(value || "").trim();
  const withoutPrefix = trimmed.replace(/^\//, "").trim();
  if (!withoutPrefix) return { commandToken: "", argText: "" };
  const parts = withoutPrefix.split(/\s+/);
  const commandToken = parts.shift() || "";
  return { commandToken, argText: parts.join(" ") };
}

function resolveSlashCommand(commandName = "", commands = []) {
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
    if (suffixMatches.length > 1)
      return { command: null, ambiguousMatches: suffixMatches };
  }

  return { command, ambiguousMatches: [] };
}

function parseCommandArgs(raw = "") {
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

function parseCommandArgsByOptions(rawArgText = "", optionDefs = []) {
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

function buildSlashCommandTemplate(command = null) {
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

function contentMentionsSelf(content = "", selfId, selfNames = []) {
  if (!content || !selfId) return false;
  if (/@everyone\b/i.test(content)) return true;
  if (new RegExp(`@\\{${escapeRegex(selfId)}\\}`, "i").test(content))
    return true;
  if (new RegExp(`(^|\\s)@${escapeRegex(selfId)}\\b`, "i").test(content))
    return true;
  for (const name of selfNames) {
    if (!name || typeof name !== "string") continue;
    const trimmed = name.trim();
    if (!trimmed) continue;
    if (new RegExp(`@\\{${escapeRegex(trimmed)}\\}`, "i").test(content))
      return true;
    if (new RegExp(`(^|\\s)@${escapeRegex(trimmed)}\\b`, "i").test(content))
      return true;
  }
  return false;
}

function formatMessageTime(value) {
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
    button2Url: activity?.buttons?.[1]?.url || "",
  };
}

function rpcActivityFromForm(form) {
  const buttons = [];
  if (form.button1Label.trim() && form.button1Url.trim())
    buttons.push({
      label: form.button1Label.trim(),
      url: form.button1Url.trim(),
    });
  if (form.button2Label.trim() && form.button2Url.trim())
    buttons.push({
      label: form.button2Label.trim(),
      url: form.button2Url.trim(),
    });
  return {
    name: form.name.trim() || undefined,
    details: form.details.trim() || undefined,
    state: form.state.trim() || undefined,
    largeImageUrl: form.largeImageUrl.trim() || undefined,
    largeImageText: form.largeImageText.trim() || undefined,
    smallImageUrl: form.smallImageUrl.trim() || undefined,
    smallImageText: form.smallImageText.trim() || undefined,
    buttons: buttons.length ? buttons : undefined,
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
    day: "numeric",
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
    osc1.onended = () => {
      osc2.onended = () => audioCtx.close();
    };
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
    return new File([file], fallbackName, {
      type: file.type || "application/octet-stream",
    });
  } catch {
    return file;
  }
}

function extractFilesFromClipboardData(clipboardData) {
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

function normalizeImageUrlInput(value = "") {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed) || /^data:image\//i.test(trimmed))
    return trimmed;
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

function normalizeFavouriteMediaUrl(value = "") {
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

function buildFavouriteMediaKey(sourceKind = "", sourceUrl = "") {
  const normalizedKind = String(sourceKind || "").trim();
  const normalizedUrl = normalizeFavouriteMediaUrl(sourceUrl);
  if (!normalizedKind || !normalizedUrl) return "";
  return `${normalizedKind}:${normalizedUrl}`;
}

function guessFileNameFromUrl(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    const lastSegment = (parsed.pathname || "").split("/").filter(Boolean).pop();
    return lastSegment ? decodeURIComponent(lastSegment) : "";
  } catch {
    const lastSegment = raw.split("/").filter(Boolean).pop();
    return lastSegment ? decodeURIComponent(lastSegment) : "";
  }
}

export function App() {
  const voiceDebugEnabled = isVoiceDebugEnabled();
  const voiceDebug = (message, context = {}) => {
    if (!voiceDebugEnabled) return;
    console.debug(`[voice-debug] ${message}`, context);
  };
  const storedActiveDmId = localStorage.getItem(ACTIVE_DM_KEY) || "";
  const [accessToken, setAccessToken] = useState(
    localStorage.getItem(ACCESS_TOKEN_KEY) || "",
  );
  const [refreshToken, setRefreshToken] = useState(
    localStorage.getItem(REFRESH_TOKEN_KEY) || "",
  );
  const [authMode, setAuthMode] = useState("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authResetPasswordConfirm, setAuthResetPasswordConfirm] = useState("");
  const [resetPasswordToken, setResetPasswordToken] = useState("");
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
  const [pendingDmAttachments, setPendingDmAttachments] = useState([]);
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
  const [profileForm, setProfileForm] = useState({
    displayName: "",
    bio: "",
    pfpUrl: "",
    bannerUrl: "",
  });
  const [fullProfileDraft, setFullProfileDraft] = useState(
    createBasicFullProfile({}),
  );
  const [fullProfileViewer, setFullProfileViewer] = useState(null);
  const [fullProfileViewerMusicPlaying, setFullProfileViewerMusicPlaying] =
    useState(false);
  const [fullProfileDraggingElementId, setFullProfileDraggingElementId] =
    useState("");
  const [profileStudioSelectedElementId, setProfileStudioSelectedElementId] =
    useState("");
  const [viewportSize, setViewportSize] = useState(() => ({
    width: typeof window !== "undefined" ? window.innerWidth : 1280,
    height: typeof window !== "undefined" ? window.innerHeight : 720,
  }));
  const fullProfileDragOffsetRef = useRef({ x: 0, y: 0 });
  const fullProfileElementsRef = useRef([]);
  const fullProfileEditorCanvasRef = useRef(null);
  const fullProfileViewerMusicAudioRef = useRef(null);
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
    button2Url: "",
  });
  const [serverProfileForm, setServerProfileForm] = useState({
    name: "",
    logoUrl: "",
    bannerUrl: "",
  });

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
  const [friendRequests, setFriendRequests] = useState({
    incoming: [],
    outgoing: [],
  });
  const [allowFriendRequests, setAllowFriendRequests] = useState(true);

  const [collapsedCategories, setCollapsedCategories] = useState({});

  // ── Private call state ─────────────────────────────────────────────────────
  // incomingCall: set when another user calls you (you haven't answered yet)
  const [incomingCall, setIncomingCall] = useState(null);
  // outgoingCall: set while you're waiting for the other person to pick up
  const [outgoingCall, setOutgoingCall] = useState(null);
  // activePrivateCall: set once both sides are in the call
  const [activePrivateCall, setActivePrivateCall] = useState(null);
  // seconds elapsed since the call connected (driven by useEffect below)
  const [callDuration, setCallDuration] = useState(0);
  // ──────────────────────────────────────────────────────────────────────────

  const [voiceSession, setVoiceSession] = useState({
    guildId: "",
    channelId: "",
  });
  const [isDisconnectingVoice, setIsDisconnectingVoice] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [selectedScreenShareProducerId, setSelectedScreenShareProducerId] =
    useState("");
  const [screenShareOverlayOpen, setScreenShareOverlayOpen] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isMicMonitorActive, setIsMicMonitorActive] = useState(false);
  const micMonitorRestoreStateRef = useRef({
    muted: false,
    deafened: false,
    shouldRestore: false,
  });
  const [micGain, setMicGain] = useState(
    Number(localStorage.getItem(MIC_GAIN_KEY) || 100),
  );
  const [micSensitivity, setMicSensitivity] = useState(
    Number(localStorage.getItem(MIC_SENSITIVITY_KEY) || 50),
  );
  const [audioInputDeviceId, setAudioInputDeviceId] = useState(
    localStorage.getItem(AUDIO_INPUT_DEVICE_KEY) || "",
  );
  const [audioOutputDeviceId, setAudioOutputDeviceId] = useState(
    localStorage.getItem(AUDIO_OUTPUT_DEVICE_KEY) || "",
  );
  const [noiseSuppressionEnabled, setNoiseSuppressionEnabled] = useState(
    localStorage.getItem(NOISE_SUPPRESSION_KEY) !== "0",
  );
  const [noiseSuppressionPreset, setNoiseSuppressionPreset] = useState(() => {
    const storedPreset = localStorage.getItem(NOISE_SUPPRESSION_PRESET_KEY);
    return normalizeNoiseSuppressionPresetForUi(
      storedPreset || VOICE_NOISE_SUPPRESSION_DEFAULT_PRESET,
    );
  });
  const [noiseSuppressionConfig, setNoiseSuppressionConfig] = useState(() => {
    const storedPreset = localStorage.getItem(NOISE_SUPPRESSION_PRESET_KEY);
    const normalizedPreset = normalizeNoiseSuppressionPresetForUi(
      storedPreset || VOICE_NOISE_SUPPRESSION_DEFAULT_PRESET,
    );
    const storedConfig = getStoredJson(NOISE_SUPPRESSION_CONFIG_KEY, null);
    return normalizeNoiseSuppressionConfigForUi(
      storedConfig || {},
      normalizedPreset,
    );
  });
  const [localAudioProcessingInfo, setLocalAudioProcessingInfo] =
    useState(null);
  const [audioInputDevices, setAudioInputDevices] = useState([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState([]);
  const [selfStatus, setSelfStatus] = useState(
    localStorage.getItem(SELF_STATUS_KEY) || "online",
  );
  const [showPinned, setShowPinned] = useState(false);
  const [newOfficialServerName, setNewOfficialServerName] = useState("");
  const [newOfficialServerLogoUrl, setNewOfficialServerLogoUrl] = useState("");
  const [newOfficialServerBannerUrl, setNewOfficialServerBannerUrl] =
    useState("");
  const [pinnedServerMessages, setPinnedServerMessages] = useState({});
  const [pinnedDmMessages, setPinnedDmMessages] = useState(
    getStoredJson(PINNED_DM_KEY, {}),
  );
  const [newRoleName, setNewRoleName] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [moderationMemberId, setModerationMemberId] = useState("");
  const [moderationBanReason, setModerationBanReason] = useState("");
  const [moderationUnbanUserId, setModerationUnbanUserId] = useState("");
  const [moderationBusy, setModerationBusy] = useState(false);
  const [profileCardPosition, setProfileCardPosition] = useState({
    x: 26,
    y: 26,
  });
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
  const [favouriteMedia, setFavouriteMedia] = useState([]);
  const [favouriteMediaLoading, setFavouriteMediaLoading] = useState(false);
  const [favouriteMediaModalOpen, setFavouriteMediaModalOpen] = useState(false);
  const [favouriteMediaQuery, setFavouriteMediaQuery] = useState("");
  const [favouriteMediaBusyById, setFavouriteMediaBusyById] = useState({});
  const [favouriteMediaInsertBusyId, setFavouriteMediaInsertBusyId] =
    useState("");
  const [favouriteMediaPreviewUrlById, setFavouriteMediaPreviewUrlById] =
    useState({});
  const [expandedMedia, setExpandedMedia] = useState(null);
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
  const [passwordForm, setPasswordForm] = useState({
    current: "",
    new: "",
    confirm: "",
  });
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [activeSessions, setActiveSessions] = useState([
    {
      id: "current",
      device: "Current Device",
      location: "Your Location",
      lastActive: "Now",
      status: "active",
    },
  ]);
  const [lastLoginInfo, setLastLoginInfo] = useState({
    date: new Date().toISOString(),
    device: "Current Device",
    location: "Your Location",
  });
  const [twoFactorSecret, setTwoFactorSecret] = useState("");
  const [twoFactorQRCode, setTwoFactorQRCode] = useState("");
  const [backupCodes, setBackupCodes] = useState([]);
  const [twoFactorToken, setTwoFactorToken] = useState("");
  const [twoFactorVerified, setTwoFactorVerified] = useState(false);
  const [show2FASetup, setShow2FASetup] = useState(false);
  const [securitySettings, setSecuritySettings] = useState({
    twoFactorEnabled: false,
  });
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
  const [remoteScreenSharesByProducerId, setRemoteScreenSharesByProducerId] =
    useState({});
  const [voiceMemberAudioPrefsByGuild, setVoiceMemberAudioPrefsByGuild] =
    useState(getStoredJson(VOICE_MEMBER_AUDIO_PREFS_KEY, {}));
  const [serverVoiceGatewayPrefs, setServerVoiceGatewayPrefs] = useState(
    getStoredJson(SERVER_VOICE_GATEWAY_PREFS_KEY, {}),
  );
  const [nodeGatewayUnavailableByServer, setNodeGatewayUnavailableByServer] =
    useState({});
  const [clientExtensionCatalog, setClientExtensionCatalog] = useState([]);
  const [serverExtensionCatalog, setServerExtensionCatalog] = useState([]);
  const [installedServerExtensions, setInstalledServerExtensions] = useState(
    [],
  );
  const [serverExtensionsLoading, setServerExtensionsLoading] = useState(false);
  const [serverExtensionBusyById, setServerExtensionBusyById] = useState({});
  const [enabledClientExtensions, setEnabledClientExtensions] = useState(
    getStoredStringArray(CLIENT_EXTENSIONS_ENABLED_KEY),
  );
  const [clientExtensionDevMode, setClientExtensionDevMode] = useState(
    localStorage.getItem(CLIENT_EXTENSIONS_DEV_MODE_KEY) === "1",
  );
  const [clientExtensionDevUrls, setClientExtensionDevUrls] = useState(
    getStoredStringArray(CLIENT_EXTENSIONS_DEV_URLS_KEY),
  );
  const [newClientExtensionDevUrl, setNewClientExtensionDevUrl] = useState("");
  const [clientExtensionLoadState, setClientExtensionLoadState] = useState({});
  const [serverExtensionCommands, setServerExtensionCommands] = useState([]);
  const [slashSelectionIndex, setSlashSelectionIndex] = useState(0);

  function applyNoiseSuppressionPreset(nextPresetRaw) {
    const nextPreset = normalizeNoiseSuppressionPresetForUi(nextPresetRaw);
    setNoiseSuppressionPreset(nextPreset);
    if (nextPreset === "custom") return;
    setNoiseSuppressionConfig(
      normalizeNoiseSuppressionConfigForUi({}, nextPreset),
    );
  }

  function updateNoiseSuppressionConfig(patch = {}) {
    setNoiseSuppressionPreset("custom");
    setNoiseSuppressionConfig((current) =>
      normalizeNoiseSuppressionConfigForUi(
        {
          ...(current || {}),
          ...(patch || {}),
        },
        noiseSuppressionPreset,
      ),
    );
  }

  const messagesRef = useRef(null);
  const gatewayWsRef = useRef(null);
  const gatewayHeartbeatRef = useRef(null);
  const nodeGatewayWsRef = useRef(null);
  const nodeGatewayHeartbeatRef = useRef(null);
  const nodeGatewayReadyRef = useRef(false);
  const voiceGatewayCandidatesRef = useRef([]);
  const voiceSpeakingDetectorRef = useRef({
    audioCtx: null,
    stream: null,
    analyser: null,
    timer: null,
    lastSpeaking: false,
  });
  const pendingVoiceEventsRef = useRef(new Map());
  const voiceSessionStartedAtRef = useRef(0);
  const voiceServerDesyncMissesRef = useRef(0);
  const voiceRecoveringRef = useRef(false);
  const voiceLastRecoverAttemptAtRef = useRef(0);
  const selfUserIdRef = useRef("");
  // Private call gateway — a standalone WS to the official node (or core proxy)
  // used exclusively while a 1:1 call is active. Kept separate so it doesn't
  // disrupt the normal server node gateway.
  const privateCallGatewayWsRef = useRef(null);
  const privateCallGatewayReadyRef = useRef(false);
  const privateCallGatewayHeartbeatRef = useRef(null);
  const voiceMemberAudioPrefsByGuildRef = useRef(voiceMemberAudioPrefsByGuild);
  voiceMemberAudioPrefsByGuildRef.current = voiceMemberAudioPrefsByGuild;
  selfUserIdRef.current = me?.id || "";
  const voiceSfuRef = useRef(null);
  if (!voiceSfuRef.current) {
    voiceSfuRef.current = createSfuVoiceClient({
      getSelfUserId: () => selfUserIdRef.current,
      sendDispatch: (type, data) => sendNodeVoiceDispatch(type, data),
      waitForEvent: waitForVoiceEvent,
      debugLog: voiceDebug,
      onLocalAudioProcessingInfo: (info) => {
        setLocalAudioProcessingInfo(info || null);
      },
      onRemoteVideoAdded: ({ producerId, userId, stream }) => {
        if (!producerId || !stream) return;
        setRemoteScreenSharesByProducerId((prev) => ({
          ...prev,
          [producerId]: { producerId, userId: userId || "", stream },
        }));
      },
      onRemoteAudioAdded: ({ guildId, userId }) => {
        const uid = String(userId || "").trim();
        if (!guildId || !uid) return;
        const guildPrefs =
          voiceMemberAudioPrefsByGuildRef.current?.[guildId] || {};
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
      },
    });
  }
  const selfStatusRef = useRef(selfStatus);
  selfStatusRef.current = selfStatus;

  function getPresence(userId) {
    if (!userId) return "offline";
    if (userId === me?.id) return selfStatus;
    const status = String(
      presenceByUserId[userId]?.status ?? "offline",
    ).toLowerCase();
    return status === "invisible" ? "offline" : status;
  }
  function getRichPresence(userId) {
    if (!userId) return null;
    return presenceByUserId[userId]?.richPresence ?? null;
  }
  const presenceLabels = {
    online: "Online",
    idle: "Idle",
    dnd: "Do Not Disturb",
    offline: "Offline",
    invisible: "Invisible",
  };
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
      <div
        className="avatar-with-presence"
        style={{ width: `${size}px`, height: `${size}px` }}
      >
        {resolvedUrl && (
          <img
            src={resolvedUrl}
            alt={username}
            className="avatar-presence-image"
            onError={(event) => {
              event.currentTarget.style.display = "none";
              const fallback = event.currentTarget.parentElement?.querySelector(
                ".avatar-presence-fallback",
              );
              if (fallback) fallback.style.display = "grid";
            }}
          />
        )}
        <div
          className="avatar-presence-fallback"
          style={{
            background: `hsl(${Math.abs(seedCode * 7) % 360}, 70%, 60%)`,
            display: resolvedUrl ? "none" : "grid",
          }}
        >
          {String(username || "?")
            .substring(0, 1)
            .toUpperCase()}
        </div>
        <span
          className={`presence-indicator-dot ${presenceIndicatorClass(avatarStatus)}`}
        />
      </div>
    );
  }

  const dmMessagesRef = useRef(null);
  const composerInputRef = useRef(null);
  const attachmentInputRef = useRef(null);
  const dmAttachmentInputRef = useRef(null);
  const dmComposerInputRef = useRef(null);
  const isAtBottomRef = useRef(true);
  const isServerAtBottomRef = useRef(true);
  const lastDmMessageCountRef = useRef(0);
  const lastServerMessageCountRef = useRef(0);
  const linkPreviewFetchInFlightRef = useRef(new Set());
  const attachmentPreviewFetchInFlightRef = useRef(new Set());
  const attachmentPreviewUrlByIdRef = useRef({});
  const favouriteMediaPreviewFetchInFlightRef = useRef(new Set());
  const favouriteMediaPreviewUrlByIdRef = useRef({});
  const autoJoinInviteAttemptRef = useRef("");
  const previousDmIdRef = useRef("");
  const previousServerChannelIdRef = useRef("");
  const dmScrollPositionsRef = useRef({});
  const serverScrollPositionsRef = useRef({});
  const activeServerMessagesRef = useRef([]);
  const activeDmMessagesRef = useRef([]);
  const serverHistoryHasMoreByChannelRef = useRef({});
  const dmHistoryHasMoreByThreadRef = useRef({});
  const serverHistoryLoadingByChannelRef = useRef({});
  const dmHistoryLoadingByThreadRef = useRef({});
  const dialogResolverRef = useRef(null);
  const dialogInputRef = useRef(null);
  const activeServerIdRef = useRef("");
  const activeChannelIdRef = useRef("");
  const activeGuildIdRef = useRef("");
  const activeDmIdRef = useRef("");
  const profileCardDragOffsetRef = useRef({ x: 0, y: 0 });
  const profileCardDragPointerIdRef = useRef(null);
  const memberProfilePopoutRef = useRef(null);
  const downloadMenuRef = useRef(null);
  const preferredDownloadTarget = useMemo(
    () => getPreferredDownloadTarget(DOWNLOAD_TARGETS),
    [],
  );
  const isDesktopRuntime = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.location.protocol === "file:" || shouldSkipLandingPage();
  }, []);
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

  function getProfileCardClampOptions() {
    const rect = memberProfilePopoutRef.current?.getBoundingClientRect?.();
    return {
      width:
        Number.isFinite(Number(rect?.width)) && Number(rect.width) > 0
          ? Number(rect.width)
          : 320,
      height:
        Number.isFinite(Number(rect?.height)) && Number(rect.height) > 0
          ? Number(rect.height)
          : 280,
    };
  }

  function openDialog({
    type = "alert",
    title = "OpenCom",
    message = "",
    defaultValue = "",
    confirmLabel = "OK",
    cancelLabel = "Cancel",
  }) {
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
      cancelLabel,
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
      cancelLabel: "Cancel",
    });
  }

  async function confirmDialog(message, title = "Confirm") {
    const result = await openDialog({
      type: "confirm",
      title,
      message,
      confirmLabel: "Confirm",
      cancelLabel: "Cancel",
    });
    return !!result;
  }

  async function alertDialog(message, title = "Notice") {
    await openDialog({
      type: "alert",
      title,
      message,
      confirmLabel: "OK",
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
    favouriteMediaPreviewUrlByIdRef.current = favouriteMediaPreviewUrlById || {};
  }, [favouriteMediaPreviewUrlById]);

  useEffect(() => {
    if (!accessToken) {
      setFavouriteMedia([]);
      setFavouriteMediaModalOpen(false);
      setFavouriteMediaQuery("");
      return;
    }
    loadFavouriteMedia().catch(() => {});
  }, [accessToken]);

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
    if (routePath !== APP_ROUTE_LOGIN) return;
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
      if (
        downloadMenuRef.current &&
        !downloadMenuRef.current.contains(event.target)
      ) {
        setDownloadsMenuOpen(false);
      }
    }

    function closeDownloadsMenuOnEscape(event) {
      if (event.key === "Escape") setDownloadsMenuOpen(false);
    }

    document.addEventListener("mousedown", closeDownloadsMenuOnOutsideClick);
    document.addEventListener("keydown", closeDownloadsMenuOnEscape);

    return () => {
      document.removeEventListener(
        "mousedown",
        closeDownloadsMenuOnOutsideClick,
      );
      document.removeEventListener("keydown", closeDownloadsMenuOnEscape);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(
      CLIENT_EXTENSIONS_ENABLED_KEY,
      JSON.stringify(enabledClientExtensions),
    );
  }, [enabledClientExtensions]);

  useEffect(() => {
    try {
      if (invitePendingCode)
        sessionStorage.setItem(PENDING_INVITE_CODE_KEY, invitePendingCode);
      else sessionStorage.removeItem(PENDING_INVITE_CODE_KEY);
    } catch {}
  }, [invitePendingCode]);

  useEffect(() => {
    try {
      if (invitePendingAutoJoin)
        sessionStorage.setItem(PENDING_INVITE_AUTO_JOIN_KEY, "1");
      else sessionStorage.removeItem(PENDING_INVITE_AUTO_JOIN_KEY);
    } catch {}
  }, [invitePendingAutoJoin]);

  useEffect(() => {
    localStorage.setItem(
      CLIENT_EXTENSIONS_DEV_MODE_KEY,
      clientExtensionDevMode ? "1" : "0",
    );
  }, [clientExtensionDevMode]);

  useEffect(() => {
    localStorage.setItem(
      CLIENT_EXTENSIONS_DEV_URLS_KEY,
      JSON.stringify(clientExtensionDevUrls),
    );
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
      bannerUrl: active.bannerUrl || "",
    });
  }, [activeServerId, servers]);

  useEffect(() => {
    if (!accessToken || !me?.id) {
      setClientExtensionCatalog([]);
      setServerExtensionCatalog([]);
      return;
    }

    api("/v1/extensions/catalog", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((data) => {
        setClientExtensionCatalog(data.clientExtensions || []);
        setServerExtensionCatalog(data.serverExtensions || []);
      })
      .catch(() => {
        setClientExtensionCatalog([]);
        setServerExtensionCatalog([]);
      });
  }, [accessToken, me?.id]);

  async function loadServerExtensionCommands(serverIdOverride = "") {
    const selectedServerId = String(serverIdOverride || activeServerId || "");
    const selectedServer =
      servers.find((server) => server.id === selectedServerId) || null;
    if (!accessToken || !selectedServer) {
      setServerExtensionCommands([]);
      return [];
    }

    try {
      const data = await nodeApi(
        selectedServer.baseUrl,
        "/v1/extensions/commands",
        selectedServer.membershipToken,
      );
      const commands = Array.isArray(data.commands) ? data.commands : [];
      setServerExtensionCommands(commands);
      return commands;
    } catch {
      setServerExtensionCommands([]);
      return [];
    }
  }

  async function loadInstalledServerExtensions(serverIdOverride = "") {
    const selectedServerId = String(serverIdOverride || activeServerId || "");
    if (!accessToken || !selectedServerId) {
      setInstalledServerExtensions([]);
      return [];
    }

    setServerExtensionsLoading(true);
    try {
      const data = await api(`/v1/servers/${selectedServerId}/extensions`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const extensions = Array.isArray(data.extensions) ? data.extensions : [];
      setInstalledServerExtensions(extensions);
      return extensions;
    } catch {
      setInstalledServerExtensions([]);
      return [];
    } finally {
      setServerExtensionsLoading(false);
    }
  }

  useEffect(() => {
    const selectedServer =
      servers.find((server) => server.id === activeServerId) || null;
    if (!accessToken || !selectedServer) {
      setServerExtensionCommands([]);
      return;
    }
    loadServerExtensionCommands(selectedServer.id).catch(() => {});
  }, [accessToken, activeServerId, servers]);

  useEffect(() => {
    const selectedServer =
      servers.find((server) => server.id === activeServerId) || null;
    if (!accessToken || !selectedServer) {
      setInstalledServerExtensions([]);
      return;
    }
    loadInstalledServerExtensions(selectedServer.id).catch(() => {});
  }, [accessToken, activeServerId, servers]);

  useEffect(() => {
    if (!accessToken || !activeServerId) return;
    const timer = window.setInterval(() => {
      loadServerExtensionCommands(activeServerId).catch(() => {});
    }, 30000);
    return () => window.clearInterval(timer);
  }, [accessToken, activeServerId]);

  useEffect(() => {
    if (!accessToken || servers.length === 0) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const currentServers = serversRef.current || [];
        const updates = await Promise.all(
          currentServers.map(async (server) => {
            try {
              const refreshed = await api(
                `/v1/servers/${server.id}/membership-token`,
                {
                  method: "POST",
                  headers: { Authorization: `Bearer ${accessToken}` },
                },
              );
              return {
                id: server.id,
                membershipToken: refreshed.membershipToken,
              };
            } catch {
              return null;
            }
          }),
        );
        if (cancelled) return;
        const byId = new Map(
          updates
            .filter(Boolean)
            .map((item) => [item.id, item.membershipToken]),
        );
        if (byId.size) {
          setServers((current) =>
            current.map((server) => {
              const token = byId.get(server.id);
              return token ? { ...server, membershipToken: token } : server;
            }),
          );
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
      const refreshed = await refreshAccessTokenWithRefreshToken().catch(
        () => null,
      );
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

  async function loadClientExtensionSource({
    extensionId,
    extensionName,
    devUrl,
  }) {
    if (devUrl) {
      const response = await fetch(devUrl);
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
      return response.text();
    }

    const response = await fetch(
      `${CORE_API}/v1/extensions/client/${encodeURIComponent(extensionId)}/source`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    return response.text();
  }

  async function loadClientExtensionRuntime({
    extensionId,
    extensionName,
    devUrl,
  }) {
    const source = await loadClientExtensionSource({
      extensionId,
      extensionName,
      devUrl,
    });
    const blob = new Blob([source], { type: "application/javascript" });
    const moduleUrl = URL.createObjectURL(blob);

    try {
      const extensionModule = await import(/* @vite-ignore */ moduleUrl);
      const activate =
        extensionModule?.activateClient || extensionModule?.default;
      if (typeof activate !== "function")
        throw new Error("Missing activateClient export");

      const extensionApi = {
        registerPanel: (panel) => {
          extensionPanelsRef.current.push(panel);
        },
        coreApi: (path, options = {}) =>
          api(path, {
            ...options,
            headers: {
              Authorization: `Bearer ${accessToken}`,
              ...(options.headers || {}),
            },
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
            screenSharing: !!isScreenSharing,
          }),
          join: async (channelId) => {
            const channel = (channels || []).find(
              (item) => item?.id === channelId && item?.type === "voice",
            );
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
            return () =>
              window.removeEventListener(
                "opencom-voice-state-change",
                listener,
              );
          },
        },
      };

      await Promise.resolve(activate(extensionApi));
    } finally {
      URL.revokeObjectURL(moduleUrl);
    }
  }

  useEffect(() => {
    if (!accessToken) return;

    const requested = [
      ...enabledClientExtensions.map((id) => ({
        id,
        extensionId: id,
        extensionName: id,
        devUrl: null,
      })),
      ...(clientExtensionDevMode
        ? clientExtensionDevUrls.map((url, index) => ({
            id: `dev:${url}`,
            extensionId: `dev-extension-${index + 1}`,
            extensionName: `Developer Extension ${index + 1}`,
            devUrl: url,
          }))
        : []),
    ];

    requested.forEach((entry) => {
      if (loadedClientExtensionIdsRef.current.has(entry.id)) return;
      loadedClientExtensionIdsRef.current.add(entry.id);
      setClientExtensionLoadState((current) => ({
        ...current,
        [entry.id]: "loading",
      }));

      loadClientExtensionRuntime(entry)
        .then(() =>
          setClientExtensionLoadState((current) => ({
            ...current,
            [entry.id]: "loaded",
          })),
        )
        .catch((error) =>
          setClientExtensionLoadState((current) => ({
            ...current,
            [entry.id]: `error:${error.message}`,
          })),
        );
    });
  }, [
    accessToken,
    enabledClientExtensions,
    clientExtensionDevMode,
    clientExtensionDevUrls,
    me,
  ]);

  function toggleClientExtension(extensionId, enabled) {
    setEnabledClientExtensions((current) => {
      if (enabled)
        return current.includes(extensionId)
          ? current
          : [...current, extensionId];
      return current.filter((id) => id !== extensionId);
    });
  }

  async function refreshServerExtensions(serverIdOverride = "") {
    const selectedServerId = String(serverIdOverride || activeServerId || "");
    if (!selectedServerId) return;
    await Promise.all([
      loadInstalledServerExtensions(selectedServerId),
      loadServerExtensionCommands(selectedServerId),
    ]);
  }

  async function toggleServerExtension(extensionId, enabled) {
    const selectedServerId = String(activeServerId || "");
    if (!accessToken || !selectedServerId || !extensionId) return;

    setServerExtensionBusyById((current) => ({
      ...current,
      [extensionId]: true,
    }));
    try {
      await api(
        `/v1/servers/${selectedServerId}/extensions/${encodeURIComponent(extensionId)}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ enabled: !!enabled }),
        },
      );
      await refreshServerExtensions(selectedServerId);
      setStatus(
        `${enabled ? "Enabled" : "Disabled"} server extension: ${extensionId}`,
      );
    } catch (error) {
      setStatus(`Server extension update failed: ${error.message}`);
    } finally {
      setServerExtensionBusyById((current) => {
        const next = { ...current };
        delete next[extensionId];
        return next;
      });
    }
  }

  function addClientDevExtensionUrl() {
    const trimmed = newClientExtensionDevUrl.trim();
    if (!trimmed) return;
    setClientExtensionDevUrls((current) =>
      current.includes(trimmed) ? current : [...current, trimmed],
    );
    setNewClientExtensionDevUrl("");
  }

  // Resolve usernames and profile pictures from core for guild members and message authors
  useEffect(() => {
    if (!accessToken) return;
    const ids = new Set();
    (guildState?.members || []).forEach((m) => m.id && ids.add(m.id));
    messages.forEach((msg) => {
      const id = msg.author_id || msg.authorId;
      if (id && !String(id).startsWith("ext:")) ids.add(id);
    });
    if (me?.id) ids.add(me.id);
    const toFetch = [...ids].filter(
      (id) => !userCache[id] && !userCacheFetchingRef.current.has(id),
    );
    if (toFetch.length === 0) return;
    toFetch.forEach((id) => userCacheFetchingRef.current.add(id));
    Promise.all(
      toFetch.map((id) =>
        fetch(`${CORE_API}/v1/users/${id}/profile`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ),
    ).then((results) => {
      toFetch.forEach((id) => userCacheFetchingRef.current.delete(id));
      setUserCache((prev) => {
        const next = { ...prev };
        toFetch.forEach((id, i) => {
          const data = results[i];
          if (
            data &&
            (data.username != null ||
              data.displayName != null ||
              data.pfpUrl != null)
          ) {
            next[id] = {
              username: data.username ?? data.displayName ?? id,
              displayName: data.displayName ?? data.username ?? id,
              pfpUrl: data.pfpUrl ?? null,
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
        displayName:
          profile.displayName ?? profile.username ?? me.username ?? me.id,
        pfpUrl: profile.pfpUrl ?? null,
      },
    }));
  }, [
    me?.id,
    me?.username,
    profile?.username,
    profile?.displayName,
    profile?.pfpUrl,
  ]);

  const activeServer = useMemo(
    () => servers.find((server) => server.id === activeServerId) || null,
    [servers, activeServerId],
  );
  const activeGuild = useMemo(
    () => guilds.find((guild) => guild.id === activeGuildId) || null,
    [guilds, activeGuildId],
  );
  const workingGuildId = useMemo(
    () =>
      activeGuildId ||
      activeGuild?.id ||
      guildState?.guild?.id ||
      activeServer?.defaultGuildId ||
      "",
    [
      activeGuildId,
      activeGuild?.id,
      guildState?.guild?.id,
      activeServer?.defaultGuildId,
    ],
  );
  const voiceConnectedChannelId = voiceSession.channelId;
  const voiceConnectedGuildId = voiceSession.guildId;
  const isInVoiceChannel = !!voiceConnectedChannelId;
  const voiceConnectedServer = useMemo(
    () =>
      servers.find(
        (server) => server.defaultGuildId === voiceConnectedGuildId,
      ) || null,
    [servers, voiceConnectedGuildId],
  );
  const nodeGatewayTargetServer = useMemo(() => {
    if (voiceConnectedServer?.baseUrl && voiceConnectedServer?.membershipToken)
      return voiceConnectedServer;
    return activeServer;
  }, [voiceConnectedServer, activeServer]);
  const nodeGatewayConnectedForActiveServer = !!(
    nodeGatewayConnected &&
    activeServer?.id &&
    nodeGatewayServerId === activeServer.id
  );
  const channels = guildState?.channels || [];
  const voiceConnectedChannelName = useMemo(() => {
    if (!voiceConnectedChannelId) return "";
    const connectedChannel = channels.find(
      (channel) => channel.id === voiceConnectedChannelId,
    );
    return connectedChannel?.name || voiceConnectedChannelId;
  }, [channels, voiceConnectedChannelId]);
  const activeChannel = useMemo(
    () => channels.find((channel) => channel.id === activeChannelId) || null,
    [channels, activeChannelId],
  );
  const activeDm = useMemo(
    () => dms.find((dm) => dm.id === activeDmId) || null,
    [dms, activeDmId],
  );
  activeServerMessagesRef.current = messages;
  activeDmMessagesRef.current = activeDm?.messages || [];
  const installedServerExtensionById = useMemo(
    () =>
      new Map(
        (installedServerExtensions || []).map((item) => [
          item?.extensionId,
          item,
        ]),
      ),
    [installedServerExtensions],
  );
  const serverExtensionsForDisplay = useMemo(() => {
    const catalog = Array.isArray(serverExtensionCatalog)
      ? serverExtensionCatalog
      : [];
    const merged = catalog.map((ext) => ({
      ...ext,
      installed: installedServerExtensionById.get(ext.id) || null,
      enabled: !!installedServerExtensionById.get(ext.id)?.enabled,
    }));
    const knownIds = new Set(merged.map((item) => item.id));
    for (const installed of installedServerExtensions || []) {
      if (!installed?.extensionId || knownIds.has(installed.extensionId))
        continue;
      const manifest = installed.manifest || {};
      merged.push({
        id: installed.extensionId,
        name: manifest.name || installed.extensionId,
        version: manifest.version || "0.1.0",
        description: manifest.description || "",
        installed,
        enabled: !!installed.enabled,
      });
    }
    return merged.sort((a, b) =>
      String(a?.name || "").localeCompare(String(b?.name || "")),
    );
  }, [
    serverExtensionCatalog,
    installedServerExtensionById,
    installedServerExtensions,
  ]);

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
      if (
        (myGuildPermissions & GUILD_PERM.ADMINISTRATOR) ===
        GUILD_PERM.ADMINISTRATOR
      )
        return true;
      return (myGuildPermissions & bit) === bit;
    };
  }, [myGuildPermissions]);

  const canManageServer = useMemo(() => {
    if (!activeServer) return false;
    const coreManage =
      (activeServer.roles || []).includes("owner") ||
      (activeServer.roles || []).includes("platform_admin");
    return (
      coreManage ||
      hasGuildPermission(GUILD_PERM.MANAGE_CHANNELS) ||
      hasGuildPermission(GUILD_PERM.MANAGE_ROLES)
    );
  }, [activeServer, hasGuildPermission]);

  const canKickMembers = useMemo(() => {
    if (!activeServer) return false;
    return (
      (activeServer.roles || []).includes("owner") ||
      (activeServer.roles || []).includes("platform_admin") ||
      hasGuildPermission(GUILD_PERM.KICK_MEMBERS)
    );
  }, [activeServer, hasGuildPermission]);

  const canBanMembers = useMemo(() => {
    if (!activeServer) return false;
    return (
      (activeServer.roles || []).includes("owner") ||
      (activeServer.roles || []).includes("platform_admin") ||
      hasGuildPermission(GUILD_PERM.BAN_MEMBERS)
    );
  }, [activeServer, hasGuildPermission]);

  const canServerMuteMembers = useMemo(() => {
    if (!activeServer) return false;
    return (
      (activeServer.roles || []).includes("owner") ||
      (activeServer.roles || []).includes("platform_admin") ||
      hasGuildPermission(GUILD_PERM.MUTE_MEMBERS)
    );
  }, [activeServer, hasGuildPermission]);

  const canServerDeafenMembers = useMemo(() => {
    if (!activeServer) return false;
    return (
      (activeServer.roles || []).includes("owner") ||
      (activeServer.roles || []).includes("platform_admin") ||
      hasGuildPermission(GUILD_PERM.DEAFEN_MEMBERS)
    );
  }, [activeServer, hasGuildPermission]);

  const canMoveVoiceMembers = useMemo(() => {
    if (!activeServer) return false;
    return (
      (activeServer.roles || []).includes("owner") ||
      (activeServer.roles || []).includes("platform_admin") ||
      hasGuildPermission(GUILD_PERM.MOVE_MEMBERS)
    );
  }, [activeServer, hasGuildPermission]);

  const canDeleteServerMessages = useMemo(() => {
    if (!activeServer) return false;
    const coreStaff =
      (activeServer.roles || []).includes("owner") ||
      (activeServer.roles || []).includes("platform_admin") ||
      (activeServer.roles || []).includes("admin") ||
      (activeServer.roles || []).includes("server_admin");
    return coreStaff || hasGuildPermission(GUILD_PERM.MANAGE_CHANNELS);
  }, [activeServer, hasGuildPermission]);

  const canModerateMembers = canKickMembers || canBanMembers;
  const hasBoostForFullProfiles = !!(
    boostStatus?.active ||
    profile?.boostActive ||
    profile?.badges?.includes?.("boost")
  );
  const profileStudioCanvasMinHeight = useMemo(
    () => Math.max(420, Math.min(900, Math.round(viewportSize.height - 300))),
    [viewportSize.height],
  );
  const profileStudioPreviewProfile = useMemo(
    () => ({
      ...(profile || {}),
      displayName:
        typeof profileForm?.displayName === "string"
          ? profileForm.displayName
          : (profile?.displayName ?? ""),
      bio:
        typeof profileForm?.bio === "string"
          ? profileForm.bio
          : (profile?.bio ?? ""),
      pfpUrl:
        typeof profileForm?.pfpUrl === "string"
          ? profileForm.pfpUrl
          : (profile?.pfpUrl ?? ""),
      bannerUrl:
        typeof profileForm?.bannerUrl === "string"
          ? profileForm.bannerUrl
          : (profile?.bannerUrl ?? ""),
      fullProfile: fullProfileDraft,
    }),
    [profile, profileForm, fullProfileDraft],
  );
  const selectedProfileStudioElement = useMemo(
    () =>
      (fullProfileDraft?.elements || []).find(
        (item) => item.id === profileStudioSelectedElementId,
      ) || null,
    [fullProfileDraft?.elements, profileStudioSelectedElementId],
  );
  const canAccessServerAdminPanel = useMemo(() => {
    return servers.some((server) => {
      const roles = Array.isArray(server?.roles) ? server.roles : [];
      return (
        roles.includes("owner") ||
        roles.includes("platform_admin") ||
        roles.includes("admin") ||
        roles.includes("server_admin")
      );
    });
  }, [servers]);

  const sortedChannels = useMemo(
    () =>
      [...(channels || [])]
        .filter(Boolean)
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [channels],
  );
  const categoryChannels = useMemo(
    () =>
      sortedChannels.filter(
        (channel) => channel && channel.type === "category",
      ),
    [sortedChannels],
  );
  const serverEmoteByName = useMemo(() => {
    const map = new Map();
    for (const emote of guildState?.emotes || []) {
      const name = String(emote?.name || "").toLowerCase();
      if (!name) continue;
      map.set(name, emote);
    }
    return map;
  }, [guildState?.emotes]);

  const filteredFriends = useMemo(() => {
    const query = friendQuery.trim().toLowerCase();
    if (!query) return friends;
    return friends.filter(
      (friend) =>
        friend.username.toLowerCase().includes(query) ||
        friend.id.includes(query),
    );
  }, [friendQuery, friends]);

  const memberList = useMemo(() => {
    const listed = guildState?.members || [];
    if (listed.length) return listed;

    const members = new Map();
    for (const message of messages) {
      const id = message.author_id || message.authorId;
      if (!id || members.has(id)) continue;
      members.set(id, {
        id,
        username: message.username || id,
        status: "offline",
        pfp_url: message.pfp_url || null,
        roleIds: [],
      });
    }

    if (me?.id && !members.has(me.id)) {
      members.set(me.id, {
        id: me.id,
        username: me.username || me.id,
        status: "offline",
        pfp_url: profile?.pfpUrl || null,
        roleIds: guildState?.me?.roleIds || [],
      });
    }

    return Array.from(members.values());
  }, [guildState, messages, me, profile]);

  const resolvedMemberList = useMemo(
    () =>
      memberList.map((m) => ({
        ...m,
        username:
          userCache[m.id]?.displayName ||
          userCache[m.id]?.username ||
          m.username,
        pfp_url: userCache[m.id]?.pfpUrl ?? m.pfp_url,
      })),
    [memberList, userCache],
  );

  const mentionSuggestions = useMemo(() => {
    const mention = getMentionQuery(messageText);
    if (!mention || navMode !== "servers") return [];
    const candidateNames = [
      "everyone",
      ...resolvedMemberList.map((member) => member.username || ""),
    ]
      .map((name) => name.trim())
      .filter(Boolean);
    const uniqueNames = Array.from(new Set(candidateNames));
    if (!mention.query) return uniqueNames.slice(0, 8);
    return uniqueNames
      .filter((name) => name.toLowerCase().startsWith(mention.query))
      .slice(0, 8);
  }, [messageText, navMode, resolvedMemberList]);

  const slashQuery = useMemo(() => {
    if (navMode !== "servers") return null;
    return getSlashQuery(messageText);
  }, [messageText, navMode]);

  const slashCommandSuggestions = useMemo(() => {
    if (slashQuery == null) return [];
    const catalog = [...serverExtensionCommands].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    if (!slashQuery) return catalog.slice(0, 10);
    return catalog
      .filter((command) => command.name.toLowerCase().includes(slashQuery))
      .slice(0, 10);
  }, [slashQuery, serverExtensionCommands]);
  const showingSlash = slashQuery != null;

  const memberByMentionToken = useMemo(() => {
    const map = new Map();
    for (const member of resolvedMemberList) {
      if (!member?.id) continue;
      map.set(String(member.id).toLowerCase(), member);
      if (member.username)
        map.set(String(member.username).toLowerCase(), member);
    }
    return map;
  }, [resolvedMemberList]);

  const memberNameById = useMemo(
    () =>
      new Map(resolvedMemberList.map((member) => [member.id, member.username])),
    [resolvedMemberList],
  );

  const mergedVoiceStates = useMemo(() => {
    const base = guildState?.voiceStates || [];
    if (!activeGuildId) return base;
    const live = voiceStatesByGuild[activeGuildId] || {};
    if (!Object.keys(live).length) return base;
    const byUser = new Map(base.map((vs) => [vs.userId, vs]));
    for (const [userId, state] of Object.entries(live)) {
      if (!state?.channelId) byUser.delete(userId);
      else
        byUser.set(userId, {
          userId,
          channelId: state.channelId,
          muted: !!state.muted,
          deafened: !!state.deafened,
        });
    }
    return Array.from(byUser.values());
  }, [guildState?.voiceStates, voiceStatesByGuild, activeGuildId]);

  const isVoiceSessionSynced = useMemo(() => {
    if (!me?.id || !voiceConnectedGuildId || !voiceConnectedChannelId)
      return false;
    const liveSelfState = voiceStatesByGuild[voiceConnectedGuildId]?.[me.id];
    if (liveSelfState?.channelId)
      return liveSelfState.channelId === voiceConnectedChannelId;
    if (activeGuildId === voiceConnectedGuildId) {
      const mergedSelfState = mergedVoiceStates.find(
        (vs) => vs.userId === me.id,
      );
      return mergedSelfState?.channelId === voiceConnectedChannelId;
    }
    return false;
  }, [
    me?.id,
    voiceConnectedGuildId,
    voiceConnectedChannelId,
    voiceStatesByGuild,
    activeGuildId,
    mergedVoiceStates,
  ]);

  const voiceMembersByChannel = useMemo(() => {
    const map = new Map();
    for (const vs of mergedVoiceStates) {
      if (!vs?.channelId || !vs?.userId) continue;
      const member = resolvedMemberList.find((item) => item.id === vs.userId);
      if (!map.has(vs.channelId)) map.set(vs.channelId, []);
      map.get(vs.channelId).push({
        id: vs.userId,
        userId: vs.userId,
        username: memberNameById.get(vs.userId) || vs.userId,
        pfp_url: member?.pfp_url || null,
        roleIds: member?.roleIds || [],
        muted: !!vs.muted,
        deafened: !!vs.deafened,
      });
    }
    return map;
  }, [mergedVoiceStates, memberNameById, resolvedMemberList]);
  const remoteScreenShares = useMemo(
    () => Object.values(remoteScreenSharesByProducerId),
    [remoteScreenSharesByProducerId],
  );
  const selectedRemoteScreenShare = useMemo(() => {
    if (!remoteScreenShares.length) return null;
    return (
      remoteScreenShares.find(
        (share) => share.producerId === selectedScreenShareProducerId,
      ) || remoteScreenShares[0]
    );
  }, [remoteScreenShares, selectedScreenShareProducerId]);
  const fullProfileViewerHasMusicElement = useMemo(() => {
    const elements = fullProfileViewer?.fullProfile?.elements;
    return (
      Array.isArray(elements) &&
      elements.some(
        (element) => String(element?.type || "").toLowerCase() === "music",
      )
    );
  }, [fullProfileViewer?.fullProfile?.elements]);
  const fullProfileViewerHasPlayableMusic = useMemo(
    () =>
      fullProfileViewerHasMusicElement &&
      !!String(fullProfileViewer?.fullProfile?.music?.url || "").trim(),
    [
      fullProfileViewerHasMusicElement,
      fullProfileViewer?.fullProfile?.music?.url,
    ],
  );
  const activeVoiceMemberAudioPrefs = useMemo(() => {
    if (!activeGuildId) return {};
    const scoped = voiceMemberAudioPrefsByGuild?.[activeGuildId];
    return scoped && typeof scoped === "object" ? scoped : {};
  }, [voiceMemberAudioPrefsByGuild, activeGuildId]);

  const groupedChannelSections = useMemo(() => {
    const categories = categoryChannels.map((category) => ({
      category,
      channels: sortedChannels.filter(
        (channel) =>
          channel.parent_id === category.id && channel.type !== "category",
      ),
    }));

    const uncategorized = sortedChannels.filter(
      (channel) => !channel.parent_id && channel.type !== "category",
    );

    return [
      ...categories,
      ...(uncategorized.length
        ? [
            {
              category: { id: "uncategorized", name: "Channels" },
              channels: uncategorized,
            },
          ]
        : []),
    ];
  }, [categoryChannels, sortedChannels]);

  const groupedServerMessages = useMemo(
    () =>
      groupMessages(
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
        },
      ),
    [messages, memberNameById, userCache],
  );

  const groupedDmMessages = useMemo(
    () =>
      groupMessages(
        activeDm?.messages || [],
        (message) => message.author || "Unknown",
        (message) => message.createdAt,
        (message) => message.authorId || "unknown",
        (message) => message.pfp_url || null,
      ),
    [activeDm],
  );

  const activePinnedServerMessages = useMemo(
    () => pinnedServerMessages[activeChannelId] || [],
    [pinnedServerMessages, activeChannelId],
  );
  const activePinnedDmMessages = useMemo(
    () => pinnedDmMessages[activeDmId] || [],
    [pinnedDmMessages, activeDmId],
  );
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
      volume: Number.isFinite(volume)
        ? Math.max(0, Math.min(100, volume))
        : 100,
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
        volume:
          patch.volume === undefined
            ? Number.isFinite(Number(existing.volume))
              ? Math.max(0, Math.min(100, Number(existing.volume)))
              : 100
            : Math.max(0, Math.min(100, Number(patch.volume))),
      };
      return {
        ...(current || {}),
        [activeGuildId]: {
          ...guildPrefs,
          [id]: next,
        },
      };
    });
  }

  async function promptSetVoiceMemberLocalVolume(userId) {
    const current = getVoiceMemberAudioPref(userId);
    const raw = await promptText(
      "Set local user volume (0-100):",
      String(current.volume),
    );
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
      customUrl: typeof pref.customUrl === "string" ? pref.customUrl : "",
    };
  }, [activeServerId, serverVoiceGatewayPrefs]);
  const favouriteMediaByKey = useMemo(() => {
    const byKey = new Map();
    for (const item of favouriteMedia) {
      const key = buildFavouriteMediaKey(item?.sourceKind, item?.sourceUrl);
      if (!key) continue;
      byKey.set(key, item);
    }
    return byKey;
  }, [favouriteMedia]);
  const filteredFavouriteMedia = useMemo(() => {
    const query = String(favouriteMediaQuery || "")
      .trim()
      .toLowerCase();
    if (!query) return favouriteMedia;
    return favouriteMedia.filter((item) =>
      [
        item?.fileName,
        item?.title,
        item?.contentType,
        item?.pageUrl,
        item?.sourceUrl,
      ].some((value) => String(value || "").toLowerCase().includes(query)),
    );
  }, [favouriteMedia, favouriteMediaQuery]);

  async function refreshSocialData(token = accessToken) {
    if (!token) return;
    const [friendsData, dmsData, requestData, socialSettingsData] =
      await Promise.all([
        api("/v1/social/friends", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        api("/v1/social/dms", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        api("/v1/social/requests", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        api("/v1/social/settings", {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

    setFriends(friendsData.friends || []);
    let nextDms = [];
    setDms((current) => {
      const previous = new Map(current.map((item) => [item.id, item]));
      nextDms = (dmsData.dms || []).map((item) => ({
        ...item,
        messages: previous.get(item.id)?.messages || [],
      }));
      return nextDms;
    });

    // Preserve current DM selection if it still exists, otherwise find last DM with messages
    if (!nextDms.some((item) => item.id === activeDmId)) {
      const dmWithMessages = nextDms.find(
        (dm) => dm.messages && dm.messages.length > 0,
      );
      const nextActiveDmId = dmWithMessages?.id || nextDms[0]?.id || "";
      if (nextActiveDmId) {
        setActiveDmId(nextActiveDmId);
        localStorage.setItem(ACTIVE_DM_KEY, nextActiveDmId);
      }
    }

    setFriendRequests({
      incoming: requestData.incoming || [],
      outgoing: requestData.outgoing || [],
    });
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
    bridge
      .getSession()
      .then((data) => {
        if (cancelled || !data) return;
        const nextAccess =
          typeof data.accessToken === "string" ? data.accessToken : "";
        const nextRefresh =
          typeof data.refreshToken === "string" ? data.refreshToken : "";
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
        coreApi: CORE_API,
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
    () =>
      JSON.stringify(
        (me?.id ? presenceByUserId[me.id]?.richPresence : null) || null,
      ),
    [me?.id, presenceByUserId],
  );

  useEffect(() => {
    if (!me?.id) return;
    let parsed = null;
    try {
      parsed = JSON.parse(selfRichPresenceSnapshot);
    } catch {}
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
    bridge
      .setSession({
        accessToken: accessToken || "",
        refreshToken: refreshToken || "",
      })
      .catch(() => {});
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
      setServers((current) =>
        current.map((server) =>
          server.id === serverId ? { ...server, membershipToken } : server,
        ),
      );
    };
    window.addEventListener("opencom-access-token-refresh", onAccessRefresh);
    window.addEventListener(
      "opencom-membership-token-refresh",
      onMembershipRefresh,
    );
    return () => {
      window.removeEventListener(
        "opencom-access-token-refresh",
        onAccessRefresh,
      );
      window.removeEventListener(
        "opencom-membership-token-refresh",
        onMembershipRefresh,
      );
    };
  }, []);

  useEffect(() => {
    if (accessToken) return;
    const storedFriends = getStoredJson(`opencom_friends_${storageScope}`, []);
    const storedDms = getStoredJson(`opencom_dms_${storageScope}`, []);
    setFriends(storedFriends);
    setDms(storedDms);
    if (!storedDms.some((item) => item.id === activeDmId))
      setActiveDmId(storedDms[0]?.id || "");
  }, [storageScope, accessToken]);

  useEffect(() => {
    localStorage.setItem(
      `opencom_friends_${storageScope}`,
      JSON.stringify(friends),
    );
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
    localStorage.setItem(
      VOICE_MEMBER_AUDIO_PREFS_KEY,
      JSON.stringify(voiceMemberAudioPrefsByGuild || {}),
    );
  }, [voiceMemberAudioPrefsByGuild]);

  useEffect(() => {
    if (activeDmId) localStorage.setItem(ACTIVE_DM_KEY, activeDmId);
    setDmReplyTarget(null);
  }, [activeDmId]);

  useEffect(() => {
    const onResize = () =>
      setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!draggingProfileCard) return;
    const onMove = (event) => {
      if (
        profileCardDragPointerIdRef.current != null &&
        Number.isFinite(Number(event.pointerId)) &&
        event.pointerId !== profileCardDragPointerIdRef.current
      )
        return;
      const rawX = invertProfileDrag
        ? profileCardDragOffsetRef.current.x - event.clientX
        : event.clientX - profileCardDragOffsetRef.current.x;
      const rawY = invertProfileDrag
        ? profileCardDragOffsetRef.current.y - event.clientY
        : event.clientY - profileCardDragOffsetRef.current.y;
      setProfileCardPosition(
        clampProfileCardPosition(rawX, rawY, getProfileCardClampOptions()),
      );
    };
    const onUp = (event) => {
      if (
        profileCardDragPointerIdRef.current != null &&
        Number.isFinite(Number(event.pointerId)) &&
        event.pointerId !== profileCardDragPointerIdRef.current
      )
        return;
      profileCardDragPointerIdRef.current = null;
      setDraggingProfileCard(false);
    };
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [draggingProfileCard, invertProfileDrag]);

  useEffect(() => {
    if (!memberProfileCard) return;
    const raf = window.requestAnimationFrame(() => {
      setProfileCardPosition((current) => {
        const next = clampProfileCardPosition(
          current.x,
          current.y,
          getProfileCardClampOptions(),
        );
        return next.x === current.x && next.y === current.y ? current : next;
      });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [memberProfileCard?.id, viewportSize.width, viewportSize.height]);

  useEffect(() => {
    fullProfileElementsRef.current = fullProfileDraft?.elements || [];
  }, [fullProfileDraft?.elements]);

  useEffect(() => {
    if (!fullProfileDraggingElementId) return;
    const onMove = (event) => {
      const canvas = fullProfileEditorCanvasRef.current;
      if (!canvas) return;
      const activeElement = (fullProfileElementsRef.current || []).find(
        (item) => item.id === fullProfileDraggingElementId,
      );
      if (!activeElement) return;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const px = ((event.clientX - rect.left) / rect.width) * 100;
      const py = ((event.clientY - rect.top) / rect.height) * 100;
      const nextRect = clampProfileElementRect(
        {
          x: px - fullProfileDragOffsetRef.current.x,
          y: py - fullProfileDragOffsetRef.current.y,
          w: activeElement.w,
          h: activeElement.h,
        },
        activeElement,
      );
      updateFullProfileElement(fullProfileDraggingElementId, {
        x: nextRect.x,
        y: nextRect.y,
      });
    };
    const onUp = () => setFullProfileDraggingElementId("");
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [fullProfileDraggingElementId]);

  useEffect(() => {
    const elements = fullProfileDraft?.elements || [];
    if (!elements.length) {
      if (profileStudioSelectedElementId) setProfileStudioSelectedElementId("");
      return;
    }
    if (
      !profileStudioSelectedElementId ||
      !elements.some((item) => item.id === profileStudioSelectedElementId)
    ) {
      setProfileStudioSelectedElementId(elements[0].id);
    }
  }, [fullProfileDraft?.elements, profileStudioSelectedElementId]);

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
          setStatus(
            updated
              ? "Easter egg enabled: profile drag is inverted."
              : "Easter egg disabled: profile drag restored.",
          );
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
      return (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        !!target.isContentEditable
      );
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

  useEffect(() => {
    if (navMode !== "servers") previousServerChannelIdRef.current = "";
    if (navMode !== "dms") previousDmIdRef.current = "";
  }, [navMode]);

  async function loadOlderServerMessages() {
    if (navMode !== "servers" || !activeServer || !activeChannelId)
      return false;
    const channelKey = `${activeGuildId || ""}:${activeChannelId || ""}`;
    if (!channelKey) return false;
    if (serverHistoryLoadingByChannelRef.current[channelKey]) return false;
    if (serverHistoryHasMoreByChannelRef.current[channelKey] === false)
      return false;

    const currentMessages = activeServerMessagesRef.current || [];
    const oldestMessage = currentMessages[0];
    const before = toIsoTimestamp(
      oldestMessage?.created_at || oldestMessage?.createdAt,
    );
    if (!before) {
      serverHistoryHasMoreByChannelRef.current[channelKey] = false;
      return false;
    }

    const container = messagesRef.current;
    const previousScrollHeight = container?.scrollHeight || 0;
    const previousScrollTop = container?.scrollTop || 0;
    const targetChannelId = activeChannelId;
    const targetGuildId = activeGuildId;
    const targetServerId = activeServer.id;
    serverHistoryLoadingByChannelRef.current[channelKey] = true;

    try {
      const path = buildPaginatedPath(
        `/v1/channels/${targetChannelId}/messages`,
        {
          limit: MESSAGE_PAGE_SIZE,
          before,
        },
      );
      const data = await nodeApi(
        activeServer.baseUrl,
        path,
        activeServer.membershipToken,
      );
      if (
        activeChannelIdRef.current !== targetChannelId ||
        activeGuildIdRef.current !== targetGuildId ||
        activeServerIdRef.current !== targetServerId
      ) {
        return false;
      }

      const fetched = Array.isArray(data?.messages) ? data.messages : [];
      const olderMessages = fetched.slice().reverse();
      const hasMore =
        data?.hasMore != null
          ? !!data.hasMore
          : fetched.length >= MESSAGE_PAGE_SIZE;
      serverHistoryHasMoreByChannelRef.current[channelKey] = hasMore;
      if (!olderMessages.length) return false;

      setMessages((current) =>
        mergeMessagesChronologically(
          current,
          olderMessages,
          (message) => message.created_at || message.createdAt,
        ),
      );

      window.requestAnimationFrame(() => {
        const nextContainer = messagesRef.current;
        if (!nextContainer) return;
        const delta = nextContainer.scrollHeight - previousScrollHeight;
        nextContainer.scrollTop = Math.max(0, previousScrollTop + delta);
      });

      return true;
    } catch (error) {
      setStatus(`Message history fetch failed: ${error.message}`);
      return false;
    } finally {
      serverHistoryLoadingByChannelRef.current[channelKey] = false;
    }
  }

  async function loadOlderDmMessages() {
    if (navMode !== "dms" || !activeDmId || !accessToken) return false;
    const threadId = activeDmId;
    if (dmHistoryLoadingByThreadRef.current[threadId]) return false;
    if (dmHistoryHasMoreByThreadRef.current[threadId] === false) return false;

    const currentMessages = activeDmMessagesRef.current || [];
    const oldestMessage = currentMessages[0];
    const before = toIsoTimestamp(
      oldestMessage?.createdAt || oldestMessage?.created_at,
    );
    if (!before) {
      dmHistoryHasMoreByThreadRef.current[threadId] = false;
      return false;
    }

    const container = dmMessagesRef.current;
    const previousScrollHeight = container?.scrollHeight || 0;
    const previousScrollTop = container?.scrollTop || 0;
    dmHistoryLoadingByThreadRef.current[threadId] = true;

    try {
      const path = buildPaginatedPath(`/v1/social/dms/${threadId}/messages`, {
        limit: MESSAGE_PAGE_SIZE,
        before,
      });
      const data = await api(path, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (activeDmIdRef.current !== threadId) return false;

      const olderMessages = Array.isArray(data?.messages) ? data.messages : [];
      const hasMore =
        data?.hasMore != null
          ? !!data.hasMore
          : olderMessages.length >= MESSAGE_PAGE_SIZE;
      dmHistoryHasMoreByThreadRef.current[threadId] = hasMore;
      if (!olderMessages.length) return false;

      setDms((current) =>
        current.map((item) => {
          if (item.id !== threadId) return item;
          return {
            ...item,
            messages: mergeMessagesChronologically(
              item.messages || [],
              olderMessages,
              (message) => message.createdAt || message.created_at,
            ),
          };
        }),
      );

      window.requestAnimationFrame(() => {
        const nextContainer = dmMessagesRef.current;
        if (!nextContainer) return;
        const delta = nextContainer.scrollHeight - previousScrollHeight;
        nextContainer.scrollTop = Math.max(0, previousScrollTop + delta);
      });

      return true;
    } catch (error) {
      setStatus(`DM history fetch failed: ${error.message}`);
      return false;
    } finally {
      dmHistoryLoadingByThreadRef.current[threadId] = false;
    }
  }

  // Keep server chat scroll position per channel and only auto-scroll when user is near the bottom.
  useEffect(() => {
    if (!messagesRef.current || navMode !== "servers") return;
    const container = messagesRef.current;
    const channelKey = `${activeGuildId || ""}:${activeChannelId || ""}`;
    const isNewChannel = channelKey !== previousServerChannelIdRef.current;
    const currentMessageCount = messages.length;

    if (isNewChannel) {
      previousServerChannelIdRef.current = channelKey;
      lastServerMessageCountRef.current = currentMessageCount;
      const savedTop = serverScrollPositionsRef.current[channelKey];
      if (Number.isFinite(savedTop)) {
        container.scrollTop = savedTop;
        isServerAtBottomRef.current =
          container.scrollHeight -
            container.scrollTop -
            container.clientHeight <
          100;
      } else {
        container.scrollTo({ top: container.scrollHeight, behavior: "auto" });
        isServerAtBottomRef.current = true;
      }
      return;
    }

    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight <
      100;
    const hasNewMessages =
      currentMessageCount > lastServerMessageCountRef.current;
    if (hasNewMessages && isNearBottom) {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
      isServerAtBottomRef.current = true;
    } else if (hasNewMessages) {
      isServerAtBottomRef.current = false;
    }
    lastServerMessageCountRef.current = currentMessageCount;
  }, [messages, activeGuildId, activeChannelId, navMode]);

  // Persist server channel scroll location.
  useEffect(() => {
    if (!messagesRef.current || navMode !== "servers") return;
    const container = messagesRef.current;
    const channelKey = `${activeGuildId || ""}:${activeChannelId || ""}`;
    const handleScroll = () => {
      const isNearBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight <
        100;
      isServerAtBottomRef.current = isNearBottom;
      serverScrollPositionsRef.current[channelKey] = container.scrollTop;
      if (container.scrollTop <= MESSAGE_HISTORY_PREFETCH_THRESHOLD_PX) {
        void loadOlderServerMessages();
      }
    };
    handleScroll();
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [navMode, activeGuildId, activeChannelId, activeServer]);

  // Keep DM scroll position per thread and only auto-scroll when user is near the bottom.
  useEffect(() => {
    if (!dmMessagesRef.current || navMode !== "dms") return;
    const container = dmMessagesRef.current;
    const dmKey = activeDmId || "";
    const isNewDm = dmKey !== previousDmIdRef.current;
    const currentMessageCount = activeDm?.messages?.length || 0;

    if (isNewDm) {
      previousDmIdRef.current = dmKey;
      lastDmMessageCountRef.current = currentMessageCount;
      const savedTop = dmScrollPositionsRef.current[dmKey];
      if (Number.isFinite(savedTop)) {
        container.scrollTop = savedTop;
        isAtBottomRef.current =
          container.scrollHeight -
            container.scrollTop -
            container.clientHeight <
          100;
      } else {
        container.scrollTo({ top: container.scrollHeight, behavior: "auto" });
        isAtBottomRef.current = true;
      }
      return;
    }

    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight <
      100;
    const hasNewMessages = currentMessageCount > lastDmMessageCountRef.current;
    if (hasNewMessages && isNearBottom) {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
      isAtBottomRef.current = true;
    } else if (hasNewMessages) {
      isAtBottomRef.current = false;
    }
    lastDmMessageCountRef.current = currentMessageCount;
  }, [activeDm?.messages, activeDmId, navMode]);

  // Persist DM scroll location.
  useEffect(() => {
    if (!dmMessagesRef.current || navMode !== "dms") return;
    const container = dmMessagesRef.current;
    const dmKey = activeDmId || "";
    const handleScroll = () => {
      const isNearBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight <
        100;
      isAtBottomRef.current = isNearBottom;
      dmScrollPositionsRef.current[dmKey] = container.scrollTop;
      if (container.scrollTop <= MESSAGE_HISTORY_PREFETCH_THRESHOLD_PX) {
        void loadOlderDmMessages();
      }
    };
    handleScroll();
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [navMode, activeDmId, accessToken]);

  useEffect(() => {
    if (!remoteScreenShares.length) {
      setSelectedScreenShareProducerId("");
      setScreenShareOverlayOpen(false);
      return;
    }
    const selectedStillExists = remoteScreenShares.some(
      (share) => share.producerId === selectedScreenShareProducerId,
    );
    if (!selectedStillExists) {
      setSelectedScreenShareProducerId(remoteScreenShares[0].producerId);
    }
  }, [remoteScreenShares, selectedScreenShareProducerId]);

  useEffect(() => {
    if (remoteScreenShares.length) setScreenShareOverlayOpen(true);
  }, [remoteScreenShares.length]);

  useEffect(() => {
    setFullProfileViewerMusicPlaying(false);
    const audio = fullProfileViewerMusicAudioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
  }, [fullProfileViewer?.id]);

  useEffect(() => {
    const audio = fullProfileViewerMusicAudioRef.current;
    if (!audio || !fullProfileViewer) return;
    try {
      audio.volume = Math.max(
        0,
        Math.min(
          1,
          Number(fullProfileViewer.fullProfile?.music?.volume ?? 60) / 100,
        ),
      );
      audio.loop = fullProfileViewer.fullProfile?.music?.loop !== false;
    } catch {
      // ignore
    }
  }, [fullProfileViewer]);

  useEffect(() => {
    if (
      !fullProfileViewerHasPlayableMusic ||
      !fullProfileViewer?.fullProfile?.music?.autoplay
    )
      return;
    const audio = fullProfileViewerMusicAudioRef.current;
    if (!audio) return;
    audio
      .play()
      .then(() => {
        setFullProfileViewerMusicPlaying(true);
      })
      .catch(() => {
        setFullProfileViewerMusicPlaying(false);
      });
  }, [
    fullProfileViewerHasPlayableMusic,
    fullProfileViewer?.fullProfile?.music?.autoplay,
    fullProfileViewer?.fullProfile?.music?.url,
  ]);

  useEffect(() => {
    if (!accessToken) return;

    async function loadSession() {
      try {
        const meData = await api("/v1/me", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        setMe(meData);

        const [profileData, serverData] = await Promise.all([
          api(`/v1/users/${meData.id}/profile`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          }),
          api("/v1/servers", {
            headers: { Authorization: `Bearer ${accessToken}` },
          }),
        ]);

        const nextServers = normalizeServerList(serverData.servers || []);
        setProfile(profileData);
        setFullProfileDraft(
          normalizeFullProfile(profileData, profileData.fullProfile),
        );
        setProfileForm({
          displayName: profileData.displayName || "",
          bio: profileData.bio || "",
          pfpUrl: profileData.pfpUrl || "",
          bannerUrl: profileData.bannerUrl || "",
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
        if (
          msg.includes("UNAUTHORIZED") ||
          msg.includes("HTTP_401") ||
          msg.includes("INVALID_REFRESH") ||
          msg.includes("REFRESH_")
        ) {
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
      deviceId =
        "web-" + Math.random().toString(36).slice(2) + "-" + Date.now();
      localStorage.setItem(GATEWAY_DEVICE_ID_KEY, deviceId);
    }
    let disposed = false;
    let connected = false;
    let hasEverConnected = false;
    let reconnectTimer = null;
    let candidateIndex = 0;
    let reconnectAttempts = 0;
    const candidates = prioritizeLastSuccessfulGateway(
      getCoreGatewayWsCandidates(),
      LAST_CORE_GATEWAY_KEY,
    );

    const scheduleReconnect = () => {
      if (disposed) return;
      const delay = Math.min(5000, 300 * 2 ** Math.min(reconnectAttempts, 4));
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
        ws.send(
          JSON.stringify({ op: "IDENTIFY", d: { accessToken, deviceId } }),
        );
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.op === "HELLO" && msg.d?.heartbeat_interval) {
            if (gatewayHeartbeatRef.current)
              clearInterval(gatewayHeartbeatRef.current);
            gatewayHeartbeatRef.current = setInterval(() => {
              if (gatewayWsRef.current?.readyState === WebSocket.OPEN)
                gatewayWsRef.current.send(JSON.stringify({ op: "HEARTBEAT" }));
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
              gatewayWsRef.current.send(
                JSON.stringify({
                  op: "DISPATCH",
                  t: "SET_PRESENCE",
                  d: { status: selfStatus, customStatus: null },
                }),
              );
            }
          }
          if (msg.op === "DISPATCH" && msg.t === "PRESENCE_SYNC_REQUEST") {
            if (gatewayWsRef.current?.readyState === WebSocket.OPEN) {
              gatewayWsRef.current.send(
                JSON.stringify({
                  op: "DISPATCH",
                  t: "SET_PRESENCE",
                  d: { status: selfStatusRef.current, customStatus: null },
                }),
              );
            }
          }
          if (
            msg.op === "DISPATCH" &&
            msg.t === "PRESENCE_UPDATE" &&
            msg.d?.userId
          ) {
            setPresenceByUserId((prev) => ({
              ...prev,
              [msg.d.userId]: {
                status: msg.d.status ?? "offline",
                customStatus: msg.d.customStatus ?? null,
                richPresence: msg.d.richPresence ?? null,
              },
            }));
          }
          if (
            msg.op === "DISPATCH" &&
            msg.t === "SOCIAL_DM_MESSAGE_CREATE" &&
            msg.d?.threadId &&
            msg.d?.message?.id
          ) {
            const threadId = msg.d.threadId;
            const incoming = msg.d.message;
            setDms((current) => {
              const next = [...current];
              const idx = next.findIndex((item) => item.id === threadId);
              const already = (messages = []) =>
                messages.some((m) => m.id === incoming.id);
              if (idx >= 0) {
                const existing = next[idx];
                if (already(existing.messages || [])) return current;
                next[idx] = {
                  ...existing,
                  badgeDetails:
                    existing.badgeDetails && existing.badgeDetails.length > 0
                      ? existing.badgeDetails
                      : incoming.badgeDetails || [],
                  isOfficial:
                    existing.isOfficial === true || incoming.isOfficial === true,
                  isNoReply:
                    existing.isNoReply === true || incoming.isNoReply === true,
                  messages: [...(existing.messages || []), incoming],
                };
                return next;
              }
              return [
                {
                  id: threadId,
                  participantId:
                    incoming.authorId === me?.id
                      ? "unknown"
                      : incoming.authorId,
                  name:
                    incoming.authorId === me?.id
                      ? "Unknown"
                      : incoming.author || "Unknown",
                  badgeDetails: incoming.badgeDetails || [],
                  isOfficial: incoming.isOfficial === true,
                  isNoReply: incoming.isNoReply === true,
                  messages: [incoming],
                },
                ...next,
              ];
            });
            if (incoming.authorId && incoming.authorId !== me?.id) {
              playNotificationBeep(selfStatusRef.current === "dnd");
              setDmNotification({ dmId: threadId, at: Date.now() });
            }
          }
          if (
            msg.op === "DISPATCH" &&
            msg.t === "SOCIAL_DM_MESSAGE_DELETE" &&
            msg.d?.threadId &&
            msg.d?.messageId
          ) {
            const threadId = msg.d.threadId;
            const messageId = msg.d.messageId;
            setDms((current) =>
              current.map((item) =>
                item.id === threadId
                  ? {
                      ...item,
                      messages: (item.messages || []).filter(
                        (m) => m.id !== messageId,
                      ),
                    }
                  : item,
              ),
            );
          }

          // ── Private call events ─────────────────────────────────────────
          if (
            msg.op === "DISPATCH" &&
            msg.t === "PRIVATE_CALL_CREATE" &&
            msg.d?.callId
          ) {
            const d = msg.d;
            if (d.callerId !== me?.id) {
              // We are the recipient — look up caller name from friends / DMs
              setFriends((currentFriends) => {
                const caller = currentFriends.find((f) => f.id === d.callerId);
                setDms((currentDms) => {
                  const dmThread = currentDms.find(
                    (dm) => dm.participantId === d.callerId,
                  );
                  const callerName =
                    caller?.username || dmThread?.name || "Unknown";
                  const callerPfp = caller?.pfp_url || null;
                  setIncomingCall({
                    callId: d.callId,
                    callerId: d.callerId,
                    callerName,
                    callerPfp,
                    channelId: d.channelId,
                    guildId: d.guildId,
                    nodeBaseUrl: d.nodeBaseUrl,
                  });
                  return currentDms; // no mutation
                });
                return currentFriends; // no mutation
              });
              playNotificationBeep(selfStatusRef.current === "dnd");
            } else {
              // We are the caller — transition outgoing toast to "ringing" state
              setOutgoingCall((prev) =>
                prev ? { ...prev, callId: d.callId } : prev,
              );
            }
          }

          if (
            msg.op === "DISPATCH" &&
            msg.t === "PRIVATE_CALL_ENDED" &&
            msg.d?.callId
          ) {
            const endedId = msg.d.callId;
            setIncomingCall((prev) => (prev?.callId === endedId ? null : prev));
            setOutgoingCall((prev) => (prev?.callId === endedId ? null : prev));
            setActivePrivateCall((prev) => {
              if (prev?.callId === endedId) {
                // Close the dedicated private-call gateway WS
                if (privateCallGatewayWsRef.current) {
                  try {
                    privateCallGatewayWsRef.current.close();
                  } catch {}
                  privateCallGatewayWsRef.current = null;
                }
                privateCallGatewayReadyRef.current = false;
                if (privateCallGatewayHeartbeatRef.current) {
                  clearInterval(privateCallGatewayHeartbeatRef.current);
                  privateCallGatewayHeartbeatRef.current = null;
                }
                return null;
              }
              return prev;
            });
          }
          // ── End private call events ─────────────────────────────────────
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
          setStatus(
            "Gateway websocket unavailable. Check DNS/TLS or set VITE_CORE_GATEWAY_URL.",
          );
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
      if (gatewayHeartbeatRef.current)
        clearInterval(gatewayHeartbeatRef.current);
      gatewayHeartbeatRef.current = null;
      if (gatewayWsRef.current) gatewayWsRef.current.close();
      gatewayWsRef.current = null;
    };
  }, [accessToken, me?.id]);

  useEffect(() => {
    if (
      !accessToken ||
      !me?.id ||
      gatewayWsRef.current?.readyState !== WebSocket.OPEN
    )
      return;
    gatewayWsRef.current.send(
      JSON.stringify({
        op: "DISPATCH",
        t: "SET_PRESENCE",
        d: { status: selfStatus, customStatus: null },
      }),
    );
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
        try {
          nodeGatewayWsRef.current.close();
        } catch {}
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
        try {
          nodeGatewayWsRef.current.close();
        } catch {}
        nodeGatewayWsRef.current = null;
      }

      return;
    }

    const wsCandidates = getLastSuccessfulGateway(
      getVoiceGatewayWsCandidates(server.baseUrl, true),
      LAST_SERVER_GATEWAY_KEY,
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

      const activeExists = allChannels.some(
        (channel) =>
          channel.id === activeChannelIdRef.current && channel.type === "text",
      );
      if (activeExists) return;

      const firstTextChannel =
        allChannels.find((channel) => channel.type === "text")?.id || "";
      setActiveChannelId(firstTextChannel);
    };

    const refreshActiveGuildStateFromNode = () => {
      if (activeServerIdRef.current !== server.id) return;
      const guildId = activeGuildIdRef.current;
      if (!guildId) return;
      nodeApi(
        server.baseUrl,
        `/v1/guilds/${guildId}/state`,
        server.membershipToken,
      )
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
      const delay = Math.min(5000, 300 * 2 ** Math.min(reconnectAttempts, 4));
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
        ws.send(
          JSON.stringify({
            op: "IDENTIFY",
            d: { membershipToken: server.membershipToken },
          }),
        );
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          resolvePendingVoiceEvent(msg);

          if (msg.op === "HELLO" && msg.d?.heartbeat_interval) {
            if (nodeGatewayHeartbeatRef.current)
              clearInterval(nodeGatewayHeartbeatRef.current);
            nodeGatewayHeartbeatRef.current = setInterval(() => {
              if (nodeGatewayWsRef.current?.readyState === WebSocket.OPEN) {
                nodeGatewayWsRef.current.send(
                  JSON.stringify({ op: "HEARTBEAT" }),
                );
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
            if (
              activeServerIdRef.current === server.id &&
              activeGuildIdRef.current
            ) {
              ws.send(
                JSON.stringify({
                  op: "DISPATCH",
                  t: "SUBSCRIBE_GUILD",
                  d: { guildId: activeGuildIdRef.current },
                }),
              );
            }
            if (
              activeServerIdRef.current === server.id &&
              activeChannelIdRef.current
            ) {
              ws.send(
                JSON.stringify({
                  op: "DISPATCH",
                  t: "SUBSCRIBE_CHANNEL",
                  d: { channelId: activeChannelIdRef.current },
                }),
              );
            }
            return;
          }

          if (msg.op === "ERROR" && msg.d?.error) {
            if (
              typeof msg.d.error === "string" &&
              msg.d.error.startsWith("VOICE_UPSTREAM_UNAVAILABLE") &&
              server?.id
            ) {
              setNodeGatewayUnavailableByServer((prev) =>
                prev[server.id] ? prev : { ...prev, [server.id]: true },
              );
              setStatus(
                "Realtime voice gateway unavailable for this server. Falling back to REST voice controls.",
              );
              try {
                ws.close();
              } catch {}
              return;
            }
            setStatus(`Voice gateway error: ${msg.d.error}`);
            return;
          }

          // Everything else stays the same as your existing handler:
          // MESSAGE_* + VOICE_* dispatches, etc.
          if (msg.op === "DISPATCH" && typeof msg.t === "string") {
            if (msg.t === "VOICE_ERROR") {
              const error = msg.d?.error || "VOICE_ERROR";
              const details = msg.d?.details ? ` (${msg.d.details})` : "";
              const activeVoiceContext =
                voiceSfuRef.current?.getContext?.() || {};
              voiceDebug("VOICE_ERROR received", {
                error,
                details: msg.d?.details,
                code: msg.d?.code,
                context: activeVoiceContext,
              });
              rejectPendingVoiceEventsByScope({
                guildId: msg.d?.guildId ?? activeVoiceContext.guildId ?? null,
                channelId:
                  msg.d?.channelId ?? activeVoiceContext.channelId ?? null,
              });
              if (voiceSession?.channelId) {
                cleanupVoiceRtc().catch(() => {});
                return;
              }
              const message = `Voice connection failed: ${error}${details}`;
              setStatus(message);
              window.alert(message);
              return;
            }

            if (msg.t === "MESSAGE_CREATE") {
              const channelId = msg.d?.channelId || "";
              const created = msg.d?.message || null;
              const deleted = msg.d?.messageDelete || null;

              if (
                channelId &&
                deleted?.id &&
                channelId === activeChannelIdRef.current
              ) {
                setMessages((current) =>
                  current.filter((message) => message.id !== deleted.id),
                );
              }

              if (
                channelId &&
                created &&
                channelId === activeChannelIdRef.current
              ) {
                setMessages((current) => {
                  if (current.some((message) => message.id === created.id))
                    return current;
                  const normalized = {
                    id: created.id,
                    author_id: created.authorId,
                    authorId: created.authorId,
                    username: created.username || created.authorId,
                    pfp_url: created.pfp_url ?? null,
                    content: created.content || "",
                    embeds: created.embeds || [],
                    linkEmbeds: created.linkEmbeds || [],
                    attachments: created.attachments || [],
                    mentionEveryone: !!created.mentionEveryone,
                    mentions: created.mentions || [],
                    created_at: created.createdAt,
                    createdAt: created.createdAt,
                  };
                  return [...current, normalized];
                });
              } else if (channelId && created && server?.id) {
                setServerPingCounts((prev) => ({
                  ...prev,
                  [server.id]: (prev[server.id] || 0) + 1,
                }));
              }
              return;
            }

            if (msg.t === "MESSAGE_MENTION" && server?.id) {
              const channelId = msg.d?.channelId || "";
              if (
                !activeChannelIdRef.current ||
                channelId !== activeChannelIdRef.current
              ) {
                setServerPingCounts((prev) => ({
                  ...prev,
                  [server.id]: (prev[server.id] || 0) + 1,
                }));
              }
              return;
            }

            if (
              msg.t === "VOICE_STATE_UPDATE" &&
              msg.d?.guildId &&
              msg.d?.userId
            ) {
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
                    deafened: !!msg.d.deafened,
                  };
                } else {
                  delete nextGuild[userId];
                }
                return { ...prev, [guildId]: nextGuild };
              });
            } else if (
              msg.t === "VOICE_STATE_REMOVE" &&
              msg.d?.guildId &&
              msg.d?.userId
            ) {
              const guildId = msg.d.guildId;
              const userId = msg.d.userId;
              setVoiceStatesByGuild((prev) => {
                if (!prev[guildId]?.[userId]) return prev;
                const nextGuild = { ...(prev[guildId] || {}) };
                delete nextGuild[userId];
                return { ...prev, [guildId]: nextGuild };
              });
            } else if (
              msg.t === "VOICE_SPEAKING" &&
              msg.d?.guildId &&
              msg.d?.userId
            ) {
              const guildId = msg.d.guildId;
              const userId = msg.d.userId;
              const speaking = !!msg.d.speaking;
              setVoiceSpeakingByGuild((prev) => ({
                ...prev,
                [guildId]: { ...(prev[guildId] || {}), [userId]: speaking },
              }));
            }

            if (
              activeServerIdRef.current === server.id &&
              (msg.t === "CHANNEL_CREATE" ||
                msg.t === "CHANNEL_UPDATE" ||
                msg.t === "CHANNEL_DELETE" ||
                msg.t === "CHANNEL_REORDER" ||
                msg.t === "ROLE_CREATE" ||
                msg.t === "ROLE_UPDATE" ||
                msg.t === "ROLE_DELETE" ||
                msg.t === "CHANNEL_OVERWRITE_UPDATE" ||
                msg.t === "CHANNEL_OVERWRITE_DELETE" ||
                msg.t === "CHANNEL_SYNC_PERMISSIONS" ||
                msg.t === "GUILD_MEMBER_UPDATE" ||
                msg.t === "GUILD_MEMBER_KICK" ||
                msg.t === "GUILD_MEMBER_BAN")
            ) {
              scheduleGuildRefresh();
            }

            voiceSfuRef.current
              ?.handleGatewayDispatch(msg.t, msg.d)
              .catch(() => {});
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
          setStatus(
            "Voice gateway unavailable. Check core gateway/proxy configuration.",
          );
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
        try {
          nodeGatewayWsRef.current.close();
        } catch {}
        nodeGatewayWsRef.current = null;
      }
    };
  }, [
    nodeGatewayTargetServer?.id,
    nodeGatewayTargetServer?.baseUrl,
    nodeGatewayTargetServer?.membershipToken,
    nodeGatewayUnavailableByServer,
  ]);

  useEffect(() => {
    if (!activeGuildId || !activeChannelId) return;
    if (!nodeGatewayConnectedForActiveServer) return;
    const ws = nodeGatewayWsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !nodeGatewayReadyRef.current)
      return;
    ws.send(
      JSON.stringify({
        op: "DISPATCH",
        t: "SUBSCRIBE_GUILD",
        d: { guildId: activeGuildId },
      }),
    );
    ws.send(
      JSON.stringify({
        op: "DISPATCH",
        t: "SUBSCRIBE_CHANNEL",
        d: { channelId: activeChannelId },
      }),
    );
  }, [activeGuildId, activeChannelId, nodeGatewayConnectedForActiveServer]);

  useEffect(() => {
    if (
      navMode !== "servers" ||
      !activeGuildId ||
      !guildState?.channels?.length
    )
      return;
    if (!nodeGatewayConnectedForActiveServer) return;
    const ws = nodeGatewayWsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !nodeGatewayReadyRef.current)
      return;
    for (const channel of guildState.channels) {
      if (!channel?.id || channel.type !== "text") continue;
      ws.send(
        JSON.stringify({
          op: "DISPATCH",
          t: "SUBSCRIBE_CHANNEL",
          d: { channelId: channel.id },
        }),
      );
    }
  }, [
    navMode,
    activeGuildId,
    guildState?.channels,
    nodeGatewayConnectedForActiveServer,
  ]);

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
    fetch(`${CORE_API}/v1/presence?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((r) => (r.ok ? r.json() : {}))
      .then((data) => {
        if (data && typeof data === "object")
          setPresenceByUserId((prev) => ({ ...prev, ...data }));
      })
      .catch(() => {});
  }, [accessToken, guildState?.members, friends]);

  // Handle invite links from /join/:code (plus legacy ?join=CODE).
  // External links auto-join once after auth; manual invite previews still require explicit accept.
  useEffect(() => {
    const codeFromLocation = getInviteCodeFromCurrentLocation();
    const pendingCode = parseInviteCodeFromInput(
      codeFromLocation || invitePendingCode || "",
    );
    if (!pendingCode) return;

    if (joinInviteCode !== pendingCode) setJoinInviteCode(pendingCode);
    if (invitePendingCode !== pendingCode) setInvitePendingCode(pendingCode);
    if (codeFromLocation && !invitePendingAutoJoin)
      setInvitePendingAutoJoin(true);

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
  }, [
    accessToken,
    invitePendingCode,
    invitePendingAutoJoin,
    joinInviteCode,
    routePath,
  ]);

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
      ...(dms.find((item) => item.id === activeDmId)?.messages || []),
    ];
    const candidateUrls = new Set();
    for (const message of visibleMessages) {
      for (const url of extractHttpUrls(message?.content || ""))
        candidateUrls.add(url);
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
        headers: { Authorization: `Bearer ${accessToken}` },
      })
        .then((data) => {
          setLinkPreviewByUrl((current) => ({
            ...current,
            [url]: data || null,
          }));
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
    const candidates = [];
    const visibleMessages = [
      ...(messages || []),
      ...(dms.find((item) => item.id === activeDmId)?.messages || []),
    ];
    for (const message of visibleMessages) {
      for (const attachment of message?.attachments || []) {
        if (!attachment?.id || !isImageMimeType(attachment.contentType))
          continue;
        if (attachmentPreviewUrlById[attachment.id]) continue;
        if (attachmentPreviewFetchInFlightRef.current.has(attachment.id))
          continue;
        candidates.push(attachment);
      }
    }

    for (const attachment of candidates) {
      attachmentPreviewFetchInFlightRef.current.add(attachment.id);
      const source = String(attachment.url || "");
      const isDmAttachment = /\/v1\/social\/dms\/attachments\//.test(source);
      const authToken = isDmAttachment
        ? accessToken
        : activeServer?.membershipToken;
      if (!authToken) {
        attachmentPreviewFetchInFlightRef.current.delete(attachment.id);
        continue;
      }

      const requestUrl = source.startsWith("http")
        ? source
        : isDmAttachment
          ? `${CORE_API}${source.startsWith("/") ? "" : "/"}${source}`
          : activeServer?.baseUrl
            ? `${activeServer.baseUrl}${source.startsWith("/") ? "" : "/"}${source}`
            : "";
      if (!requestUrl) {
        attachmentPreviewFetchInFlightRef.current.delete(attachment.id);
        continue;
      }

      fetch(requestUrl, {
        headers: { Authorization: `Bearer ${authToken}` },
      })
        .then((response) => (response.ok ? response.blob() : null))
        .then((blob) => {
          if (
            !blob ||
            !isImageMimeType(blob.type || attachment.contentType || "")
          )
            return;
          const objectUrl = URL.createObjectURL(blob);
          setAttachmentPreviewUrlById((current) => {
            const existing = current[attachment.id];
            if (existing) URL.revokeObjectURL(objectUrl);
            return existing
              ? current
              : { ...current, [attachment.id]: objectUrl };
          });
        })
        .catch(() => {})
        .finally(() => {
          attachmentPreviewFetchInFlightRef.current.delete(attachment.id);
        });
    }
  }, [
    messages,
    dms,
    activeDmId,
    activeServer?.baseUrl,
    activeServer?.membershipToken,
    accessToken,
    attachmentPreviewUrlById,
  ]);

  useEffect(() => {
    if (!favouriteMediaModalOpen) return;
    const candidates = favouriteMedia.filter((item) => {
      if (!item?.id) return false;
      if (item.sourceKind === "external_url") return false;
      if (favouriteMediaPreviewUrlById[item.id]) return false;
      if (favouriteMediaPreviewFetchInFlightRef.current.has(item.id))
        return false;
      return true;
    });

    for (const item of candidates) {
      const request = resolveFavouriteMediaRequest(item);
      if (!request?.requestUrl) continue;
      favouriteMediaPreviewFetchInFlightRef.current.add(item.id);
      fetch(request.requestUrl, {
        headers: request.headers,
      })
        .then((response) => (response.ok ? response.blob() : null))
        .then((blob) => {
          if (!blob) return;
          if (
            !isImageMimeType(blob.type || item.contentType || "") &&
            !isLikelyImageUrl(item.sourceUrl)
          )
            return;
          const objectUrl = URL.createObjectURL(blob);
          setFavouriteMediaPreviewUrlById((current) => {
            const existing = current[item.id];
            if (existing) URL.revokeObjectURL(objectUrl);
            return existing ? current : { ...current, [item.id]: objectUrl };
          });
        })
        .catch(() => {})
        .finally(() => {
          favouriteMediaPreviewFetchInFlightRef.current.delete(item.id);
        });
    }
  }, [
    favouriteMediaModalOpen,
    favouriteMedia,
    favouriteMediaPreviewUrlById,
    accessToken,
    activeServer?.baseUrl,
    activeServer?.membershipToken,
    activeServerId,
    servers,
  ]);

  useEffect(() => {
    const old = attachmentPreviewUrlByIdRef.current || {};
    Object.values(old).forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    });
    attachmentPreviewFetchInFlightRef.current.clear();
    setAttachmentPreviewUrlById({});
  }, [activeServerId]);

  useEffect(() => {
    if (favouriteMediaModalOpen) return;
    const urls = favouriteMediaPreviewUrlByIdRef.current || {};
    if (!Object.keys(urls).length) return;
    Object.values(urls).forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    });
    favouriteMediaPreviewFetchInFlightRef.current.clear();
    favouriteMediaPreviewUrlByIdRef.current = {};
    setFavouriteMediaPreviewUrlById({});
  }, [favouriteMediaModalOpen]);

  useEffect(() => {
    return () => {
      const urls = attachmentPreviewUrlByIdRef.current || {};
      Object.values(urls).forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch {}
      });
      const favouriteUrls = favouriteMediaPreviewUrlByIdRef.current || {};
      Object.values(favouriteUrls).forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch {}
      });
      favouriteMediaPreviewFetchInFlightRef.current.clear();
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

        const hasActiveGuild = nextGuilds.some(
          (guild) => guild.id === activeGuildId,
        );
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

    const loadGuildState = () =>
      nodeApi(
        activeServer.baseUrl,
        `/v1/guilds/${activeGuildId}/state`,
        activeServer.membershipToken,
      )
        .then((state) => {
          if (cancelled) return;
          const allChannels = state.channels || [];
          setGuildState(state);

          const activeExists = allChannels.some(
            (channel) =>
              channel.id === activeChannelId && channel.type === "text",
          );
          if (activeExists) return;

          const firstTextChannel =
            allChannels.find((channel) => channel.type === "text")?.id || "";
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
    const timer = nodeGatewayConnectedForActiveServer
      ? null
      : window.setInterval(loadGuildState, 3000);
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [
    activeServer,
    activeGuildId,
    navMode,
    activeChannelId,
    nodeGatewayConnectedForActiveServer,
  ]);

  useEffect(() => {
    if (navMode !== "dms" || !activeDmId || !accessToken) return;
    const threadId = activeDmId;
    let cancelled = false;
    dmHistoryLoadingByThreadRef.current[threadId] = false;

    const path = buildPaginatedPath(`/v1/social/dms/${threadId}/messages`, {
      limit: MESSAGE_PAGE_SIZE,
    });
    api(path, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((data) => {
        if (cancelled || activeDmIdRef.current !== threadId) return;
        const nextMessages = Array.isArray(data?.messages) ? data.messages : [];
        const hasMore =
          data?.hasMore != null
            ? !!data.hasMore
            : nextMessages.length >= MESSAGE_PAGE_SIZE;
        dmHistoryHasMoreByThreadRef.current[threadId] = hasMore;
        setDms((current) =>
          current.map((item) =>
            item.id === threadId ? { ...item, messages: nextMessages } : item,
          ),
        );
      })
      .catch(() => {
        // keep existing local messages as fallback
      });

    return () => {
      cancelled = true;
    };
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
    const currentVoiceUsesPrivateGateway = !!activePrivateCall?.callId;
    const canSendVoiceSpeaking =
      isInVoiceChannel &&
      isVoiceSessionSynced &&
      !!voiceConnectedGuildId &&
      (currentVoiceUsesPrivateGateway
        ? !!privateCallGatewayReadyRef.current &&
          privateCallGatewayWsRef.current?.readyState === WebSocket.OPEN
        : !!nodeGatewayReadyRef.current &&
          nodeGatewayWsRef.current?.readyState === WebSocket.OPEN);

    if (
      !isInVoiceChannel ||
      !isVoiceSessionSynced ||
      !voiceConnectedGuildId ||
      isMuted ||
      isDeafened ||
      !navigator.mediaDevices?.getUserMedia ||
      !canSendVoiceSpeaking
    ) {
      const detector = voiceSpeakingDetectorRef.current;
      if (detector.timer) clearInterval(detector.timer);
      detector.timer = null;
      if (
        detector.stream &&
        detector.stream !== voiceSfuRef.current?.getLocalStream()
      )
        detector.stream.getTracks().forEach((t) => t.stop());
      detector.stream = null;
      if (detector.audioCtx) detector.audioCtx.close().catch(() => {});
      detector.audioCtx = null;
      detector.analyser = null;
      detector.lastSpeaking = false;
      if (voiceConnectedGuildId && me?.id) {
        setVoiceSpeakingByGuild((prev) => ({
          ...prev,
          [voiceConnectedGuildId]: {
            ...(prev[voiceConnectedGuildId] || {}),
            [me.id]: false,
          },
        }));
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
        const stream =
          voiceSfuRef.current?.getLocalStream() ||
          (await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: !!noiseSuppressionEnabled,
              autoGainControl: true,
              ...(audioInputDeviceId
                ? { deviceId: { exact: audioInputDeviceId } }
                : {}),
            },
          }));
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
          const threshold =
            0.01 +
            ((100 - Math.max(0, Math.min(100, micSensitivity))) / 100) * 0.03;
          const speaking = rms > threshold;
          if (speaking === detector.lastSpeaking) return;
          detector.lastSpeaking = speaking;

          if (voiceConnectedGuildId && me?.id) {
            setVoiceSpeakingByGuild((prev) => ({
              ...prev,
              [voiceConnectedGuildId]: {
                ...(prev[voiceConnectedGuildId] || {}),
                [me.id]: speaking,
              },
            }));
          }
          if (
            isInVoiceChannel &&
            voiceConnectedGuildId &&
            (currentVoiceUsesPrivateGateway
              ? privateCallGatewayReadyRef.current &&
                privateCallGatewayWsRef.current?.readyState === WebSocket.OPEN
              : nodeGatewayReadyRef.current &&
                nodeGatewayWsRef.current?.readyState === WebSocket.OPEN)
          ) {
            void sendNodeVoiceDispatch("VOICE_SPEAKING", {
              guildId: voiceConnectedGuildId,
              channelId: voiceConnectedChannelId,
              speaking,
            }).catch(() => {});
          }
        }, 150);
      } catch {
        setStatus(
          "Mic speaking detection unavailable. Check microphone permissions.",
        );
      }
    })();

    return () => {
      cancelled = true;
      const detector = voiceSpeakingDetectorRef.current;
      if (detector.timer) clearInterval(detector.timer);
      detector.timer = null;
      if (
        detector.stream &&
        detector.stream !== voiceSfuRef.current?.getLocalStream()
      )
        detector.stream.getTracks().forEach((t) => t.stop());
      detector.stream = null;
      if (detector.audioCtx) detector.audioCtx.close().catch(() => {});
      detector.audioCtx = null;
      detector.analyser = null;
      detector.lastSpeaking = false;
    };
  }, [
    isInVoiceChannel,
    isVoiceSessionSynced,
    voiceConnectedGuildId,
    voiceConnectedChannelId,
    isMuted,
    isDeafened,
    micSensitivity,
    audioInputDeviceId,
    noiseSuppressionEnabled,
    me?.id,
    activePrivateCall?.callId,
  ]);

  useEffect(() => {
    localStorage.setItem(MIC_GAIN_KEY, String(micGain));
  }, [micGain]);

  useEffect(() => {
    voiceSfuRef.current?.setMicGain?.(micGain);
  }, [micGain]);

  useEffect(() => {
    localStorage.setItem(MIC_SENSITIVITY_KEY, String(micSensitivity));
  }, [micSensitivity]);

  useEffect(() => {
    localStorage.setItem(AUDIO_INPUT_DEVICE_KEY, audioInputDeviceId || "");
  }, [audioInputDeviceId]);

  useEffect(() => {
    if (!isInVoiceChannel) return;
    voiceSfuRef.current?.setAudioInputDevice?.(audioInputDeviceId).catch(() => {
      setStatus("Could not switch microphone device on current voice session.");
    });
  }, [audioInputDeviceId, isInVoiceChannel]);

  useEffect(() => {
    localStorage.setItem(AUDIO_OUTPUT_DEVICE_KEY, audioOutputDeviceId || "");
  }, [audioOutputDeviceId]);

  useEffect(() => {
    localStorage.setItem(
      NOISE_SUPPRESSION_KEY,
      noiseSuppressionEnabled ? "1" : "0",
    );
  }, [noiseSuppressionEnabled]);

  useEffect(() => {
    localStorage.setItem(NOISE_SUPPRESSION_PRESET_KEY, noiseSuppressionPreset);
  }, [noiseSuppressionPreset]);

  useEffect(() => {
    localStorage.setItem(
      NOISE_SUPPRESSION_CONFIG_KEY,
      JSON.stringify(noiseSuppressionConfig),
    );
  }, [noiseSuppressionConfig]);

  useEffect(() => {
    voiceSfuRef.current?.setNoiseSuppressionConfig?.({
      preset: noiseSuppressionPreset,
      config: noiseSuppressionConfig,
    });
  }, [noiseSuppressionPreset, noiseSuppressionConfig]);

  useEffect(() => {
    if (!isInVoiceChannel) return;
    voiceSfuRef.current
      ?.setNoiseSuppression?.(noiseSuppressionEnabled)
      .catch((error) => {
        const reason = String(error?.message || "").trim();
        setStatus(
          reason
            ? `Could not apply noise suppression: ${reason}`
            : "Could not apply noise suppression on current microphone track.",
        );
      });
  }, [noiseSuppressionEnabled, isInVoiceChannel]);

  useEffect(() => {
    voiceSfuRef.current?.setMuted(isMuted);
  }, [isMuted]);

  useEffect(() => {
    voiceSfuRef.current?.setDeafened(isDeafened);
  }, [isDeafened]);

  useEffect(() => {
    if (!isMicMonitorActive) return;
    if (!isMuted || !isDeafened) {
      stopMicMonitor({ restoreState: false, announce: true }).catch(() => {});
    }
  }, [isMicMonitorActive, isMuted, isDeafened]);

  useEffect(() => {
    if (!isMicMonitorActive || isInVoiceChannel) return;
    stopMicMonitor({ restoreState: false, announce: false }).catch(() => {});
  }, [isMicMonitorActive, isInVoiceChannel]);

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
    if (
      settingsTab !== "voice" ||
      !settingsOpen ||
      !navigator.mediaDevices?.enumerateDevices
    )
      return;
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
        if (!audioInputDeviceId && ins[0]?.deviceId)
          setAudioInputDeviceId(ins[0].deviceId);
        if (!audioOutputDeviceId && outs[0]?.deviceId)
          setAudioOutputDeviceId(outs[0].deviceId);
      } catch {
        if (!cancelled)
          setStatus("Could not load audio devices. Check browser permissions.");
      }
    };
    loadDevices();
    return () => {
      cancelled = true;
    };
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
        if (
          prev.guildId === detectedGuildId &&
          prev.channelId === detectedChannelId
        )
          return prev;
        return { guildId: detectedGuildId, channelId: detectedChannelId };
      }
      if (prev.guildId && prev.guildId !== activeGuildId) return prev;
      if (!prev.guildId && !prev.channelId) return prev;
      return { guildId: "", channelId: "" };
    });
  }, [
    mergedVoiceStates,
    voiceStatesByGuild,
    me?.id,
    activeGuildId,
    voiceConnectedGuildId,
  ]);

  useEffect(() => {
    if (voiceConnectedGuildId && voiceConnectedChannelId) {
      voiceSessionStartedAtRef.current = Date.now();
      voiceServerDesyncMissesRef.current = 0;
      return;
    }
    voiceSessionStartedAtRef.current = 0;
    voiceServerDesyncMissesRef.current = 0;
    voiceRecoveringRef.current = false;
  }, [voiceConnectedGuildId, voiceConnectedChannelId]);

  useEffect(() => {
    if (!voiceConnectedGuildId || !voiceConnectedChannelId) return;
    if (isDisconnectingVoice) return;
    if (activePrivateCall?.callId) return;
    const server = voiceConnectedServer || activeServer;
    if (!server?.baseUrl || !server?.membershipToken) return;

    let cancelled = false;
    let pollInFlight = false;
    let intervalId = null;
    const attemptAutoRecover = async (statusMessage) => {
      const now = Date.now();
      if (voiceRecoveringRef.current) return false;
      if (now - voiceLastRecoverAttemptAtRef.current < 12000) return false;
      if (!canUseRealtimeVoiceGateway()) return false;
      voiceRecoveringRef.current = true;
      voiceLastRecoverAttemptAtRef.current = now;
      try {
        setStatus(statusMessage);
        await voiceSfuRef.current?.join({
          guildId: voiceConnectedGuildId,
          channelId: voiceConnectedChannelId,
          audioInputDeviceId,
          micGain,
          noiseSuppression: noiseSuppressionEnabled,
          noiseSuppressionPreset,
          noiseSuppressionConfig,
          isMuted,
          isDeafened,
          audioOutputDeviceId,
        });
        if (cancelled) return true;
        voiceSessionStartedAtRef.current = Date.now();
        voiceServerDesyncMissesRef.current = 0;
        setStatus("Voice reconnected.");
        return true;
      } catch {
        return false;
      } finally {
        voiceRecoveringRef.current = false;
      }
    };

    const reconcileVoiceState = async () => {
      try {
        const data = await nodeApi(
          server.baseUrl,
          "/v1/me/voice-state",
          server.membershipToken,
        );
        if (cancelled) return;
        const serverVoiceStates = Array.isArray(data?.voiceStates)
          ? data.voiceStates
          : [];
        const hasMatchingServerState = serverVoiceStates.some((state) => {
          const guildId = state?.guildId || state?.guild_id || "";
          const channelId = state?.channelId || state?.channel_id || "";
          return (
            guildId === voiceConnectedGuildId &&
            channelId === voiceConnectedChannelId
          );
        });
        const sessionAgeMs = voiceSessionStartedAtRef.current
          ? Date.now() - voiceSessionStartedAtRef.current
          : 0;

        if (hasMatchingServerState) {
          voiceServerDesyncMissesRef.current = 0;
          const localContext = voiceSfuRef.current?.getContext?.() || {};
          const localHealthy =
            localContext.guildId === voiceConnectedGuildId &&
            localContext.channelId === voiceConnectedChannelId &&
            !!voiceSfuRef.current?.getLocalStream?.();
          if (localHealthy || sessionAgeMs < 8000) return;
          await attemptAutoRecover("Voice media dropped. Reconnecting...");
          return;
        }

        voiceServerDesyncMissesRef.current += 1;
        if (sessionAgeMs < 15000 || voiceServerDesyncMissesRef.current < 2)
          return;

        const recovered = await attemptAutoRecover(
          "Voice connection desynced. Reconnecting...",
        );
        if (recovered) return;
        if (voiceServerDesyncMissesRef.current < 4) return;

        setVoiceSession((prev) => {
          if (
            prev.guildId !== voiceConnectedGuildId ||
            prev.channelId !== voiceConnectedChannelId
          )
            return prev;
          return { guildId: "", channelId: "" };
        });
        await cleanupVoiceRtc();
        voiceServerDesyncMissesRef.current = 0;
        setStatus("Voice session ended on the server. Local state re-synced.");
      } catch {
        // Keep local session on transient API failures; next pass can reconcile.
      }
    };

    const runReconcile = () => {
      if (pollInFlight) return;
      pollInFlight = true;
      reconcileVoiceState()
        .catch(() => {})
        .finally(() => {
          pollInFlight = false;
        });
    };

    runReconcile();
    intervalId = setInterval(() => {
      runReconcile();
    }, 10000);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [
    voiceConnectedGuildId,
    voiceConnectedChannelId,
    voiceConnectedServer,
    activeServer,
    activePrivateCall?.callId,
    isDisconnectingVoice,
    audioInputDeviceId,
    micGain,
    noiseSuppressionEnabled,
    noiseSuppressionPreset,
    noiseSuppressionConfig,
    isMuted,
    isDeafened,
    audioOutputDeviceId,
  ]);

  useEffect(() => {
    if (!accessToken || (navMode !== "friends" && navMode !== "dms")) return;
    refreshSocialData(accessToken).catch(() => {
      // keep existing state on transient failures
    });
  }, [accessToken, navMode]);

  activeChannelIdRef.current = activeChannelId;
  activeGuildIdRef.current = activeGuildId;
  activeServerIdRef.current = activeServerId;
  activeDmIdRef.current = activeDmId;

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("opencom-voice-state-change", {
        detail: {
          connected: !!voiceSession.channelId,
          guildId: voiceSession.guildId || "",
          channelId: voiceSession.channelId || "",
          muted: !!isMuted,
          deafened: !!isDeafened,
          screenSharing: !!isScreenSharing,
        },
      }),
    );
  }, [
    voiceSession.guildId,
    voiceSession.channelId,
    isMuted,
    isDeafened,
    isScreenSharing,
  ]);

  useEffect(() => {
    if (navMode !== "servers" || !activeServer || !activeChannelId) {
      if (navMode !== "servers") setMessages([]);
      return;
    }

    let cancelled = false;
    const channelKey = `${activeGuildId || ""}:${activeChannelId || ""}`;
    serverHistoryLoadingByChannelRef.current[channelKey] = false;

    const loadChannelMessages = (mode = "replace") => {
      const path = buildPaginatedPath(
        `/v1/channels/${activeChannelId}/messages`,
        { limit: MESSAGE_PAGE_SIZE },
      );
      return nodeApi(activeServer.baseUrl, path, activeServer.membershipToken)
        .then((data) => {
          if (cancelled) return;
          setStatus("");
          const fetched = Array.isArray(data?.messages) ? data.messages : [];
          const latestMessages = fetched.slice().reverse();
          const hasMore =
            data?.hasMore != null
              ? !!data.hasMore
              : fetched.length >= MESSAGE_PAGE_SIZE;
          serverHistoryHasMoreByChannelRef.current[channelKey] = hasMore;
          if (mode === "replace") {
            setMessages(latestMessages);
            return;
          }
          setMessages((current) =>
            mergeMessagesChronologically(
              current,
              latestMessages,
              (message) => message.created_at || message.createdAt,
            ),
          );
        })
        .catch((error) => {
          if (cancelled) return;
          if (error?.message?.startsWith("HTTP_403")) {
            setMessages([]);
            serverHistoryHasMoreByChannelRef.current[channelKey] = false;
            setStatus("You no longer have access to that channel.");
            setActiveChannelId("");
            return;
          }
          if (error?.message?.startsWith("HTTP_404")) {
            setMessages([]);
            serverHistoryHasMoreByChannelRef.current[channelKey] = false;
            setStatus(
              "That channel no longer exists. Switching to an available channel.",
            );
            setActiveChannelId("");
            return;
          }
          setStatus(`Message fetch failed: ${error.message}`);
        });
    };

    loadChannelMessages("replace");
    const timer = nodeGatewayConnectedForActiveServer
      ? null
      : window.setInterval(() => {
          loadChannelMessages("merge").catch(() => {});
        }, 2000);

    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [
    activeServer,
    activeGuildId,
    activeChannelId,
    navMode,
    nodeGatewayConnectedForActiveServer,
  ]);

  useEffect(() => {
    if (navMode !== "servers" || !activeServer || !activeChannelId) return;
    loadServerPins(activeChannelId).catch(() => {});
  }, [navMode, activeServer, activeChannelId]);

  useEffect(() => {
    setPendingAttachments([]);
    if (attachmentInputRef.current) attachmentInputRef.current.value = "";
  }, [activeServerId, activeChannelId]);

  useEffect(() => {
    setPendingDmAttachments([]);
    if (dmAttachmentInputRef.current) dmAttachmentInputRef.current.value = "";
  }, [activeDmId]);

  useEffect(() => {
    if (
      navMode !== "servers" ||
      !accessToken ||
      !activeGuildId ||
      gatewayConnected
    )
      return;

    let cancelled = false;

    const loadGuildPresence = () => {
      const memberIds = Array.from(
        new Set((guildState?.members || []).map((m) => m?.id).filter(Boolean)),
      );
      if (!memberIds.length) return;
      const params = new URLSearchParams({ userIds: memberIds.join(",") });
      fetch(`${CORE_API}/v1/presence?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
        .then((r) => (r.ok ? r.json() : {}))
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
  }, [
    navMode,
    accessToken,
    activeGuildId,
    guildState?.members,
    gatewayConnected,
  ]);

  // Fallback polling for social presence/RPC only when core gateway websocket is unavailable.
  useEffect(() => {
    if (
      !accessToken ||
      gatewayConnected ||
      (navMode !== "friends" && navMode !== "dms")
    )
      return;

    let cancelled = false;

    const loadSocialPresence = () => {
      const ids = new Set();
      (friends || []).forEach((friend) => friend?.id && ids.add(friend.id));
      (dms || []).forEach(
        (dm) => dm?.participantId && ids.add(dm.participantId),
      );
      const userIds = [...ids];
      if (!userIds.length) return;

      const params = new URLSearchParams({ userIds: userIds.join(",") });
      fetch(`${CORE_API}/v1/presence?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
        .then((r) => (r.ok ? r.json() : {}))
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
    const nextResetPasswordToken = params.get("resetPasswordToken");
    if (!nextResetPasswordToken) return;
    if (getAppRouteFromLocation() === APP_ROUTE_HOME) {
      navigateAppRoute(APP_ROUTE_LOGIN, { replace: true });
    }
    setResetPasswordToken(nextResetPasswordToken);
    setAuthMode("reset-password");
    setPassword("");
    setAuthResetPasswordConfirm("");
    setStatus("Reset link ready. Choose a new password.");

    params.delete("resetPasswordToken");
    const next = params.toString();
    const nextUrl = `${window.location.pathname}${next ? `?${next}` : ""}${window.location.hash || ""}`;
    window.history.replaceState({}, "", nextUrl);
  }, []);

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
      body: JSON.stringify({ token: verifyEmailToken }),
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
    setStatus(
      authMode === "forgot-password"
        ? "Sending reset link..."
        : authMode === "reset-password"
          ? "Resetting password..."
          : "Authenticating...",
    );

    try {
      if (authMode === "forgot-password") {
        await requestPasswordReset(email.trim());
        return;
      }

      if (authMode === "reset-password") {
        if (!resetPasswordToken) {
          setStatus("This reset link is missing or invalid. Request a new one.");
          return;
        }
        if (password !== authResetPasswordConfirm) {
          setStatus("Passwords do not match.");
          return;
        }
        if (password.length < 8) {
          setStatus("Password must be at least 8 characters.");
          return;
        }

        await api("/v1/auth/reset-password", {
          method: "POST",
          body: JSON.stringify({ token: resetPasswordToken, newPassword: password }),
        });
        setAccessToken("");
        setRefreshToken("");
        setMe(null);
        setPendingVerificationEmail("");
        setResetPasswordToken("");
        setPassword("");
        setAuthResetPasswordConfirm("");
        setAuthMode("login");
        setStatus("Password reset. Log in with your new password.");
        return;
      }

      if (authMode === "register") {
        await api("/v1/auth/register", {
          method: "POST",
          body: JSON.stringify({ email, username, password }),
        });
        setPendingVerificationEmail(email.trim());
        setAuthMode("login");
        setPassword("");
        setStatus(
          "Account created. Check your email for a verification link before logging in.",
        );
        return;
      }

      const loginData = await api("/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setAccessToken(loginData.accessToken);
      setRefreshToken(loginData.refreshToken || "");
      setMe(loginData.user);
      setPendingVerificationEmail("");
      setStatus("Authenticated.");
    } catch (error) {
      if (error?.message === "EMAIL_NOT_VERIFIED") {
        setPendingVerificationEmail(email.trim());
        setStatus(
          "Auth failed: EMAIL_NOT_VERIFIED. Use the resend button below if needed.",
        );
        return;
      }
      if (error?.message === "SMTP_NOT_CONFIGURED") {
        setStatus(
          "Auth failed: SMTP is not configured on the API server, so verification emails cannot be sent yet.",
        );
        return;
      }
      if (error?.message === "SMTP_AUTH_FAILED") {
        setStatus(
          "Auth failed: SMTP auth failed. Check Zoho SMTP username/app password.",
        );
        return;
      }
      if (error?.message === "SMTP_CONNECTION_FAILED") {
        setStatus(
          "Auth failed: SMTP connection failed. Check server network + SMTP host/port/TLS.",
        );
        return;
      }
      setStatus(`Auth failed: ${error.message}`);
    }
  }

  async function requestPasswordReset(targetEmail = "") {
    const normalizedEmail = String(targetEmail || "").trim();
    if (!normalizedEmail) {
      setStatus("Enter your email first.");
      return;
    }

    try {
      await api("/v1/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: normalizedEmail }),
      });
      setEmail(normalizedEmail);
      setAuthMode("login");
      setStatus("If the account exists, a password reset link has been sent.");
    } catch (error) {
      if (error?.message === "SMTP_NOT_CONFIGURED") {
        setStatus(
          "Reset failed: SMTP is not configured on the API server. Set SMTP_* (or Zoho SMTP envs) and restart backend.",
        );
        return;
      }
      if (error?.message === "SMTP_AUTH_FAILED") {
        setStatus(
          "Reset failed: SMTP auth failed. Check Zoho username and app password.",
        );
        return;
      }
      if (error?.message === "SMTP_CONNECTION_FAILED") {
        setStatus(
          "Reset failed: could not connect to SMTP server. Check host/port/TLS/firewall.",
        );
        return;
      }
      setStatus(`Reset failed: ${error.message}`);
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
        body: JSON.stringify({ email: targetEmail }),
      });
      setPendingVerificationEmail(targetEmail);
      setStatus(
        "If the account exists and is unverified, a new verification email has been sent.",
      );
    } catch (error) {
      if (error?.message === "SMTP_NOT_CONFIGURED") {
        setStatus(
          "Resend failed: SMTP is not configured on the API server. Set SMTP_* (or Zoho SMTP envs) and restart backend.",
        );
        return;
      }
      if (error?.message === "SMTP_AUTH_FAILED") {
        setStatus(
          "Resend failed: SMTP auth failed. Check Zoho username and app password.",
        );
        return;
      }
      if (error?.message === "SMTP_CONNECTION_FAILED") {
        setStatus(
          "Resend failed: could not connect to SMTP server. Check host/port/TLS/firewall.",
        );
        return;
      }
      setStatus(`Resend failed: ${error.message}`);
    }
  }

  function applySlashCommandTemplate(command) {
    const template = buildSlashCommandTemplate(command);
    setMessageText(template.text);
    window.requestAnimationFrame(() => {
      const input = composerInputRef.current;
      if (!input) return;
      input.focus();
      const cursor = Math.max(
        0,
        Math.min(template.cursor, template.text.length),
      );
      input.setSelectionRange(cursor, cursor);
    });
  }

  async function executeSlashCommand(rawInput) {
    const { commandToken, argText } = splitSlashInput(rawInput);
    if (!commandToken) return false;

    const resolved = resolveSlashCommand(commandToken, serverExtensionCommands);
    if (!resolved.command && resolved.ambiguousMatches.length > 1) {
      setStatus(
        `Ambiguous command /${commandToken}. Use one of: ${resolved.ambiguousMatches.map((item) => `/${item.name}`).join(", ")}`,
      );
      return true;
    }
    if (!resolved.command) {
      setStatus(`Unknown command: /${commandToken}`);
      return true;
    }

    const command = resolved.command;
    const resolvedCommandName = command.name;
    const optionDefs = Array.isArray(command.options) ? command.options : [];
    const args = {};

    try {
      Object.assign(args, parseCommandArgsByOptions(argText, optionDefs));

      optionDefs.forEach((option) => {
        if (!option?.required) return;
        if (!Object.prototype.hasOwnProperty.call(args, option.name)) {
          throw new Error(`Missing required option: ${option.name}`);
        }
      });
    } catch (error) {
      setStatus(`/${commandToken}: ${error.message}`);
      return true;
    }

    try {
      setMessageText("");
      const result = await nodeApi(
        activeServer.baseUrl,
        `/v1/extensions/commands/${encodeURIComponent(resolvedCommandName)}/execute`,
        activeServer.membershipToken,
        {
          method: "POST",
          body: JSON.stringify({
            args,
            channelId: activeChannelId || undefined,
          }),
        },
      );
      const commandResult = result?.result;
      if (result?.postedMessage?.id && activeChannelId) {
        const path = buildPaginatedPath(
          `/v1/channels/${activeChannelId}/messages`,
          { limit: MESSAGE_PAGE_SIZE },
        );
        const data = await nodeApi(
          activeServer.baseUrl,
          path,
          activeServer.membershipToken,
        );
        const fetched = Array.isArray(data?.messages) ? data.messages : [];
        const latestMessages = fetched.slice().reverse();
        const channelKey = `${activeGuildId || ""}:${activeChannelId || ""}`;
        const hasMore =
          data?.hasMore != null
            ? !!data.hasMore
            : fetched.length >= MESSAGE_PAGE_SIZE;
        serverHistoryHasMoreByChannelRef.current[channelKey] = hasMore;
        setMessages((current) =>
          mergeMessagesChronologically(
            current,
            latestMessages,
            (message) => message.created_at || message.createdAt,
          ),
        );
        setStatus(`Executed /${resolvedCommandName}`);
      } else if (
        commandResult &&
        typeof commandResult === "object" &&
        (commandResult.content || Array.isArray(commandResult.embeds))
      ) {
        setStatus(`Executed /${resolvedCommandName}`);
      } else {
        setStatus(
          `Executed /${resolvedCommandName}${result?.result != null ? ` → ${typeof result.result === "string" ? result.result : JSON.stringify(result.result)}` : ""}`,
        );
      }
    } catch (error) {
      setMessageText(rawInput);
      setStatus(`Command failed: ${error.message}`);
    }

    return true;
  }

  async function loadFavouriteMedia() {
    if (!accessToken) {
      setFavouriteMedia([]);
      return;
    }
    setFavouriteMediaLoading(true);
    try {
      const data = await api("/v1/social/favourites/media", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setFavouriteMedia(Array.isArray(data?.favourites) ? data.favourites : []);
    } catch (error) {
      setStatus(`Could not load favourites: ${error.message}`);
    } finally {
      setFavouriteMediaLoading(false);
    }
  }

  function openFavouriteMediaPicker() {
    setFavouriteMediaModalOpen(true);
    loadFavouriteMedia().catch(() => {});
  }

  function buildFavouriteMediaDraftFromAttachment(attachment, messageId = "") {
    const sourceUrl = String(attachment?.url || "").trim();
    if (!sourceUrl) return null;
    const isDmAttachment = /\/v1\/social\/dms\/attachments\//.test(sourceUrl);
    return {
      sourceKind: isDmAttachment ? "dm_attachment" : "server_attachment",
      sourceUrl,
      title: attachment?.fileName || "Image",
      fileName: attachment?.fileName || "",
      contentType: attachment?.contentType || "",
      serverId: isDmAttachment ? "" : activeServerId || "",
      threadId: isDmAttachment ? activeDmId || "" : "",
      messageId: messageId || "",
    };
  }

  function buildFavouriteMediaDraftFromEmbed(embed) {
    const preview = getLinkPreviewForUrl(embed?.url);
    const imageUrl = String(embed?.imageUrl || preview?.imageUrl || "").trim();
    const fallbackImageUrl =
      !imageUrl && isLikelyImageUrl(embed?.url) ? String(embed.url) : "";
    const resolvedImageUrl = imageUrl || fallbackImageUrl;
    if (!resolvedImageUrl) return null;
    return {
      sourceKind: "external_url",
      sourceUrl: resolvedImageUrl,
      pageUrl: embed?.url || preview?.url || resolvedImageUrl,
      title: embed?.title || preview?.title || guessFileNameFromUrl(resolvedImageUrl),
      fileName: guessFileNameFromUrl(resolvedImageUrl),
      contentType: "",
      serverId: "",
      threadId: "",
      messageId: "",
    };
  }

  function resolveFavouriteMediaRequest(item) {
    const sourceUrl = String(item?.sourceUrl || "").trim();
    if (!sourceUrl) return null;

    if (item?.sourceKind === "dm_attachment") {
      if (!accessToken) return null;
      return {
        requestUrl: sourceUrl.startsWith("http")
          ? sourceUrl
          : `${CORE_API}${sourceUrl.startsWith("/") ? "" : "/"}${sourceUrl}`,
        headers: { Authorization: `Bearer ${accessToken}` },
      };
    }

    if (item?.sourceKind === "server_attachment") {
      const targetServerId = String(item?.serverId || "").trim();
      const currentServer =
        targetServerId && activeServerId === targetServerId ? activeServer : null;
      const matchedServer =
        currentServer ||
        (serversRef.current || []).find((server) => server.id === targetServerId) ||
        null;
      const baseUrl = normalizeServerBaseUrl(matchedServer?.baseUrl || "");
      const membershipToken = matchedServer?.membershipToken || "";
      if (!baseUrl || !membershipToken) return null;
      return {
        requestUrl: sourceUrl.startsWith("http")
          ? sourceUrl
          : `${baseUrl}${sourceUrl.startsWith("/") ? "" : "/"}${sourceUrl}`,
        headers: { Authorization: `Bearer ${membershipToken}` },
      };
    }

    return {
      requestUrl: sourceUrl,
      headers: {},
    };
  }

  async function fetchFavouriteMediaBlob(item) {
    const request = resolveFavouriteMediaRequest(item);
    if (!request?.requestUrl) throw new Error("MEDIA_UNAVAILABLE");
    const response = await fetch(request.requestUrl, {
      headers: request.headers,
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `HTTP_${response.status}`);
    }
    return response.blob();
  }

  function buildFavouriteMediaFile(item, blob) {
    const blobType =
      blob?.type || item?.contentType || "application/octet-stream";
    const baseName = String(
      item?.fileName ||
        guessFileNameFromUrl(item?.sourceUrl) ||
        item?.title ||
        "",
    )
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "_");
    const fileName =
      baseName || `favourite-${Date.now()}${extensionForMimeType(blobType)}`;
    return new File([blob], fileName, {
      type: blobType,
    });
  }

  function appendTextToActiveComposer(text, scope) {
    const value = String(text || "").trim();
    if (!value) return;
    if (scope === "dm") {
      setDmText((current) =>
        current.trimEnd() ? `${current.trimEnd()} ${value}` : value,
      );
      dmComposerInputRef.current?.focus();
      return;
    }
    setMessageText((current) =>
      current.trimEnd() ? `${current.trimEnd()} ${value}` : value,
    );
    composerInputRef.current?.focus();
  }

  async function insertFavouriteMedia(item) {
    if (!item?.id) return;
    const scope = navMode === "dms" ? "dm" : navMode === "servers" ? "server" : "";
    if (!scope) {
      setStatus("Open a channel or DM to send saved media.");
      return;
    }
    if (scope === "server" && (!activeServer || !activeChannelId)) {
      setStatus("Select a server channel first.");
      return;
    }
    if (scope === "dm" && (!activeDm || activeDm?.isNoReply)) {
      setStatus(
        activeDm?.isNoReply
          ? "This official account does not accept replies."
          : "Select a DM first.",
      );
      return;
    }

    setFavouriteMediaInsertBusyId(item.id);
    try {
      if (item.sourceKind === "external_url") {
        appendTextToActiveComposer(item.sourceUrl, scope);
        setStatus("Added saved media to the composer.");
      } else {
        const blob = await fetchFavouriteMediaBlob(item);
        const file = buildFavouriteMediaFile(item, blob);
        await uploadAttachments([file], "favourites", scope);
      }
      setFavouriteMediaModalOpen(false);
    } catch (error) {
      setStatus(`Could not add favourite: ${error.message}`);
    } finally {
      setFavouriteMediaInsertBusyId("");
    }
  }

  async function toggleFavouriteMedia(draft) {
    const key = buildFavouriteMediaKey(draft?.sourceKind, draft?.sourceUrl);
    if (!accessToken || !key) return;

    const existing = favouriteMediaByKey.get(key) || null;
    const busyKey = existing?.id || key;
    if (favouriteMediaBusyById[busyKey]) return;

    setFavouriteMediaBusyById((current) => ({ ...current, [busyKey]: true }));
    try {
      if (existing?.id) {
        await api(`/v1/social/favourites/media/${existing.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        setFavouriteMedia((current) =>
          current.filter((item) => item.id !== existing.id),
        );
        setStatus("Removed from favourites.");
      } else {
        const data = await api("/v1/social/favourites/media", {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify(draft),
        });
        const favourite = data?.favourite;
        if (favourite?.id) {
          setFavouriteMedia((current) => {
            const favouriteKey = buildFavouriteMediaKey(
              favourite.sourceKind,
              favourite.sourceUrl,
            );
            const filtered = current.filter(
              (item) =>
                item.id !== favourite.id &&
                buildFavouriteMediaKey(item?.sourceKind, item?.sourceUrl) !==
                  favouriteKey,
            );
            return [favourite, ...filtered];
          });
        }
        setStatus("Saved to favourites.");
      }
    } catch (error) {
      setStatus(`Could not update favourites: ${error.message}`);
    } finally {
      setFavouriteMediaBusyById((current) => {
        const next = { ...current };
        delete next[busyKey];
        return next;
      });
    }
  }

  async function uploadServerAttachment(file) {
    if (!activeServer || !activeGuildId || !activeChannelId || !file)
      return null;
    const nextFile = normalizeAttachmentFile(file, "attachment") || file;
    const form = new FormData();
    form.append("guildId", activeGuildId);
    form.append("channelId", activeChannelId);
    form.append("file", nextFile, nextFile.name || "upload.bin");
    const response = await fetch(
      `${activeServer.baseUrl}/v1/attachments/upload`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${activeServer.membershipToken}` },
        body: form,
      },
    );
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `HTTP_${response.status}`);
    }
    return response.json();
  }

  async function uploadDmAttachment(file, threadId) {
    if (!threadId || !file || !accessToken) return null;
    const nextFile = normalizeAttachmentFile(file, "dm-attachment") || file;
    const form = new FormData();
    form.append("file", nextFile, nextFile.name || "upload.bin");
    const response = await fetch(
      `${CORE_API}/v1/social/dms/${threadId}/attachments/upload`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      },
    );
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `HTTP_${response.status}`);
    }
    return response.json();
  }

  async function uploadAttachments(files, source = "files", scope = "server") {
    const selected = Array.from(files || []).filter(Boolean);
    if (!selected.length) return;
    const isDmScope = scope === "dm";
    const pending = isDmScope ? pendingDmAttachments : pendingAttachments;

    if (isDmScope && activeDm?.isNoReply) {
      setStatus("The OpenCom official account is no-reply.");
      return;
    }

    const availableSlots = Math.max(0, 10 - pending.length);
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
        const data = isDmScope
          ? await uploadDmAttachment(file, activeDm?.id)
          : await uploadServerAttachment(file);
        if (data) {
          if (isDmScope)
            setPendingDmAttachments((current) => [...current, data]);
          else setPendingAttachments((current) => [...current, data]);
          uploaded += 1;
        }
      } catch (error) {
        failed += 1;
        console.warn("Attachment upload failed", error);
      }
    }

    if (uploaded > 0 && failed === 0) {
      setStatus(
        `Attached ${uploaded} file${uploaded === 1 ? "" : "s"} from ${source}.`,
      );
      return;
    }
    if (uploaded > 0) {
      setStatus(
        `Attached ${uploaded} file${uploaded === 1 ? "" : "s"} from ${source}; ${failed} failed.`,
      );
      return;
    }
    setStatus(`Attachment upload failed from ${source}.`);
  }

  async function openMessageAttachment(attachment) {
    if (!attachment?.url) return;
    try {
      const rawUrl = String(attachment.url || "");
      const isDmAttachment = /\/v1\/social\/dms\/attachments\//.test(rawUrl);
      const url = rawUrl.startsWith("http")
        ? rawUrl
        : `${isDmAttachment ? CORE_API : activeServer?.baseUrl || ""}${rawUrl}`;
      if (!url) return;

      const authToken = isDmAttachment
        ? accessToken
        : activeServer?.membershipToken;
      const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};
      const response = await fetch(url, {
        headers,
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
      await nodeApi(
        activeServer.baseUrl,
        `/v1/channels/${activeChannelId}/messages`,
        activeServer.membershipToken,
        {
          method: "POST",
          body: JSON.stringify({
            content: content || "Attachment",
            attachmentIds: pendingAttachments
              .map((attachment) => attachment.attachmentId || attachment.id)
              .filter(Boolean),
          }),
        },
      );

      const path = buildPaginatedPath(
        `/v1/channels/${activeChannelId}/messages`,
        { limit: MESSAGE_PAGE_SIZE },
      );
      const data = await nodeApi(
        activeServer.baseUrl,
        path,
        activeServer.membershipToken,
      );
      const fetched = Array.isArray(data?.messages) ? data.messages : [];
      const latestMessages = fetched.slice().reverse();
      const channelKey = `${activeGuildId || ""}:${activeChannelId || ""}`;
      const hasMore =
        data?.hasMore != null
          ? !!data.hasMore
          : fetched.length >= MESSAGE_PAGE_SIZE;
      serverHistoryHasMoreByChannelRef.current[channelKey] = hasMore;
      setMessages((current) =>
        mergeMessagesChronologically(
          current,
          latestMessages,
          (message) => message.created_at || message.createdAt,
        ),
      );
      setReplyTarget(null);
      setPendingAttachments([]);
      if (attachmentInputRef.current) attachmentInputRef.current.value = "";
    } catch (error) {
      setMessageText(content);
      setStatus(`Send failed: ${error.message}`);
    }
  }
  async function sendDm() {
    if (!activeDm || (!dmText.trim() && pendingDmAttachments.length === 0))
      return;
    if (activeDm.isNoReply) {
      setStatus("The OpenCom official account is no-reply.");
      return;
    }

    const content = `${dmReplyTarget ? `> replying to ${dmReplyTarget.author}: ${dmReplyTarget.content}\n` : ""}${dmText.trim()}`;
    setDmText("");

    try {
      await api(`/v1/social/dms/${activeDm.id}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          content: content || "Attachment",
          attachmentIds: pendingDmAttachments
            .map((attachment) => attachment.attachmentId || attachment.id)
            .filter(Boolean),
        }),
      });

      const path = buildPaginatedPath(
        `/v1/social/dms/${activeDm.id}/messages`,
        { limit: MESSAGE_PAGE_SIZE },
      );
      const data = await api(path, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const latestMessages = Array.isArray(data?.messages) ? data.messages : [];
      const hasMore =
        data?.hasMore != null
          ? !!data.hasMore
          : latestMessages.length >= MESSAGE_PAGE_SIZE;
      dmHistoryHasMoreByThreadRef.current[activeDm.id] = hasMore;
      setDms((current) =>
        current.map((item) => {
          if (item.id !== activeDm.id) return item;
          return {
            ...item,
            messages: mergeMessagesChronologically(
              item.messages || [],
              latestMessages,
              (message) => message.createdAt || message.created_at,
            ),
          };
        }),
      );
      setDmReplyTarget(null);
      setPendingDmAttachments([]);
      if (dmAttachmentInputRef.current) dmAttachmentInputRef.current.value = "";
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
        body: JSON.stringify({ username: cleaned }),
      });

      if (data.friend && data.threadId) {
        setFriends((current) => [
          data.friend,
          ...current.filter((item) => item.id !== data.friend.id),
        ]);
        const nextDm = {
          id: data.threadId,
          participantId: data.friend.id,
          name: data.friend.username,
          messages: [],
        };
        setDms((current) => [
          nextDm,
          ...current.filter((item) => item.id !== nextDm.id),
        ]);
        setActiveDmId(nextDm.id);
        setStatus(`You're now connected with ${data.friend.username}.`);
      } else {
        setStatus("Friend request sent.");
      }

      const requests = await api("/v1/social/requests", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setFriendRequests({
        incoming: requests.incoming || [],
        outgoing: requests.outgoing || [],
      });
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
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const [requests, friendsData] = await Promise.all([
        api("/v1/social/requests", {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
        api("/v1/social/friends", {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      ]);
      setFriendRequests({
        incoming: requests.incoming || [],
        outgoing: requests.outgoing || [],
      });
      setFriends(friendsData.friends || []);
      if (action === "accept") setStatus("Friend request accepted.");
      else if (action === "cancel") setStatus("Friend request canceled.");
      else setStatus("Friend request declined.");
    } catch (error) {
      setStatus(`Request update failed: ${error.message}`);
    }
  }

  async function saveSocialSettings() {
    try {
      await api("/v1/social/settings", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ allowFriendRequests }),
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
        headers: { Authorization: `Bearer ${accessToken}` },
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
        headers: { Authorization: `Bearer ${accessToken}` },
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
        headers: { Authorization: `Bearer ${accessToken}` },
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
        headers: { Authorization: `Bearer ${accessToken}` },
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
        headers: { Authorization: `Bearer ${accessToken}` },
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
        headers: { Authorization: `Bearer ${accessToken}` },
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
        body: JSON.stringify({ giftId, sessionId }),
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
      const data = await api(
        `/v1/billing/boost/gifts/${encodeURIComponent(code)}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      setBoostGiftCode(code);
      setBoostGiftPreview(data);
      setBoostGiftPrompt(data);
      setSettingsOpen(true);
      setSettingsTab("billing");
      setStatus(
        `Boost gift from ${data?.from?.username || "someone"} is ready to redeem.`,
      );
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
      const data = await api(
        `/v1/billing/boost/gifts/${encodeURIComponent(code)}/redeem`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
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
      cta: "Open Boost Settings",
    });
  }

  function openBoostUpsell(title, reason, cta) {
    setBoostUpsell({ title, reason, cta });
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
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setStatus("Session revoked.");
      await loadSessions();
    } catch (error) {
      setStatus(`Could not revoke session: ${error.message}`);
    }
  }

  async function changePassword() {
    if (
      !passwordForm.current ||
      !passwordForm.new ||
      passwordForm.new !== passwordForm.confirm
    ) {
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
          newPassword: passwordForm.new,
        }),
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
        code += Math.floor(Math.random() * 10000)
          .toString()
          .padStart(4, "0");
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
    setStatus(
      "2FA setup initiated. Scan the QR code with your authenticator app.",
    );
  }

  function verifyTOTPToken(token, secret) {
    if (!token || !secret) return false;
    const cleanToken = token.replace(/\s/g, "").slice(0, 6);
    if (!/^\d{6}$/.test(cleanToken)) return false;

    if (backupCodes.includes(cleanToken)) {
      setStatus("Backup code verified! Removing code from backups.");
      setBackupCodes((current) =>
        current.filter((code) => code !== cleanToken),
      );
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
      k = new Uint8Array(blockSize).map((_, i) => (i < k.length ? k[i] : 0));
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
    const code =
      ((hash[offset] & 0x7f) << 24) |
      ((hash[offset + 1] & 0xff) << 16) |
      ((hash[offset + 2] & 0xff) << 8) |
      (hash[offset + 3] & 0xff);

    return (code % 1000000).toString().padStart(6, "0");
  }

  function sha1Bytes(data) {
    let view = new Uint8Array(data);
    const buf = Array.from(view)
      .map((x) => String.fromCharCode(x))
      .join("");
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
        w[i] =
          (msg.charCodeAt(chunkStart + i * 4) << 24) |
          (msg.charCodeAt(chunkStart + i * 4 + 1) << 16) |
          (msg.charCodeAt(chunkStart + i * 4 + 2) << 8) |
          msg.charCodeAt(chunkStart + i * 4 + 3);
      }

      for (let i = 16; i < 80; i++) {
        w[i] =
          ((w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]) << 1) |
          ((w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]) >>> 31);
      }

      let [a, b, c, d, e] = hash;

      for (let i = 0; i < 80; i++) {
        let f, k;
        if (i < 20) {
          f = (b & c) | (~b & d);
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
        c = (b << 30) | (b >>> 2);
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
    const approved = await confirmDialog(
      "Are you sure? You will lose 2FA protection.",
      "Disable 2FA",
    );
    if (!approved) return;
    setSecuritySettings((current) => ({ ...current, twoFactorEnabled: false }));
    setTwoFactorSecret("");
    setBackupCodes([]);
    setTwoFactorVerified(false);
    setShow2FASetup(false);
    setStatus("2FA has been disabled.");
  }

  async function openDmFromFriend(friend) {
    const existing = dms.find(
      (item) =>
        item.participantId === friend.id || item.name === friend.username,
    );
    if (existing) {
      setActiveDmId(existing.id);
      setNavMode("dms");
      return;
    }

    try {
      const data = await api("/v1/social/dms/open", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ friendId: friend.id }),
      });

      const threadId = data.threadId;
      setDms((current) => {
        const existing = current.find((item) => item.id === threadId);
        if (existing) return current;
        return [
          {
            id: threadId,
            participantId: friend.id,
            name: friend.username,
            messages: [],
          },
          ...current,
        ];
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
          bannerUrl: normalizeImageUrlInput(profileForm.bannerUrl) || null,
        }),
      });
      if (me?.id) {
        const updated = await api(`/v1/users/${me.id}/profile`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        setProfile(updated);
        setFullProfileDraft(normalizeFullProfile(updated, updated.fullProfile));
        setProfileForm({
          displayName: updated.displayName ?? "",
          bio: updated.bio ?? "",
          pfpUrl: updated.pfpUrl ?? "",
          bannerUrl: updated.bannerUrl ?? "",
        });
      } else {
        setProfile((current) => ({ ...current, ...profileForm }));
      }
      setStatus("Profile updated.");
    } catch (error) {
      const msg = error?.message || "";
      if (
        msg.includes("INVALID_IMAGE") ||
        msg.includes("Invalid image format")
      ) {
        setStatus(
          "Invalid image URL. Use uploaded image paths (/v1/profile-images/...), users/... paths, or valid http(s) image URLs.",
        );
      } else setStatus(`Profile update failed: ${msg}`);
    }
  }

  function updateFullProfileElement(elementId, patch) {
    setFullProfileDraft((current) => ({
      ...current,
      mode: "custom",
      elements: (current.elements || []).map((item) => {
        if (item.id !== elementId) return item;
        const merged = { ...item, ...patch };
        const rect = clampProfileElementRect(
          { x: merged.x, y: merged.y, w: merged.w, h: merged.h },
          item,
        );
        return { ...merged, ...rect };
      }),
    }));
  }

  function addFullProfileElement(elementType) {
    const type = String(elementType || "").toLowerCase();
    if (
      !["avatar", "banner", "name", "bio", "links", "text", "music"].includes(
        type,
      )
    )
      return;
    const nextId = `${type}-${Date.now()}`;
    const fallback =
      type === "banner"
        ? { x: 0, y: 0, w: 100, h: 34 }
        : type === "avatar"
          ? { x: 4, y: 21, w: 20, h: 31 }
          : type === "name"
            ? { x: 30, y: 30, w: 66, h: 10 }
            : type === "bio"
              ? { x: 4, y: 54, w: 92, h: 22 }
              : type === "links"
                ? { x: 4, y: 76, w: 56, h: 20 }
                : type === "music"
                  ? { x: 74, y: 6, w: 22, h: 9 }
                  : { x: 8, y: 22, w: 58, h: 12 };
    setFullProfileDraft((current) => {
      const nextIndex = (current.elements || []).length + 1;
      const placement = clampProfileElementRect(
        {
          x: Number(fallback.x || 0) + ((nextIndex - 1) % 5) * 3,
          y: Number(fallback.y || 0) + ((nextIndex - 1) % 5) * 3,
          w: fallback.w,
          h: fallback.h,
        },
        fallback,
      );
      return {
        ...current,
        mode: "custom",
        enabled: true,
        elements: [
          ...(current.elements || []),
          {
            id: nextId,
            type,
            ...placement,
            order: 10 + nextIndex,
            text: type === "text" ? `Custom text ${nextIndex}` : "",
            radius: type === "avatar" ? 18 : type === "banner" ? 0 : 8,
            opacity: 100,
            fontSize:
              type === "name"
                ? 22
                : type === "bio"
                  ? 14
                  : type === "links"
                    ? 14
                    : type === "music"
                      ? 12
                      : 16,
            align: "left",
            color: "",
          },
        ],
      };
    });
    setProfileStudioSelectedElementId(nextId);
  }

  function addFullProfileTextBlock() {
    addFullProfileElement("text");
  }

  function removeFullProfileElement(elementId) {
    setFullProfileDraft((current) => ({
      ...current,
      mode: "custom",
      elements: (current.elements || []).filter(
        (item) => item.id !== elementId,
      ),
    }));
    if (profileStudioSelectedElementId === elementId)
      setProfileStudioSelectedElementId("");
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
            y: 0,
          },
        ].slice(0, 16),
      };
    });
  }

  function updateFullProfileLink(linkId, patch) {
    setFullProfileDraft((current) => ({
      ...current,
      mode: "custom",
      links: (current.links || []).map((item) =>
        item.id === linkId ? { ...item, ...patch } : item,
      ),
    }));
  }

  function removeFullProfileLink(linkId) {
    setFullProfileDraft((current) => ({
      ...current,
      mode: "custom",
      links: (current.links || []).filter((item) => item.id !== linkId),
    }));
  }

  function resetFullProfileDraftToBasic() {
    setFullProfileDraft(createBasicFullProfile(profile || {}));
    setProfileStudioSelectedElementId("");
  }

  function nudgeFullProfileElement(elementId, patch) {
    const element = (fullProfileDraft?.elements || []).find(
      (item) => item.id === elementId,
    );
    if (!element) return;
    const rect = clampProfileElementRect(
      {
        x: patch.x ?? element.x,
        y: patch.y ?? element.y,
        w: patch.w ?? element.w,
        h: patch.h ?? element.h,
      },
      element,
    );
    updateFullProfileElement(elementId, {
      ...rect,
      order: Math.max(
        0,
        Math.min(
          100,
          Number.isFinite(Number(patch.order))
            ? Number(patch.order)
            : Number(element.order || 0),
        ),
      ),
    });
  }

  async function saveFullProfileDraft() {
    if (!hasBoostForFullProfiles) {
      openBoostUpsell(
        "Boost required",
        "Custom full profiles are a Boost perk. Without Boost you get the default profile layout.",
        "Open billing",
      );
      return;
    }
    try {
      const payload = normalizeFullProfile(profile || {}, {
        ...fullProfileDraft,
        mode: "custom",
        enabled: true,
      });
      const data = await api("/v1/me/profile/full", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(payload),
      });
      const nextProfile = {
        ...(profile || {}),
        fullProfile: normalizeFullProfile(
          profile || {},
          data?.fullProfile || payload,
        ),
        hasCustomFullProfile: true,
      };
      setProfile(nextProfile);
      setFullProfileDraft(nextProfile.fullProfile);
      setStatus("Full profile updated.");
    } catch (error) {
      const message = String(error?.message || "");
      if (message.includes("BOOST_REQUIRED")) {
        openBoostUpsell(
          "Boost required",
          "Custom full profiles are a Boost perk. Activate Boost to save your layout.",
          "Open billing",
        );
      } else {
        setStatus(`Full profile update failed: ${message}`);
      }
    }
  }

  function onFullProfileElementMouseDown(event, elementId) {
    if (!fullProfileEditorCanvasRef.current) return;
    const element = (fullProfileDraft.elements || []).find(
      (item) => item.id === elementId,
    );
    if (!element) return;
    const rect = fullProfileEditorCanvasRef.current.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * 100;
    const py = ((event.clientY - rect.top) / rect.height) * 100;
    fullProfileDragOffsetRef.current = {
      x: px - Number(element.x || 0),
      y: py - Number(element.y || 0),
    };
    setProfileStudioSelectedElementId(elementId);
    setFullProfileDraggingElementId(elementId);
  }

  async function saveRichPresence() {
    if (!accessToken) return;
    const activity = rpcActivityFromForm(rpcForm);
    if (
      !activity.name &&
      !activity.details &&
      !activity.state &&
      !activity.largeImageUrl &&
      !activity.smallImageUrl &&
      !activity.buttons
    ) {
      setStatus("Add at least one rich presence field before saving.");
      return;
    }
    try {
      await api("/v1/presence/rpc", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ activity }),
      });
      if (me?.id) {
        setPresenceByUserId((prev) => ({
          ...prev,
          [me.id]: {
            ...(prev[me.id] || {}),
            status: prev[me.id]?.status || selfStatus,
            customStatus: prev[me.id]?.customStatus ?? null,
            richPresence: activity,
          },
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
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (me?.id) {
        setPresenceByUserId((prev) => ({
          ...prev,
          [me.id]: {
            ...(prev[me.id] || {}),
            status: prev[me.id]?.status || selfStatus,
            customStatus: prev[me.id]?.customStatus ?? null,
            richPresence: null,
          },
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
          logoUrl:
            normalizeImageUrlInput(serverProfileForm.logoUrl || "") || null,
          bannerUrl:
            normalizeImageUrlInput(serverProfileForm.bannerUrl || "") || null,
        }),
      });
      const refreshed = await api("/v1/servers", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const next = normalizeServerList(refreshed.servers || []);
      setServers(next);
      setStatus("Server profile updated.");
    } catch (error) {
      const msg = error?.message || "";
      if (msg.includes("LOGO_REQUIRED")) setStatus("Server logo is required.");
      else if (msg.includes("INVALID_LOGO_URL"))
        setStatus(
          "Invalid server logo URL. Use uploaded paths (/v1/profile-images/... or users/...) or valid http(s) URLs.",
        );
      else if (msg.includes("INVALID_BANNER_URL"))
        setStatus(
          "Invalid server banner URL. Use uploaded paths (/v1/profile-images/... or users/...) or valid http(s) URLs.",
        );
      else if (msg.includes("VALIDATION_ERROR"))
        setStatus(
          "Server profile data is invalid. Check name, logo URL, and banner URL.",
        );
      else setStatus(`Server profile update failed: ${msg}`);
    }
  }

  async function createServer() {
    if (
      !newServerName.trim() ||
      !newServerBaseUrl.trim() ||
      !newServerLogoUrl.trim()
    )
      return;
    try {
      await api("/v1/servers", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          name: newServerName.trim(),
          baseUrl: newServerBaseUrl.trim(),
          logoUrl: normalizeImageUrlInput(newServerLogoUrl),
          bannerUrl: normalizeImageUrlInput(newServerBannerUrl) || null,
        }),
      });
      setNewServerName("");
      setNewServerBaseUrl("https://");
      setNewServerLogoUrl("");
      setNewServerBannerUrl("");
      setStatus("Server provider added.");
      const refreshed = await api("/v1/servers", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setServers(normalizeServerList(refreshed.servers || []));
      setAddServerModalOpen(false);
    } catch (error) {
      const msg = error?.message || "";
      if (msg.includes("LOGO_REQUIRED")) setStatus("Server logo is required.");
      else if (msg.includes("INVALID_LOGO_URL"))
        setStatus(
          "Invalid server logo URL. Use uploaded paths (/v1/profile-images/... or users/...) or valid http(s) URLs.",
        );
      else if (msg.includes("INVALID_BANNER_URL"))
        setStatus(
          "Invalid server banner URL. Use uploaded paths (/v1/profile-images/... or users/...) or valid http(s) URLs.",
        );
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
    if (
      !activeServer?.baseUrl ||
      !activeServer?.membershipToken ||
      !newWorkspaceName?.trim()
    ) {
      setStatus("Select a server and enter a workspace name.");
      return;
    }
    try {
      const data = await nodeApi(
        activeServer.baseUrl,
        "/v1/guilds",
        activeServer.membershipToken,
        {
          method: "POST",
          body: JSON.stringify({
            name: newWorkspaceName.trim(),
            createDefaultVoice: true,
          }),
        },
      );
      setNewWorkspaceName("");
      setStatus("Workspace created.");
      const nextGuilds = await nodeApi(
        activeServer.baseUrl,
        "/v1/guilds",
        activeServer.membershipToken,
      );
      const list = Array.isArray(nextGuilds) ? nextGuilds : [];
      setGuilds(list);
      if (data?.guildId && list.length) setActiveGuildId(data.guildId);
    } catch (error) {
      setStatus(`Create workspace failed: ${error.message}`);
    }
  }

  async function createInvite() {
    if (!inviteServerId) return;
    const wantsBoostPerk =
      invitePermanent || inviteCustomCode.trim().length > 0;
    if (wantsBoostPerk && boostStatus && !boostStatus.active) {
      showBoostUpsell(
        "Custom invite codes and permanent invite links require OpenCom Boost.",
      );
      return;
    }
    try {
      const payload = {
        serverId: inviteServerId,
        code: inviteCustomCode.trim() || undefined,
        permanent: invitePermanent,
      };
      const data = await api("/v1/invites", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(payload),
      });
      setInviteCode(data.code);
      setInviteJoinUrl(data.joinUrl || "");
      setInviteCustomCode("");
      setStatus("Invite code generated.");
    } catch (error) {
      if (String(error?.message || "").includes("BOOST_REQUIRED")) {
        showBoostUpsell(
          "Custom invite codes and permanent invite links require OpenCom Boost.",
        );
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
        body: JSON.stringify({ accept: true }),
      });
      setJoinInviteCode("");
      setInvitePreview(null);
      setInvitePendingCode("");
      setInvitePendingAutoJoin(false);
      const joinedServerName =
        data?.serverName ||
        data?.server?.name ||
        invitePreview?.serverName ||
        "";
      setStatus(
        joinedServerName
          ? `Joined ${joinedServerName}.`
          : "Joined server from invite.",
      );

      const refreshed = await api("/v1/servers", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const next = normalizeServerList(refreshed.servers || []);
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
    const tokens = raw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    if (!tokens.length) return [];
    const rolePool = (guildState?.roles || []).filter(
      (role) => !role.is_everyone,
    );
    const byId = new Map(
      rolePool.map((role) => [String(role.id).toLowerCase(), role.id]),
    );
    const byName = new Map(
      rolePool.map((role) => [String(role.name || "").toLowerCase(), role.id]),
    );
    const picked = [];
    for (const token of tokens) {
      const key = token.toLowerCase();
      const roleId = byId.get(key) || byName.get(key);
      if (roleId && !picked.includes(roleId)) picked.push(roleId);
    }
    return picked;
  }

  async function applyPrivateVisibilityToChannel(
    channelId,
    allowedRoleIds = [],
    server = activeServer,
    guildId = workingGuildId,
  ) {
    if (!server || !guildId || !channelId) return;
    const everyoneRole = (guildState?.roles || []).find(
      (role) => role.is_everyone,
    );
    if (!everyoneRole) throw new Error("EVERYONE_ROLE_NOT_FOUND");

    await nodeApi(
      server.baseUrl,
      `/v1/channels/${channelId}/overwrites`,
      server.membershipToken,
      {
        method: "PUT",
        body: JSON.stringify({
          targetType: "role",
          targetId: everyoneRole.id,
          allow: "0",
          deny: String(VIEW_CHANNEL_BIT),
        }),
      },
    );

    for (const roleId of allowedRoleIds) {
      await nodeApi(
        server.baseUrl,
        `/v1/channels/${channelId}/overwrites`,
        server.membershipToken,
        {
          method: "PUT",
          body: JSON.stringify({
            targetType: "role",
            targetId: roleId,
            allow: String(VIEW_CHANNEL_BIT),
            deny: "0",
          }),
        },
      );
    }
  }

  async function createChannelWithOptions({
    server = activeServer,
    guildId = workingGuildId,
    name,
    type = "text",
    parentId = "",
    privateRoleIds = null,
  }) {
    if (!server || !guildId || !name?.trim()) return null;

    const payload = { name: name.trim(), type };
    if (type !== "category" && parentId) payload.parentId = parentId;

    const created = await nodeApi(
      server.baseUrl,
      `/v1/guilds/${guildId}/channels`,
      server.membershipToken,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );

    const channelId = created?.channelId;
    if (channelId && Array.isArray(privateRoleIds)) {
      await applyPrivateVisibilityToChannel(
        channelId,
        privateRoleIds,
        server,
        guildId,
      );
    }

    if (server.id === activeServerId && guildId === workingGuildId) {
      const state = await nodeApi(
        server.baseUrl,
        `/v1/guilds/${guildId}/state`,
        server.membershipToken,
      );
      setGuildState(state);
    }

    return channelId;
  }

  async function promptCreateChannelFlow({
    server = activeServer,
    guildId = workingGuildId,
    fixedType = "",
    fixedParentId = "",
  } = {}) {
    if (!server || !guildId) {
      setStatus(
        "No active guild selected yet. Open a channel first, then try again.",
      );
      return;
    }

    const type =
      fixedType ||
      (
        (await promptText("Channel type: text, voice, or category", "text")) ||
        ""
      )
        .trim()
        .toLowerCase();
    if (!["text", "voice", "category"].includes(type)) {
      setStatus("Invalid channel type.");
      return;
    }

    const suggestedName = type === "category" ? "New Category" : `new-${type}`;
    const name = (
      (await promptText(`Name for the new ${type}:`, suggestedName)) || ""
    ).trim();
    if (!name) return;

    let parentId = fixedParentId || "";
    if (type !== "category" && !fixedParentId) {
      const parentName = (
        (await promptText(
          "Optional category name/ID (leave blank for none):",
          "",
        )) || ""
      ).trim();
      if (parentName) {
        const parent = (categoryChannels || []).find(
          (cat) =>
            cat.id === parentName ||
            String(cat.name || "").toLowerCase() === parentName.toLowerCase(),
        );
        if (!parent) {
          setStatus("Category not found.");
          return;
        }
        parentId = parent.id;
      }
    }

    let privateRoleIds = null;
    if (type === "category") {
      const makePrivate = await confirmDialog(
        "Make this category private?",
        "Category Privacy",
      );
      if (makePrivate) {
        const roleList = (guildState?.roles || [])
          .filter((role) => !role.is_everyone)
          .map((role) => role.name)
          .join(", ");
        const rawRoles =
          (await promptText(
            `Allowed roles (comma-separated names or IDs).\nAvailable: ${roleList}`,
            "",
          )) || "";
        privateRoleIds = parseRoleInputToIds(rawRoles);
      }
    }

    try {
      await createChannelWithOptions({
        server,
        guildId,
        name,
        type,
        parentId,
        privateRoleIds,
      });
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
        parentId: newChannelType !== "category" ? newChannelParentId : "",
      });
      setNewChannelName("");
      setNewChannelParentId("");
      setStatus("Channel created.");
    } catch (error) {
      setStatus(`Create channel failed: ${error.message}`);
    }
  }

  async function createServerEmote() {
    if (
      !activeServer ||
      !activeGuildId ||
      !newServerEmoteName.trim() ||
      !newServerEmoteUrl.trim()
    )
      return;
    try {
      await nodeApi(
        activeServer.baseUrl,
        `/v1/guilds/${activeGuildId}/emotes`,
        activeServer.membershipToken,
        {
          method: "POST",
          body: JSON.stringify({
            name: newServerEmoteName.trim().toLowerCase(),
            imageUrl: newServerEmoteUrl.trim(),
          }),
        },
      );
      setNewServerEmoteName("");
      setNewServerEmoteUrl("");
      const state = await nodeApi(
        activeServer.baseUrl,
        `/v1/guilds/${activeGuildId}/state`,
        activeServer.membershipToken,
      );
      setGuildState(state);
      setStatus("Custom emote created.");
    } catch (error) {
      setStatus(`Create emote failed: ${error.message}`);
    }
  }

  async function removeServerEmote(emoteId) {
    if (!activeServer || !activeGuildId || !emoteId) return;
    try {
      await nodeApi(
        activeServer.baseUrl,
        `/v1/guilds/${activeGuildId}/emotes/${emoteId}`,
        activeServer.membershipToken,
        {
          method: "DELETE",
        },
      );
      const state = await nodeApi(
        activeServer.baseUrl,
        `/v1/guilds/${activeGuildId}/state`,
        activeServer.membershipToken,
      );
      setGuildState(state);
      setStatus("Custom emote removed.");
    } catch (error) {
      setStatus(`Remove emote failed: ${error.message}`);
    }
  }

  async function updateChannelPosition(channelId, newPosition) {
    if (!activeServer || !activeGuildId) return;
    try {
      await nodeApi(
        activeServer.baseUrl,
        `/v1/channels/${channelId}`,
        activeServer.membershipToken,
        {
          method: "PATCH",
          body: JSON.stringify({ position: newPosition }),
        },
      );
      const state = await nodeApi(
        activeServer.baseUrl,
        `/v1/guilds/${activeGuildId}/state`,
        activeServer.membershipToken,
      );
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
      const isThisSection = pid === sectionParentId;
      const ordered = isThisSection
        ? reordered
        : list.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      flatOrder.push(...ordered);
    }
    const updates = flatOrder.map((ch, idx) =>
      (ch.position ?? -1) !== idx
        ? updateChannelPosition(ch.id, idx)
        : Promise.resolve(),
    );
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
      await Promise.all(
        reordered.map((cat, idx) => updateChannelPosition(cat.id, idx * 100)),
      );
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
          await nodeApi(
            activeServer.baseUrl,
            `/v1/channels/${channelId}/overwrites`,
            activeServer.membershipToken,
            {
              method: "PUT",
              body: JSON.stringify({
                targetType: "role",
                targetId: everyoneRole.id,
                allow: "0",
                deny: String(SEND_MESSAGES_BIT),
              }),
            },
          );
        }
        await nodeApi(
          activeServer.baseUrl,
          `/v1/channels/${channelId}/overwrites`,
          activeServer.membershipToken,
          {
            method: "PUT",
            body: JSON.stringify({
              targetType: "role",
              targetId: roleId,
              allow: String(SEND_MESSAGES_BIT),
              deny: "0",
            }),
          },
        );
      } else {
        await nodeApi(
          activeServer.baseUrl,
          `/v1/channels/${channelId}/overwrites`,
          activeServer.membershipToken,
          {
            method: "DELETE",
            body: JSON.stringify({ targetType: "role", targetId: roleId }),
          },
        );
        const otherRoleAllows = (guildState?.overwrites || []).filter(
          (o) =>
            o.channel_id === channelId &&
            o.target_type === "role" &&
            o.target_id !== roleId &&
            parseInt(o.allow, 10) & SEND_MESSAGES_BIT,
        );
        if (everyoneRole && otherRoleAllows.length === 0) {
          await nodeApi(
            activeServer.baseUrl,
            `/v1/channels/${channelId}/overwrites`,
            activeServer.membershipToken,
            {
              method: "DELETE",
              body: JSON.stringify({
                targetType: "role",
                targetId: everyoneRole.id,
              }),
            },
          );
        }
      }
      const state = await nodeApi(
        activeServer.baseUrl,
        `/v1/guilds/${activeGuildId}/state`,
        activeServer.membershipToken,
      );
      setGuildState(state);
    } catch (e) {
      setStatus(`Permission update failed: ${e.message}`);
    }
  }

  function channelOverwriteAllowsSend(channelId, roleId) {
    const ov = (guildState?.overwrites || []).find(
      (o) =>
        o.channel_id === channelId &&
        o.target_type === "role" &&
        o.target_id === roleId,
    );
    if (!ov) return false;
    return (parseInt(ov.allow, 10) & SEND_MESSAGES_BIT) !== 0;
  }

  async function createRole() {
    if (!activeServer || !activeGuildId || !newRoleName.trim()) return;
    try {
      await nodeApi(
        activeServer.baseUrl,
        `/v1/guilds/${activeGuildId}/roles`,
        activeServer.membershipToken,
        {
          method: "POST",
          body: JSON.stringify({ name: newRoleName.trim(), permissions: "0" }),
        },
      );
      setNewRoleName("");
      const state = await nodeApi(
        activeServer.baseUrl,
        `/v1/guilds/${activeGuildId}/state`,
        activeServer.membershipToken,
      );
      setGuildState(state);
      setStatus("Role created.");
    } catch (error) {
      setStatus(`Create role failed: ${error.message}`);
    }
  }

  async function assignRoleToMember() {
    if (!activeServer || !activeGuildId || !selectedMemberId || !selectedRoleId)
      return;
    try {
      await nodeApi(
        activeServer.baseUrl,
        `/v1/guilds/${activeGuildId}/members/${selectedMemberId}/roles/${selectedRoleId}`,
        activeServer.membershipToken,
        { method: "PUT", body: "{}" },
      );
      setStatus("Role assigned.");
    } catch (error) {
      setStatus(`Assign role failed: ${error.message}`);
    }
  }

  async function refreshActiveGuildState() {
    if (!activeServer || !activeGuildId) return;
    const state = await nodeApi(
      activeServer.baseUrl,
      `/v1/guilds/${activeGuildId}/state`,
      activeServer.membershipToken,
    );
    setGuildState(state);
  }

  async function kickMember(memberId) {
    if (
      !activeServer ||
      !activeGuildId ||
      !memberId ||
      !canKickMembers ||
      moderationBusy
    )
      return;
    const member = resolvedMemberList.find((item) => item.id === memberId);
    const label = member?.username || memberId;
    if (
      !(await confirmDialog(
        `Kick ${label}? They can rejoin with an invite.`,
        "Kick Member",
      ))
    )
      return;

    setModerationBusy(true);
    try {
      await nodeApi(
        activeServer.baseUrl,
        `/v1/guilds/${activeGuildId}/members/${memberId}/kick`,
        activeServer.membershipToken,
        { method: "POST", body: "{}" },
      );
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
    if (
      !activeServer ||
      !activeGuildId ||
      !memberId ||
      !canBanMembers ||
      moderationBusy
    )
      return;
    const member = resolvedMemberList.find((item) => item.id === memberId);
    const label = member?.username || memberId;
    if (
      !(await confirmDialog(
        `Ban ${label}? This removes them and blocks rejoin until unbanned.`,
        "Ban Member",
      ))
    )
      return;

    setModerationBusy(true);
    try {
      const payload = {};
      if (reason.trim()) payload.reason = reason.trim().slice(0, 256);
      await nodeApi(
        activeServer.baseUrl,
        `/v1/guilds/${activeGuildId}/members/${memberId}/ban`,
        activeServer.membershipToken,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      );
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
    if (
      !activeServer ||
      !activeGuildId ||
      !memberId ||
      !canBanMembers ||
      moderationBusy
    )
      return;
    setModerationBusy(true);
    try {
      await nodeApi(
        activeServer.baseUrl,
        `/v1/guilds/${activeGuildId}/bans/${memberId}`,
        activeServer.membershipToken,
        { method: "DELETE" },
      );
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
      if (color !== undefined)
        body.color =
          typeof color === "string" && color.startsWith("#")
            ? parseInt(color.slice(1), 16)
            : color;
      if (position !== undefined) body.position = position;
      if (Object.keys(body).length === 0) return;
      await nodeApi(
        activeServer.baseUrl,
        `/v1/roles/${roleId}`,
        activeServer.membershipToken,
        {
          method: "PATCH",
          body: JSON.stringify(body),
        },
      );
      const state = await nodeApi(
        activeServer.baseUrl,
        `/v1/guilds/${activeGuildId}/state`,
        activeServer.membershipToken,
      );
      setGuildState(state);
      setStatus("Role updated.");
    } catch (error) {
      setStatus(`Update role failed: ${error.message}`);
    }
  }

  function startDraggingProfileCard(event) {
    if (typeof event.button === "number" && event.button !== 0) return;
    event.preventDefault();
    profileCardDragPointerIdRef.current = Number.isFinite(
      Number(event.pointerId),
    )
      ? event.pointerId
      : null;
    profileCardDragOffsetRef.current = invertProfileDrag
      ? {
          x: event.clientX + profileCardPosition.x,
          y: event.clientY + profileCardPosition.y,
        }
      : {
          x: event.clientX - profileCardPosition.x,
          y: event.clientY - profileCardPosition.y,
        };
    setDraggingProfileCard(true);
  }

  function toggleCategory(categoryId) {
    setCollapsedCategories((current) => ({
      ...current,
      [categoryId]: !current[categoryId],
    }));
  }

  function openServerContextMenu(event, server) {
    event.preventDefault();
    const pos = getContextMenuPoint(event.clientX, event.clientY, {
      width: 260,
      height: 260,
    });
    setMessageContextMenu(null);
    setMemberContextMenu(null);
    setChannelContextMenu(null);
    setCategoryContextMenu(null);
    setServerContextMenu({ server, x: pos.x, y: pos.y });
  }

  function openChannelContextMenu(event, channel) {
    event.preventDefault();
    const pos = getContextMenuPoint(event.clientX, event.clientY, {
      width: 260,
      height: 230,
    });
    setServerContextMenu(null);
    setMessageContextMenu(null);
    setMemberContextMenu(null);
    setCategoryContextMenu(null);
    setChannelContextMenu({ channel, x: pos.x, y: pos.y });
  }

  function openCategoryContextMenu(event, category) {
    event.preventDefault();
    const pos = getContextMenuPoint(event.clientX, event.clientY, {
      width: 260,
      height: 230,
    });
    setServerContextMenu(null);
    setMessageContextMenu(null);
    setMemberContextMenu(null);
    setChannelContextMenu(null);
    setCategoryContextMenu({ category, x: pos.x, y: pos.y });
  }

  async function saveChannelName(channelId, currentName) {
    if (!activeServer || !workingGuildId) return;
    const nextName = (
      (await promptText("Channel name:", currentName || "")) || ""
    ).trim();
    if (!nextName || nextName === currentName) return;
    await nodeApi(
      activeServer.baseUrl,
      `/v1/channels/${channelId}`,
      activeServer.membershipToken,
      {
        method: "PATCH",
        body: JSON.stringify({ name: nextName }),
      },
    );
  }

  async function setChannelVisibilityByRoles(channelId) {
    if (!activeServer || !workingGuildId || !channelId) return;
    const roleList = (guildState?.roles || [])
      .filter((role) => !role.is_everyone)
      .map((role) => role.name)
      .join(", ");
    const rawRoles = await promptText(
      `Visible to roles (comma-separated names or IDs). Leave blank to keep private for admins only.\nAvailable: ${roleList}`,
      "",
    );
    if (rawRoles == null) return;
    const allowedRoleIds = parseRoleInputToIds(rawRoles);
    await applyPrivateVisibilityToChannel(
      channelId,
      allowedRoleIds,
      activeServer,
      workingGuildId,
    );
  }

  async function openChannelSettings(channel) {
    if (!channel || !canManageServer || !activeServer || !workingGuildId)
      return;
    try {
      await saveChannelName(channel.id, channel.name);
      if (
        await confirmDialog(
          "Configure visibility (private roles) for this channel/category?",
          "Channel Visibility",
        )
      ) {
        await setChannelVisibilityByRoles(channel.id);
      }
      const state = await nodeApi(
        activeServer.baseUrl,
        `/v1/guilds/${workingGuildId}/state`,
        activeServer.membershipToken,
      );
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
    if (!channel || !canManageServer || !activeServer || !workingGuildId)
      return;
    const kind = channel.type === "category" ? "category" : "channel";
    if (
      !(await confirmDialog(
        `Delete ${kind} "${channel.name}"?`,
        "Delete Channel",
      ))
    )
      return;

    try {
      if (channel.type === "category") {
        const children = (guildState?.channels || []).filter(
          (item) => item.parent_id === channel.id,
        );
        for (const child of children) {
          await nodeApi(
            activeServer.baseUrl,
            `/v1/channels/${child.id}`,
            activeServer.membershipToken,
            {
              method: "PATCH",
              body: JSON.stringify({ parentId: null }),
            },
          );
        }
      }

      await nodeApi(
        activeServer.baseUrl,
        `/v1/channels/${channel.id}`,
        activeServer.membershipToken,
        {
          method: "DELETE",
        },
      );

      if (activeChannelId === channel.id) setActiveChannelId("");
      const state = await nodeApi(
        activeServer.baseUrl,
        `/v1/guilds/${workingGuildId}/state`,
        activeServer.membershipToken,
      );
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
        body: JSON.stringify({
          serverIds: reordered.map((server) => server.id),
        }),
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
      await api(`/v1/servers/${server.id}/leave`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (server.defaultGuildId && server.baseUrl) {
        try {
          await nodeApi(
            server.baseUrl,
            `/v1/guilds/${server.defaultGuildId}/leave`,
            server.membershipToken,
            { method: "POST", body: "{}" },
          );
        } catch {
          // membership already gone on core; node leave is best-effort
        }
      }
      const refreshed = await api("/v1/servers", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const next = normalizeServerList(refreshed.servers || []);
      setServers(next);
      if (wasActive && next.length) setActiveServerId(next[0].id);
      setStatus("Left server.");
    } catch (error) {
      setStatus(`Leave failed: ${error.message}`);
    }
  }

  async function deleteServer(server) {
    if (!server?.id || !(server.roles || []).includes("owner")) return;
    if (
      !(await confirmDialog(
        `Delete "${server.name}"? This cannot be undone. All members will lose access.`,
        "Delete Server",
      ))
    )
      return;
    setServerContextMenu(null);
    try {
      await api(`/v1/servers/${server.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const refreshed = await api("/v1/servers", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const next = normalizeServerList(refreshed.servers || []);
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
      await nodeApi(
        activeServer.baseUrl,
        `/v1/channels/${activeChannelId}/messages/${messageId}`,
        activeServer.membershipToken,
        { method: "DELETE", body: "{}" },
      );
      setMessages((current) =>
        current.filter((message) => message.id !== messageId),
      );
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
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setDms((current) =>
        current.map((item) =>
          item.id === activeDmId
            ? {
                ...item,
                messages: (item.messages || []).filter(
                  (message) => message.id !== messageId,
                ),
              }
            : item,
        ),
      );
      setStatus("DM message deleted.");
    } catch (error) {
      setStatus(`Delete failed: ${error.message}`);
    }
    setMessageContextMenu(null);
  }

  async function loadServerPins(channelId = activeChannelId) {
    if (!activeServer || !channelId) return;
    try {
      const data = await nodeApi(
        activeServer.baseUrl,
        `/v1/channels/${channelId}/pins`,
        activeServer.membershipToken,
      );
      setPinnedServerMessages((current) => ({
        ...current,
        [channelId]: Array.isArray(data?.pins) ? data.pins : [],
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
          { method: isPinned ? "DELETE" : "PUT", body: "{}" },
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
          : [
              {
                id: message.id,
                author: message.author,
                content: message.content,
              },
              ...existing,
            ].slice(0, 50);
        return { ...current, [activeDmId]: next };
      });
      setStatus("Updated pinned messages.");
    }
  }

  function isMessagePinned(message) {
    if (!message?.id) return false;
    if (message.kind === "server")
      return activePinnedServerMessages.some((item) => item.id === message.id);
    if (message.kind === "dm")
      return activePinnedDmMessages.some((item) => item.id === message.id);
    return false;
  }

  function waitForVoiceEvent({
    type,
    match = null,
    timeoutMs = 10000,
    guildId = null,
    channelId = null,
    sessionToken = null,
    transportId = null,
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
          pendingVoiceEventsRef.current.set(
            key,
            current.filter((entry) => entry !== pending),
          );
        }, timeoutMs),
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
        ? !pending.guildId ||
          data.guildId == null ||
          data.guildId === pending.guildId
        : !pending.guildId || data.guildId === pending.guildId;
      const channelMatches = isTransportConnected
        ? !pending.channelId ||
          data.channelId == null ||
          data.channelId === pending.channelId
        : !pending.channelId || data.channelId === pending.channelId;
      const transportMatches =
        !isTransportConnected ||
        !pending.transportId ||
        data.transportId === pending.transportId;
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

  function rejectPendingVoiceEventsByScope({
    guildId = null,
    channelId = null,
    reason = "VOICE_REQUEST_CANCELLED",
  } = {}) {
    for (const [key, bucket] of pendingVoiceEventsRef.current.entries()) {
      const remaining = [];
      for (const pending of bucket) {
        const guildMatches =
          !guildId || !pending.guildId || pending.guildId === guildId;
        const channelMatches =
          !channelId || !pending.channelId || pending.channelId === channelId;
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
    await voiceSfuRef.current?.stopSelfMonitor?.().catch(() => {});
    micMonitorRestoreStateRef.current = {
      muted: false,
      deafened: false,
      shouldRestore: false,
    };
    setIsMicMonitorActive(false);
    await voiceSfuRef.current?.cleanup();
    setIsScreenSharing(false);
    setRemoteScreenSharesByProducerId({});
    setSelectedScreenShareProducerId("");
    setScreenShareOverlayOpen(false);
  }

  async function waitForVoiceGatewayReady(timeoutMs = 15000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      // Prefer the dedicated private-call gateway when it's live — this keeps
      // private-call voice traffic completely separate from the server node WS.
      const pcWs = privateCallGatewayWsRef.current;
      if (
        pcWs &&
        pcWs.readyState === WebSocket.OPEN &&
        privateCallGatewayReadyRef.current
      )
        return pcWs;

      const ws = nodeGatewayWsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN && nodeGatewayReadyRef.current)
        return ws;

      await new Promise((resolve) => setTimeout(resolve, 120));
    }

    // Build a descriptive error so problems are easy to diagnose
    const pcWs = privateCallGatewayWsRef.current;
    const pcState = pcWs?.readyState;
    const wsState = nodeGatewayWsRef.current?.readyState;
    const stateName = (s) =>
      s === WebSocket.CONNECTING
        ? "CONNECTING"
        : s === WebSocket.OPEN
          ? "OPEN"
          : s === WebSocket.CLOSING
            ? "CLOSING"
            : s === WebSocket.CLOSED
              ? "CLOSED"
              : "MISSING";

    const candidates = voiceGatewayCandidatesRef.current?.length
      ? voiceGatewayCandidatesRef.current.join(",")
      : "none";

    throw new Error(
      `VOICE_GATEWAY_UNAVAILABLE:` +
        `pcReady=${privateCallGatewayReadyRef.current ? "1" : "0"},pcWs=${stateName(pcState)},` +
        `nodeReady=${nodeGatewayReadyRef.current ? "1" : "0"},nodeWs=${stateName(wsState)},` +
        `candidates=${candidates}`,
    );
  }

  async function sendNodeVoiceDispatch(type, data) {
    const ws = await waitForVoiceGatewayReady();
    ws.send(JSON.stringify({ op: "DISPATCH", t: type, d: data }));
  }

  function canUseRealtimeVoiceGateway() {
    const ws = nodeGatewayWsRef.current;
    const usable = !!(
      ws &&
      ws.readyState === WebSocket.OPEN &&
      nodeGatewayReadyRef.current
    );
    if (voiceDebugEnabled) {
      const wsState = ws?.readyState;
      const wsStateName =
        wsState === WebSocket.CONNECTING
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
        activeChannelId,
      });
    }
    return usable;
  }

  function selectScreenShare(producerId) {
    const id = String(producerId || "").trim();
    if (!id) return;
    setSelectedScreenShareProducerId(id);
    setScreenShareOverlayOpen(true);
  }

  async function setServerVoiceMemberState(channelId, memberId, patch = {}) {
    if (
      !activeServer?.baseUrl ||
      !activeServer?.membershipToken ||
      !channelId ||
      !memberId
    )
      return;
    const hasMuted = patch.muted !== undefined;
    const hasDeafened = patch.deafened !== undefined;
    if (!hasMuted && !hasDeafened) return;
    try {
      await nodeApi(
        activeServer.baseUrl,
        `/v1/channels/${channelId}/voice/members/${memberId}/state`,
        activeServer.membershipToken,
        { method: "PATCH", body: JSON.stringify(patch) },
      );
      const actionParts = [];
      if (hasMuted) actionParts.push(patch.muted ? "muted" : "unmuted");
      if (hasDeafened)
        actionParts.push(patch.deafened ? "deafened" : "undeafened");
      setStatus(`Voice member ${actionParts.join(" and ")}.`);
    } catch (error) {
      setStatus(
        `Voice moderation failed: ${error.message || "VOICE_MODERATION_FAILED"}`,
      );
    }
  }

  async function disconnectVoiceMember(channelId, memberId) {
    if (
      !activeServer?.baseUrl ||
      !activeServer?.membershipToken ||
      !channelId ||
      !memberId
    )
      return;
    try {
      await nodeApi(
        activeServer.baseUrl,
        `/v1/channels/${channelId}/voice/members/${memberId}/disconnect`,
        activeServer.membershipToken,
        { method: "POST" },
      );
      setStatus("Voice member disconnected.");
    } catch (error) {
      setStatus(
        `Disconnect failed: ${error.message || "VOICE_DISCONNECT_FAILED"}`,
      );
    }
  }

  async function joinVoiceChannel(channel) {
    if (
      !channel?.id ||
      !activeGuildId ||
      !activeServer?.baseUrl ||
      !activeServer?.membershipToken
    )
      return;
    let sfuError = null;
    try {
      setStatus(`Joining ${channel.name}...`);
      await voiceSfuRef.current?.join({
        guildId: activeGuildId,
        channelId: channel.id,
        audioInputDeviceId,
        micGain,
        noiseSuppression: noiseSuppressionEnabled,
        noiseSuppressionPreset,
        noiseSuppressionConfig,
        isMuted,
        isDeafened,
        audioOutputDeviceId,
      });
      setVoiceSession({ guildId: activeGuildId, channelId: channel.id });
      setStatus(`Joined ${channel.name}.`);
      return;
    } catch (error) {
      sfuError = error;
    }

    const allowRestFallback =
      String(import.meta.env.VITE_ENABLE_REST_VOICE_FALLBACK || "").trim() ===
      "1";
    if (!allowRestFallback) {
      const reason = sfuError?.message || "VOICE_GATEWAY_UNAVAILABLE";
      const message = `Voice connection failed: ${reason}. Realtime voice gateway is required; set VITE_ENABLE_REST_VOICE_FALLBACK=1 only for diagnostics.`;
      setStatus(message);
      await alertDialog(message, "Voice Error");
      return;
    }

    try {
      await nodeApi(
        activeServer.baseUrl,
        `/v1/channels/${channel.id}/voice/join`,
        activeServer.membershipToken,
        { method: "POST" },
      );
      setVoiceSession({ guildId: activeGuildId, channelId: channel.id });
      const fallbackReason = sfuError?.message
        ? ` (gateway fallback: ${sfuError.message})`
        : "";
      setStatus(
        `Joined ${channel.name} (REST voice mode, no SFU playback).${fallbackReason}`,
      );
    } catch (error) {
      const message = `Voice connection failed: ${error.message || "VOICE_JOIN_FAILED"}`;
      setStatus(message);
      await alertDialog(message, "Voice Error");
    }
  }

  // ── Private call functions ──────────────────────────────────────────────────

  /**
   * Initiate a 1:1 voice call with a friend.
   * Shows an outgoing call toast while waiting for them to accept.
   */
  async function initiatePrivateCall(friendId, friendName, friendPfp) {
    if (!accessToken || !friendId) return;
    setOutgoingCall({
      calleeId: friendId,
      calleeName: friendName || friendId,
      calleePfp: friendPfp || null,
      callId: null,
    });
    try {
      const data = await api("/call/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ id: friendId }),
      });
      if (!data?.success) {
        setOutgoingCall(null);
        const reason = data?.message || data?.error || "CALL_CREATE_FAILED";
        setStatus(`Call failed: ${reason}`);
      }
      // On success the WS will receive PRIVATE_CALL_CREATE which updates outgoingCall.callId
    } catch (err) {
      setOutgoingCall(null);
      setStatus(`Call failed: ${err.message || "CALL_CREATE_FAILED"}`);
    }
  }

  /**
   * Connect to the voice channel for an accepted private call.
   * Opens a dedicated WebSocket to the official node (via core gateway proxy)
   * so it doesn't interfere with the current server node connection.
   */
  async function joinPrivateVoiceCall(callId) {
    if (!accessToken || !callId) return;
    setIncomingCall(null);

    try {
      setStatus("Joining voice call…");

      // 1. Ask core for a membership token + channel info
      const joinData = await api("/call/join", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ callId }),
      });

      if (!joinData?.success) {
        const reason = joinData?.error || "CALL_JOIN_FAILED";
        setStatus(`Voice join failed: ${reason}`);
        await alertDialog(`Could not join the call: ${reason}`, "Call Error");
        return;
      }

      const { membershipToken, nodeBaseUrl, guildId, channelId } = joinData;
      if (!membershipToken || !nodeBaseUrl || !guildId || !channelId) {
        setStatus("Voice join failed: incomplete call data from server.");
        return;
      }

      // 2. Open a dedicated gateway WS to the official node.
      //    The core gateway will proxy voice traffic when given a membershipToken.
      const coreGatewayWsUrl = (() => {
        const candidates = getCoreGatewayWsCandidates();
        return candidates[0] || getDefaultCoreGatewayWsUrl();
      })();

      await new Promise((resolve, reject) => {
        const ws = new WebSocket(coreGatewayWsUrl);
        privateCallGatewayWsRef.current = ws;
        privateCallGatewayReadyRef.current = false;

        const timeout = setTimeout(() => {
          ws.close();
          reject(new Error("PRIVATE_CALL_GATEWAY_TIMEOUT"));
        }, 15000);

        ws.onopen = () => {
          ws.send(JSON.stringify({ op: "IDENTIFY", d: { membershipToken } }));
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            resolvePendingVoiceEvent(msg);

            if (msg.op === "HELLO" && msg.d?.heartbeat_interval) {
              if (privateCallGatewayHeartbeatRef.current)
                clearInterval(privateCallGatewayHeartbeatRef.current);
              privateCallGatewayHeartbeatRef.current = setInterval(() => {
                if (
                  privateCallGatewayWsRef.current?.readyState === WebSocket.OPEN
                )
                  privateCallGatewayWsRef.current.send(
                    JSON.stringify({ op: "HEARTBEAT" }),
                  );
              }, msg.d.heartbeat_interval);
              return;
            }

            if (msg.op === "READY") {
              clearTimeout(timeout);
              privateCallGatewayReadyRef.current = true;
              resolve();
              return;
            }

            if (msg.op === "ERROR") {
              clearTimeout(timeout);
              reject(new Error(msg.d?.error || "PRIVATE_CALL_GATEWAY_ERROR"));
            }
          } catch {}
        };

        ws.onerror = () => reject(new Error("PRIVATE_CALL_GATEWAY_WS_ERROR"));
        ws.onclose = () => {
          privateCallGatewayReadyRef.current = false;
          if (privateCallGatewayHeartbeatRef.current) {
            clearInterval(privateCallGatewayHeartbeatRef.current);
            privateCallGatewayHeartbeatRef.current = null;
          }
        };
      });

      // 3. Join voice via the SFU (which now routes through privateCallGatewayWsRef)
      await voiceSfuRef.current?.join({
        guildId,
        channelId,
        audioInputDeviceId,
        micGain,
        noiseSuppression: noiseSuppressionEnabled,
        noiseSuppressionPreset,
        noiseSuppressionConfig,
        isMuted,
        isDeafened,
        audioOutputDeviceId,
      });

      setVoiceSession({ guildId, channelId });
      setActivePrivateCall({
        callId,
        channelId,
        guildId,
        nodeBaseUrl,
        otherName: incomingCall?.callerName || outgoingCall?.calleeName || "",
      });
      setOutgoingCall(null);
      setCallDuration(0);
      setStatus("Voice call connected.");
    } catch (err) {
      privateCallGatewayReadyRef.current = false;
      if (privateCallGatewayWsRef.current) {
        try {
          privateCallGatewayWsRef.current.close();
        } catch {}
        privateCallGatewayWsRef.current = null;
      }
      setOutgoingCall(null);
      const reason = err.message || "VOICE_JOIN_FAILED";
      setStatus(`Voice call failed: ${reason}`);
      await alertDialog(`Could not connect to voice: ${reason}`, "Call Error");
    }
  }

  /**
   * End the active private call: marks it ended on the server, cleans up voice
   * and tears down the private gateway WS.
   */
  async function endPrivateCall() {
    const call = activePrivateCall;
    setActivePrivateCall(null);
    setOutgoingCall(null);
    setIncomingCall(null);
    setCallDuration(0);

    // Tear down voice RTC
    await cleanupVoiceRtc().catch(() => {});
    setVoiceSession({ guildId: "", channelId: "" });

    // Close the dedicated gateway
    if (privateCallGatewayWsRef.current) {
      try {
        privateCallGatewayWsRef.current.close();
      } catch {}
      privateCallGatewayWsRef.current = null;
    }
    privateCallGatewayReadyRef.current = false;
    if (privateCallGatewayHeartbeatRef.current) {
      clearInterval(privateCallGatewayHeartbeatRef.current);
      privateCallGatewayHeartbeatRef.current = null;
    }

    // Notify the server
    if (call?.callId && accessToken) {
      try {
        await api("/call/end", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ callId: call.callId }),
        });
      } catch {}
    }
  }

  // ── Call duration ticker ────────────────────────────────────────────────────
  useEffect(() => {
    if (!activePrivateCall) {
      setCallDuration(0);
      return;
    }
    const id = setInterval(() => setCallDuration((d) => d + 1), 1000);
    return () => clearInterval(id);
  }, [activePrivateCall?.callId]);

  // ── End private call functions ──────────────────────────────────────────────

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
      const reason = error?.message || "";
      if (
        reason === "SCREEN_SOURCE_CANCELLED" ||
        reason === "NotAllowedError"
      ) {
        setStatus("Screen sharing cancelled.");
        return;
      }
      const message = `Screen sharing failed: ${error.message || "SCREEN_SHARE_FAILED"}`;
      setStatus(message);
      await alertDialog(message, "Screen Share Error");
    }
  }

  async function stopMicMonitor({
    restoreState = true,
    announce = false,
  } = {}) {
    await voiceSfuRef.current?.stopSelfMonitor?.().catch(() => {});
    const restore = micMonitorRestoreStateRef.current || {
      muted: false,
      deafened: false,
      shouldRestore: false,
    };
    micMonitorRestoreStateRef.current = {
      muted: false,
      deafened: false,
      shouldRestore: false,
    };
    setIsMicMonitorActive(false);
    if (restoreState && restore.shouldRestore) {
      setIsMuted(!!restore.muted);
      setIsDeafened(!!restore.deafened);
    }
    if (announce) {
      setStatus("Mic test stopped.");
    }
  }

  async function toggleMicMonitor() {
    if (isMicMonitorActive) {
      await stopMicMonitor({ restoreState: true, announce: true });
      return;
    }
    if (!isInVoiceChannel) {
      setStatus("Join a voice channel to test your microphone.");
      return;
    }

    const restoreState = {
      muted: !!isMuted,
      deafened: !!isDeafened,
      shouldRestore: true,
    };
    micMonitorRestoreStateRef.current = restoreState;
    setIsMuted(true);
    setIsDeafened(true);

    try {
      await voiceSfuRef.current?.startSelfMonitor?.();
      setIsMicMonitorActive(true);
      setStatus(
        "Mic test started. You are muted and deafened while hearing your processed mic.",
      );
    } catch (error) {
      micMonitorRestoreStateRef.current = {
        muted: false,
        deafened: false,
        shouldRestore: false,
      };
      setIsMuted(restoreState.muted);
      setIsDeafened(restoreState.deafened);

      const reason = String(error?.message || "").trim();
      if (reason === "MIC_TEST_NOT_READY") {
        setStatus("Mic test failed: microphone stream is not ready.");
        return;
      }
      if (reason === "NotAllowedError") {
        setStatus(
          "Mic test failed: playback was blocked by browser permissions.",
        );
        return;
      }
      setStatus(`Mic test failed: ${reason || "MIC_TEST_FAILED"}`);
    }
  }

  async function leaveVoiceChannel() {
    if (isDisconnectingVoice) return;

    let targetGuildId = voiceConnectedGuildId;
    let targetChannelId = voiceConnectedChannelId;

    if (!targetGuildId || !targetChannelId) {
      for (const [guildId, byUser] of Object.entries(
        voiceStatesByGuild || {},
      )) {
        const selfState = byUser?.[me?.id];
        if (selfState?.channelId) {
          targetGuildId = guildId;
          targetChannelId = selfState.channelId;
          break;
        }
      }
    }

    if (!targetChannelId) {
      const selfState = mergedVoiceStates.find(
        (state) => state.userId === me?.id,
      );
      if (selfState?.channelId) {
        targetGuildId = targetGuildId || activeGuildId || "";
        targetChannelId = selfState.channelId;
      }
    }

    const connectedServer =
      servers.find((server) => server.defaultGuildId === targetGuildId) ||
      activeServer ||
      null;

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
        if (!connectedServer?.baseUrl || !connectedServer?.membershipToken)
          return;
        try {
          await nodeApi(
            connectedServer.baseUrl,
            "/v1/me/voice-disconnect",
            connectedServer.membershipToken,
            { method: "POST" },
          );
        } catch (error) {
          const message = `Disconnected locally. Server voice leave failed: ${error.message || "VOICE_LEAVE_FAILED"}`;
          setStatus(message);
          console.warn(message);
        }
        return;
      }

      if (canUseRealtimeVoiceGateway()) {
        try {
          await sendNodeVoiceDispatch("VOICE_LEAVE", {
            guildId: targetGuildId,
            channelId: targetChannelId,
          });
          return;
        } catch {}
      }

      if (!connectedServer?.baseUrl || !connectedServer?.membershipToken)
        return;

      try {
        if (targetChannelId) {
          await nodeApi(
            connectedServer.baseUrl,
            `/v1/channels/${targetChannelId}/voice/leave`,
            connectedServer.membershipToken,
            { method: "POST" },
          );
          return;
        }
        await nodeApi(
          connectedServer.baseUrl,
          "/v1/me/voice-disconnect",
          connectedServer.membershipToken,
          { method: "POST" },
        );
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
          bannerUrl: normalizeImageUrlInput(newOfficialServerBannerUrl) || null,
        }),
      });
      setNewOfficialServerName("");
      setNewOfficialServerLogoUrl("");
      setNewOfficialServerBannerUrl("");
      setStatus("Your server was created.");
      const refreshed = await api("/v1/servers", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const next = normalizeServerList(refreshed.servers || []);
      setServers(next);
      if (data.serverId && next.length) {
        setActiveServerId(data.serverId);
        setNavMode("servers");
      }
      setAddServerModalOpen(false);
    } catch (err) {
      const msg = err?.message || "";
      if (msg.includes("SERVER_LIMIT")) setStatus("You already have a server.");
      else if (msg.includes("LOGO_REQUIRED"))
        setStatus("Server logo is required.");
      else if (msg.includes("INVALID_LOGO_URL"))
        setStatus(
          "Invalid server logo URL. Use uploaded paths (/v1/profile-images/... or users/...) or valid http(s) URLs.",
        );
      else if (msg.includes("INVALID_BANNER_URL"))
        setStatus(
          "Invalid server banner URL. Use uploaded paths (/v1/profile-images/... or users/...) or valid http(s) URLs.",
        );
      else if (msg.includes("OFFICIAL_SERVER_NOT_CONFIGURED"))
        setStatus(
          "Server creation isn’t set up yet. The site admin needs to set OFFICIAL_NODE_SERVER_ID on the API server (same value as NODE_SERVER_ID on the node).",
        );
      else if (msg.includes("OFFICIAL_SERVER_UNAVAILABLE"))
        setStatus("Official server is unavailable. Please try again later.");
      else setStatus(`Failed: ${msg}`);
    }
  }

  function openMessageContextMenu(event, message) {
    event.preventDefault();
    const pos = getContextMenuPoint(event.clientX, event.clientY, {
      width: 260,
      height: 220,
    });
    setChannelContextMenu(null);
    setCategoryContextMenu(null);
    setMemberContextMenu(null);
    setMessageContextMenu({
      x: pos.x,
      y: pos.y,
      message: { ...message, pinned: isMessagePinned(message) },
    });
  }

  function openMemberContextMenu(event, member) {
    const memberId = member?.id || member?.userId;
    if (!memberId) return;
    event.preventDefault();
    event.stopPropagation();
    const pos = getContextMenuPoint(event.clientX, event.clientY, {
      width: 280,
      height: 460,
    });
    setServerContextMenu(null);
    setChannelContextMenu(null);
    setCategoryContextMenu(null);
    setMessageContextMenu(null);
    setMemberContextMenu({
      x: pos.x,
      y: pos.y,
      member: { ...member, id: memberId },
    });
  }

  const MAX_IMAGE_BYTES = 25 * 1024 * 1024; // 25MB for raw image upload
  const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25MB for profile music upload

  function isAcceptedImage(file) {
    if (!file?.type) return false;
    return file.type.startsWith("image/");
  }

  function isAcceptedAudio(file) {
    if (!file?.type) return false;
    return file.type.startsWith("audio/");
  }

  async function uploadProfileImage(file, endpoint) {
    if (!accessToken) throw new Error("AUTH_REQUIRED");
    const formData = new FormData();
    formData.append("image", file);
    const res = await fetch(`${CORE_API}${endpoint}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: formData,
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
      setStatus(
        `Image too large. Max ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB.`,
      );
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

  async function onAudioFieldUpload(event, label, onUploaded) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!isAcceptedAudio(file)) {
      setStatus("Please choose an audio file (MP3, WAV, OGG, M4A).");
      return;
    }
    if (file.size > MAX_AUDIO_BYTES) {
      setStatus(
        `Audio too large. Max ${Math.round(MAX_AUDIO_BYTES / 1024 / 1024)}MB.`,
      );
      return;
    }
    try {
      setStatus(`Uploading ${label}...`);
      const data = await uploadProfileImage(file, "/v1/media/upload");
      if (!data?.mediaUrl) throw new Error("UPLOAD_FAILED");
      onUploaded(data.mediaUrl);
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
      setStatus(
        `Image too large. Max ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB.`,
      );
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
      setStatus(
        `Image too large. Max ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB.`,
      );
      return;
    }
    try {
      setStatus("Uploading banner…");
      const data = await uploadProfileImage(file, "/v1/me/profile/banner");
      setProfileForm((current) => ({
        ...current,
        bannerUrl: data.bannerUrl || "",
      }));
      setProfile(profile ? { ...profile, bannerUrl: data.bannerUrl } : null);
      setStatus("Banner updated.");
    } catch (e) {
      setStatus(e.message || "Upload failed.");
    }
  }

  async function openMemberProfile(member, anchorPoint = null) {
    if (
      anchorPoint &&
      Number.isFinite(Number(anchorPoint.x)) &&
      Number.isFinite(Number(anchorPoint.y))
    ) {
      setProfileCardPosition(
        clampProfileCardPosition(
          Number(anchorPoint.x) + 12,
          Number(anchorPoint.y) + 12,
          getProfileCardClampOptions(),
        ),
      );
    }
    try {
      const profileData = await api(`/v1/users/${member.id}/profile`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setUserCache((prev) => ({
        ...prev,
        [member.id]: {
          username:
            profileData.username ??
            prev[member.id]?.username ??
            member.username,
          displayName:
            profileData.displayName ?? profileData.username ?? member.username,
          pfpUrl: profileData.pfpUrl ?? null,
        },
      }));
      setMemberProfileCard({
        ...profileData,
        fullProfile: normalizeFullProfile(profileData, profileData.fullProfile),
        username: profileData.username || member.username,
        status: getPresence(member.id) || "offline",
        roleIds: member.roleIds || [],
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
        fullProfile: createBasicFullProfile({
          username: member.username || member.id,
        }),
        roleIds: member.roleIds || [],
      });
    }
  }

  async function openFullProfileViewer(userLikeProfile) {
    if (!userLikeProfile) return;
    const userId = String(userLikeProfile.id || "").trim();
    if (!userId || !accessToken) {
      setFullProfileViewer(userLikeProfile);
      return;
    }
    try {
      const latest = await api(`/v1/users/${userId}/profile`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setFullProfileViewer({
        ...userLikeProfile,
        ...latest,
        username: latest.username || userLikeProfile.username || userId,
        displayName:
          latest.displayName ??
          userLikeProfile.displayName ??
          latest.username ??
          userId,
        fullProfile: normalizeFullProfile(latest, latest.fullProfile),
      });
    } catch {
      setFullProfileViewer(userLikeProfile);
    }
  }

  async function toggleFullProfileViewerMusicPlayback() {
    if (!fullProfileViewerHasPlayableMusic) return;
    const audio = fullProfileViewerMusicAudioRef.current;
    if (!audio) return;
    try {
      audio.volume = Math.max(
        0,
        Math.min(
          1,
          Number(fullProfileViewer?.fullProfile?.music?.volume ?? 60) / 100,
        ),
      );
      audio.loop = fullProfileViewer?.fullProfile?.music?.loop !== false;
      if (audio.paused) {
        await audio.play();
        setFullProfileViewerMusicPlaying(true);
      } else {
        audio.pause();
        setFullProfileViewerMusicPlaying(false);
      }
    } catch (error) {
      setStatus(
        `Profile music error: ${error?.message || "AUDIO_PLAYBACK_FAILED"}`,
      );
      setFullProfileViewerMusicPlaying(false);
    }
  }

  function getBadgePresentation(badge) {
    if (
      badge &&
      typeof badge === "object" &&
      (badge.bgColor || badge.icon || badge.name)
    ) {
      return {
        icon: badge.icon || "🏷️",
        name: badge.name || String(badge.id || "Badge"),
        bgColor: badge.bgColor || "#3a4f72",
        fgColor: badge.fgColor || "#ffffff",
      };
    }
    const id = String(badge?.id || badge || "").toLowerCase();
    if (id === "platform_owner")
      return {
        icon: "👑",
        name: "Platform Owner",
        bgColor: "#2d6cdf",
        fgColor: "#ffffff",
      };
    if (id === "platform_admin")
      return {
        icon: "🔨",
        name: "Platform Admin",
        bgColor: "#2d6cdf",
        fgColor: "#ffffff",
      };
    if (id === "official")
      return {
        icon: "✓",
        name: "OFFICIAL",
        bgColor: "#1292ff",
        fgColor: "#ffffff",
      };
    if (id === "boost")
      return {
        icon: "➕",
        name: "Boost",
        bgColor: "#4f7ecf",
        fgColor: "#ffffff",
      };
    return {
      icon: badge?.icon || "🏷️",
      name: badge?.name || id || "Badge",
      bgColor: badge?.bgColor || "#3a4f72",
      fgColor: badge?.fgColor || "#ffffff",
    };
  }

  function isOfficialBadge(badge) {
    const id = String(badge?.id || badge || "")
      .trim()
      .toLowerCase();
    return id === "official";
  }

  function hasOfficialBadge(badges = []) {
    return Array.isArray(badges) && badges.some((badge) => isOfficialBadge(badge));
  }

  function renderOfficialBadge(badges = [], extraClassName = "") {
    if (!hasOfficialBadge(badges)) return null;
    const className = ["official-badge", extraClassName].filter(Boolean).join(" ");
    return (
      <span className={className} title="Official OpenCom account">
        <span className="official-badge__tick">✓</span>
        <span className="official-badge__label">OFFICIAL</span>
      </span>
    );
  }

  function getFullProfileFontFamily(preset) {
    const key = String(preset || "")
      .trim()
      .toLowerCase();
    if (key === "serif") return '"Merriweather", Georgia, serif';
    if (key === "mono")
      return '"JetBrains Mono", "SFMono-Regular", Consolas, monospace';
    if (key === "display")
      return '"Space Grotesk", "Avenir Next", "Segoe UI", sans-serif';
    return '"Plus Jakarta Sans", "Segoe UI", system-ui, sans-serif';
  }

  function getFullProfileElementFrameStyle(element) {
    const radius = Math.max(0, Math.min(40, Number(element?.radius ?? 8)));
    const opacity = Math.max(
      20,
      Math.min(100, Number(element?.opacity ?? 100)),
    );
    const alignRaw = String(element?.align || "")
      .trim()
      .toLowerCase();
    const align =
      alignRaw === "center" || alignRaw === "right" ? alignRaw : "left";
    return {
      left: `${element.x}%`,
      top: `${element.y}%`,
      width: `${element.w}%`,
      height: `${element.h}%`,
      borderRadius: `${radius}px`,
      opacity: opacity / 100,
      textAlign: align,
    };
  }

  function renderFullProfileElement(element, viewerProfile, options = {}) {
    if (!element || !viewerProfile) return null;
    const type = String(element.type || "").toLowerCase();
    const alignRaw = String(element.align || "")
      .trim()
      .toLowerCase();
    const textAlign =
      alignRaw === "center" || alignRaw === "right" ? alignRaw : "left";
    const textColor =
      typeof element.color === "string" && element.color.trim()
        ? element.color.trim()
        : undefined;
    const textSize = Math.max(
      10,
      Math.min(
        72,
        Number(
          element.fontSize || (type === "name" ? 22 : type === "bio" ? 14 : 16),
        ),
      ),
    );
    const textStyle = {
      textAlign,
      color: textColor,
      fontSize: `${textSize}px`,
      lineHeight: 1.35,
    };
    if (type === "banner") {
      const banner = profileImageUrl(viewerProfile.bannerUrl || "");
      return banner ? (
        <img src={banner} alt="Banner" className="full-profile-banner-image" />
      ) : (
        <div className="full-profile-banner-fallback" />
      );
    }
    if (type === "avatar") {
      const avatar = profileImageUrl(viewerProfile.pfpUrl || "");
      return (
        <div className="full-profile-avatar-element">
          {avatar ? (
            <img
              src={avatar}
              alt="Avatar"
              className="full-profile-avatar-image"
            />
          ) : (
            getInitials(
              viewerProfile.displayName || viewerProfile.username || "U",
            )
          )}
        </div>
      );
    }
    if (type === "name") {
      return (
        <strong className="full-profile-rich-text" style={textStyle}>
          {viewerProfile.displayName || viewerProfile.username || "User"}
        </strong>
      );
    }
    if (type === "bio") {
      return (
        <span className="full-profile-rich-text" style={textStyle}>
          {viewerProfile.bio || "No bio set."}
        </span>
      );
    }
    if (type === "links") {
      const links = Array.isArray(viewerProfile.fullProfile?.links)
        ? viewerProfile.fullProfile.links
        : [];
      return (
        <div className="full-profile-links-list" style={textStyle}>
          {links.length === 0 && (
            <span className="hint">No links configured.</span>
          )}
          {links.map((link) => (
            <a
              key={link.id || link.url}
              href={link.url}
              target="_blank"
              rel="noreferrer"
            >
              {link.label}
            </a>
          ))}
        </div>
      );
    }
    if (type === "music") {
      const hasMusicUrl = !!String(
        viewerProfile.fullProfile?.music?.url || "",
      ).trim();
      if (!hasMusicUrl)
        return (
          <span className="full-profile-music-pill muted">♪ No track</span>
        );
      const isPlaying = !!options.musicPlaying;
      return (
        <span
          className={`full-profile-music-pill ${isPlaying ? "playing" : ""}`}
        >
          {isPlaying ? "⏸ Music" : "▶ Music"}
        </span>
      );
    }
    return (
      <span className="full-profile-rich-text" style={textStyle}>
        {element.text || "Custom text"}
      </span>
    );
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
      const inlineRegex =
        /(\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]+)\)|https?:\/\/[^\s<>"'`]+|`([^`\n]+)`|\*\*([^*\n]+)\*\*|__([^_\n]+)__|~~([^~\n]+)~~|\*([^*\n]+)\*|_([^_\n]+)_|\n|:([a-zA-Z0-9_+-]{2,32}):)/g;
      let cursorLocal = 0;
      let match = inlineRegex.exec(text);
      let localIndex = 0;

      while (match) {
        const start = match.index ?? 0;
        if (start > cursorLocal) {
          out.push(
            <span key={`${keyPrefix}-plain-${localIndex}`}>
              {text.slice(cursorLocal, start)}
            </span>,
          );
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
            <a
              key={`${keyPrefix}-md-link-${localIndex}`}
              href={markdownUrl}
              target="_blank"
              rel="noreferrer"
            >
              {renderInlineMarkdown(
                markdownLabel,
                `${keyPrefix}-md-link-label-${localIndex}`,
              )}
            </a>,
          );
        } else if (/^https?:\/\//i.test(full)) {
          out.push(
            <a
              key={`${keyPrefix}-link-${localIndex}`}
              href={full}
              target="_blank"
              rel="noreferrer"
            >
              {full}
            </a>,
          );
        } else if (inlineCode) {
          out.push(
            <code
              key={`${keyPrefix}-code-${localIndex}`}
              className="message-inline-code"
            >
              {inlineCode}
            </code>,
          );
        } else if (boldA || boldB) {
          const inner = boldA || boldB;
          out.push(
            <strong key={`${keyPrefix}-bold-${localIndex}`}>
              {renderInlineMarkdown(
                inner,
                `${keyPrefix}-bold-inner-${localIndex}`,
              )}
            </strong>,
          );
        } else if (strike) {
          out.push(
            <s key={`${keyPrefix}-strike-${localIndex}`}>
              {renderInlineMarkdown(
                strike,
                `${keyPrefix}-strike-inner-${localIndex}`,
              )}
            </s>,
          );
        } else if (italicA || italicB) {
          const inner = italicA || italicB;
          out.push(
            <em key={`${keyPrefix}-italic-${localIndex}`}>
              {renderInlineMarkdown(
                inner,
                `${keyPrefix}-italic-inner-${localIndex}`,
              )}
            </em>,
          );
        } else if (full === "\n") {
          out.push(<br key={`${keyPrefix}-br-${localIndex}`} />);
        } else if (emoteToken) {
          const token = String(emoteToken || "").toLowerCase();
          const emote = BUILTIN_EMOTES[token];
          if (emote) {
            out.push(
              <span
                key={`${keyPrefix}-emote-${localIndex}`}
                className="message-emote"
                title={`:${token}:`}
              >
                {emote}
              </span>,
            );
          } else if (serverEmoteByName.has(token)) {
            const custom = serverEmoteByName.get(token);
            out.push(
              <img
                key={`${keyPrefix}-custom-emote-${localIndex}`}
                className="message-custom-emote"
                src={custom.imageUrl || custom.image_url}
                alt={`:${token}:`}
                title={`:${token}:`}
              />,
            );
          } else {
            out.push(
              <span key={`${keyPrefix}-raw-emote-${localIndex}`}>{full}</span>,
            );
          }
        } else {
          out.push(<span key={`${keyPrefix}-raw-${localIndex}`}>{full}</span>);
        }

        localIndex += 1;
        cursorLocal = start + full.length;
        match = inlineRegex.exec(text);
      }

      if (cursorLocal < text.length) {
        out.push(
          <span key={`${keyPrefix}-tail-${localIndex}`}>
            {text.slice(cursorLocal)}
          </span>,
        );
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
        nodes.push(
          ...renderInlineMarkdown(
            content.slice(cursor, index),
            `text-${cursor}`,
          ),
        );
      }

      if (raw.toLowerCase() === "everyone") {
        nodes.push(
          <span key={`everyone-${index}`} className="message-mention">
            {token}
          </span>,
        );
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
                openMemberProfile(member, {
                  x: event.clientX,
                  y: event.clientY,
                });
              }}
            >
              @{member.username || member.id}
            </button>,
          );
        } else {
          nodes.push(
            <span key={`unknown-${index}`} className="message-mention">
              {token}
            </span>,
          );
        }
      }

      cursor = index + token.length;
    }

    if (cursor < content.length) {
      nodes.push(
        ...renderInlineMarkdown(content.slice(cursor), `tail-${cursor}`),
      );
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
      return /\.(png|jpe?g|gif|webp|bmp|svg|heic|avif)(?:[?#]|$)/i.test(
        parsed.pathname || "",
      );
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

    const existing = new Set(
      (message?.linkEmbeds || []).map((embed) => normalizedLinkKey(embed?.url)),
    );
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
        invite: preview.invite || null,
      });
    }
    return out;
  }

  function onMediaCardKeyDown(event, onOpen) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onOpen();
  }

  function openExpandedMediaFromEmbed(embed) {
    const draft = buildFavouriteMediaDraftFromEmbed(embed);
    const imageUrl = String(draft?.sourceUrl || "").trim();
    if (!imageUrl) return;
    setExpandedMedia({
      src: imageUrl,
      title: embed?.title || draft?.fileName || "Image",
      subtitle: embed?.pageUrl || embed?.url || "",
      openHref: embed?.url || draft?.pageUrl || imageUrl,
    });
  }

  function openExpandedMediaFromAttachment(attachment) {
    const imagePreviewUrl = attachmentPreviewUrlById[attachment?.id] || "";
    const directUrl = String(attachment?.url || "");
    const directImageUrl = isLikelyImageUrl(directUrl) ? directUrl : "";
    const imageUrl = imagePreviewUrl || directImageUrl;
    if (!imageUrl) return;
    setExpandedMedia({
      src: imageUrl,
      title: attachment?.fileName || "Image",
      subtitle: attachment?.contentType || "",
      openHref: "",
    });
  }

  function renderFavouriteMediaButton(draft) {
    const key = buildFavouriteMediaKey(draft?.sourceKind, draft?.sourceUrl);
    if (!key) return null;
    const favourite = favouriteMediaByKey.get(key) || null;
    const busyKey = favourite?.id || key;
    const busy = !!favouriteMediaBusyById[busyKey];

    return (
      <button
        type="button"
        className={`message-media-favourite-btn ${favourite ? "active" : ""}`}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          toggleFavouriteMedia(draft);
        }}
        disabled={busy}
        title={favourite ? "Remove from favourites" : "Save to favourites"}
      >
        ★
      </button>
    );
  }

  function formatInviteEstablishedDate(value) {
    if (!value) return "";
    try {
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return "";
      return parsed.toLocaleDateString(undefined, {
        month: "short",
        year: "numeric",
      });
    } catch {
      return "";
    }
  }

  function renderMessageLinkEmbedCard(embed, key) {
    const preview = getLinkPreviewForUrl(embed?.url);
    const inviteEmbed =
      embed?.kind === "opencom_invite" && embed?.invite?.code
        ? embed
        : preview?.kind === "opencom_invite" && preview?.invite?.code
          ? {
              url: preview.url || embed?.url || "",
              invite: preview.invite,
            }
          : null;

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
          <div
            className="message-invite-hero"
            style={
              iconSource
                ? {
                    backgroundImage: `linear-gradient(180deg, rgba(12, 16, 27, 0.3), rgba(12, 16, 27, 0.95)), url(${iconSource})`,
                  }
                : undefined
            }
          />
          <div className="message-invite-body">
            <div className="message-invite-header">
              <div className="message-invite-icon">
                {iconSource ? (
                  <img src={iconSource} alt={serverName} />
                ) : (
                  <span>{getInitials(serverName)}</span>
                )}
              </div>
              <div className="message-invite-title-wrap">
                <strong>{serverName}</strong>
                <p className="message-invite-stats">
                  <span className="dot online" /> {onlineCount} Online
                  <span className="dot members" /> {memberCount} Members
                </p>
                {established && (
                  <p className="message-invite-established">
                    Est. {established}
                  </p>
                )}
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
            <a
              className="message-invite-link"
              href={joinUrl}
              target="_blank"
              rel="noreferrer"
            >
              {joinUrl}
            </a>
          </div>
        </div>
      );
    }

    const imageUrl = String(embed?.imageUrl || preview?.imageUrl || "").trim();
    const fallbackImageUrl =
      !imageUrl && isLikelyImageUrl(embed?.url) ? String(embed.url) : "";
    const resolvedImageUrl = imageUrl || fallbackImageUrl;
    if (resolvedImageUrl) {
      const favouriteDraft = buildFavouriteMediaDraftFromEmbed({
        ...embed,
        imageUrl: resolvedImageUrl,
      });
      return (
        <div
          key={key}
          className="message-media-card-wrap"
          onContextMenu={(event) => event.stopPropagation()}
        >
          <div
            className="message-image-link-embed message-media-card-surface"
            role="button"
            tabIndex={0}
            onClick={() => openExpandedMediaFromEmbed(embed)}
            onKeyDown={(event) =>
              onMediaCardKeyDown(event, () => openExpandedMediaFromEmbed(embed))
            }
          >
            <img
              src={resolvedImageUrl}
              alt={embed.title || "Image"}
              loading="lazy"
            />
            <div className="message-image-link-meta">
              <strong>{embed.title || "Image"}</strong>
              <p>{embed.url}</p>
            </div>
          </div>
          {renderFavouriteMediaButton(favouriteDraft)}
        </div>
      );
    }

    return (
      <a
        key={key}
        className="message-embed-card"
        href={embed.url}
        target="_blank"
        rel="noreferrer"
      >
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
    const isImage =
      isImageMimeType(attachment?.contentType || "") || Boolean(imageUrl);

    if (isImage && imageUrl) {
      const favouriteDraft = buildFavouriteMediaDraftFromAttachment(attachment);
      return (
        <div
          key={key}
          className="message-media-card-wrap"
          title="Right-click image to save"
          onContextMenu={(event) => {
            // Keep native browser image context menu (Save image as...) instead of message menu.
            event.stopPropagation();
          }}
        >
          <div
            className="message-image-attachment message-media-card-surface"
            role="button"
            tabIndex={0}
            onClick={() => openExpandedMediaFromAttachment(attachment)}
            onKeyDown={(event) =>
              onMediaCardKeyDown(event, () =>
                openExpandedMediaFromAttachment(attachment),
              )
            }
          >
            <img
              src={imageUrl}
              alt={attachment?.fileName || "Image attachment"}
              loading="lazy"
            />
            <div className="message-image-attachment-meta">
              <strong>{attachment?.fileName || "Image"}</strong>
              <p>{attachment?.contentType || "image"}</p>
            </div>
          </div>
          {renderFavouriteMediaButton(favouriteDraft)}
        </div>
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
      return d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
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

  function openAppEntryRoute() {
    navigateAppRoute(accessToken ? APP_ROUTE_CLIENT : APP_ROUTE_LOGIN);
  }

  function openBlogsRoute() {
    navigateAppRoute(APP_ROUTE_BLOGS);
  }

  function openBlogPostRoute(slug) {
    if (!slug) return;
    navigateAppRoute(`${APP_ROUTE_BLOGS}/${slug}`);
  }

  function openPreferredDesktopDownload() {
    const href = preferredDownloadTarget?.href || DOWNLOAD_TARGETS[0]?.href;
    if (!href) return;
    window.open(href, "_blank", "noopener,noreferrer");
  }

  if (routePath === APP_ROUTE_PANEL) {
    return <AdminApp />;
  }

  if (routePath === APP_ROUTE_BLOGS) {
    return (
      <BlogsPage
        coreApi={CORE_API}
        onOpenHome={() => navigateAppRoute(APP_ROUTE_HOME)}
        onOpenTerms={() => navigateAppRoute(APP_ROUTE_TERMS)}
        onOpenApp={openAppEntryRoute}
        onOpenPost={openBlogPostRoute}
      />
    );
  }

  if (isBlogPostPath(routePath)) {
    return (
      <BlogPostPage
        coreApi={CORE_API}
        slug={getBlogSlugFromPath(routePath)}
        onOpenHome={() => navigateAppRoute(APP_ROUTE_HOME)}
        onOpenBlogs={openBlogsRoute}
        onOpenTerms={() => navigateAppRoute(APP_ROUTE_TERMS)}
        onOpenApp={openAppEntryRoute}
      />
    );
  }

  if (routePath === APP_ROUTE_TERMS) {
    return (
      <TermsPage
        onBack={() =>
          navigateAppRoute(accessToken ? APP_ROUTE_CLIENT : APP_ROUTE_HOME)
        }
      />
    );
  }

  if (routePath === APP_ROUTE_HOME) {
    return (
      <LandingPage
        downloadMenuRef={downloadMenuRef}
        downloadsMenuOpen={downloadsMenuOpen}
        setDownloadsMenuOpen={setDownloadsMenuOpen}
        downloadTargets={DOWNLOAD_TARGETS}
        preferredDownloadTarget={preferredDownloadTarget}
        onOpenApp={openAppEntryRoute}
        onOpenClient={openAppEntryRoute}
        onOpenTerms={() => navigateAppRoute(APP_ROUTE_TERMS)}
        onOpenBlogs={openBlogsRoute}
      />
    );
  }

  if (!accessToken) {
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
        authResetPasswordConfirm={authResetPasswordConfirm}
        setAuthResetPasswordConfirm={setAuthResetPasswordConfirm}
        pendingVerificationEmail={pendingVerificationEmail}
        resetPasswordToken={resetPasswordToken}
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
      <ServerRailNav
        dmNotification={dmNotification}
        dms={dms}
        setNavMode={setNavMode}
        setActiveDmId={setActiveDmId}
        setDmNotification={setDmNotification}
        profileImageUrl={profileImageUrl}
        getInitials={getInitials}
        navMode={navMode}
        servers={servers}
        activeServerId={activeServerId}
        setActiveServerId={setActiveServerId}
        setActiveGuildId={setActiveGuildId}
        setGuildState={setGuildState}
        setMessages={setMessages}
        openServerContextMenu={openServerContextMenu}
        serverPingCounts={serverPingCounts}
        setAddServerModalOpen={setAddServerModalOpen}
      />

      <aside
        className={`channel-sidebar ${isInVoiceChannel ? "voice-connected" : ""}`}
      >
        <header
          className="sidebar-header"
          style={
            activeServer?.bannerUrl
              ? {
                  backgroundImage: `linear-gradient(rgba(10,16,30,0.72), rgba(10,16,30,0.86)), url(${profileImageUrl(activeServer.bannerUrl)})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : undefined
          }
        >
          <h2>
            {navMode === "servers"
              ? activeServer?.name || "No server"
              : navMode.toUpperCase()}
          </h2>
          <small>
            {navMode === "servers"
              ? activeGuild?.name || "Choose a channel"
              : "Unified communication hub"}
          </small>
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
                        draggable={
                          canManageServer && category.id !== "uncategorized"
                        }
                        onDragStart={() =>
                          canManageServer &&
                          category.id !== "uncategorized" &&
                          setCategoryDragId(category.id)
                        }
                        onDragOver={(e) => {
                          e.preventDefault();
                          if (category.id !== "uncategorized")
                            e.currentTarget.classList.add(
                              "channel-drop-target",
                            );
                        }}
                        onDragLeave={(e) =>
                          e.currentTarget.classList.remove(
                            "channel-drop-target",
                          )
                        }
                        onDrop={(e) => {
                          e.preventDefault();
                          e.currentTarget.classList.remove(
                            "channel-drop-target",
                          );
                          if (
                            canManageServer &&
                            categoryDragId &&
                            category.id !== "uncategorized" &&
                            categoryDragId !== category.id
                          ) {
                            handleCategoryDrop(categoryDragId, category.id);
                          }
                        }}
                        onDragEnd={() => setCategoryDragId(null)}
                        onClick={() => toggleCategory(category.id)}
                        onContextMenu={(event) =>
                          category.id !== "uncategorized" &&
                          canManageServer &&
                          openCategoryContextMenu(event, category)
                        }
                      >
                        <span className="chevron">
                          {isCollapsed ? "▸" : "▾"}
                        </span>
                        {category.name}
                      </button>
                      {canManageServer && category.id !== "uncategorized" && (
                        <div className="category-actions">
                          <button
                            type="button"
                            className="channel-action-btn"
                            title="Create channel in category"
                            onClick={(event) => {
                              event.stopPropagation();
                              promptCreateChannelFlow({
                                fixedType: "text",
                                fixedParentId: category.id,
                              });
                            }}
                          >
                            ＋
                          </button>
                          <button
                            type="button"
                            className="channel-action-btn"
                            title="Category settings"
                            onClick={(event) => {
                              event.stopPropagation();
                              openChannelSettings(category);
                            }}
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
                                onDragStart={() =>
                                  canManageServer &&
                                  setChannelDragId(channel.id)
                                }
                                onDragOver={(e) => {
                                  e.preventDefault();
                                  e.currentTarget.classList.add(
                                    "channel-drop-target",
                                  );
                                }}
                                onDragLeave={(e) =>
                                  e.currentTarget.classList.remove(
                                    "channel-drop-target",
                                  )
                                }
                                onDrop={(e) => {
                                  e.preventDefault();
                                  e.currentTarget.classList.remove(
                                    "channel-drop-target",
                                  );
                                  if (
                                    canManageServer &&
                                    channelDragId &&
                                    channelDragId !== channel.id
                                  )
                                    handleChannelDrop(
                                      channelDragId,
                                      channel.id,
                                      items,
                                    );
                                }}
                                onDragEnd={() => setChannelDragId(null)}
                                onContextMenu={(event) =>
                                  canManageServer &&
                                  openChannelContextMenu(event, channel)
                                }
                                onClick={() => {
                                  if (channel.type === "text") {
                                    setActiveChannelId(channel.id);
                                    return;
                                  }
                                  if (channel.type === "voice")
                                    joinVoiceChannel(channel);
                                }}
                              >
                                <span className="channel-hash">
                                  {channel.type === "voice" ? "🔊" : "#"}
                                </span>
                                <span
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "flex-start",
                                    minWidth: 0,
                                  }}
                                >
                                  <span>{channel.name}</span>
                                  {channel.type === "voice" &&
                                    (voiceMembersByChannel.get(channel.id)
                                      ?.length || 0) > 0 && (
                                      <span
                                        className="hint"
                                        style={{ fontSize: "11px" }}
                                      >
                                        {
                                          voiceMembersByChannel.get(channel.id)
                                            .length
                                        }{" "}
                                        connected
                                      </span>
                                    )}
                                </span>
                              </button>
                              {canManageServer && (
                                <button
                                  type="button"
                                  className="channel-action-btn channel-row-cog"
                                  title="Channel settings"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    openChannelSettings(channel);
                                  }}
                                >
                                  ⚙
                                </button>
                              )}
                            </div>
                            {channel.type === "voice" &&
                              (voiceMembersByChannel.get(channel.id)?.length ||
                                0) > 0 && (
                                <div className="voice-channel-members">
                                  {voiceMembersByChannel
                                    .get(channel.id)
                                    .map((member) => {
                                      const speaking =
                                        !!voiceSpeakingByGuild[activeGuildId]?.[
                                          member.userId
                                        ];
                                      return (
                                        <div
                                          key={`${channel.id}-${member.userId}`}
                                          className="voice-channel-member-row"
                                          onContextMenu={(event) =>
                                            openMemberContextMenu(event, member)
                                          }
                                        >
                                          <div className="voice-channel-member-main">
                                            <div
                                              className={`avatar member-avatar vc-avatar ${speaking ? "speaking" : ""}`}
                                            >
                                              {member.pfp_url ? (
                                                <img
                                                  src={profileImageUrl(
                                                    member.pfp_url,
                                                  )}
                                                  alt={member.username}
                                                  className="avatar-image"
                                                />
                                              ) : (
                                                getInitials(member.username)
                                              )}
                                            </div>
                                            <span className="voice-channel-member-name">
                                              {member.username}
                                            </span>
                                            <span className="voice-channel-member-icons">
                                              {member.deafened
                                                ? "🔇"
                                                : member.muted
                                                  ? "🎙️"
                                                  : "🎤"}
                                            </span>
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

              {!groupedChannelSections.length && (
                <p className="hint">
                  No channels available. Create one in Settings.
                </p>
              )}
            </section>
          </>
        )}

        {navMode === "dms" && (
          <section className="sidebar-block channels-container">
            {dms.map((dm) => (
              <button
                key={dm.id}
                className={`channel-row dm-sidebar-row ${dm.id === activeDmId ? "active" : ""}`}
                onClick={() => setActiveDmId(dm.id)}
                title={`DM ${dm.name}`}
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                {renderPresenceAvatar({
                  userId: dm.participantId || dm.id,
                  username: dm.name,
                  pfpUrl: dm.pfp_url,
                  size: 28,
                })}
                <span className="channel-hash">@</span>
                <div className="dm-sidebar-meta">
                  <div className="dm-sidebar-name-row">
                    <span className="dm-sidebar-name">{dm.name}</span>
                    {renderOfficialBadge(
                      dm.badgeDetails,
                      "official-badge--compact",
                    )}
                  </div>
                  {dm.isNoReply && (
                    <small className="dm-sidebar-note">No replies</small>
                  )}
                </div>
              </button>
            ))}
            {!dms.length && (
              <p className="hint">
                Add friends to open direct message threads.
              </p>
            )}
          </section>
        )}

        {navMode === "friends" && (
          <section className="sidebar-block channels-container friend-sidebar-list">
            {friends.map((friend) => (
              <button
                className="friend-row friend-sidebar-row"
                key={friend.id}
                onClick={() => openDmFromFriend(friend)}
                title={`Open ${friend.username}`}
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                {renderPresenceAvatar({
                  userId: friend.id,
                  username: friend.username,
                  pfpUrl: friend.pfp_url,
                  size: 28,
                })}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong>{friend.username}</strong>
                  <span className="hint">
                    {presenceLabel(getPresence(friend.id))}
                  </span>
                </div>
              </button>
            ))}
            {!friends.length && (
              <p className="hint">
                No friends yet. Use the Add Friend tab in the main panel.
              </p>
            )}
          </section>
        )}

        {navMode === "profile" && profile && (
          <section className="sidebar-block channels-container">
            <div
              className="profile-preview"
              style={{
                backgroundImage: profile?.bannerUrl
                  ? `url(${profileImageUrl(profile.bannerUrl)})`
                  : undefined,
              }}
            >
              <div className="avatar">
                {getInitials(profile.displayName || profile.username || "User")}
              </div>
              <strong>{profile.displayName || profile.username}</strong>
              <span>@{profile.username}</span>
              <small>{profile.platformTitle || "OpenCom Member"}</small>
            </div>
          </section>
        )}

        <footer className="self-card">
          {isInVoiceChannel && (
            <div className="voice-widget">
              <div className="voice-top">
                <strong>Voice Connected</strong>
                <span title={voiceConnectedChannelName}>
                  {voiceConnectedChannelName}
                </span>
              </div>
              <div className="voice-actions voice-actions-modern">
                <button
                  className={`voice-action-pill ${isMuted ? "active danger" : ""}`}
                  title={isMuted ? "Unmute" : "Mute"}
                  onClick={() => setIsMuted((value) => !value)}
                >
                  {isMuted ? "🔇" : "🎤"}
                </button>
                <button
                  className={`voice-action-pill ${isDeafened ? "active danger" : ""}`}
                  title={isDeafened ? "Undeafen" : "Deafen"}
                  onClick={() => setIsDeafened((value) => !value)}
                >
                  {isDeafened ? "🔕" : "🎧"}
                </button>
                <button
                  className={`voice-action-pill ${isScreenSharing ? "active" : ""}`}
                  title={
                    isScreenSharing ? "Stop screen share" : "Start screen share"
                  }
                  onClick={toggleScreenShare}
                >
                  {isScreenSharing ? "🖥️" : "📺"}
                </button>
                <button
                  className="voice-action-pill danger"
                  title="Disconnect from voice"
                  onClick={leaveVoiceChannel}
                  disabled={isDisconnectingVoice}
                >
                  {isDisconnectingVoice ? "…" : "📞"}
                </button>
                <button
                  className="voice-action-pill"
                  title="Voice settings"
                  onClick={() => {
                    setSettingsOpen(true);
                    setSettingsTab("voice");
                  }}
                >
                  ⚙️
                </button>
              </div>
              {!!remoteScreenShares.length && (
                <div className="voice-screen-grid">
                  {remoteScreenShares.map((share) => {
                    const isSelected =
                      selectedRemoteScreenShare?.producerId ===
                      share.producerId;
                    return (
                      <button
                        type="button"
                        className={`voice-screen-tile ${isSelected ? "active" : ""}`}
                        key={share.producerId}
                        onClick={() => selectScreenShare(share.producerId)}
                        title="Show this share in overlay"
                      >
                        <video
                          autoPlay
                          playsInline
                          muted
                          ref={(node) => {
                            if (!node || !share.stream) return;
                            if (node.srcObject !== share.stream)
                              node.srcObject = share.stream;
                          }}
                        />
                        <span>
                          {memberNameById.get(share.userId) ||
                            share.userId ||
                            "Screen Share"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {!!remoteScreenShares.length && !screenShareOverlayOpen && (
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setScreenShareOverlayOpen(true)}
                >
                  Show Screen Overlay
                </button>
              )}
            </div>
          )}

          <div className="user-row">
            {renderPresenceAvatar({
              userId: me?.id,
              username: me?.username || "OpenCom User",
              pfpUrl: profile?.pfpUrl,
              size: 36,
            })}
            <div className="user-meta">
              <strong>{me?.username}</strong>
              <span>{canManageServer ? "Owner" : "Member"}</span>
            </div>
            <select
              className="status-select"
              value={selfStatus}
              onChange={(event) => setSelfStatus(event.target.value)}
              title="Your status"
            >
              <option value="online">Online</option>
              <option value="idle">Idle</option>
              <option value="dnd">Do Not Disturb</option>
              <option value="invisible">Invisible</option>
            </select>
            <div className="user-controls">
              <button
                className={`icon-btn ${isMuted ? "danger" : "ghost"}`}
                onClick={() => setIsMuted((value) => !value)}
              >
                {isMuted ? "🎙️" : "🎤"}
              </button>
              <button
                className={`icon-btn ${isDeafened ? "danger" : "ghost"}`}
                onClick={() => setIsDeafened((value) => !value)}
              >
                {isDeafened ? "🔇" : "🎧"}
              </button>
              <button
                className="icon-btn ghost"
                onClick={() => {
                  setSettingsOpen(true);
                  setSettingsTab("profile");
                }}
              >
                ⚙️
              </button>
            </div>
          </div>
        </footer>
      </aside>

      <main className="chat-pane">
        {navMode === "servers" && servers.length === 0 && (
          <div
            className="create-server-empty"
            style={{ padding: "2rem", maxWidth: "420px", margin: "auto" }}
          >
            <h3 style={{ marginBottom: "0.5rem" }}>Create your server</h3>
            <p className="hint" style={{ marginBottom: "1rem" }}>
              You get one server hosted by us. Name it and start customising
              channels and roles.
            </p>
            <input
              type="text"
              value={newOfficialServerName}
              onChange={(e) => setNewOfficialServerName(e.target.value)}
              placeholder="Server name"
              style={{
                width: "100%",
                marginBottom: "0.75rem",
                padding: "0.5rem",
              }}
            />
            <input
              type="text"
              value={newOfficialServerLogoUrl}
              onChange={(e) => setNewOfficialServerLogoUrl(e.target.value)}
              placeholder="Logo URL (.png/.jpg/.webp/.svg)"
              style={{
                width: "100%",
                marginBottom: "0.75rem",
                padding: "0.5rem",
              }}
            />
            <label style={{ display: "block", marginBottom: "0.75rem" }}>
              Upload Logo
              <input
                type="file"
                accept="image/*"
                onChange={(event) =>
                  onImageFieldUpload(
                    event,
                    "server logo",
                    setNewOfficialServerLogoUrl,
                  )
                }
                style={{ width: "100%", marginTop: "0.35rem" }}
              />
            </label>
            <input
              type="text"
              value={newOfficialServerBannerUrl}
              onChange={(e) => setNewOfficialServerBannerUrl(e.target.value)}
              placeholder="Banner URL (optional)"
              style={{
                width: "100%",
                marginBottom: "0.75rem",
                padding: "0.5rem",
              }}
            />
            <label style={{ display: "block", marginBottom: "0.75rem" }}>
              Upload Banner
              <input
                type="file"
                accept="image/*"
                onChange={(event) =>
                  onImageFieldUpload(
                    event,
                    "server banner",
                    setNewOfficialServerBannerUrl,
                  )
                }
                style={{ width: "100%", marginTop: "0.35rem" }}
              />
            </label>
            <button
              onClick={createOfficialServer}
              disabled={
                !newOfficialServerName.trim() ||
                !newOfficialServerLogoUrl.trim()
              }
            >
              Create your server
            </button>
          </div>
        )}
        {navMode === "servers" && servers.length > 0 && (
          <div className="chat-layout">
            <section className="chat-main">
              <header className="chat-header">
                <h3>
                  <span className="channel-hash">#</span>{" "}
                  {activeChannel?.name || "updates"}
                </h3>
                <div className="chat-actions">
                  <button
                    className="icon-btn ghost"
                    title="Pinned messages"
                    onClick={() => setShowPinned((value) => !value)}
                  >
                    📌
                  </button>
                  <button className="icon-btn ghost" title="Threads">
                    🧵
                  </button>
                  <button className="icon-btn ghost" title="Notifications">
                    🔔
                  </button>
                  <button className="icon-btn ghost" title="Members">
                    👥
                  </button>
                  <input
                    className="search-input"
                    placeholder={`Search ${activeServer?.name || "server"}`}
                  />
                  <button
                    className="ghost"
                    onClick={() => {
                      setSettingsOpen(true);
                      setSettingsTab("server");
                    }}
                  >
                    Open settings
                  </button>
                </div>
              </header>

              {showPinned && activePinnedServerMessages.length > 0 && (
                <div className="pinned-strip">
                  {activePinnedServerMessages.slice(0, 3).map((item) => (
                    <div key={item.id} className="pinned-item">
                      <strong>{item.author}</strong>
                      <span>{item.content}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="messages" ref={messagesRef}>
                {(() => {
                  let lastDayKey = "";
                  return groupedServerMessages.map((group) => {
                    const member = resolvedMemberList.find(
                      (m) => m.id === group.authorId,
                    );
                    const roles = (guildState?.roles || [])
                      .filter((r) => (member?.roleIds || []).includes(r.id))
                      .sort((a, b) => (b.position ?? 0) - (a.position ?? 0));
                    const topRole = roles[0];
                    const roleColor =
                      topRole?.color != null && topRole.color !== ""
                        ? typeof topRole.color === "number"
                          ? `#${Number(topRole.color).toString(16).padStart(6, "0")}`
                          : topRole.color
                        : null;
                    const groupDayKey = getMessageDayKey(
                      group.firstMessageTime,
                    );
                    const showDateDivider =
                      !!groupDayKey && groupDayKey !== lastDayKey;
                    if (groupDayKey) lastDayKey = groupDayKey;

                    return (
                      <div key={`group-wrap-${group.id}`}>
                        {showDateDivider && (
                          <div className="message-date-divider">
                            <span>
                              {formatMessageDate(group.firstMessageTime)}
                            </span>
                          </div>
                        )}
                        <article className="msg grouped-msg">
                          <div className="msg-avatar">
                            {group.pfpUrl ? (
                              <img
                                src={profileImageUrl(group.pfpUrl)}
                                alt={group.author}
                              />
                            ) : (
                              getInitials(group.author || "User")
                            )}
                          </div>
                          <div className="msg-body">
                            <strong className="msg-author">
                              <button
                                className="name-btn"
                                style={
                                  roleColor ? { color: roleColor } : undefined
                                }
                                onClick={(event) =>
                                  openMemberProfile(
                                    {
                                      id: group.authorId,
                                      username: group.author,
                                      status: getPresence(group.authorId),
                                      pfp_url: group.pfpUrl,
                                    },
                                    { x: event.clientX, y: event.clientY },
                                  )
                                }
                                onContextMenu={(event) =>
                                  openMemberContextMenu(event, {
                                    id: group.authorId,
                                    username: group.author,
                                    pfp_url: group.pfpUrl,
                                    roleIds: member?.roleIds || [],
                                  })
                                }
                              >
                                {group.author}
                              </button>
                              {topRole && (
                                <span className="msg-role-tag">
                                  {topRole.name}
                                </span>
                              )}
                              <span className="msg-time">
                                {formatMessageTime(group.firstMessageTime)}
                              </span>
                            </strong>
                            {group.messages.map((message) => {
                              const derivedLinkEmbeds =
                                getDerivedLinkEmbeds(message);
                              return (
                                <div
                                  key={message.id}
                                  onContextMenu={(event) =>
                                    openMessageContextMenu(event, {
                                      id: message.id,
                                      kind: "server",
                                      author: group.author,
                                      content: message.content,
                                      mine:
                                        (message.author_id ||
                                          message.authorId) === me?.id,
                                    })
                                  }
                                >
                                  <p>
                                    {activePinnedServerMessages.some(
                                      (item) => item.id === message.id,
                                    )
                                      ? "📌 "
                                      : ""}
                                    {renderContentWithMentions(message)}
                                  </p>
                                  {Array.isArray(message?.embeds) &&
                                    message.embeds.length > 0 && (
                                      <div className="message-embeds">
                                        {message.embeds.map((embed, index) => (
                                          <div
                                            key={`${message.id}-embed-${index}`}
                                            className="message-embed-card"
                                          >
                                            {embed.title && (
                                              <strong>{embed.title}</strong>
                                            )}
                                            {embed.description && (
                                              <p>{embed.description}</p>
                                            )}
                                            {embed.url && (
                                              <a
                                                href={embed.url}
                                                target="_blank"
                                                rel="noreferrer"
                                              >
                                                {embed.url}
                                              </a>
                                            )}
                                            {embed.footer?.text && (
                                              <small>{embed.footer.text}</small>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  {Array.isArray(message?.linkEmbeds) &&
                                    message.linkEmbeds.length > 0 && (
                                      <div className="message-embeds">
                                        {message.linkEmbeds.map(
                                          (embed, index) =>
                                            renderMessageLinkEmbedCard(
                                              embed,
                                              `${message.id}-link-${index}`,
                                            ),
                                        )}
                                      </div>
                                    )}
                                  {derivedLinkEmbeds.length > 0 && (
                                    <div className="message-embeds">
                                      {derivedLinkEmbeds.map((embed, index) =>
                                        renderMessageLinkEmbedCard(
                                          embed,
                                          `${message.id}-derived-link-${index}`,
                                        ),
                                      )}
                                    </div>
                                  )}
                                  {Array.isArray(message?.attachments) &&
                                    message.attachments.length > 0 && (
                                      <div className="message-embeds">
                                        {message.attachments.map(
                                          (attachment, index) =>
                                            renderMessageAttachmentCard(
                                              attachment,
                                              `${message.id}-att-${index}`,
                                            ),
                                        )}
                                      </div>
                                    )}
                                </div>
                              );
                            })}
                          </div>
                        </article>
                      </div>
                    );
                  });
                })()}
                {!messages.length && (
                  <p className="empty">
                    No messages yet. Start the conversation.
                  </p>
                )}
              </div>

              {replyTarget && (
                <div className="reply-banner">
                  <span>Replying to {replyTarget.author}</span>
                  <button
                    className="ghost"
                    onClick={() => setReplyTarget(null)}
                  >
                    Cancel
                  </button>
                </div>
              )}

              <footer
                className="composer server-composer"
                onClick={() => composerInputRef.current?.focus()}
              >
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
                        <div
                          key={`pending-att-${index}`}
                          className="mention-suggestion"
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            width: "100%",
                          }}
                        >
                          <span>{attachment.fileName || "attachment"}</span>
                          <button
                            type="button"
                            className="ghost"
                            onClick={(event) => {
                              event.stopPropagation();
                              setPendingAttachments((current) =>
                                current.filter((_, i) => i !== index),
                              );
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
                      const files = extractFilesFromClipboardData(
                        event.clipboardData,
                      );
                      if (!files.length) return;
                      event.preventDefault();
                      uploadAttachments(files, "clipboard").catch(() => {});
                    }}
                    placeholder={`Message #${activeChannel?.name || "channel"}`}
                    onKeyDown={(event) => {
                      if (
                        event.key === "ArrowDown" &&
                        slashCommandSuggestions.length > 0
                      ) {
                        event.preventDefault();
                        setSlashSelectionIndex(
                          (current) =>
                            (current + 1) % slashCommandSuggestions.length,
                        );
                        return;
                      }
                      if (
                        event.key === "ArrowUp" &&
                        slashCommandSuggestions.length > 0
                      ) {
                        event.preventDefault();
                        setSlashSelectionIndex(
                          (current) =>
                            (current - 1 + slashCommandSuggestions.length) %
                            slashCommandSuggestions.length,
                        );
                        return;
                      }
                      if (event.key === "Escape" && showingSlash) {
                        event.preventDefault();
                        setMessageText("");
                        return;
                      }
                      if (
                        (event.key === "Tab" ||
                          (event.key === "Enter" && !event.shiftKey)) &&
                        slashCommandSuggestions.length > 0
                      ) {
                        event.preventDefault();
                        const selected =
                          slashCommandSuggestions[
                            Math.min(
                              slashSelectionIndex,
                              slashCommandSuggestions.length - 1,
                            )
                          ] || slashCommandSuggestions[0];
                        if (!selected) return;
                        applySlashCommandTemplate(selected);
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
                      <div className="slash-command-header">
                        COMMANDS MATCHING /{(slashQuery || "").toUpperCase()}
                      </div>
                      {slashCommandSuggestions.length === 0 ? (
                        <div className="slash-command-empty">
                          No commands found for this server.
                        </div>
                      ) : (
                        slashCommandSuggestions.map((command, index) => (
                          <button
                            key={command.name}
                            type="button"
                            className={`slash-command-item ${index === slashSelectionIndex ? "active" : ""}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              applySlashCommandTemplate(command);
                              setSlashSelectionIndex(index);
                            }}
                          >
                            <div>
                              <strong>/{command.name}</strong>
                              <p>
                                {command.description ||
                                  "No description provided."}
                              </p>
                            </div>
                            <span>
                              {command.extensionName || command.extensionId}
                            </span>
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
                            insertEmoteToken(
                              String(emote.name || "").toLowerCase(),
                            );
                          }}
                          title={`:${emote.name}:`}
                        >
                          <img
                            className="message-custom-emote"
                            src={emote.imageUrl || emote.image_url}
                            alt={`:${emote.name}:`}
                          />
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
                    openFavouriteMediaPicker();
                  }}
                  title="Open favourites"
                  disabled={!activeChannelId}
                >
                  ★
                </button>
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
                <button
                  className="send-btn"
                  onClick={sendMessage}
                  disabled={
                    !activeChannelId ||
                    (!messageText.trim() && pendingAttachments.length === 0)
                  }
                >
                  Send
                </button>
              </footer>
            </section>

            <aside className="members-pane">
              <h4>Members — {resolvedMemberList.length}</h4>
              {(() => {
                const rolesById = new Map(
                  (guildState?.roles || []).map((r) => [r.id, r]),
                );
                const getHighestRole = (member) => {
                  const memberRoles = (member.roleIds || [])
                    .map((id) => rolesById.get(id))
                    .filter(Boolean)
                    .sort((a, b) => (b.position ?? 0) - (a.position ?? 0));
                  return memberRoles[0] || null;
                };
                const byHighestRole = new Map();
                for (const member of resolvedMemberList) {
                  const top = getHighestRole(member);
                  const key = top?.id ?? "__none__";
                  if (!byHighestRole.has(key))
                    byHighestRole.set(key, { role: top, members: [] });
                  byHighestRole.get(key).members.push(member);
                }
                const noneRole = {
                  id: "__none__",
                  name: "No role",
                  position: -1,
                  color: null,
                };
                const sections = Array.from(byHighestRole.entries()).map(
                  ([key, { role, members }]) => ({
                    role: role || noneRole,
                    members,
                  }),
                );
                sections.sort(
                  (a, b) => (b.role.position ?? 0) - (a.role.position ?? 0),
                );
                return sections.map(({ role, members }) => {
                  const roleColor =
                    role.color != null && role.color !== ""
                      ? typeof role.color === "number"
                        ? `#${Number(role.color).toString(16).padStart(6, "0")}`
                        : role.color
                      : null;
                  return (
                    <div className="members-role-section" key={role.id}>
                      <div
                        className="members-role-label"
                        style={roleColor ? { color: roleColor } : undefined}
                      >
                        {role.name}
                      </div>
                      {members.map((member) => {
                        const topRole = getHighestRole(member);
                        const color =
                          topRole?.color != null && topRole.color !== ""
                            ? typeof topRole.color === "number"
                              ? `#${Number(topRole.color).toString(16).padStart(6, "0")}`
                              : topRole.color
                            : null;
                        const memberVoice = mergedVoiceStates.find(
                          (vs) => vs.userId === member.id,
                        );
                        const inMyCall =
                          memberVoice?.channelId &&
                          memberVoice.channelId === voiceConnectedChannelId;
                        const speaking =
                          !!inMyCall &&
                          !!voiceSpeakingByGuild[activeGuildId]?.[member.id];
                        return (
                          <button
                            className="member-row"
                            key={member.id}
                            title={`View ${member.username}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              openMemberProfile(member, {
                                x: event.clientX,
                                y: event.clientY,
                              });
                            }}
                            onContextMenu={(event) =>
                              openMemberContextMenu(event, member)
                            }
                          >
                            <div className={speaking ? "speaking" : ""}>
                              {renderPresenceAvatar({
                                userId: member.id,
                                username: member.username,
                                pfpUrl: member.pfp_url,
                                size: 32,
                              })}
                            </div>
                            <div>
                              <strong style={color ? { color } : undefined}>
                                {member.username}
                              </strong>
                              <span>
                                {memberVoice
                                  ? `${memberVoice.deafened ? "🔇" : memberVoice.muted ? "🎙️" : "🎤"} In voice`
                                  : presenceLabel(getPresence(member.id))}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  );
                });
              })()}
              {!resolvedMemberList.length && (
                <p className="hint">No visible members yet.</p>
              )}
            </aside>
          </div>
        )}

        {navMode === "dms" && (
          <section className="chat-main">
            <header className="chat-header dm-header-actions">
              <div className="dm-header-meta">
                <h3>{activeDm ? `@ ${activeDm.name}` : "Direct Messages"}</h3>
                {activeDm && (
                  <div className="dm-header-subline">
                    {renderOfficialBadge(activeDm.badgeDetails)}
                    {activeDm.isNoReply && (
                      <span className="dm-readonly-note">
                        Official announcements only
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="chat-actions">
                {activeDm?.participantId &&
                  !activePrivateCall &&
                  !activeDm?.isNoReply && (
                  <button
                    className="icon-btn ghost"
                    title={`Call ${activeDm.name}`}
                    onClick={() => {
                      const friend = friends.find(
                        (f) => f.id === activeDm.participantId,
                      );
                      initiatePrivateCall(
                        activeDm.participantId,
                        activeDm.name,
                        friend?.pfp_url ?? null,
                      );
                    }}
                  >
                    📞
                  </button>
                )}
                {activePrivateCall && (
                  <button
                    className="icon-btn ghost"
                    style={{ color: "var(--danger, #ef5f76)" }}
                    title="End call"
                    onClick={endPrivateCall}
                  >
                    📵
                  </button>
                )}
                <button
                  className="icon-btn ghost"
                  onClick={() => setShowPinned((value) => !value)}
                  title="Pinned DMs"
                >
                  📌
                </button>
              </div>
            </header>
            {showPinned && activePinnedDmMessages.length > 0 && (
              <div className="pinned-strip">
                {activePinnedDmMessages.slice(0, 3).map((item) => (
                  <div key={item.id} className="pinned-item">
                    <strong>{item.author}</strong>
                    <span>{item.content}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="messages" ref={dmMessagesRef}>
              {(() => {
                let lastDayKey = "";
                return groupedDmMessages.map((group) => {
                  const groupDayKey = getMessageDayKey(group.firstMessageTime);
                  const showDateDivider =
                    !!groupDayKey && groupDayKey !== lastDayKey;
                  if (groupDayKey) lastDayKey = groupDayKey;

                  return (
                    <div key={`dm-group-wrap-${group.id}`}>
                      {showDateDivider && (
                        <div className="message-date-divider">
                          <span>
                            {formatMessageDate(group.firstMessageTime)}
                          </span>
                        </div>
                      )}
                      <article className="msg dm-msg grouped-msg">
                        <div className="msg-avatar">
                          {group.pfpUrl ? (
                            <img
                              src={profileImageUrl(group.pfpUrl)}
                              alt={group.author}
                            />
                          ) : (
                            getInitials(group.author)
                          )}
                        </div>
                        <div className="msg-body">
                          <strong className="msg-author">
                            <span className="dm-author-row">
                              <button
                                className="name-btn"
                                onClick={(event) =>
                                  openMemberProfile(
                                    {
                                      id: group.authorId,
                                      username: group.author,
                                      status: getPresence(group.authorId),
                                      pfp_url: group.pfpUrl,
                                    },
                                    { x: event.clientX, y: event.clientY },
                                  )
                                }
                                onContextMenu={(event) =>
                                  openMemberContextMenu(event, {
                                    id: group.authorId,
                                    username: group.author,
                                    pfp_url: group.pfpUrl,
                                  })
                                }
                              >
                                {group.author}
                              </button>
                              {renderOfficialBadge(
                                group.messages?.[0]?.badgeDetails,
                                "official-badge--compact",
                              )}
                            </span>
                            <span className="msg-time">
                              {formatMessageTime(group.firstMessageTime)}
                            </span>
                          </strong>
                          {group.messages.map((message) => {
                            const derivedLinkEmbeds =
                              getDerivedLinkEmbeds(message);
                            return (
                              <div
                                key={message.id}
                                onContextMenu={(event) =>
                                  openMessageContextMenu(event, {
                                    id: message.id,
                                    kind: "dm",
                                    author: message.author,
                                    content: message.content,
                                    mine: message.authorId === me?.id,
                                  })
                                }
                              >
                                {message.content === "__CALL_REQUEST__" ? (
                                  <CallMessageCard
                                    message={message}
                                    me={me}
                                    activeCallId={
                                      activePrivateCall?.callId ?? null
                                    }
                                    onJoin={joinPrivateVoiceCall}
                                    callerName={group.author}
                                  />
                                ) : (
                                  <p>
                                    {activePinnedDmMessages.some(
                                      (item) => item.id === message.id,
                                    )
                                      ? "📌 "
                                      : ""}
                                    {renderContentWithMentions(message)}
                                  </p>
                                )}
                                {derivedLinkEmbeds.length > 0 && (
                                  <div className="message-embeds">
                                    {derivedLinkEmbeds.map((embed, index) =>
                                      renderMessageLinkEmbedCard(
                                        embed,
                                        `${message.id}-dm-derived-link-${index}`,
                                      ),
                                    )}
                                  </div>
                                )}
                                {Array.isArray(message?.attachments) &&
                                  message.attachments.length > 0 && (
                                    <div className="message-embeds">
                                      {message.attachments.map(
                                        (attachment, index) =>
                                          renderMessageAttachmentCard(
                                            attachment,
                                            `${message.id}-dm-att-${index}`,
                                          ),
                                      )}
                                    </div>
                                  )}
                              </div>
                            );
                          })}
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
                <button
                  className="ghost"
                  onClick={() => setDmReplyTarget(null)}
                >
                  Cancel
                </button>
              </div>
            )}
            {activeDm?.isNoReply && (
              <div className="reply-banner dm-readonly-banner">
                <span>
                  `opencom` is a no-reply official account. You can read its
                  messages, but you cannot reply.
                </span>
              </div>
            )}
            <footer
              className="composer dm-composer"
              onClick={() => dmComposerInputRef.current?.focus()}
            >
              <button
                className="ghost composer-icon"
                onClick={(event) => {
                  event.stopPropagation();
                  dmAttachmentInputRef.current?.click();
                }}
                title="Attach files"
                disabled={!activeDm || activeDm?.isNoReply}
              >
                ＋
              </button>
              <input
                ref={dmAttachmentInputRef}
                type="file"
                multiple
                style={{ display: "none" }}
                onChange={async (event) => {
                  const files = Array.from(event.target.files || []);
                  await uploadAttachments(files, "file picker", "dm");
                }}
              />
              <div className="composer-input-wrap">
                {pendingDmAttachments.length > 0 && (
                  <div className="mention-suggestions">
                    {pendingDmAttachments.map((attachment, index) => (
                      <div
                        key={`pending-dm-att-${index}`}
                        className="mention-suggestion"
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          width: "100%",
                        }}
                      >
                        <span>{attachment.fileName || "attachment"}</span>
                        <button
                          type="button"
                          className="ghost"
                          onClick={(event) => {
                            event.stopPropagation();
                            setPendingDmAttachments((current) =>
                              current.filter((_, i) => i !== index),
                            );
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <textarea
                  ref={dmComposerInputRef}
                  value={dmText}
                  onChange={(event) => setDmText(event.target.value)}
                  placeholder={
                    activeDm?.isNoReply
                      ? "This official account does not accept replies"
                      : `Message ${activeDm?.name || "friend"}`
                  }
                  onPaste={(event) => {
                    const files = extractFilesFromClipboardData(
                      event.clipboardData,
                    );
                    if (!files.length) return;
                    event.preventDefault();
                    uploadAttachments(files, "clipboard", "dm").catch(() => {});
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      sendDm();
                    }
                  }}
                  disabled={!activeDm || activeDm?.isNoReply}
                />
              </div>
              <button
                className="ghost composer-icon"
                onClick={(event) => {
                  event.stopPropagation();
                  openFavouriteMediaPicker();
                }}
                title="Open favourites"
                disabled={!activeDm || activeDm?.isNoReply}
              >
                ★
              </button>
              <button
                className="send-btn"
                onClick={sendDm}
                disabled={
                  !activeDm ||
                  activeDm?.isNoReply ||
                  (!dmText.trim() && pendingDmAttachments.length === 0)
                }
              >
                Send
              </button>
            </footer>
          </section>
        )}

        {navMode === "friends" && (
          <FriendsSurface
            friendView={friendView}
            setFriendView={setFriendView}
            friendQuery={friendQuery}
            setFriendQuery={setFriendQuery}
            friendAddInput={friendAddInput}
            setFriendAddInput={setFriendAddInput}
            addFriend={addFriend}
            friendRequests={friendRequests}
            respondToFriendRequest={respondToFriendRequest}
            filteredFriends={filteredFriends}
            getPresence={getPresence}
            presenceLabel={presenceLabel}
            renderPresenceAvatar={renderPresenceAvatar}
            openDmFromFriend={openDmFromFriend}
            openMemberProfile={openMemberProfile}
          />
        )}

        {navMode === "profile" && (
          <ProfileStudioPage
            resetFullProfileDraftToBasic={resetFullProfileDraftToBasic}
            saveFullProfileDraft={saveFullProfileDraft}
            profileForm={profileForm}
            setProfileForm={setProfileForm}
            onAvatarUpload={onAvatarUpload}
            onBannerUpload={onBannerUpload}
            saveProfile={saveProfile}
            addFullProfileElement={addFullProfileElement}
            fullProfileDraft={fullProfileDraft}
            addFullProfileTextBlock={addFullProfileTextBlock}
            hasBoostForFullProfiles={hasBoostForFullProfiles}
            fullProfileEditorCanvasRef={fullProfileEditorCanvasRef}
            profileStudioCanvasMinHeight={profileStudioCanvasMinHeight}
            getFullProfileFontFamily={getFullProfileFontFamily}
            fullProfileDraggingElementId={fullProfileDraggingElementId}
            profileStudioSelectedElementId={profileStudioSelectedElementId}
            getFullProfileElementFrameStyle={getFullProfileElementFrameStyle}
            onFullProfileElementMouseDown={onFullProfileElementMouseDown}
            setProfileStudioSelectedElementId={
              setProfileStudioSelectedElementId
            }
            renderFullProfileElement={renderFullProfileElement}
            profileStudioPreviewProfile={profileStudioPreviewProfile}
            openBoostUpsell={openBoostUpsell}
            selectedProfileStudioElement={selectedProfileStudioElement}
            updateFullProfileElement={updateFullProfileElement}
            nudgeFullProfileElement={nudgeFullProfileElement}
            removeFullProfileElement={removeFullProfileElement}
            setFullProfileDraft={setFullProfileDraft}
            updateFullProfileLink={updateFullProfileLink}
            removeFullProfileLink={removeFullProfileLink}
            addFullProfileLink={addFullProfileLink}
            onAudioFieldUpload={onAudioFieldUpload}
          />
        )}
        <VoiceShareOverlay
          isInVoiceChannel={isInVoiceChannel}
          navMode={navMode}
          screenShareOverlayOpen={screenShareOverlayOpen}
          selectedRemoteScreenShare={selectedRemoteScreenShare}
          remoteScreenShares={remoteScreenShares}
          selectScreenShare={selectScreenShare}
          memberNameById={memberNameById}
          setScreenShareOverlayOpen={setScreenShareOverlayOpen}
        />
      </main>

      <AppContextMenus
        messageContextMenu={messageContextMenu}
        setReplyTarget={setReplyTarget}
        setDmReplyTarget={setDmReplyTarget}
        setMessageContextMenu={setMessageContextMenu}
        togglePinMessage={togglePinMessage}
        setStatus={setStatus}
        canDeleteServerMessages={canDeleteServerMessages}
        deleteServerMessage={deleteServerMessage}
        deleteDmMessage={deleteDmMessage}
        memberContextMenu={memberContextMenu}
        voiceStateByUserId={voiceStateByUserId}
        getVoiceMemberAudioPref={getVoiceMemberAudioPref}
        setVoiceMemberAudioPref={setVoiceMemberAudioPref}
        promptSetVoiceMemberLocalVolume={promptSetVoiceMemberLocalVolume}
        me={me}
        canServerMuteMembers={canServerMuteMembers}
        canServerDeafenMembers={canServerDeafenMembers}
        canMoveVoiceMembers={canMoveVoiceMembers}
        setServerVoiceMemberState={setServerVoiceMemberState}
        disconnectVoiceMember={disconnectVoiceMember}
        openMemberProfile={openMemberProfile}
        openDmFromFriend={openDmFromFriend}
        canKickMembers={canKickMembers}
        kickMember={kickMember}
        canBanMembers={canBanMembers}
        banMember={banMember}
        canModerateMembers={canModerateMembers}
        setModerationMemberId={setModerationMemberId}
        setSettingsOpen={setSettingsOpen}
        setSettingsTab={setSettingsTab}
        setMemberContextMenu={setMemberContextMenu}
        serverContextMenu={serverContextMenu}
        openServerFromContext={openServerFromContext}
        canManageServer={canManageServer}
        activeServerId={activeServerId}
        workingGuildId={workingGuildId}
        promptCreateChannelFlow={promptCreateChannelFlow}
        moveServerInRail={moveServerInRail}
        setInviteServerId={setInviteServerId}
        copyServerId={copyServerId}
        leaveServer={leaveServer}
        deleteServer={deleteServer}
        setServerContextMenu={setServerContextMenu}
        channelContextMenu={channelContextMenu}
        openChannelSettings={openChannelSettings}
        setChannelPermsChannelId={setChannelPermsChannelId}
        setChannelContextMenu={setChannelContextMenu}
        setActiveChannelId={setActiveChannelId}
        deleteChannelById={deleteChannelById}
        categoryContextMenu={categoryContextMenu}
        setCategoryContextMenu={setCategoryContextMenu}
      />

      <AddServerModal
        addServerModalOpen={addServerModalOpen}
        setAddServerModalOpen={setAddServerModalOpen}
        addServerTab={addServerTab}
        setAddServerTab={setAddServerTab}
        canAccessServerAdminPanel={canAccessServerAdminPanel}
        resolveStaticPageHref={resolveStaticPageHref}
        joinInviteCode={joinInviteCode}
        setJoinInviteCode={setJoinInviteCode}
        previewInvite={previewInvite}
        joinInvite={joinInvite}
        invitePendingCode={invitePendingCode}
        invitePreview={invitePreview}
        newServerName={newServerName}
        setNewServerName={setNewServerName}
        newServerBaseUrl={newServerBaseUrl}
        setNewServerBaseUrl={setNewServerBaseUrl}
        newServerLogoUrl={newServerLogoUrl}
        setNewServerLogoUrl={setNewServerLogoUrl}
        onImageFieldUpload={onImageFieldUpload}
        newServerBannerUrl={newServerBannerUrl}
        setNewServerBannerUrl={setNewServerBannerUrl}
        createServer={createServer}
        newOfficialServerName={newOfficialServerName}
        setNewOfficialServerName={setNewOfficialServerName}
        newOfficialServerLogoUrl={newOfficialServerLogoUrl}
        setNewOfficialServerLogoUrl={setNewOfficialServerLogoUrl}
        newOfficialServerBannerUrl={newOfficialServerBannerUrl}
        setNewOfficialServerBannerUrl={setNewOfficialServerBannerUrl}
        createOfficialServer={createOfficialServer}
      />

      <MemberProfilePopout
        memberProfileCard={memberProfileCard}
        memberProfilePopoutRef={memberProfilePopoutRef}
        profileCardPosition={profileCardPosition}
        openMemberContextMenu={openMemberContextMenu}
        startDraggingProfileCard={startDraggingProfileCard}
        profileImageUrl={profileImageUrl}
        getInitials={getInitials}
        presenceLabel={presenceLabel}
        getPresence={getPresence}
        formatAccountCreated={formatAccountCreated}
        getBadgePresentation={getBadgePresentation}
        guildState={guildState}
        getRichPresence={getRichPresence}
        openDmFromFriend={openDmFromFriend}
        openFullProfileViewer={openFullProfileViewer}
        canKickMembers={canKickMembers}
        me={me}
        kickMember={kickMember}
        canBanMembers={canBanMembers}
        banMember={banMember}
        setMemberProfileCard={setMemberProfileCard}
      />

      <FullProfileViewerModal
        fullProfileViewer={fullProfileViewer}
        setFullProfileViewer={setFullProfileViewer}
        profileImageUrl={profileImageUrl}
        getFullProfileFontFamily={getFullProfileFontFamily}
        getFullProfileElementFrameStyle={getFullProfileElementFrameStyle}
        toggleFullProfileViewerMusicPlayback={
          toggleFullProfileViewerMusicPlayback
        }
        renderFullProfileElement={renderFullProfileElement}
        fullProfileViewerMusicPlaying={fullProfileViewerMusicPlaying}
        fullProfileViewerHasPlayableMusic={fullProfileViewerHasPlayableMusic}
        fullProfileViewerMusicAudioRef={fullProfileViewerMusicAudioRef}
        setFullProfileViewerMusicPlaying={setFullProfileViewerMusicPlaying}
      />

      <AppDialogModal
        dialogModal={dialogModal}
        resolveDialog={resolveDialog}
        setDialogModal={setDialogModal}
        dialogInputRef={dialogInputRef}
      />

      <FavouriteMediaModal
        open={favouriteMediaModalOpen}
        onClose={() => setFavouriteMediaModalOpen(false)}
        favourites={filteredFavouriteMedia}
        loading={favouriteMediaLoading}
        query={favouriteMediaQuery}
        setQuery={setFavouriteMediaQuery}
        previewUrlById={favouriteMediaPreviewUrlById}
        onSelect={insertFavouriteMedia}
        onRemove={toggleFavouriteMedia}
        removeBusyById={favouriteMediaBusyById}
        insertBusyId={favouriteMediaInsertBusyId}
      />

      <MediaViewerModal
        media={expandedMedia}
        onClose={() => setExpandedMedia(null)}
      />

      <BoostUpsellModal
        boostUpsell={boostUpsell}
        setBoostUpsell={setBoostUpsell}
        openBoostSettingsFromUpsell={openBoostSettingsFromUpsell}
      />

      <BoostGiftPromptModal
        boostGiftPrompt={boostGiftPrompt}
        setBoostGiftPrompt={setBoostGiftPrompt}
        boostGiftRedeeming={boostGiftRedeeming}
        redeemBoostGift={redeemBoostGift}
      />

      <SettingsOverlay
        settingsOpen={settingsOpen}
        closeSettings={() => setSettingsOpen(false)}
        settingsTab={settingsTab}
        setSettingsTab={setSettingsTab}
        onOpenSecurity={() => {
          setSettingsTab("security");
          loadSessions();
        }}
        onOpenBilling={() => {
          setSettingsTab("billing");
          loadBoostStatus();
          loadSentBoostGifts();
        }}
        canModerateMembers={canModerateMembers}
        canAccessServerAdminPanel={canAccessServerAdminPanel}
        resolveStaticPageHref={resolveStaticPageHref}
        logout={logout}
      >
        {settingsTab === "profile" && (
          <ProfileSettingsSection
            profileForm={profileForm}
            setProfileForm={setProfileForm}
            onAvatarUpload={onAvatarUpload}
            onBannerUpload={onBannerUpload}
            saveProfile={saveProfile}
            isDesktopRuntime={isDesktopRuntime}
            openPreferredDesktopDownload={openPreferredDesktopDownload}
            preferredDownloadTarget={preferredDownloadTarget}
            downloadTargets={DOWNLOAD_TARGETS}
            onOpenProfileStudio={() => {
              setSettingsOpen(false);
              setNavMode("profile");
            }}
            rpcForm={rpcForm}
            setRpcForm={setRpcForm}
            onImageFieldUpload={onImageFieldUpload}
            saveRichPresence={saveRichPresence}
            clearRichPresence={clearRichPresence}
          />
        )}

        {settingsTab === "server" && (
          <ServerSettingsSection
            serverState={{
              activeServer,
              servers,
              canManageServer,
              activeServerVoiceGatewayPref,
              categoryChannels,
              sortedChannels,
              channelPermsChannelId,
              guildState,
            }}
            forms={{
              serverProfileForm,
              newServerName,
              newServerBaseUrl,
              newServerLogoUrl,
              newServerBannerUrl,
              newWorkspaceName,
              newChannelName,
              newChannelType,
              newChannelParentId,
              newServerEmoteName,
              newServerEmoteUrl,
            }}
            actions={{
              setServerProfileForm,
              onImageFieldUpload,
              saveActiveServerProfile,
              setNewServerName,
              setNewServerBaseUrl,
              setNewServerLogoUrl,
              setNewServerBannerUrl,
              createServer,
              updateActiveServerVoiceGatewayPref,
              setNewWorkspaceName,
              createWorkspace,
              setNewChannelName,
              setNewChannelType,
              setNewChannelParentId,
              createChannel,
              setNewServerEmoteName,
              setNewServerEmoteUrl,
              createServerEmote,
              removeServerEmote,
              setChannelPermsChannelId,
              channelOverwriteAllowsSend,
              setChannelRoleSend,
            }}
          />
        )}

        {settingsTab === "roles" && (
          <RolesSettingsSection
            canManageServer={canManageServer}
            newRoleName={newRoleName}
            setNewRoleName={setNewRoleName}
            createRole={createRole}
            guildState={guildState}
            updateRole={updateRole}
            selectedMemberId={selectedMemberId}
            setSelectedMemberId={setSelectedMemberId}
            resolvedMemberList={resolvedMemberList}
            selectedRoleId={selectedRoleId}
            setSelectedRoleId={setSelectedRoleId}
            assignRoleToMember={assignRoleToMember}
          />
        )}

        {settingsTab === "moderation" && (
          <ModerationSettingsSection
            canModerateMembers={canModerateMembers}
            resolvedMemberList={resolvedMemberList}
            me={me}
            moderationMemberId={moderationMemberId}
            setModerationMemberId={setModerationMemberId}
            canBanMembers={canBanMembers}
            moderationBanReason={moderationBanReason}
            setModerationBanReason={setModerationBanReason}
            canKickMembers={canKickMembers}
            moderationBusy={moderationBusy}
            kickMember={kickMember}
            banMember={banMember}
            moderationUnbanUserId={moderationUnbanUserId}
            setModerationUnbanUserId={setModerationUnbanUserId}
            unbanMember={unbanMember}
          />
        )}

        {settingsTab === "invites" && (
          <InvitesSettingsSection
            joinInviteCode={joinInviteCode}
            setJoinInviteCode={setJoinInviteCode}
            previewInvite={previewInvite}
            joinInvite={joinInvite}
            invitePendingCode={invitePendingCode}
            invitePreview={invitePreview}
            inviteServerId={inviteServerId}
            setInviteServerId={setInviteServerId}
            servers={servers}
            inviteCustomCode={inviteCustomCode}
            setInviteCustomCode={setInviteCustomCode}
            boostStatus={boostStatus}
            showBoostUpsell={showBoostUpsell}
            invitePermanent={invitePermanent}
            setInvitePermanent={setInvitePermanent}
            createInvite={createInvite}
            inviteCode={inviteCode}
            inviteJoinUrl={inviteJoinUrl}
            buildInviteJoinUrl={buildInviteJoinUrl}
            setStatus={setStatus}
          />
        )}

        {settingsTab === "extensions" && (
          <ExtensionsSettingsSection
            activeServer={activeServer}
            canManageServer={canManageServer}
            refreshServerExtensions={refreshServerExtensions}
            serverExtensionsLoading={serverExtensionsLoading}
            serverExtensionsForDisplay={serverExtensionsForDisplay}
            serverExtensionBusyById={serverExtensionBusyById}
            toggleServerExtension={toggleServerExtension}
            serverExtensionCommands={serverExtensionCommands}
            clientExtensionCatalog={clientExtensionCatalog}
            enabledClientExtensions={enabledClientExtensions}
            toggleClientExtension={toggleClientExtension}
            clientExtensionLoadState={clientExtensionLoadState}
            clientExtensionDevMode={clientExtensionDevMode}
            setClientExtensionDevMode={setClientExtensionDevMode}
            newClientExtensionDevUrl={newClientExtensionDevUrl}
            setNewClientExtensionDevUrl={setNewClientExtensionDevUrl}
            addClientDevExtensionUrl={addClientDevExtensionUrl}
            clientExtensionDevUrls={clientExtensionDevUrls}
            setClientExtensionDevUrls={setClientExtensionDevUrls}
          />
        )}

        {settingsTab === "appearance" && (
          <AppearanceSettingsSection
            themeEnabled={themeEnabled}
            setThemeEnabled={setThemeEnabled}
            onUploadTheme={onUploadTheme}
            themeCss={themeCss}
            setThemeCss={setThemeCss}
            openStaticPage={openStaticPage}
          />
        )}

        {settingsTab === "voice" && (
          <VoiceSettingsSection
            audioInputDeviceId={audioInputDeviceId}
            setAudioInputDeviceId={setAudioInputDeviceId}
            audioInputDevices={audioInputDevices}
            audioOutputDeviceId={audioOutputDeviceId}
            setAudioOutputDeviceId={setAudioOutputDeviceId}
            audioOutputDevices={audioOutputDevices}
            isMicMonitorActive={isMicMonitorActive}
            toggleMicMonitor={toggleMicMonitor}
            isInVoiceChannel={isInVoiceChannel}
            micGain={micGain}
            setMicGain={setMicGain}
            micSensitivity={micSensitivity}
            setMicSensitivity={setMicSensitivity}
            noiseSuppressionEnabled={noiseSuppressionEnabled}
            setNoiseSuppressionEnabled={setNoiseSuppressionEnabled}
            noiseSuppressionPreset={noiseSuppressionPreset}
            applyNoiseSuppressionPreset={applyNoiseSuppressionPreset}
            noiseSuppressionConfig={noiseSuppressionConfig}
            updateNoiseSuppressionConfig={updateNoiseSuppressionConfig}
            localAudioProcessingInfo={localAudioProcessingInfo}
          />
        )}

        {settingsTab === "billing" && (
          <BillingSettingsSection
            boostStatus={boostStatus}
            boostLoading={boostLoading}
            startBoostCheckout={startBoostCheckout}
            openBoostPortal={openBoostPortal}
            loadBoostStatus={loadBoostStatus}
            startBoostGiftCheckout={startBoostGiftCheckout}
            boostGiftCheckoutBusy={boostGiftCheckoutBusy}
            loadSentBoostGifts={loadSentBoostGifts}
            boostGiftCode={boostGiftCode}
            setBoostGiftCode={setBoostGiftCode}
            previewBoostGift={previewBoostGift}
            boostGiftLoading={boostGiftLoading}
            boostGiftPreview={boostGiftPreview}
            setBoostGiftPrompt={setBoostGiftPrompt}
            boostGiftSent={boostGiftSent}
            buildBoostGiftUrl={buildBoostGiftUrl}
            setStatus={setStatus}
          />
        )}

        {settingsTab === "security" && (
          <SecuritySettingsSection
            lastLoginInfo={lastLoginInfo}
            showPasswordChange={showPasswordChange}
            setShowPasswordChange={setShowPasswordChange}
            currentPassword={currentPassword}
            setCurrentPassword={setCurrentPassword}
            newPassword={newPassword}
            setNewPassword={setNewPassword}
            confirmPassword={confirmPassword}
            setConfirmPassword={setConfirmPassword}
            userEmail={me?.email || ""}
            onSendPasswordResetLink={requestPasswordReset}
            api={api}
            accessToken={accessToken}
            setStatus={setStatus}
            securitySettings={securitySettings}
            show2FASetup={show2FASetup}
            twoFactorVerified={twoFactorVerified}
            initiate2FASetup={initiate2FASetup}
            twoFactorQRCode={twoFactorQRCode}
            twoFactorToken={twoFactorToken}
            setTwoFactorToken={setTwoFactorToken}
            backupCodes={backupCodes}
            setTwoFactorSecret={setTwoFactorSecret}
            setBackupCodes={setBackupCodes}
            confirm2FA={confirm2FA}
            disable2FA={disable2FA}
            activeSessions={activeSessions}
            confirmDialog={confirmDialog}
          />
        )}

        <p className="status">{status}</p>
      </SettingsOverlay>
    </div>
  );
}
