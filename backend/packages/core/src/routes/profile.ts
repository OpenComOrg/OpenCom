import { FastifyInstance } from "fastify";
import { z } from "zod";
import { q } from "../db.js";
import { parseBody } from "../validation.js";
import { env } from "../env.js";
import { saveProfileImage, saveProfileImageFromBuffer, deleteProfileImage } from "../storage.js";
import { reconcileBoostBadge } from "../boost.js";
import fs from "node:fs";
import path from "node:path";

function isValidImageReference(value: string) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return false;
  if (/^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(trimmed)) return true;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }
  if (trimmed.startsWith("/")) return true;
  if (trimmed.startsWith("users/")) return true;
  return false;
}

function isValidMediaReference(value: string) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return false;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }
  if (trimmed.startsWith("/")) return true;
  if (trimmed.startsWith("users/")) return true;
  return false;
}

const imageValue = z.string().max(6_000_000).refine(isValidImageReference, "Invalid image format");

const UpdateProfile = z.object({
  displayName: z.string().min(1).max(64).nullable().optional(),
  bio: z.string().max(400).nullable().optional(),
  pfpUrl: imageValue.nullable().optional(),
  bannerUrl: imageValue.nullable().optional()
});

const FullProfileElementInput = z.object({
  id: z.string().min(1).max(40).optional(),
  type: z.enum(["avatar", "banner", "name", "bio", "links", "text"]),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  w: z.number().min(1).max(100),
  h: z.number().min(1).max(100),
  order: z.number().int().min(0).max(100).optional(),
  text: z.string().max(500).optional().nullable(),
  radius: z.number().min(0).max(40).optional(),
  opacity: z.number().min(20).max(100).optional(),
  fontSize: z.number().min(10).max(72).optional(),
  align: z.enum(["left", "center", "right"]).optional(),
  color: z.string().max(40).optional()
});

const FullProfileLinkInput = z.object({
  id: z.string().min(1).max(40).optional(),
  label: z.string().min(1).max(40),
  url: z.string().min(1).max(500),
  x: z.number().min(0).max(100).optional(),
  y: z.number().min(0).max(100).optional()
});

const UpdateFullProfile = z.object({
  enabled: z.boolean().optional(),
  theme: z.object({
    background: z.string().max(300).optional(),
    card: z.string().max(120).optional(),
    text: z.string().max(40).optional(),
    accent: z.string().max(40).optional(),
    fontPreset: z.enum(["sans", "serif", "mono", "display"]).optional()
  }).optional(),
  elements: z.array(FullProfileElementInput).max(24).optional(),
  links: z.array(FullProfileLinkInput).max(16).optional(),
  music: z.object({
    url: z.string().max(500).optional(),
    autoplay: z.boolean().optional(),
    loop: z.boolean().optional(),
    volume: z.number().min(0).max(100).optional()
  }).optional()
});

/** Extract relative path (users/userId/filename) from stored URL for deleteProfileImage */
function relPathFromStoredUrl(stored: string | null): string | null {
  if (!stored) return null;
  let value = stored.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) {
    try {
      value = new URL(value).pathname;
    } catch {
      return null;
    }
  }
  const base = env.PROFILE_IMAGE_BASE_URL.replace(/\/$/, "");
  if (value.startsWith(base + "/")) return value.slice(base.length).replace(/^\//, "") || null;
  if (value.startsWith("/users/")) return value.slice(1) || null;
  if (value.startsWith("users/")) return value;
  return null;
}

function normalizeImageReference(value: string) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  const base = env.PROFILE_IMAGE_BASE_URL.replace(/\/$/, "");
  if (trimmed.startsWith("users/")) return `${base}/${trimmed}`;
  if (trimmed.startsWith("/users/")) return `${base}${trimmed}`;
  return trimmed;
}

function normalizeMediaReference(value: string) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  const base = env.PROFILE_IMAGE_BASE_URL.replace(/\/$/, "");
  if (trimmed.startsWith("users/")) return `${base}/${trimmed}`;
  if (trimmed.startsWith("/users/")) return `${base}${trimmed}`;
  return trimmed;
}

