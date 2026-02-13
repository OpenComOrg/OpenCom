import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

export function randomId(bytes = 12) {
  return crypto.randomBytes(bytes).toString("hex");
}

/**
 * Convert base64 data URL to buffer and file extension
 * Returns { buffer, ext, mimeType } or null if invalid
 */
export function parseBase64Image(dataUrl: string): { buffer: Buffer; ext: string; mimeType: string } | null {
  const match = dataUrl.match(/^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;

  const mimeType = `image/${match[1]}`;
  const base64Data = match[2];

  try {
    const buffer = Buffer.from(base64Data, "base64");
    const exts: Record<string, string> = {
      "jpeg": "jpg",
      "png": "png",
      "webp": "webp",
      "gif": "gif",
      "svg+xml": "svg"
    };
    const ext = exts[match[1]] || "bin";
    return { buffer, ext, mimeType };
  } catch {
    return null;
  }
}

/**
 * Save an image to storage and return the relative path for URL construction
 */
export function saveProfileImage(
  storageDir: string,
  userId: string,
  imageType: "pfp" | "banner",
  base64Data: string
): string | null {
  const parsed = parseBase64Image(base64Data);
  if (!parsed) return null;

  ensureDir(storageDir);
  const usersDir = path.join(storageDir, "users");
  ensureDir(usersDir);
  const userDir = path.join(usersDir, userId);
  ensureDir(userDir);

  const filename = `${imageType}_${randomId(8)}.${parsed.ext}`;
  const filepath = path.join(userDir, filename);

  try {
    fs.writeFileSync(filepath, parsed.buffer, { flag: "w" });
    // Return relative path for URL construction: users/{userId}/{filename} (matches serve route)
    return `users/${userId}/${filename}`;
  } catch {
    return null;
  }
}

/**
 * Delete an old profile image if it exists
 */
export function deleteProfileImage(storageDir: string, relPath: string) {
  if (!relPath?.startsWith("users/")) return;

  const filepath = path.join(storageDir, relPath);
  try {
    fs.unlinkSync(filepath);
  } catch {
    // File doesn't exist or already deleted, that's fine
  }
}
