import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { isIP } from "node:net";
import { z } from "zod";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isCloudRun = Boolean(process.env.K_SERVICE || process.env.CLOUD_RUN_JOB || process.env.CLOUD_RUN_EXECUTION);
export const nodeEnvFilePath = loadNodeEnv();

const emptyToUndefined = (value: unknown) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};

const boolFlag = z.preprocess(
  (value) => {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value === 1;
    if (typeof value === "string") return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
    return false;
  },
  z.boolean()
);

function loadNodeEnv() {
  const candidates = [
    process.env.NODE_ENV_FILE,
    path.resolve(process.cwd(), "node.env"),
    path.resolve(process.cwd(), ".env.node"),
    path.resolve(process.cwd(), ".env"),
    path.resolve(__dirname, "../../../node.env"),
    path.resolve(__dirname, "../../../.env.node"),
    path.resolve(__dirname, "../../../.env"),
    path.resolve(__dirname, "../../../../../node.env"),
    path.resolve(__dirname, "../../../../../.env.node"),
    path.resolve(__dirname, "../../../../../.env"),
    path.resolve(__dirname, "../node.env"),
    path.resolve(__dirname, "../../node.env"),
    path.resolve(__dirname, "../.env"),
    path.resolve(__dirname, "../../.env"),
  ];

  for (const candidate of new Set(candidates)) {
    if (typeof candidate !== "string" || candidate.length === 0) continue;
    if (!fs.existsSync(candidate)) continue;
    config({ path: candidate, override: true });
    return candidate;
  }

  return null;
}

const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NODE_PORT: z.preprocess(
    (value) => value ?? process.env.PORT,
    z.coerce.number().default(3002)
  ),
  NODE_HOST: z.string().default("0.0.0.0"),
  NODE_DATABASE_URL: z.string().min(1),
  NODE_ID: z.string().min(1),

  CORE_BASE_URL: z.string().url(),
  CORE_JWKS_URL: z.string().url(),
  NODE_SYNC_SECRET: z.preprocess(emptyToUndefined, z.string().min(16).optional()),

  ATTACHMENT_MAX_BYTES: z.coerce.number().default(52428800),
  ATTACHMENT_BOOST_MAX_BYTES: z.coerce.number().default(104857600),
  ATTACHMENT_TTL_DAYS: z.coerce.number().default(365),
  ATTACHMENT_STORAGE_DIR: z.string().default("./data/attachments"),
  STORAGE_PROVIDER: z.enum(["local", "s3", "gcs", "cdn"]).default("local"),
  NODE_STORAGE_BUCKET: z.preprocess(
    (value) =>
      value ??
      process.env.NODE_GCS_BUCKET ??
      process.env.NODE_S3_BUCKET ??
      process.env.S3_BUCKET,
    z.preprocess(emptyToUndefined, z.string().min(1).optional())
  ),
  NODE_S3_BUCKET: z.preprocess(
    (value) => value ?? process.env.S3_BUCKET,
    z.preprocess(emptyToUndefined, z.string().min(1).optional())
  ),
  GCS_PROJECT_ID: z.preprocess(
    (value) =>
      value ??
      process.env.GOOGLE_CLOUD_PROJECT ??
      process.env.GCLOUD_PROJECT,
    z.preprocess(emptyToUndefined, z.string().min(1).optional())
  ),
  S3_REGION: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  S3_ENDPOINT: z.preprocess(emptyToUndefined, z.string().url().optional()),
  S3_ACCESS_KEY_ID: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  S3_SECRET_ACCESS_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  S3_FORCE_PATH_STYLE: boolFlag.default(false),
  S3_KEY_PREFIX: z.preprocess(emptyToUndefined, z.string().optional()),
  CDN_BASE_URL: z.string().url().default("https://cdn.opencom.online"),
  CDN_SHARED_TOKEN: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  PUBLIC_BASE_URL: z.string().url(),
  NODE_SERVER_ID: z.string().min(1),
  MEDIA_SERVER_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  MEDIA_WS_URL: z.preprocess(emptyToUndefined, z.string().optional()),
  MEDIA_TOKEN_SECRET: z.preprocess(emptyToUndefined, z.string().min(16).optional()),
  MEDIA_TOKEN_ISSUER: z.string().default("opencom-media"),
  MEDIA_TOKEN_AUDIENCE: z.preprocess(emptyToUndefined, z.string().optional()),
  MEDIA_TOKEN_TTL_SECONDS: z.coerce.number().default(300),
  MEDIA_SYNC_SECRET: z.preprocess(
    (value) => value ?? process.env.NODE_SYNC_SECRET,
    z.preprocess(emptyToUndefined, z.string().min(16).optional())
  ),
  VOICE_STUN_URLS: z.preprocess(
    emptyToUndefined,
    z.string().default("stun:stun.l.google.com:19302")
  ),
  VOICE_TURN_URLS: z.preprocess(emptyToUndefined, z.string().optional()),
  VOICE_TURN_SECRET: z.preprocess(emptyToUndefined, z.string().min(16).optional()),
  VOICE_TURN_TTL_SECONDS: z.coerce.number().int().positive().default(3600),

  MEDIASOUP_LISTEN_IP: z.string().default("0.0.0.0"),
  MEDIASOUP_ANNOUNCED_ADDRESS: z.preprocess(emptyToUndefined, z.string().optional()),
  MEDIASOUP_ANNOUNCED_IP: z.preprocess(emptyToUndefined, z.string().optional()),
  MEDIASOUP_RTC_MIN_PORT: z.coerce.number().default(40000),
  MEDIASOUP_RTC_MAX_PORT: z.coerce.number().default(40100),
  MEDIASOUP_ENABLE_UDP: boolFlag.default(true),
  MEDIASOUP_ENABLE_TCP: boolFlag.default(true),
  MEDIASOUP_PREFER_UDP: boolFlag.default(true),

  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("warn"),
  LOG_DIR: z.string().default("./logs"),
  LOG_TO_FILE: z.preprocess(
    (value) => value ?? (isCloudRun ? "0" : undefined),
    boolFlag.default(true)
  ),
  DEBUG_HTTP: boolFlag.default(false),
  DEBUG_VOICE: boolFlag.default(false)
});

