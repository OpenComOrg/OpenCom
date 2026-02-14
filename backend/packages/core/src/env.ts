import { z } from "zod";

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
  OFFICIAL_NODE_SERVER_ID: z.string().min(1).optional()
});

export const env = Env.parse(process.env);
