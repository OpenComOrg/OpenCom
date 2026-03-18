import { z } from "zod";

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

const Env = z.object({
  CORE_PORT: z.coerce.number().default(3001),
  CORE_HOST: z.string().default("127.0.0.1"),
  /** Host for WebSocket gateway only. Use 0.0.0.0 so it's reachable externally; main API stays on CORE_HOST. */
  CORE_GATEWAY_HOST: z.string().default("0.0.0.0"),
  /** Port for WebSocket gateway only. Default 9443 to avoid conflicting with nginx/other on 443; point ws.opencom.online to this port or proxy 443→9443. */
  CORE_GATEWAY_PORT: z.coerce.number().default(9443),
  /** Optional TLS cert file for native wss listener. If both cert+key are set, gateway serves HTTPS/WSS directly. */
  CORE_GATEWAY_TLS_CERT_FILE: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  /** Optional TLS key file for native wss listener. */
  CORE_GATEWAY_TLS_KEY_FILE: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  CORE_DATABASE_URL: z.string().min(1),
  CORE_LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("warn"),
  CORE_LOG_DIR: z.string().default("./logs"),
  CORE_LOG_TO_FILE: boolFlag.default(true),
  CORE_JWT_ACCESS_SECRET: z.string().min(16),
  CORE_JWT_REFRESH_SECRET: z.string().min(16),

  CORE_MEMBERSHIP_PRIVATE_JWK: z.string().min(1),
  CORE_MEMBERSHIP_PUBLIC_JWK: z.string().min(1),
  CORE_ISSUER: z.string().min(1),
  ADMIN_PANEL_PASSWORD: z.string().min(8),
  REDIS_URL: z.string().url(),
  CORE_NODE_SYNC_SECRET: z.preprocess(emptyToUndefined, z.string().min(16).optional()),

  // Profile image storage
  PROFILE_IMAGE_STORAGE_DIR: z.string().default("./storage/profiles"),
  PROFILE_IMAGE_BASE_URL: z.string().default("/v1/profile-images"),

  // General attachment storage (channel + social DM uploads)
  ATTACHMENT_MAX_BYTES: z.coerce.number().int().min(1024).default(50 * 1024 * 1024),
  ATTACHMENT_BOOST_MAX_BYTES: z.coerce.number().int().min(1024).default(100 * 1024 * 1024),
  ATTACHMENT_TTL_DAYS: z.coerce.number().int().min(1).default(365),
  ATTACHMENT_STORAGE_DIR: z.string().default("./data/attachments"),

  // Official server node (one server per user hosted by the platform)
  OFFICIAL_NODE_BASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  /** Must match NODE_SERVER_ID on that node so the node accepts the membership token */
  OFFICIAL_NODE_SERVER_ID: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
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
