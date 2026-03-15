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
import {
  appendUploadChunk,
  createUploadSession,
  DEFAULT_UPLOAD_CHUNK_BYTES,
  destroyUploadSession,
  finalizeUploadSession,
  getUploadSession
} from "../storage/uploadSessions.js";
import { env } from "../env.js";

export async function attachmentRoutes(app: FastifyInstance) {
  // IMPORTANT: register multipart ONCE
  await app.register(multipart, {
    limits: {
      // Allow parsing up to boosted max; per-user limits are enforced below.
      fileSize: Math.max(env.ATTACHMENT_MAX_BYTES, env.ATTACHMENT_BOOST_MAX_BYTES)
    }
  });

  async function resolveAttachmentUploadContext(req: any, guildId: string, channelId: string, uploaderId: string) {
    const ch = await q<{ id: string }>(
      `SELECT id FROM channels WHERE id=:channelId AND guild_id=:guildId`,
      { channelId, guildId }
    );
    if (!ch.length) return { error: "CHANNEL_INVALID" as const };

    const perms = await resolveChannelPermissions({
      guildId,
      channelId,
      userId: uploaderId,
      roles: req.auth.roles
    });

    if (!has(perms, Perm.VIEW_CHANNEL) || !has(perms, Perm.ATTACH_FILES)) {
      return { error: "MISSING_PERMS" as const };
    }

    const isBoostUser = (req.auth.roles || []).includes("boost");
    return {
      error: null,
      tier: isBoostUser ? "boost" : "default",
      maxUploadBytes: isBoostUser ? env.ATTACHMENT_BOOST_MAX_BYTES : env.ATTACHMENT_MAX_BYTES
    };
  }

  app.post("/v1/attachments/uploads/init", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const authUserId = req.auth.userId as string;
    const body = z.object({
      guildId: z.string().min(3),
      channelId: z.string().min(3),
      fileName: z.string().min(1).max(255),
      contentType: z.string().max(255).optional(),
      sizeBytes: z.coerce.number().int().min(0),
      messageId: z.string().min(3).nullable().optional()
    }).parse(req.body || {});

    const uploadContext = await resolveAttachmentUploadContext(req, body.guildId, body.channelId, authUserId);
    if (uploadContext.error === "CHANNEL_INVALID") return rep.code(404).send({ error: "CHANNEL_INVALID" });
    if (uploadContext.error === "MISSING_PERMS") return rep.code(403).send({ error: "MISSING_PERMS" });
    if (body.sizeBytes > uploadContext.maxUploadBytes) {
      return rep.code(413).send({ error: "TOO_LARGE", maxBytes: uploadContext.maxUploadBytes });
    }

    const attachmentId = ulidLike();
    const originalName = safeName(body.fileName || "file");
    const contentType = String(body.contentType || "application/octet-stream").slice(0, 255);

    const root = env.ATTACHMENT_STORAGE_DIR;
    ensureDir(root);

    const relDir = path.join(body.guildId, body.channelId);
    const absDir = buildPath(root, [relDir]);
    ensureDir(absDir);

    const relPath = path.join(
      relDir,
      `${attachmentId}_${randomId(8)}_${originalName}`
    );

    const session = createUploadSession({
      rootDir: root,
      attachmentId,
      fileName: originalName,
      contentType,
      expectedSizeBytes: body.sizeBytes,
      maxBytes: uploadContext.maxUploadBytes,
      finalObjectKey: relPath,
      chunkSizeBytes: DEFAULT_UPLOAD_CHUNK_BYTES,
      context: {
        guildId: body.guildId,
        channelId: body.channelId,
        uploaderId: authUserId,
        messageId: body.messageId ?? null,
        tier: uploadContext.tier
      }
    });

    return rep.send({
      uploadId: session.uploadId,
      attachmentId,
      fileName: originalName,
      contentType,
      sizeBytes: body.sizeBytes,
      chunkSizeBytes: session.chunkSizeBytes,
      uploadedBytes: 0,
      tier: uploadContext.tier,
      maxBytes: uploadContext.maxUploadBytes,
      expiresAt: session.expiresAt
    });
  });

  app.put("/v1/attachments/uploads/:uploadId/chunks", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const authUserId = req.auth.userId as string;
    const { uploadId } = z.object({ uploadId: z.string().min(8) }).parse(req.params);
    const { offset } = z.object({ offset: z.coerce.number().int().min(0) }).parse(req.query || {});

    const session = getUploadSession(env.ATTACHMENT_STORAGE_DIR, uploadId);
    if (!session) return rep.code(404).send({ error: "UPLOAD_NOT_FOUND" });
    if (String(session.context.uploaderId || "") !== authUserId) {
      return rep.code(403).send({ error: "BAD_UPLOADER" });
    }

    const stream = (req.body || req.raw) as NodeJS.ReadableStream | undefined;
    if (!stream || typeof (stream as { pipe?: unknown }).pipe !== "function") {
      return rep.code(400).send({ error: "CHUNK_REQUIRED" });
    }

    try {
      const result = await appendUploadChunk(env.ATTACHMENT_STORAGE_DIR, uploadId, stream, offset);
      if (result.error === "NOT_FOUND") return rep.code(404).send({ error: "UPLOAD_NOT_FOUND" });
      if (result.error === "OFFSET_MISMATCH") {
        return rep.code(409).send({
          error: "OFFSET_MISMATCH",
          uploadedBytes: result.uploadedBytes,
          expectedSizeBytes: result.expectedSizeBytes
        });
      }

      return rep.send({
        ok: true,
        attachmentId: session.attachmentId,
        uploadedBytes: result.uploadedBytes,
        expectedSizeBytes: result.expectedSizeBytes,
        complete: result.complete
      });
    } catch (error: any) {
      destroyUploadSession(env.ATTACHMENT_STORAGE_DIR, uploadId);
      if (String(error?.message || "") === "CHUNK_TOO_LARGE") {
        return rep.code(413).send({ error: "CHUNK_TOO_LARGE", chunkSizeBytes: session.chunkSizeBytes });
      }
      if (String(error?.message || "") === "TOO_LARGE") {
        return rep.code(413).send({ error: "TOO_LARGE", maxBytes: session.maxBytes });
      }
      return rep.code(500).send({ error: "UPLOAD_FAILED" });
    }
  });

  app.post("/v1/attachments/uploads/:uploadId/complete", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const authUserId = req.auth.userId as string;
    const { uploadId } = z.object({ uploadId: z.string().min(8) }).parse(req.params);

    const session = getUploadSession(env.ATTACHMENT_STORAGE_DIR, uploadId);
    if (!session) return rep.code(404).send({ error: "UPLOAD_NOT_FOUND" });
    if (String(session.context.uploaderId || "") !== authUserId) {
      return rep.code(403).send({ error: "BAD_UPLOADER" });
    }

    const guildId = String(session.context.guildId || "");
    const channelId = String(session.context.channelId || "");
    const uploadContext = await resolveAttachmentUploadContext(req, guildId, channelId, authUserId);
    if (uploadContext.error === "CHANNEL_INVALID") return rep.code(404).send({ error: "CHANNEL_INVALID" });
    if (uploadContext.error === "MISSING_PERMS") return rep.code(403).send({ error: "MISSING_PERMS" });

    let finalized = null as ReturnType<typeof finalizeUploadSession> | null;
    try {
      finalized = finalizeUploadSession(env.ATTACHMENT_STORAGE_DIR, uploadId);
    } catch (error: any) {
      if (String(error?.message || "") === "INCOMPLETE_UPLOAD") {
        return rep.code(400).send({ error: "INCOMPLETE_UPLOAD", uploadedBytes: session.uploadedBytes });
      }
      return rep.code(500).send({ error: "UPLOAD_FAILED" });
    }
    if (!finalized) return rep.code(404).send({ error: "UPLOAD_NOT_FOUND" });

    const expiresAt = new Date(Date.now() + env.ATTACHMENT_TTL_DAYS * 24 * 60 * 60 * 1000);
    try {
      await q(
        `INSERT INTO attachments
          (id,guild_id,channel_id,message_id,uploader_id,object_key,file_name,content_type,size_bytes,expires_at)
         VALUES
          (:id,:guildId,:channelId,:messageId,:uploaderId,:objectKey,:fileName,:contentType,:sizeBytes,:expiresAt)`,
        {
          id: finalized.attachmentId,
          guildId,
          channelId,
          messageId: session.context.messageId || null,
          uploaderId: authUserId,
          objectKey: finalized.finalObjectKey,
          fileName: finalized.fileName,
          contentType: finalized.contentType,
          sizeBytes: finalized.uploadedBytes,
          expiresAt: toMariaTimestamp(expiresAt)
        }
      );
    } catch (error) {
      unlinkIfExists(buildPath(env.ATTACHMENT_STORAGE_DIR, [finalized.finalObjectKey]));
      throw error;
    }

    const publicUrl = `${env.PUBLIC_BASE_URL}/v1/attachments/${finalized.attachmentId}`;

    return rep.send({
      attachmentId: finalized.attachmentId,
      fileName: finalized.fileName,
      contentType: finalized.contentType,
      sizeBytes: finalized.uploadedBytes,
      tier: String(session.context.tier || uploadContext.tier),
      maxBytes: session.maxBytes,
      expiresAt: expiresAt.toISOString(),
      url: publicUrl
    });
  });

  app.delete("/v1/attachments/uploads/:uploadId", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const authUserId = req.auth.userId as string;
    const { uploadId } = z.object({ uploadId: z.string().min(8) }).parse(req.params);

    const session = getUploadSession(env.ATTACHMENT_STORAGE_DIR, uploadId);
    if (!session) return rep.send({ ok: true });
    if (String(session.context.uploaderId || "") !== authUserId) {
      return rep.code(403).send({ error: "BAD_UPLOADER" });
    }

    destroyUploadSession(env.ATTACHMENT_STORAGE_DIR, uploadId);
    return rep.send({ ok: true });
  });

  // Upload (multipart/form-data)
  // fields: guildId, channelId, (optional) uploaderId, (optional) messageId
  // file field name: "file"
  app.post("/v1/attachments/upload", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    
    const parts = req.parts();

    let guildId = "";
    let channelId = "";
    const authUserId = req.auth.userId as string;
    let uploaderId = authUserId;
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
      uploaderId: z.string().min(3).optional(),
      messageId: z.string().min(3).nullable().optional()
    }).parse({ guildId, channelId, uploaderId, messageId });

    if (!filePart) return rep.code(400).send({ error: "FILE_REQUIRED" });
    if (parsed.uploaderId && parsed.uploaderId !== authUserId) return rep.code(403).send({ error: "BAD_UPLOADER" });
    uploaderId = authUserId;

    const uploadContext = await resolveAttachmentUploadContext(req, parsed.guildId, parsed.channelId, uploaderId);
    if (uploadContext.error === "CHANNEL_INVALID") return rep.code(404).send({ error: "CHANNEL_INVALID" });
    if (uploadContext.error === "MISSING_PERMS") return rep.code(403).send({ error: "MISSING_PERMS" });

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
      sizeBytes = await streamToFile(filePart.file, absPath, uploadContext.maxUploadBytes);
    } catch (e: any) {
      unlinkIfExists(absPath);
      if (String(e?.message) === "TOO_LARGE") return rep.code(413).send({ error: "TOO_LARGE", maxBytes: uploadContext.maxUploadBytes });
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
        uploaderId,
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
      tier: uploadContext.tier,
      maxBytes: uploadContext.maxUploadBytes,
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
