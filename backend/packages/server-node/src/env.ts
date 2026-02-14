import { z } from "zod";

const Env = z.object({
  NODE_PORT: z.coerce.number().default(3002),
  NODE_HOST: z.string().default("0.0.0.0"),
  NODE_DATABASE_URL: z.string().min(1),
  NODE_ID: z.string().min(1),

  CORE_BASE_URL: z.string().url(),
  CORE_JWKS_URL: z.string().url(),
  NODE_SYNC_SECRET: z.string().min(16).optional(),


  ATTACHMENT_MAX_BYTES: z.coerce.number().default(52428800),
  ATTACHMENT_TTL_DAYS: z.coerce.number().default(365),
  ATTACHMENT_STORAGE_DIR: z.string().default("./data/attachments"),
  PUBLIC_BASE_URL: z.string().url(),
  NODE_SERVER_ID: z.string().min(1),

  MEDIASOUP_LISTEN_IP: z.string().default("0.0.0.0"),
  MEDIASOUP_ANNOUNCED_IP: z.string().optional(),
  MEDIASOUP_RTC_MIN_PORT: z.coerce.number().default(40000),
  MEDIASOUP_RTC_MAX_PORT: z.coerce.number().default(40100)

});

export const env = Env.parse(process.env);
