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
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NODE_PORT: z.coerce.number().default(3002),
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
  PUBLIC_BASE_URL: z.string().url(),
  NODE_SERVER_ID: z.string().min(1),

  MEDIASOUP_LISTEN_IP: z.string().default("0.0.0.0"),
  MEDIASOUP_ANNOUNCED_IP: z.preprocess(emptyToUndefined, z.string().optional()),
  MEDIASOUP_RTC_MIN_PORT: z.coerce.number().default(40000),
  MEDIASOUP_RTC_MAX_PORT: z.coerce.number().default(40100),

  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  DEBUG_HTTP: boolFlag.default(false),
  DEBUG_VOICE: boolFlag.default(false)
});

export const env = Env.parse(process.env);

if (env.MEDIASOUP_RTC_MIN_PORT > env.MEDIASOUP_RTC_MAX_PORT) {
  throw new Error(`INVALID_MEDIASOUP_PORT_RANGE:${env.MEDIASOUP_RTC_MIN_PORT}>${env.MEDIASOUP_RTC_MAX_PORT}`);
}