function clampNumber(value: any, min: number, max: number, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function isHttpUrl(value: string) {
  const trimmed = String(value || "").trim();
  if (!/^https?:\/\//i.test(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function parseFullProfileJson(value: string | null): any {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function buildBasicFullProfile(user: { display_name: string | null; username: string; bio: string | null }) {
  const hasBio = !!String(user.bio || "").trim();
  return {
    version: 1,
    mode: "basic",
    enabled: true,
    theme: {
      background: "linear-gradient(150deg, #16274b, #0f1a33 65%)",
      card: "rgba(9, 14, 28, 0.62)",
      text: "#dfe9ff",
      accent: "#9bb6ff",
      fontPreset: "sans"
    },
    elements: [
      { id: "banner", type: "banner", x: 0, y: 0, w: 100, h: 34, order: 0, radius: 0, opacity: 100, fontSize: 16, align: "left", color: "" },
      { id: "avatar", type: "avatar", x: 4, y: 21, w: 20, h: 31, order: 1, radius: 18, opacity: 100, fontSize: 16, align: "left", color: "" },
      { id: "name", type: "name", x: 30, y: 30, w: 66, h: 10, order: 2, radius: 8, opacity: 100, fontSize: 22, align: "left", color: "" },
      { id: "bio", type: "bio", x: 4, y: 54, w: 92, h: hasBio ? 30 : 18, order: 3, radius: 8, opacity: 100, fontSize: 14, align: "left", color: "" }
    ],
    links: [],
    music: {
      url: "",
      autoplay: false,
      loop: true,
      volume: 60
    }
  };
}

function normalizeFullProfile(raw: any, fallbackUser: { display_name: string | null; username: string; bio: string | null }) {
  const basic = buildBasicFullProfile(fallbackUser);
  if (!raw || typeof raw !== "object") return basic;

  const parsedTheme = raw.theme && typeof raw.theme === "object" ? raw.theme : {};
  const fontPresetRaw = String(parsedTheme.fontPreset || "").trim().toLowerCase();
  const fontPreset = ["sans", "serif", "mono", "display"].includes(fontPresetRaw) ? fontPresetRaw : basic.theme.fontPreset;
  const theme = {
    background: typeof parsedTheme.background === "string" && parsedTheme.background.trim() ? parsedTheme.background.trim().slice(0, 300) : basic.theme.background,
    card: typeof parsedTheme.card === "string" && parsedTheme.card.trim() ? parsedTheme.card.trim().slice(0, 120) : basic.theme.card,
    text: typeof parsedTheme.text === "string" && parsedTheme.text.trim() ? parsedTheme.text.trim().slice(0, 40) : basic.theme.text,
    accent: typeof parsedTheme.accent === "string" && parsedTheme.accent.trim() ? parsedTheme.accent.trim().slice(0, 40) : basic.theme.accent,
    fontPreset
  };

  const incomingElements = Array.isArray(raw.elements) ? raw.elements : [];
  const elements = incomingElements
    .filter((item: any) => item && typeof item === "object")
    .slice(0, 24)
    .map((item: any, index: number) => {
      const type = String(item.type || "").toLowerCase();
      if (!["avatar", "banner", "name", "bio", "links", "text"].includes(type)) return null;
      const alignRaw = String(item.align || "").trim().toLowerCase();
      const align = alignRaw === "center" || alignRaw === "right" ? alignRaw : "left";
      const defaultFontSize = type === "name" ? 22 : (type === "bio" ? 14 : (type === "links" ? 14 : 16));
      return {
        id: typeof item.id === "string" && item.id.trim() ? item.id.trim().slice(0, 40) : `${type}-${index + 1}`,
        type,
        x: clampNumber(item.x, 0, 100, type === "banner" ? 0 : 5),
        y: clampNumber(item.y, 0, 100, type === "banner" ? 0 : 5 + index * 8),
        w: clampNumber(item.w, 1, 100, type === "banner" ? 100 : (type === "avatar" ? 20 : 80)),
        h: clampNumber(item.h, 1, 100, type === "banner" ? 34 : (type === "avatar" ? 31 : 12)),
        order: Math.round(clampNumber(item.order, 0, 100, index)),
        text: typeof item.text === "string" ? item.text.slice(0, 500) : null,
        radius: Math.round(clampNumber(item.radius, 0, 40, type === "avatar" ? 18 : (type === "banner" ? 0 : 8))),
        opacity: Math.round(clampNumber(item.opacity, 20, 100, 100)),
        fontSize: Math.round(clampNumber(item.fontSize, 10, 72, defaultFontSize)),
        align,
        color: typeof item.color === "string" && item.color.trim() ? item.color.trim().slice(0, 40) : ""
      };
    })
    .filter(Boolean);

  const incomingLinks = Array.isArray(raw.links) ? raw.links : [];
  const links = incomingLinks
    .filter((item: any) => item && typeof item === "object")
    .slice(0, 16)
    .map((item: any, index: number) => {
      const label = String(item.label || "").trim().slice(0, 40);
      const url = String(item.url || "").trim().slice(0, 500);
      if (!label || !url || !isHttpUrl(url)) return null;
      return {
        id: typeof item.id === "string" && item.id.trim() ? item.id.trim().slice(0, 40) : `link-${index + 1}`,
        label,
        url,
        x: clampNumber(item.x, 0, 100, 0),
        y: clampNumber(item.y, 0, 100, 0)
      };
    })
    .filter(Boolean);

  const incomingMusic = raw.music && typeof raw.music === "object" ? raw.music : {};
  const musicUrlRaw = String(incomingMusic.url || "").trim();
  const musicUrl = musicUrlRaw && isValidMediaReference(musicUrlRaw) ? normalizeMediaReference(musicUrlRaw).slice(0, 500) : "";
  const music = {
    url: musicUrl,
    autoplay: !!incomingMusic.autoplay,
    loop: incomingMusic.loop !== false,
    volume: Math.round(clampNumber(incomingMusic.volume, 0, 100, 60))
  };

  return {
    version: 1,
    mode: "custom",
    enabled: raw.enabled !== false,
    theme,
    elements: elements.length ? elements : basic.elements,
    links,
    music
  };
}

const ALLOWED_IMAGE_MIMES = new Set([
  "image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml", "image/bmp"
]);
const ALLOWED_AUDIO_MIMES = new Set([
  "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/ogg", "audio/mp4", "audio/x-m4a"
]);

const MIME_ALIASES: Record<string, string> = {
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
  "image/jfif": "image/jpeg",
  "image/x-png": "image/png",
  "image/x-ms-bmp": "image/bmp"
};

export async function profileRoutes(app: FastifyInstance) {
  // Serve stored profile images: raw file stream
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
      ".svg": "image/svg+xml",
      ".bmp": "image/bmp",
      ".mp3": "audio/mpeg",
      ".wav": "audio/wav",
      ".ogg": "audio/ogg",
      ".m4a": "audio/mp4"
    };
    const contentType = mime[ext] ?? "application/octet-stream";
    rep.header("Content-Type", contentType);
    rep.header("Cache-Control", "public, max-age=31536000, immutable");
    return rep.send(fs.createReadStream(filepath));
  });

  // Raw image upload (multipart), max 25MB, .png .jpg .gif .webp .svg
  function mimeFromFilename(filename: string): string | null {
    const ext = path.extname(filename || "").toLowerCase();
    const map: Record<string, string> = {
      ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
      ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml", ".bmp": "image/bmp"
    };
    return map[ext] ?? null;
  }

  function normalizeImageMime(mimeType: string | undefined, filename: string | undefined): string | null {
    const rawMime = (mimeType || "").toLowerCase().trim();
    const canonicalMime = MIME_ALIASES[rawMime] ?? rawMime;
    if (canonicalMime && ALLOWED_IMAGE_MIMES.has(canonicalMime)) return canonicalMime;

    const filenameMime = mimeFromFilename(filename || "");
    if (filenameMime && ALLOWED_IMAGE_MIMES.has(filenameMime)) return filenameMime;
    return null;
  }

  async function handleProfileImageUpload(
    req: any,
    rep: any,
    userId: string,
    imageType: "pfp" | "banner"
  ) {
    const data = await req.file();
    if (!data) return rep.code(400).send({ error: "MISSING_FILE" });
    const mime = normalizeImageMime(data.mimetype, data.filename);
    if (!mime) {
      return rep.code(400).send({ error: "INVALID_IMAGE_TYPE", allowed: [...ALLOWED_IMAGE_MIMES] });
    }
    const buffer = await data.toBuffer();
    const current = await q<{ pfp_url: string | null; banner_url: string | null }>(
      `SELECT pfp_url, banner_url FROM users WHERE id=:userId`,
      { userId }
    );
    const currentUrl = imageType === "pfp" ? current[0]?.pfp_url : current[0]?.banner_url;
    const oldRel = relPathFromStoredUrl(currentUrl ?? null);
    const saved = saveProfileImageFromBuffer(env.PROFILE_IMAGE_STORAGE_DIR, userId, imageType, buffer, mime);
    if (!saved) return rep.code(500).send({ error: "SAVE_FAILED" });
    if (oldRel) deleteProfileImage(env.PROFILE_IMAGE_STORAGE_DIR, oldRel);
    const url = `${env.PROFILE_IMAGE_BASE_URL}/${saved}`;
    await q(
      `UPDATE users SET ${imageType === "pfp" ? "pfp_url" : "banner_url"} = :url WHERE id=:userId`,
      { url, userId }
    );
    return rep.send(imageType === "pfp" ? { pfpUrl: url } : { bannerUrl: url });
  }

  app.post("/v1/me/profile/pfp", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const userId = req.user.sub as string;
    return handleProfileImageUpload(req, rep, userId, "pfp");
  });

  app.post("/v1/me/profile/banner", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const userId = req.user.sub as string;
    return handleProfileImageUpload(req, rep, userId, "banner");
  });

  app.post("/v1/images/upload", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const userId = req.user.sub as string;
    const data = await req.file();
    if (!data) return rep.code(400).send({ error: "MISSING_FILE" });
    const mime = normalizeImageMime(data.mimetype, data.filename);
    if (!mime) {
      return rep.code(400).send({ error: "INVALID_IMAGE_TYPE", allowed: [...ALLOWED_IMAGE_MIMES] });
    }
    const buffer = await data.toBuffer();
    const saved = saveProfileImageFromBuffer(env.PROFILE_IMAGE_STORAGE_DIR, userId, "asset", buffer, mime);
    if (!saved) return rep.code(500).send({ error: "SAVE_FAILED" });
    return rep.send({ imageUrl: `${env.PROFILE_IMAGE_BASE_URL}/${saved}` });
  });

  app.post("/v1/media/upload", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const userId = req.user.sub as string;
    const data = await req.file();
    if (!data) return rep.code(400).send({ error: "MISSING_FILE" });
    const rawMime = String(data.mimetype || "").toLowerCase().trim();
    const mime = MIME_ALIASES[rawMime] ?? rawMime;
    const filenameExt = path.extname(String(data.filename || "")).toLowerCase();
    const extToMime: Record<string, string> = {
      ".mp3": "audio/mpeg",
      ".wav": "audio/wav",
      ".ogg": "audio/ogg",
      ".m4a": "audio/mp4"
    };
    const guessedMime = extToMime[filenameExt] || "";
    const resolvedMime = ALLOWED_AUDIO_MIMES.has(mime) ? mime : (ALLOWED_AUDIO_MIMES.has(guessedMime) ? guessedMime : "");
    if (!resolvedMime) {
      return rep.code(400).send({ error: "INVALID_MEDIA_TYPE", allowed: [...ALLOWED_AUDIO_MIMES] });
    }
    const buffer = await data.toBuffer();
    const saved = saveProfileImageFromBuffer(env.PROFILE_IMAGE_STORAGE_DIR, userId, "asset", buffer, resolvedMime);
    if (!saved) return rep.code(500).send({ error: "SAVE_FAILED" });
    return rep.send({ mediaUrl: `${env.PROFILE_IMAGE_BASE_URL}/${saved}` });
  });

  app.get("/v1/users/:id/profile", async (req, rep) => {
    const { id } = z.object({ id: z.string().min(3) }).parse(req.params);

    const boostEntitlement = await reconcileBoostBadge(id);

    const u = await q<any>(
      `SELECT id, username, display_name, bio, pfp_url, banner_url, full_profile_json, created_at FROM users WHERE id=:id`,
      { id }
    );
    if (!u.length) return rep.code(404).send({ error: "NOT_FOUND" });

    const badges = await q<{ badge: string; created_at: string }>(
      `SELECT badge, created_at FROM user_badges WHERE user_id=:id`,
      { id }
    );

    const founder = await q<{ founder_user_id: string | null }>(`SELECT founder_user_id FROM platform_config WHERE id=1`);
    const isOwner = founder.length && founder[0].founder_user_id === id;
    const isAdmin = !!(await q<{ user_id: string }>(`SELECT user_id FROM platform_admins WHERE user_id=:id`, { id })).length;

    const now = Date.now();
    const badgeDetails = badges.map((row) => {
      const badgeId = row.badge;
      const createdAt = row.created_at ?? null;
      const detail: any = {
        id: badgeId,
        name: badgeId,
        createdAt,
        icon: "🏷️",
        bgColor: "#3a4f72",
        fgColor: "#ffffff"
      };
      if (badgeId === "boost") {
        const years = createdAt ? (now - new Date(createdAt).getTime()) / (365 * 24 * 60 * 60 * 1000) : 0;
        detail.name = years >= 2 ? "Boost (2+ years)" : "Boost";
        detail.icon = "➕";
        detail.bgColor = years >= 2 ? "#d4af37" : "#4f7ecf";
        detail.fgColor = "#ffffff";
      }
      return detail;
    });

    if (isAdmin && !isOwner) {
      badgeDetails.push({
        id: "platform_admin",
        name: "Platform Admin",
        icon: "🔨",
        bgColor: "#2d6cdf",
        fgColor: "#ffffff",
        createdAt: null
      });
    }
    if (isOwner) {
      badgeDetails.push({
        id: "platform_owner",
        name: "Platform Owner",
        icon: "👑",
        bgColor: "#2d6cdf",
        fgColor: "#ffffff",
        createdAt: null
      });
    }

    const basicFullProfile = buildBasicFullProfile(u[0]);
    const parsedFullProfile = normalizeFullProfile(parseFullProfileJson(u[0].full_profile_json ?? null), u[0]);
    const canUseCustomProfile = boostEntitlement.active && parsedFullProfile.mode === "custom" && parsedFullProfile.enabled;
    const fullProfile = canUseCustomProfile ? parsedFullProfile : { ...basicFullProfile, mode: "basic" };

    return {
      id: u[0].id,
      username: u[0].username,
      displayName: u[0].display_name ?? null,
      bio: u[0].bio ?? null,
      pfpUrl: u[0].pfp_url ?? null,
      bannerUrl: u[0].banner_url ?? null,
      createdAt: u[0].created_at ?? null,
      badges: badges.map(b => b.badge),
      badgeDetails,
      platformRole: isOwner ? "owner" : (isAdmin ? "admin" : "user"),
      platformTitle: isOwner ? "Platform Owner" : (isAdmin ? "Platform Admin" : null),
      boostActive: boostEntitlement.active,
      hasCustomFullProfile: canUseCustomProfile,
      fullProfile
    };
  });

  app.patch("/v1/me/profile", { preHandler: [app.authenticate] } as any, async (req: any, rep: any) => {
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
      } else if (isValidImageReference(body.pfpUrl)) {
        pfpUrl = normalizeImageReference(body.pfpUrl);
      } else {
        return rep.code(400).send({ error: "INVALID_IMAGE", field: "pfpUrl" });
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
      } else if (isValidImageReference(body.bannerUrl)) {
        bannerUrl = normalizeImageReference(body.bannerUrl);
      } else {
        return rep.code(400).send({ error: "INVALID_IMAGE", field: "bannerUrl" });
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

  app.patch("/v1/me/profile/full", { preHandler: [app.authenticate] } as any, async (req: any, rep: any) => {
    const userId = req.user.sub as string;
    const entitlement = await reconcileBoostBadge(userId);
    if (!entitlement.active) return rep.code(403).send({ error: "BOOST_REQUIRED" });

    const body = parseBody(UpdateFullProfile, req.body);
    const parsed = normalizeFullProfile(body, { display_name: null, username: userId, bio: null });
    parsed.mode = "custom";
    if (body.enabled === false) parsed.enabled = false;

    await q(
      `UPDATE users SET full_profile_json=:fullProfileJson WHERE id=:userId`,
      { userId, fullProfileJson: JSON.stringify(parsed) }
    );

    return { ok: true, fullProfile: parsed };
  });
}