export const env = Env.parse(process.env);

if (env.STORAGE_PROVIDER === "s3") {
  if (!(env.NODE_STORAGE_BUCKET || env.NODE_S3_BUCKET)) {
    throw new Error("NODE_STORAGE_BUCKET/NODE_S3_BUCKET (or S3_BUCKET) is required when STORAGE_PROVIDER=s3");
  }
  if (!env.S3_REGION) {
    throw new Error("S3_REGION is required when STORAGE_PROVIDER=s3");
  }
}

if (env.STORAGE_PROVIDER === "gcs" && !env.NODE_STORAGE_BUCKET) {
  throw new Error("NODE_STORAGE_BUCKET (or NODE_GCS_BUCKET) is required when STORAGE_PROVIDER=gcs");
}

if (env.STORAGE_PROVIDER === "cdn") {
  if (!(env.NODE_STORAGE_BUCKET || env.NODE_S3_BUCKET)) {
    throw new Error("NODE_STORAGE_BUCKET/NODE_S3_BUCKET (or S3_BUCKET) is required when STORAGE_PROVIDER=cdn");
  }
  if (!env.CDN_SHARED_TOKEN) {
    throw new Error("CDN_SHARED_TOKEN is required when STORAGE_PROVIDER=cdn");
  }
}

if (env.MEDIASOUP_RTC_MIN_PORT > env.MEDIASOUP_RTC_MAX_PORT) {
  throw new Error(`INVALID_MEDIASOUP_PORT_RANGE:${env.MEDIASOUP_RTC_MIN_PORT}>${env.MEDIASOUP_RTC_MAX_PORT}`);
}

if (!env.MEDIASOUP_ENABLE_UDP && !env.MEDIASOUP_ENABLE_TCP) {
  throw new Error("INVALID_MEDIASOUP_TRANSPORT_CONFIG:NO_PROTOCOLS_ENABLED");
}

function stripAddressBrackets(value: string) {
  return String(value || "").trim().replace(/^\[(.*)\]$/, "$1");
}

function normalizeHttpBaseUrl(value: string | null | undefined): string {
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

function normalizeWsUrl(value: string | null | undefined): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === "http:") parsed.protocol = "ws:";
    if (parsed.protocol === "https:") parsed.protocol = "wss:";
    if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") return "";
    parsed.pathname = "/gateway";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function isLoopbackHostname(hostname: string) {
  const normalized = stripAddressBrackets(hostname).toLowerCase();
  if (!normalized) return false;
  return normalized === "localhost"
    || normalized === "::1"
    || normalized === "0:0:0:0:0:0:0:1"
    || normalized.startsWith("127.");
}

function isUnspecifiedHostname(hostname: string) {
  const normalized = stripAddressBrackets(hostname).toLowerCase();
  return normalized === "0.0.0.0" || normalized === "::" || normalized === "";
}

function isPrivateIpv4Address(address: string) {
  if (isIP(address) !== 4) return false;
  const octets = address.split(".").map((part) => Number(part));
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part))) return false;
  return octets[0] === 10
    || octets[0] === 127
    || octets[0] === 0
    || (octets[0] === 169 && octets[1] === 254)
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168)
    || (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127);
}

function isPrivateIpv6Address(address: string) {
  if (isIP(address) !== 6) return false;
  const normalized = stripAddressBrackets(address).toLowerCase();
  return normalized === "::1"
    || normalized.startsWith("fc")
    || normalized.startsWith("fd")
    || normalized.startsWith("fe8")
    || normalized.startsWith("fe9")
    || normalized.startsWith("fea")
    || normalized.startsWith("feb");
}

