import { resolveCoreApiUrl } from "./config";
import type { CoreServer } from "./types";

const CORE_API = resolveCoreApiUrl().replace(/\/$/, "");

function toNormalizedBoolean(value: string | undefined): boolean {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

export function normalizeHttpBaseUrl(value = ""): string {
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

export function isLoopbackHostname(hostname = ""): boolean {
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

export function gatewayUrlToHttpBaseUrl(value = ""): string {
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

export function resolvePublicNodeBaseUrl(): string {
  const explicit = normalizeHttpBaseUrl(
    process.env.EXPO_PUBLIC_OPENCOM_PUBLIC_NODE_BASE_URL || "",
  );
  if (explicit) return explicit;

  const wsCandidates = [
    process.env.EXPO_PUBLIC_OPENCOM_NODE_GATEWAY_WS_URL,
    process.env.EXPO_PUBLIC_OPENCOM_VOICE_GATEWAY_URL,
  ];
  for (const candidate of wsCandidates) {
    const derived = gatewayUrlToHttpBaseUrl(candidate || "");
    if (derived) return derived;
  }
  return "";
}

export const PUBLIC_NODE_BASE_URL = resolvePublicNodeBaseUrl();

function shouldAllowLoopbackTargets(): boolean {
  if (toNormalizedBoolean(process.env.EXPO_PUBLIC_OPENCOM_ALLOW_LOOPBACK_TARGETS)) {
    return true;
  }

  try {
    const parsed = new URL(CORE_API);
    return isLoopbackHostname(parsed.hostname);
  } catch {
    return false;
  }
}

export function normalizeServerBaseUrl(baseUrl = ""): string {
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

export function normalizeServerRecord(
  server: CoreServer | null | undefined,
): CoreServer | null {
  if (!server) return null;
  const normalizedBaseUrl = normalizeServerBaseUrl(server.baseUrl);
  if (!normalizedBaseUrl || normalizedBaseUrl === server.baseUrl) return server;
  return {
    ...server,
    baseUrl: normalizedBaseUrl,
  };
}

export function normalizeServerList(list: CoreServer[]): CoreServer[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((server) => normalizeServerRecord(server))
    .filter((server): server is CoreServer => !!server);
}

function cleanResolvableUrl(url?: string | null): string | null {
  const trimmed = String(url || "").trim();
  if (
    !trimmed ||
    trimmed === "null" ||
    trimmed === "undefined" ||
    trimmed === "[object Object]"
  ) {
    return null;
  }
  return trimmed;
}

export function resolveUrlAgainstBase(
  url: string | null | undefined,
  baseUrl: string | null | undefined,
): string | null {
  const cleanedUrl = cleanResolvableUrl(url);
  if (!cleanedUrl) return null;

  if (
    cleanedUrl.startsWith("data:") ||
    cleanedUrl.startsWith("file:") ||
    cleanedUrl.startsWith("content:") ||
    cleanedUrl.startsWith("blob:")
  ) {
    return cleanedUrl;
  }

  if (/^https?:\/\//i.test(cleanedUrl)) return cleanedUrl;

  const normalizedBaseUrl = normalizeHttpBaseUrl(baseUrl || "");
  if (!normalizedBaseUrl) return cleanedUrl;

  try {
    return new URL(
      cleanedUrl,
      cleanedUrl.startsWith("/")
        ? normalizedBaseUrl
        : `${normalizedBaseUrl.replace(/\/$/, "")}/`,
    ).toString();
  } catch {
    return cleanedUrl;
  }
}

export function resolveCoreImageUrl(url: string | null | undefined): string | null {
  const cleanedUrl = cleanResolvableUrl(url);
  if (!cleanedUrl) return null;
  if (cleanedUrl.startsWith("users/")) {
    return `${CORE_API}/v1/profile-images/${cleanedUrl}`;
  }
  if (cleanedUrl.startsWith("/users/")) {
    return `${CORE_API}/v1/profile-images${cleanedUrl}`;
  }
  return resolveUrlAgainstBase(cleanedUrl, CORE_API);
}

export function resolveCoreAttachmentUrl(
  url: string | null | undefined,
): string | null {
  return resolveUrlAgainstBase(url, CORE_API);
}

export function resolveServerAttachmentUrl(
  url: string | null | undefined,
  serverBaseUrl: string | null | undefined,
): string | null {
  return resolveUrlAgainstBase(url, normalizeServerBaseUrl(serverBaseUrl || ""));
}
