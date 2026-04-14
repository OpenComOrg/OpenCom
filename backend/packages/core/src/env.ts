import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { z } from "zod";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isCloudRun = Boolean(process.env.K_SERVICE || process.env.CLOUD_RUN_JOB || process.env.CLOUD_RUN_EXECUTION);

export const coreEnvFilePath = loadCoreEnv();

const emptyToUndefined = (value: unknown) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};

function loadCoreEnv() {
  const candidates = [
    process.env.CORE_ENV_FILE,
    // Prefer service-specific env files.
    path.resolve(process.cwd(), "core.env"),
    path.resolve(process.cwd(), ".env.core"),
    // Prefer the backend root .env when the process is launched from backend/.
    path.resolve(process.cwd(), ".env"),
    // Source-tree layout: packages/core/src -> backend/core.env
    path.resolve(__dirname, "../../../core.env"),
    path.resolve(__dirname, "../../../.env.core"),
    // Source-tree layout: packages/core/src -> backend/.env
    path.resolve(__dirname, "../../../.env"),
    // Built layout: packages/core/dist/core/src -> backend/core.env
    path.resolve(__dirname, "../../../../../core.env"),
    path.resolve(__dirname, "../../../../../.env.core"),
    // Built layout: packages/core/dist/core/src -> backend/.env
    path.resolve(__dirname, "../../../../../.env"),
    // Package-local fallbacks.
    path.resolve(__dirname, "../core.env"),
    path.resolve(__dirname, "../../core.env"),
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

const boolFlag = z.preprocess(
  (value) => {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value === 1;
    if (typeof value === "string") return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
    return false;
  },
  z.boolean()
);

const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  CORE_PORT: z.preprocess((value) => value ?? process.env.PORT, z.coerce.number().default(3000)),
  CORE_HOST: z.preprocess(
    (value) => value ?? (isCloudRun ? "0.0.0.0" : undefined),
    z.string().default("127.0.0.1")
  ),
  /** Host for WebSocket gateway only. Use 0.0.0.0 so it's reachable externally; main API stays on CORE_HOST. */
  CORE_GATEWAY_HOST: z.string().default("0.0.0.0"),
  /** Port for WebSocket gateway only. Default 9443 to avoid conflicting with nginx/other on 443; point ws.opencom.online to this port or proxy 443→9443. */
  CORE_GATEWAY_PORT: z.coerce.number().default(9443),
  /** Optional TLS cert file for native wss listener. If both cert+key are set, gateway serves HTTPS/WSS directly. */
  CORE_GATEWAY_TLS_CERT_FILE: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  /** Optional TLS key file for native wss listener. */
  CORE_GATEWAY_TLS_KEY_FILE: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(3306),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string(),
  DB_NAME: z.string().min(1),
  CORE_LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("warn"),
  CORE_LOG_DIR: z.string().default("./logs"),
  CORE_LOG_TO_FILE: z.preprocess(
    (value) => value ?? (isCloudRun ? "0" : undefined),
    boolFlag.default(true)
  ),
  DEPLOYMENT_PROVIDER: z.preprocess(emptyToUndefined, z.string().optional()),
  DEPLOYMENT_COMPUTE_CLASS: z.preprocess(emptyToUndefined, z.string().optional()),
  DEPLOYMENT_REGION: z.preprocess(
    (value) =>
      value ??
      process.env.AWS_REGION ??
      process.env.AWS_DEFAULT_REGION ??
      process.env.S3_REGION,
    z.preprocess(emptyToUndefined, z.string().optional())
  ),
  DEPLOYMENT_STACK_NAME: z.preprocess(emptyToUndefined, z.string().optional()),
  DEPLOYMENT_OS_NAME: z.preprocess(emptyToUndefined, z.string().optional()),
  CORE_JWT_ACCESS_SECRET: z.string().min(16),
  CORE_JWT_REFRESH_SECRET: z.string().min(16),

  CORE_MEMBERSHIP_PRIVATE_JWK: z.string().min(1),
  CORE_MEMBERSHIP_PUBLIC_JWK: z.string().min(1),
  CORE_ISSUER: z.string().min(1),
  ADMIN_PANEL_PASSWORD: z.string().min(8),
  ADMIN_2FA_ENCRYPTION_KEY: z.preprocess(emptyToUndefined, z.string().min(16).optional()),
  ADMIN_2FA_ISSUER: z.string().default("OpenCom Admin"),
  REDIS_DISABLED: boolFlag.default(false),
  REDIS_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  CORE_NODE_SYNC_SECRET: z.preprocess(emptyToUndefined, z.string().min(16).optional()),

  // Profile image storage
  PROFILE_IMAGE_STORAGE_DIR: z.string().default("./storage/profiles"),
  PROFILE_IMAGE_BASE_URL: z.string().default("/v1/profile-images"),

  // General attachment storage (channel + social DM uploads)
  ATTACHMENT_MAX_BYTES: z.coerce.number().int().min(1024).default(50 * 1024 * 1024),
  ATTACHMENT_BOOST_MAX_BYTES: z.coerce.number().int().min(1024).default(100 * 1024 * 1024),
  CLIENT_UPLOAD_MAX_BYTES: z.coerce.number().int().min(1024).default(500 * 1024 * 1024),
  ATTACHMENT_TTL_DAYS: z.coerce.number().int().min(1).default(365),
  ATTACHMENT_STORAGE_DIR: z.string().default("./data/attachments"),
  STORAGE_PROVIDER: z.enum(["local", "s3", "gcs", "cdn"]).default("local"),
  CORE_STORAGE_BUCKET: z.preprocess(
    (value) =>
      value ??
      process.env.CORE_GCS_BUCKET ??
      process.env.CORE_S3_BUCKET ??
      process.env.S3_BUCKET,
    z.preprocess(emptyToUndefined, z.string().min(1).optional())
  ),
  CORE_S3_BUCKET: z.preprocess(
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

  // Official server node (one server per user hosted by the platform)
  OFFICIAL_NODE_BASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  /** Must match NODE_SERVER_ID on that node so the node accepts the membership token */
  OFFICIAL_NODE_SERVER_ID: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  MEDIA_SERVER_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  MEDIA_WS_URL: z.preprocess(emptyToUndefined, z.string().optional()),
  MEDIA_TOKEN_SECRET: z.preprocess(emptyToUndefined, z.string().min(16).optional()),
  MEDIA_TOKEN_ISSUER: z.string().default("opencom-media"),
  MEDIA_TOKEN_AUDIENCE: z.preprocess(emptyToUndefined, z.string().optional()),
  MEDIA_TOKEN_TTL_SECONDS: z.coerce.number().default(300),
  /**
   * The ID of the system guild (is_system=1) that lives on the official node and is used
   * exclusively to host ephemeral voice channels for private (1:1) calls.
   * Run `scripts/create-private-calls-guild.mjs` once to bootstrap it, then paste the
   * returned guild ID here.  Without this set, /call/create will still record the call in
   * the DB but will not provision a real voice channel on the node.
   */
  PRIVATE_CALLS_GUILD_ID: z.preprocess(emptyToUndefined, z.string().min(1).optional()),

  // Stripe subscriptions (OpenCom Boost)
  STRIPE_SECRET_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  STRIPE_PRICE_ID_BOOST_GBP_10: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  STRIPE_SUCCESS_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  STRIPE_CANCEL_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  STRIPE_CUSTOMER_PORTAL_RETURN_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),

  // Klipy media search
  KLIPY_API_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  KLIPY_API_BASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  KLIPY_CLIENT_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),

  // Auth email verification
  AUTH_REQUIRE_EMAIL_VERIFICATION: boolFlag.default(true),
  AUTH_EMAIL_VERIFICATION_TOKEN_TTL_MINUTES: z.coerce.number().int().min(5).max(1440).default(60),
  AUTH_PASSWORD_RESET_TOKEN_TTL_MINUTES: z.coerce.number().int().min(5).max(1440).default(60),
  APP_BASE_URL: z.string().url().default("http://localhost:5173"),
  SUPPORT_BASE_URL: z.string().url().default("https://support.opencom.online"),
  LINK_PREVIEW_SERVICE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  LINK_PREVIEW_INTERNAL_TOKEN: z.preprocess(
    (value) => value ?? process.env.CORE_NODE_SYNC_SECRET,
    z.preprocess(emptyToUndefined, z.string().min(16).optional())
  ),
  DOWNLOADS_SERVICE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  DOWNLOADS_INTERNAL_TOKEN: z.preprocess(
    (value) => value ?? process.env.CORE_NODE_SYNC_SECRET,
    z.preprocess(emptyToUndefined, z.string().min(16).optional())
  ),
  THEMES_SERVICE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  THEMES_INTERNAL_TOKEN: z.preprocess(
    (value) => value ?? process.env.CORE_NODE_SYNC_SECRET,
    z.preprocess(emptyToUndefined, z.string().min(16).optional())
  ),
  SMTP_HOST: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: boolFlag.default(false),
  SMTP_USER: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  SMTP_PASS: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  SMTP_FROM: z.preprocess(emptyToUndefined, z.string().min(1).optional()),

  // Public downloadable desktop artifacts served by core (/downloads/:filename)
  DOWNLOADS_STORAGE_DIR: z.string().default("frontend/public/downloads")
});

