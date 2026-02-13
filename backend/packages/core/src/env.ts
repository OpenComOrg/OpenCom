import { z } from "zod";

const Env = z.object({
  CORE_PORT: z.coerce.number().default(3001),
  CORE_HOST: z.string().default("127.0.0.1"),
  CORE_DATABASE_URL: z.string().min(1),
  CORE_JWT_ACCESS_SECRET: z.string().min(16),
  CORE_JWT_REFRESH_SECRET: z.string().min(16),

  CORE_MEMBERSHIP_PRIVATE_JWK: z.string().min(1),
  CORE_MEMBERSHIP_PUBLIC_JWK: z.string().min(1),
  CORE_ISSUER: z.string().min(1),
  ADMIN_PANEL_PASSWORD: z.string().min(8),
  REDIS_URL: z.string().url().optional(),
  
  // Profile image storage
  PROFILE_IMAGE_STORAGE_DIR: z.string().default("./storage/profiles"),
  PROFILE_IMAGE_BASE_URL: z.string().default("/v1/profile-images")
});

export const env = Env.parse(process.env);
