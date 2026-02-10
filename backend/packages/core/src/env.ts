import { z } from "zod";

const Env = z.object({
  CORE_PORT: z.coerce.number().default(3001),
  CORE_DATABASE_URL: z.string().min(1),
  CORE_JWT_ACCESS_SECRET: z.string().min(16),
  CORE_JWT_REFRESH_SECRET: z.string().min(16),

  CORE_MEMBERSHIP_PRIVATE_JWK: z.string().min(1),
  CORE_MEMBERSHIP_PUBLIC_JWK: z.string().min(1),
  CORE_ISSUER: z.string().min(1),
  ADMIN_PANEL_PASSWORD: z.string().min(8),
  REDIS_URL: z.string().url().optional()
});

export const env = Env.parse(process.env);