export const env = Env.parse(process.env);

if (env.STORAGE_PROVIDER === "s3") {
  if (!(env.CORE_STORAGE_BUCKET || env.CORE_S3_BUCKET)) {
    throw new Error("CORE_STORAGE_BUCKET/CORE_S3_BUCKET (or S3_BUCKET) is required when STORAGE_PROVIDER=s3");
  }
  if (!env.S3_REGION) {
    throw new Error("S3_REGION is required when STORAGE_PROVIDER=s3");
  }
}

if (env.STORAGE_PROVIDER === "gcs" && !env.CORE_STORAGE_BUCKET) {
  throw new Error("CORE_STORAGE_BUCKET (or CORE_GCS_BUCKET) is required when STORAGE_PROVIDER=gcs");
}

if (env.STORAGE_PROVIDER === "cdn") {
  if (!(env.CORE_STORAGE_BUCKET || env.CORE_S3_BUCKET)) {
    throw new Error("CORE_STORAGE_BUCKET/CORE_S3_BUCKET (or S3_BUCKET) is required when STORAGE_PROVIDER=cdn");
  }
  if (!env.CDN_SHARED_TOKEN) {
    throw new Error("CDN_SHARED_TOKEN is required when STORAGE_PROVIDER=cdn");
  }
}

if (!env.REDIS_DISABLED && !env.REDIS_URL) {
  throw new Error("REDIS_URL is required unless REDIS_DISABLED=1");
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

export const resolvedMediaServerUrl = normalizeHttpBaseUrl(
  env.MEDIA_SERVER_URL || env.OFFICIAL_NODE_BASE_URL,
);
export const resolvedMediaWsUrl = normalizeWsUrl(
  env.MEDIA_WS_URL || env.MEDIA_SERVER_URL || env.OFFICIAL_NODE_BASE_URL,
);
