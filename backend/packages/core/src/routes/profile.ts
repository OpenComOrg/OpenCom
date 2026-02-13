import { FastifyInstance } from "fastify";
import { z } from "zod";
import { q } from "../db.js";
import { parseBody } from "../validation.js";
import { env } from "../env.js";
import { saveProfileImage, deleteProfileImage, parseBase64Image } from "../storage.js";
import fs from "node:fs";
import path from "node:path";

const imageValue = z.string().max(6_000_000).refine((value) => {
  if (/^https?:\/\//i.test(value)) return true;
  if (/^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(value)) return true;
  return false;
}, "Invalid image format");

const UpdateProfile = z.object({
  displayName: z.string().min(1).max(64).nullable().optional(),
  bio: z.string().max(400).nullable().optional(),
  pfpUrl: imageValue.nullable().optional(),
  bannerUrl: imageValue.nullable().optional()
});

/** Extract relative path (users/userId/filename) from stored URL for deleteProfileImage */
function relPathFromStoredUrl(stored: string | null): string | null {
  if (!stored || stored.startsWith("http")) return null;
  const base = env.PROFILE_IMAGE_BASE_URL.replace(/\/$/, "");
  if (stored.startsWith(base + "/")) return stored.slice(base.length).replace(/^\//, "") || null;
  if (stored.startsWith("users/")) return stored;
  return null;
}

export async function profileRoutes(app: FastifyInstance) {
  // Serve stored profile images: /v1/profile-images/users/{userId}/{filename}
  app.get("/v1/profile-images/users/:userId/:filename", async (req: any, rep) => {
    const { userId, filename } = z.object({
      userId: z.string().min(3),
      filename: z.string().min(1)
    }).parse(req.params);

    const relPath = `users/${userId}/${filename}`;
    const filepath = path.join(env.PROFILE_IMAGE_STORAGE_DIR, relPath);

    // Prevent directory traversal
    const normDir = path.resolve(env.PROFILE_IMAGE_STORAGE_DIR);
    const normFile = path.resolve(filepath);
    if (!normFile.startsWith(normDir)) {
      return rep.code(403).send({ error: "FORBIDDEN" });
    }

    if (!fs.existsSync(filepath)) {
      return rep.code(404).send({ error: "NOT_FOUND" });
    }

    const ext = path.extname(filename).toLowerCase();
    const mime: Record<string, string> = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".svg": "image/svg+xml"
    };
    if (mime[ext]) rep.header("Content-Type", mime[ext]);
    rep.header("Cache-Control", "public, max-age=31536000, immutable");
    return rep.sendFile(filepath);
  });

  app.get("/v1/users/:id/profile", async (req, rep) => {
    const { id } = z.object({ id: z.string().min(3) }).parse(req.params);

    const u = await q<any>(
      `SELECT id, username, display_name, bio, pfp_url, banner_url, created_at FROM users WHERE id=:id`,
      { id }
    );
    if (!u.length) return rep.code(404).send({ error: "NOT_FOUND" });

    const badges = await q<{ badge: string }>(`SELECT badge FROM user_badges WHERE user_id=:id`, { id });

    const founder = await q<{ founder_user_id: string | null }>(`SELECT founder_user_id FROM platform_config WHERE id=1`);
    const isOwner = founder.length && founder[0].founder_user_id === id;
    const isAdmin = !!(await q<{ user_id: string }>(`SELECT user_id FROM platform_admins WHERE user_id=:id`, { id })).length;

    return {
      id: u[0].id,
      username: u[0].username,
      displayName: u[0].display_name ?? null,
      bio: u[0].bio ?? null,
      pfpUrl: u[0].pfp_url ?? null,
      bannerUrl: u[0].banner_url ?? null,
      createdAt: u[0].created_at ?? null,
      badges: badges.map(b => b.badge),
      platformRole: isOwner ? "owner" : (isAdmin ? "admin" : "user"),
      platformTitle: isOwner ? "Platform Owner" : (isAdmin ? "Platform Admin" : null)
    };
  });

  app.patch("/v1/me/profile", { preHandler: [app.authenticate] } as any, async (req: any) => {
    const userId = req.user.sub as string;
    const body = parseBody(UpdateProfile, req.body);

    // Get current URLs to clean up old images
    const current = await q<{ pfp_url: string | null; banner_url: string | null }>(
      `SELECT pfp_url, banner_url FROM users WHERE id=:userId`,
      { userId }
    );

    let pfpUrl = current[0]?.pfp_url ?? null;
    let bannerUrl = current[0]?.banner_url ?? null;

    // Process PFP upload
    if (body.pfpUrl !== undefined) {
      if (body.pfpUrl === null) {
        // Explicitly removing pfp
        const oldRel = relPathFromStoredUrl(pfpUrl);
        if (oldRel) deleteProfileImage(env.PROFILE_IMAGE_STORAGE_DIR, oldRel);
        pfpUrl = null;
      } else if (body.pfpUrl.startsWith("data:image/")) {
        // Base64 image upload
        const saved = saveProfileImage(env.PROFILE_IMAGE_STORAGE_DIR, userId, "pfp", body.pfpUrl);
        if (saved) {
          const oldRel = relPathFromStoredUrl(pfpUrl);
          if (oldRel) deleteProfileImage(env.PROFILE_IMAGE_STORAGE_DIR, oldRel);
          pfpUrl = `${env.PROFILE_IMAGE_BASE_URL}/${saved}`;
        } else {
          return rep.code(400).send({ error: "INVALID_IMAGE", field: "pfpUrl" });
        }
      } else if (body.pfpUrl.startsWith("http")) {
        // External URL - allow it
        pfpUrl = body.pfpUrl;
      }
    }

    // Process banner upload
    if (body.bannerUrl !== undefined) {
      if (body.bannerUrl === null) {
        // Explicitly removing banner
        const oldRel = relPathFromStoredUrl(bannerUrl);
        if (oldRel) deleteProfileImage(env.PROFILE_IMAGE_STORAGE_DIR, oldRel);
        bannerUrl = null;
      } else if (body.bannerUrl.startsWith("data:image/")) {
        // Base64 image upload
        const saved = saveProfileImage(env.PROFILE_IMAGE_STORAGE_DIR, userId, "banner", body.bannerUrl);
        if (saved) {
          const oldRel = relPathFromStoredUrl(bannerUrl);
          if (oldRel) deleteProfileImage(env.PROFILE_IMAGE_STORAGE_DIR, oldRel);
          bannerUrl = `${env.PROFILE_IMAGE_BASE_URL}/${saved}`;
        } else {
          return rep.code(400).send({ error: "INVALID_IMAGE", field: "bannerUrl" });
        }
      } else if (body.bannerUrl.startsWith("http")) {
        // External URL - allow it
        bannerUrl = body.bannerUrl;
      }
    }

    await q(
      `UPDATE users SET
         display_name = COALESCE(:displayName, display_name),
         bio = COALESCE(:bio, bio),
         pfp_url = :pfpUrl,
         banner_url = :bannerUrl
       WHERE id=:userId`,
      { userId, displayName: body.displayName ?? null, bio: body.bio ?? null, pfpUrl, bannerUrl }
    );

    return { ok: true };
  });
}