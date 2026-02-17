import { z } from "zod";

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
  CORE_GATEWAY_TLS_CERT_FILE: z.string().min(1).optional(),
  /** Optional TLS key file for native wss listener. */
  CORE_GATEWAY_TLS_KEY_FILE: z.string().min(1).optional(),
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
  REDIS_URL: z.string().url().optional(),
  CORE_NODE_SYNC_SECRET: z.string().min(16).optional(),
  
  // Profile image storage
  PROFILE_IMAGE_STORAGE_DIR: z.string().default("./storage/profiles"),
  PROFILE_IMAGE_BASE_URL: z.string().default("/v1/profile-images"),

  // Official server node (one server per user hosted by the platform)
  OFFICIAL_NODE_BASE_URL: z.string().url().optional(),
  /** Must match NODE_SERVER_ID on that node so the node accepts the membership token */
  OFFICIAL_NODE_SERVER_ID: z.string().min(1).optional(),

  // Stripe subscriptions (OpenCom Boost)
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_PRICE_ID_BOOST_GBP_10: z.string().min(1).optional(),
  STRIPE_SUCCESS_URL: z.string().url().optional(),
  STRIPE_CANCEL_URL: z.string().url().optional(),
  STRIPE_CUSTOMER_PORTAL_RETURN_URL: z.string().url().optional(),

  // Auth email verification
  AUTH_REQUIRE_EMAIL_VERIFICATION: boolFlag.default(true),
  AUTH_EMAIL_VERIFICATION_TOKEN_TTL_MINUTES: z.coerce.number().int().min(5).max(1440).default(60),
  APP_BASE_URL: z.string().url().default("http://localhost:5173"),
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: boolFlag.default(false),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASS: z.string().min(1).optional(),
  SMTP_FROM: z.string().min(1).optional(),

  // Public downloadable desktop artifacts served by core (/downloads/:filename)
  DOWNLOADS_STORAGE_DIR: z.string().default("frontend/public/downloads")
});

export const env = Env.parse(process.env);