export type MediasoupAnnouncedAddressSource =
  | "MEDIASOUP_ANNOUNCED_ADDRESS"
  | "MEDIASOUP_ANNOUNCED_IP"
  | "PUBLIC_BASE_URL"
  | null;

export type MediasoupAnnouncedAddressKind =
  | "missing"
  | "loopback"
  | "unspecified"
  | "private"
  | "public-ip"
  | "hostname";

type ResolvedMediasoupAnnouncedAddress = {
  address: string | undefined;
  source: MediasoupAnnouncedAddressSource;
};

function resolveMediasoupAnnouncedAddress(): ResolvedMediasoupAnnouncedAddress {
  if (env.MEDIASOUP_ANNOUNCED_ADDRESS) {
    return {
      address: env.MEDIASOUP_ANNOUNCED_ADDRESS,
      source: "MEDIASOUP_ANNOUNCED_ADDRESS",
    };
  }
  if (env.MEDIASOUP_ANNOUNCED_IP) {
    return {
      address: env.MEDIASOUP_ANNOUNCED_IP,
      source: "MEDIASOUP_ANNOUNCED_IP",
    };
  }
  try {
    const parsed = new URL(env.PUBLIC_BASE_URL);
    if (isLoopbackHostname(parsed.hostname) || isUnspecifiedHostname(parsed.hostname)) {
      return { address: undefined, source: null };
    }
    return {
      address: parsed.hostname || undefined,
      source: parsed.hostname ? "PUBLIC_BASE_URL" : null,
    };
  } catch {
    return { address: undefined, source: null };
  }
}

function classifyMediasoupAnnouncedAddress(address?: string): MediasoupAnnouncedAddressKind {
  const normalized = stripAddressBrackets(address || "").toLowerCase();
  if (!normalized) return "missing";
  if (isLoopbackHostname(normalized)) return "loopback";
  if (isUnspecifiedHostname(normalized)) return "unspecified";
  if (isPrivateIpv4Address(normalized) || isPrivateIpv6Address(normalized)) {
    return "private";
  }
  return isIP(normalized) ? "public-ip" : "hostname";
}

const resolvedAnnouncedAddress = resolveMediasoupAnnouncedAddress();

export const resolvedMediasoupAnnouncedAddress = resolvedAnnouncedAddress.address;
export const resolvedMediasoupAnnouncedAddressSource = resolvedAnnouncedAddress.source;
export const resolvedMediasoupAnnouncedAddressKind = classifyMediasoupAnnouncedAddress(
  resolvedMediasoupAnnouncedAddress,
);
export const resolvedMediasoupAnnouncedIp = resolvedMediasoupAnnouncedAddress;
export const configuredMediaServerUrl = normalizeHttpBaseUrl(env.MEDIA_SERVER_URL);
export const resolvedMediaServerUrl = normalizeHttpBaseUrl(
  env.MEDIA_SERVER_URL || env.PUBLIC_BASE_URL,
);
export const configuredMediaWsUrl = normalizeWsUrl(
  env.MEDIA_WS_URL || env.MEDIA_SERVER_URL,
);
export const resolvedMediaWsUrl = normalizeWsUrl(
  env.MEDIA_WS_URL || env.MEDIA_SERVER_URL || env.PUBLIC_BASE_URL,
);

export type MediasoupNetworkingWarning = {
  code: string;
  message: string;
};

export const mediasoupNetworkingWarnings: MediasoupNetworkingWarning[] = (() => {
  const warnings: MediasoupNetworkingWarning[] = [];

  if (resolvedMediasoupAnnouncedAddressKind === "missing") {
    warnings.push({
      code: "ANNOUNCED_ADDRESS_UNSET",
      message:
        "Mediasoup is not advertising a non-loopback address. External voice clients will fail unless PUBLIC_BASE_URL points directly at the reachable node address.",
    });
  } else if (resolvedMediasoupAnnouncedAddressKind === "loopback") {
    warnings.push({
      code: "ANNOUNCED_ADDRESS_LOOPBACK",
      message:
        "Mediasoup is advertising a loopback address. Only same-host clients can reach this voice node.",
    });
  } else if (resolvedMediasoupAnnouncedAddressKind === "unspecified") {
    warnings.push({
      code: "ANNOUNCED_ADDRESS_UNSPECIFIED",
      message:
        "Mediasoup is advertising an unspecified address such as 0.0.0.0 or ::, which browsers cannot use for ICE.",
    });
  } else if (resolvedMediasoupAnnouncedAddressKind === "private") {
    warnings.push({
      code: "ANNOUNCED_ADDRESS_PRIVATE",
      message:
        "Mediasoup is advertising a private address. Internet clients will fail unless they are on the same private network or behind explicit port-forwarding.",
    });
  }

  if (!env.MEDIASOUP_ENABLE_UDP) {
    warnings.push({
      code: "UDP_DISABLED",
      message:
        "UDP is disabled for mediasoup transports. Direct WebRTC connectivity becomes less reliable without TURN when clients are on restrictive networks.",
    });
  }

  return warnings;
})();
