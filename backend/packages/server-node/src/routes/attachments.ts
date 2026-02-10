import { FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import { z } from "zod";
import path from "node:path";
import fs from "node:fs";
import { ulidLike } from "@ods/shared/ids.js";
import { q } from "../db.js";
import { resolveChannelPermissions } from "../permissions/resolve.js";
import { Perm, has } from "../permissions/bits.js";
import { ensureDir, safeName, buildPath, randomId, streamToFile, unlinkIfExists } from "../storage/fsStore.js";
import { env } from "../env.js";

export async function attachmentRoutes(app: FastifyInstance) {
  // IMPORTANT: register multipart ONCE
  await app.register(multipart, {
    limits: {
      fileSize: env.ATTACHMENT_MAX_BYTES // hard limit
    }
  });

  // Upload (multipart/form-data)
  // fields: guildId, channelId, uploaderId, (optional) messageId
  // file field name: "file"
  app.post("/v1/attachments/upload", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    
    const parts = req.parts();

    let guildId = "";
    let channelId = "";
    let uploaderId = req.auth.userId as string;
    let messageId: string | null = null;

    let filePart: any = null;

    for await (const part of parts) {
      if (part.type === "file") {
        filePart = part;
      } else {
        const v = String(part.value ?? "");
        if (part.fieldname === "guildId") guildId = v;
        if (part.fieldname === "channelId") channelId = v;
        if (part.fieldname === "uploaderId") uploaderId = v;
        if (part.fieldname === "messageId") messageId = v || null;
      }
    }

    const parsed = z.object({
      guildId: z.string().min(3),
      channelId: z.string().min(3),
      uploaderId: z.string().min(3),
      messageId: z.string().min(3).nullable().optional()
    }).parse({ guildId, channelId, uploaderId, messageId });

    if (!filePart) return rep.code(400).send({ error: "FILE_REQUIRED" });

    // Validate channel belongs to guild
    const ch = await q<{ id: string }>(
      `SELECT id FROM channels WHERE id=:channelId AND guild_id=:guildId`,
      { channelId: parsed.channelId, guildId: parsed.guildId }
    );
    if (!ch.length) return rep.code(404).send({ error: "CHANNEL_INVALID" });

    // Permission check: must view + attach (and typically send)
    const perms = await resolveChannelPermissions({
      guildId: parsed.guildId,
      channelId: parsed.channelId,
      userId: parsed.uploaderId,
      roles: req.auth.roles
    });

    if (!has(perms, Perm.VIEW_CHANNEL) || !has(perms, Perm.ATTACH_FILES)) {
      return rep.code(403).send({ error: "MISSING_PERMS" });
    }

    const attachmentId = ulidLike();
    const originalName = safeName(filePart.filename ?? "file");
    const contentType = String(filePart.mimetype ?? "application/octet-stream");

    const now = Date.now();
    const expiresAt = new Date(now + env.ATTACHMENT_TTL_DAYS * 24 * 60 * 60 * 1000);

    // Store on disk as:
    // <root>/<guildId>/<channelId>/<attachmentId>_<rand>_<filename>
    const root = env.ATTACHMENT_STORAGE_DIR;
    ensureDir(root);

    const relDir = path.join(parsed.guildId, parsed.channelId);
    const absDir = buildPath(root, [relDir]);
    ensureDir(absDir);

    const rand = randomId(8);
    const relPath = path.join(relDir, `${attachmentId}_${rand}_${originalName}`);
    const absPath = buildPath(root, [relPath]);

    // Stream to disk with size enforcement
    let sizeBytes = 0;
    try {
      sizeBytes = await streamToFile(filePart.file, absPath, env.ATTACHMENT_MAX_BYTES);
    } catch (e: any) {
      unlinkIfExists(absPath);
      if (String(e?.message) === "TOO_LARGE") return rep.code(413).send({ error: "TOO_LARGE", maxBytes: env.ATTACHMENT_MAX_BYTES });
      return rep.code(500).send({ error: "UPLOAD_FAILED" });
    }

    await q(
      `INSERT INTO attachments
        (id,guild_id,channel_id,message_id,uploader_id,object_key,file_name,content_type,size_bytes,expires_at)
       VALUES
        (:id,:guildId,:channelId,:messageId,:uploaderId,:objectKey,:fileName,:contentType,:sizeBytes,:expiresAt)`,
      {
        id: attachmentId,
        guildId: parsed.guildId,
        channelId: parsed.channelId,
        messageId: parsed.messageId ?? null,
        uploaderId: parsed.uploaderId,
        objectKey: relPath, // disk path relative to storage root
        fileName: originalName,
        contentType,
        sizeBytes,
        expiresAt: toMariaTimestamp(expiresAt)
      }
    );

    const publicUrl = `${env.PUBLIC_BASE_URL}/v1/attachments/${attachmentId}`;

    return rep.send({
      attachmentId,
      fileName: originalName,
      contentType,
      sizeBytes,
      expiresAt: expiresAt.toISOString(),
      url: publicUrl
    });
  });

  // Download (streams file)
  app.get("/v1/attachments/:id", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const { id } = z.object({ id: z.string().min(3) }).parse(req.params);
    const userId = req.auth.userId as string;

    const rows = await q<any>(
      `SELECT id,guild_id,channel_id,object_key,file_name,content_type,size_bytes,expires_at
       FROM attachments WHERE id=:id`,
      { id }
    );
    if (!rows.length) return rep.code(404).send({ error: "NOT_FOUND" });

    const a = rows[0];
    const exp = new Date(a.expires_at);
    if (exp.getTime() < Date.now()) return rep.code(410).send({ error: "EXPIRED" });

    const perms = await resolveChannelPermissions({
      guildId: a.guild_id,
      channelId: a.channel_id,
      userId,
      roles: req.auth.roles
    });
    if (!has(perms, Perm.VIEW_CHANNEL)) return rep.code(403).send({ error: "MISSING_PERMS" });

    const absPath = buildPath(env.ATTACHMENT_STORAGE_DIR, [a.object_key]);
    if (!fs.existsSync(absPath)) return rep.code(404).send({ error: "FILE_MISSING" });

    rep.header("Content-Type", a.content_type);
    rep.header("Content-Disposition", `inline; filename="${a.file_name}"`);
    return rep.send(fs.createReadStream(absPath));
  });
}

function toMariaTimestamp(d: Date) {
  // YYYY-MM-DD HH:MM:SS
  return d.toISOString().slice(0, 19).replace("T", " ");
}
