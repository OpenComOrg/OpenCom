import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ulidLike } from "@ods/shared/ids.js";
import { q } from "../db.js";
import { parseBody } from "../validation.js";
import { env } from "../env.js";
import { reconcileBoostBadge } from "../boost.js";
import { buildOfficialBadgeDetail, ensureSocialDmThread, getDmCounterpartyMeta, isOfficialAccountName, isOfficialAccountUserId } from "../officialAccount.js";
import fs from "node:fs";
import path from "node:path";
import { ensureDir, randomId } from "../storage.js";
import {
  appendUploadChunk,
  createUploadSession,
  DEFAULT_UPLOAD_CHUNK_BYTES,
  destroyUploadSession,
  finalizeUploadSession,
  getUploadSession
} from "../uploadSessions.js";

const AddFriend = z.object({ username: z.string().min(2).max(32) });
const OpenDm = z.object({ friendId: z.string().min(3) });
const SendDm = z.object({
  content: z.string().max(4000).optional(),
  attachmentIds: z.array(z.string().min(3)).max(10).optional()
});
const UpdateSocialSettings = z.object({ allowFriendRequests: z.boolean() });
const DmMessageParams = z.object({ threadId: z.string().min(3), messageId: z.string().min(3) });
const DmCallSignalParams = z.object({ threadId: z.string().min(3) });
const DmCallSignalQuery = z.object({ afterId: z.string().min(3).optional() });
const DmMessagesQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.string().datetime().optional()
});
const DmCallSignalBody = z.object({
  targetUserId: z.string().min(3),
  type: z.enum(["offer", "answer", "ice", "end"]),
  payload: z.any().optional()
});

function toMariaTimestamp(d: Date) {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

function safeAttachmentFileName(rawName: string) {
  const cleaned = String(rawName || "file")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/[\u0000-\u001f]+/g, "")
    .trim()
    .slice(0, 220);
  return cleaned || "file";
}

async function streamToFileWithLimit(stream: NodeJS.ReadableStream, absPath: string, maxBytes: number): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    const out = fs.createWriteStream(absPath, { flags: "w" });
    stream.pipe(out);
    stream.once("error", reject);
    out.once("error", reject);
    out.once("finish", () => resolve());
  });
  const stat = await fs.promises.stat(absPath);
  const size = Number(stat?.size || 0);
  if (size > maxBytes) {
    try { await fs.promises.unlink(absPath); } catch {}
    throw new Error("TOO_LARGE");
  }
  return size;
}

async function createFriendshipPair(userId: string, friendId: string) {
  await q(
    `INSERT IGNORE INTO friendships (user_id, friend_user_id) VALUES (:userId, :friendId), (:friendId, :userId)`,
    { userId, friendId }
  );

  await ensureThread(userId, friendId);

  await q(
    `UPDATE friend_requests
     SET status='accepted', responded_at=NOW()
     WHERE status='pending'
       AND ((sender_user_id=:userId AND recipient_user_id=:friendId)
         OR (sender_user_id=:friendId AND recipient_user_id=:userId))`,
    { userId, friendId }
  );
}

async function ensureThread(userId: string, friendId: string): Promise<string> {
  return ensureSocialDmThread(userId, friendId);
}

export async function socialRoutes(
  app: FastifyInstance,
  broadcastCallSignal?: (targetUserId: string, signal: any) => Promise<void>,
  broadcastToUser?: (targetUserId: string, t: string, d: any) => Promise<void>
) {
  async function getDmMessageAttachmentsByMessageIds(messageIds: string[]) {
    if (!messageIds.length) return new Map<string, any[]>();
    const params: Record<string, any> = {};
    const inList = messageIds.map((id, index) => (params[`m${index}`] = id, `:m${index}`)).join(",");
    const rows = await q<any>(
      `SELECT id,message_id,file_name,content_type,size_bytes,expires_at
       FROM social_dm_attachments
       WHERE message_id IN (${inList})`,
      params
    );
    const byMessage = new Map<string, any[]>();
    for (const row of rows) {
      if (!byMessage.has(row.message_id)) byMessage.set(row.message_id, []);
      byMessage.get(row.message_id)!.push({
        id: row.id,
        fileName: row.file_name,
        contentType: row.content_type,
        sizeBytes: row.size_bytes,
        expiresAt: new Date(row.expires_at).toISOString(),
        url: `/v1/social/dms/attachments/${row.id}`
      });
    }
    return byMessage;
  }

  async function resolveDmAttachmentUploadContext(userId: string, threadId: string) {
    const thread = await q<{ id: string }>(
      `SELECT id FROM social_dm_threads WHERE id=:threadId AND (user_a=:userId OR user_b=:userId) LIMIT 1`,
      { threadId, userId }
    );
    if (!thread.length) return { error: "THREAD_NOT_FOUND" as const };

    const counterparty = await getDmCounterpartyMeta(threadId, userId);
    if (counterparty?.isNoReply) return { error: "OFFICIAL_ACCOUNT_NO_REPLY" as const };

    const entitlement = await reconcileBoostBadge(userId);
    return {
      error: null,
      tier: entitlement.active ? "boost" : "default",
      maxUploadBytes: entitlement.active ? env.ATTACHMENT_BOOST_MAX_BYTES : env.ATTACHMENT_MAX_BYTES
    };
  }

  app.get("/v1/social/friends", { preHandler: [app.authenticate] } as any, async (req: any) => {
    const userId = req.user.sub as string;

    const rows = await q<{ id: string; username: string; display_name: string | null; pfp_url: string | null; status: string }>(
      `SELECT u.id, u.username, u.display_name, u.pfp_url, COALESCE(p.status, 'offline') AS status
       FROM friendships f
       JOIN users u ON u.id=f.friend_user_id
       LEFT JOIN presence p ON p.user_id=u.id
       WHERE f.user_id=:userId
       ORDER BY f.created_at DESC`,
      { userId }
    );

    return {
      friends: rows.map((row) => ({
        id: row.id,
        username: row.display_name || row.username,
        pfp_url: row.pfp_url,
        status: row.status
      }))
    };
  });

  app.post("/v1/social/friends", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const userId = req.user.sub as string;
    const body = parseBody(AddFriend, req.body);

    const target = await q<{ id: string; username: string; display_name: string | null; allow_friend_requests: number | null }>(
      `SELECT u.id, u.username, u.display_name, ss.allow_friend_requests
       FROM users u
       LEFT JOIN social_settings ss ON ss.user_id=u.id
       WHERE LOWER(u.username)=LOWER(:username)
       LIMIT 1`,
      { username: body.username }
    );

    if (!target.length) return rep.code(404).send({ error: "USER_NOT_FOUND" });
    if (target[0].id === userId) return rep.code(400).send({ error: "CANNOT_FRIEND_SELF" });
    if (isOfficialAccountName(target[0].username)) {
      return rep.code(403).send({ error: "OFFICIAL_ACCOUNT_NO_REPLY" });
    }

    const friendId = target[0].id;

    const existing = await q<{ user_id: string }>(
      `SELECT user_id FROM friendships WHERE user_id=:userId AND friend_user_id=:friendId LIMIT 1`,
      { userId, friendId }
    );
    if (existing.length) {
      const threadId = await ensureThread(userId, friendId);
      return {
        ok: true,
        alreadyFriends: true,
        friend: {
          id: friendId,
          username: target[0].display_name || target[0].username,
          status: "online"
        },
        threadId
      };
    }

    const areFriendRequestsAllowed = target[0].allow_friend_requests === null || target[0].allow_friend_requests === 1;
    if (!areFriendRequestsAllowed) return rep.code(403).send({ error: "FRIEND_REQUESTS_DISABLED" });

    const incomingRequest = await q<{ id: string }>(
      `SELECT id FROM friend_requests
       WHERE sender_user_id=:friendId AND recipient_user_id=:userId AND status='pending'
       LIMIT 1`,
      { userId, friendId }
    );

    if (incomingRequest.length) {
      await createFriendshipPair(userId, friendId);
      const threadId = await ensureThread(userId, friendId);
      return {
        ok: true,
        acceptedExistingRequest: true,
        friend: {
          id: friendId,
          username: target[0].display_name || target[0].username,
          status: "online"
        },
        threadId
      };
    }

    const outgoingRequest = await q<{ id: string }>(
      `SELECT id FROM friend_requests
       WHERE sender_user_id=:userId AND recipient_user_id=:friendId AND status='pending'
       LIMIT 1`,
      { userId, friendId }
    );
    if (outgoingRequest.length) return { ok: true, requestId: outgoingRequest[0].id, requestStatus: "pending" };

    const newRequestId = ulidLike();
    await q(
      `INSERT INTO friend_requests (id,sender_user_id,recipient_user_id,status) VALUES (:id,:userId,:friendId,'pending')`,
      { id: newRequestId, userId, friendId }
    );

    return { ok: true, requestId: newRequestId, requestStatus: "pending" };
  });

  app.get("/v1/social/requests", { preHandler: [app.authenticate] } as any, async (req: any) => {
    const userId = req.user.sub as string;

    const incoming = await q<{ id: string; sender_user_id: string; username: string; display_name: string | null; created_at: string }>(
      `SELECT fr.id, fr.sender_user_id, u.username, u.display_name, fr.created_at
       FROM friend_requests fr
       JOIN users u ON u.id=fr.sender_user_id
       WHERE fr.recipient_user_id=:userId AND fr.status='pending'
       ORDER BY fr.created_at DESC`,
      { userId }
    );

    const outgoing = await q<{ id: string; recipient_user_id: string; username: string; display_name: string | null; created_at: string }>(
      `SELECT fr.id, fr.recipient_user_id, u.username, u.display_name, fr.created_at
       FROM friend_requests fr
       JOIN users u ON u.id=fr.recipient_user_id
       WHERE fr.sender_user_id=:userId AND fr.status='pending'
       ORDER BY fr.created_at DESC`,
      { userId }
    );

    return {
      incoming: incoming.map((row) => ({ id: row.id, userId: row.sender_user_id, username: row.display_name || row.username, createdAt: row.created_at })),
      outgoing: outgoing.map((row) => ({ id: row.id, userId: row.recipient_user_id, username: row.display_name || row.username, createdAt: row.created_at }))
    };
  });

  app.post("/v1/social/requests/:requestId/accept", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const userId = req.user.sub as string;
    const { requestId } = z.object({ requestId: z.string().min(3) }).parse(req.params);

    const pending = await q<{ sender_user_id: string; recipient_user_id: string }>(
      `SELECT sender_user_id,recipient_user_id FROM friend_requests WHERE id=:requestId AND status='pending' LIMIT 1`,
      { requestId }
    );
    if (!pending.length || pending[0].recipient_user_id !== userId) return rep.code(404).send({ error: "REQUEST_NOT_FOUND" });

    const friendId = pending[0].sender_user_id;
    await createFriendshipPair(userId, friendId);
    await q(`UPDATE friend_requests SET status='accepted', responded_at=NOW() WHERE id=:requestId`, { requestId });

    return { ok: true };
  });

  app.post("/v1/social/requests/:requestId/decline", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const userId = req.user.sub as string;
    const { requestId } = z.object({ requestId: z.string().min(3) }).parse(req.params);

    const pending = await q<{ recipient_user_id: string }>(
      `SELECT recipient_user_id FROM friend_requests WHERE id=:requestId AND status='pending' LIMIT 1`,
      { requestId }
    );
    if (!pending.length || pending[0].recipient_user_id !== userId) return rep.code(404).send({ error: "REQUEST_NOT_FOUND" });

    await q(`UPDATE friend_requests SET status='declined', responded_at=NOW() WHERE id=:requestId`, { requestId });
    return { ok: true };
  });

  app.post("/v1/social/requests/:requestId/cancel", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const userId = req.user.sub as string;
    const { requestId } = z.object({ requestId: z.string().min(3) }).parse(req.params);

    const pending = await q<{ sender_user_id: string }>(
      `SELECT sender_user_id
       FROM friend_requests
       WHERE id=:requestId AND status='pending'
       LIMIT 1`,
      { requestId }
    );
    if (!pending.length || pending[0].sender_user_id !== userId) return rep.code(404).send({ error: "REQUEST_NOT_FOUND" });

    await q(`DELETE FROM friend_requests WHERE id=:requestId`, { requestId });
    return { ok: true };
  });

  app.get("/v1/social/settings", { preHandler: [app.authenticate] } as any, async (req: any) => {
    const userId = req.user.sub as string;
    const rows = await q<{ allow_friend_requests: number }>(
      `SELECT allow_friend_requests FROM social_settings WHERE user_id=:userId LIMIT 1`,
      { userId }
    );

    return { allowFriendRequests: !rows.length || rows[0].allow_friend_requests === 1 };
  });

  app.patch("/v1/social/settings", { preHandler: [app.authenticate] } as any, async (req: any) => {
    const userId = req.user.sub as string;
    const body = parseBody(UpdateSocialSettings, req.body);

    await q(
      `INSERT INTO social_settings (user_id,allow_friend_requests)
       VALUES (:userId,:allowFriendRequests)
       ON DUPLICATE KEY UPDATE allow_friend_requests=VALUES(allow_friend_requests)`,
      { userId, allowFriendRequests: body.allowFriendRequests ? 1 : 0 }
    );

    return { ok: true, allowFriendRequests: body.allowFriendRequests };
  });

  app.delete("/v1/social/friends/:friendId", { preHandler: [app.authenticate] } as any, async (req: any) => {
    const userId = req.user.sub as string;
    const { friendId } = z.object({ friendId: z.string().min(3) }).parse(req.params);

    await q(
      `DELETE FROM friendships
       WHERE (user_id=:userId AND friend_user_id=:friendId)
          OR (user_id=:friendId AND friend_user_id=:userId)`,
      { userId, friendId }
    );

    return { ok: true };
  });

  app.post("/v1/social/dms/open", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const userId = req.user.sub as string;
    const body = parseBody(OpenDm, req.body);

    const friend = await q<{ id: string }>(
      `SELECT id FROM users WHERE id=:friendId LIMIT 1`,
      { friendId: body.friendId }
    );
    if (!friend.length) return rep.code(404).send({ error: "USER_NOT_FOUND" });

    const threadId = await ensureThread(userId, body.friendId);
    return { threadId };
  });

  app.get("/v1/social/dms", { preHandler: [app.authenticate] } as any, async (req: any) => {
    const userId = req.user.sub as string;

    const rows = await q<{ id: string; other_user_id: string; other_username: string; other_display_name: string | null; other_pfp_url: string | null; last_message_at: string | null }>(
      `SELECT t.id,
              CASE WHEN t.user_a=:userId THEN t.user_b ELSE t.user_a END AS other_user_id,
              u.username AS other_username,
              u.display_name AS other_display_name,
              u.pfp_url AS other_pfp_url,
              t.last_message_at
       FROM social_dm_threads t
       JOIN users u ON u.id = CASE WHEN t.user_a=:userId THEN t.user_b ELSE t.user_a END
       WHERE t.user_a=:userId OR t.user_b=:userId
       ORDER BY COALESCE(t.last_message_at, t.created_at) DESC`,
      { userId }
    );

    return {
      dms: rows.map((row) => ({
        ...(() => {
          const isOfficial = isOfficialAccountName(row.other_username);
          return {
            badgeDetails: isOfficial ? [buildOfficialBadgeDetail()] : [],
            isOfficial,
            isNoReply: isOfficial
          };
        })(),
        id: row.id,
        participantId: row.other_user_id,
        name: row.other_display_name || row.other_username,
        pfp_url: row.other_pfp_url,
        lastMessageAt: row.last_message_at
      }))
    };
  });

  app.post("/v1/social/dms/:threadId/attachments/uploads/init", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const userId = req.user.sub as string;
    const { threadId } = z.object({ threadId: z.string().min(3) }).parse(req.params);
    const body = z.object({
      fileName: z.string().min(1).max(255),
      contentType: z.string().max(255).optional(),
      sizeBytes: z.coerce.number().int().min(0)
    }).parse(req.body || {});

    const uploadContext = await resolveDmAttachmentUploadContext(userId, threadId);
    if (uploadContext.error === "THREAD_NOT_FOUND") return rep.code(404).send({ error: "THREAD_NOT_FOUND" });
    if (uploadContext.error === "OFFICIAL_ACCOUNT_NO_REPLY") return rep.code(403).send({ error: "OFFICIAL_ACCOUNT_NO_REPLY" });
    if (body.sizeBytes > uploadContext.maxUploadBytes) {
      return rep.code(413).send({ error: "TOO_LARGE", maxBytes: uploadContext.maxUploadBytes });
    }

    const attachmentId = ulidLike();
    const originalName = safeAttachmentFileName(body.fileName);
    const contentType = String(body.contentType || "application/octet-stream").slice(0, 255);

    const rootDir = path.resolve(env.ATTACHMENT_STORAGE_DIR, "social-dms");
    const threadDir = path.resolve(rootDir, threadId);
    ensureDir(rootDir);
    ensureDir(threadDir);

    const relPath = path.join(threadId, `${attachmentId}_${randomId(8)}_${originalName}`);
    const absPath = path.resolve(rootDir, relPath);
    if (!absPath.startsWith(threadDir + path.sep)) {
      return rep.code(400).send({ error: "BAD_FILE_PATH" });
    }

    const session = createUploadSession({
      rootDir,
      attachmentId,
      fileName: originalName,
      contentType,
      expectedSizeBytes: body.sizeBytes,
      maxBytes: uploadContext.maxUploadBytes,
      finalObjectKey: relPath,
      chunkSizeBytes: DEFAULT_UPLOAD_CHUNK_BYTES,
      context: {
        threadId,
        uploaderUserId: userId,
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

  app.put("/v1/social/dms/:threadId/attachments/uploads/:uploadId/chunks", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const userId = req.user.sub as string;
    const { threadId, uploadId } = z.object({
      threadId: z.string().min(3),
      uploadId: z.string().min(8)
    }).parse(req.params);
    const { offset } = z.object({ offset: z.coerce.number().int().min(0) }).parse(req.query || {});

    const session = getUploadSession(path.resolve(env.ATTACHMENT_STORAGE_DIR, "social-dms"), uploadId);
    if (!session) return rep.code(404).send({ error: "UPLOAD_NOT_FOUND" });
    if (String(session.context.threadId || "") !== threadId) return rep.code(404).send({ error: "UPLOAD_NOT_FOUND" });
    if (String(session.context.uploaderUserId || "") !== userId) return rep.code(403).send({ error: "BAD_UPLOADER" });

    const stream = (req.body || req.raw) as NodeJS.ReadableStream | undefined;
    if (!stream || typeof (stream as { pipe?: unknown }).pipe !== "function") {
      return rep.code(400).send({ error: "CHUNK_REQUIRED" });
    }

    try {
      const result = await appendUploadChunk(path.resolve(env.ATTACHMENT_STORAGE_DIR, "social-dms"), uploadId, stream, offset);
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
      destroyUploadSession(path.resolve(env.ATTACHMENT_STORAGE_DIR, "social-dms"), uploadId);
      if (String(error?.message || "") === "CHUNK_TOO_LARGE") {
        return rep.code(413).send({ error: "CHUNK_TOO_LARGE", chunkSizeBytes: session.chunkSizeBytes });
      }
      if (String(error?.message || "") === "TOO_LARGE") {
        return rep.code(413).send({ error: "TOO_LARGE", maxBytes: session.maxBytes });
      }
      return rep.code(500).send({ error: "UPLOAD_FAILED" });
    }
  });

  app.post("/v1/social/dms/:threadId/attachments/uploads/:uploadId/complete", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const userId = req.user.sub as string;
    const { threadId, uploadId } = z.object({
      threadId: z.string().min(3),
      uploadId: z.string().min(8)
    }).parse(req.params);

    const rootDir = path.resolve(env.ATTACHMENT_STORAGE_DIR, "social-dms");
    const session = getUploadSession(rootDir, uploadId);
    if (!session) return rep.code(404).send({ error: "UPLOAD_NOT_FOUND" });
    if (String(session.context.threadId || "") !== threadId) return rep.code(404).send({ error: "UPLOAD_NOT_FOUND" });
    if (String(session.context.uploaderUserId || "") !== userId) return rep.code(403).send({ error: "BAD_UPLOADER" });

    const uploadContext = await resolveDmAttachmentUploadContext(userId, threadId);
    if (uploadContext.error === "THREAD_NOT_FOUND") return rep.code(404).send({ error: "THREAD_NOT_FOUND" });
    if (uploadContext.error === "OFFICIAL_ACCOUNT_NO_REPLY") return rep.code(403).send({ error: "OFFICIAL_ACCOUNT_NO_REPLY" });

    let finalized = null as ReturnType<typeof finalizeUploadSession> | null;
    try {
      finalized = finalizeUploadSession(rootDir, uploadId);
    } catch (error: any) {
      if (String(error?.message || "") === "INCOMPLETE_UPLOAD") {
        return rep.code(400).send({ error: "INCOMPLETE_UPLOAD", uploadedBytes: session.uploadedBytes });
      }
      return rep.code(500).send({ error: "UPLOAD_FAILED" });
    }
    if (!finalized) return rep.code(404).send({ error: "UPLOAD_NOT_FOUND" });

    const expiresAt = new Date(Date.now() + (env.ATTACHMENT_TTL_DAYS * 24 * 60 * 60 * 1000));
    try {
      await q(
        `INSERT INTO social_dm_attachments
          (id,thread_id,message_id,uploader_user_id,object_key,file_name,content_type,size_bytes,expires_at)
         VALUES
          (:id,:threadId,NULL,:uploaderUserId,:objectKey,:fileName,:contentType,:sizeBytes,:expiresAt)`,
        {
          id: finalized.attachmentId,
          threadId,
          uploaderUserId: userId,
          objectKey: finalized.finalObjectKey,
          fileName: finalized.fileName,
          contentType: finalized.contentType,
          sizeBytes: finalized.uploadedBytes,
          expiresAt: toMariaTimestamp(expiresAt)
        }
      );
    } catch (error) {
      try { fs.unlinkSync(path.resolve(rootDir, finalized.finalObjectKey)); } catch {}
      throw error;
    }

    return rep.send({
      attachmentId: finalized.attachmentId,
      fileName: finalized.fileName,
      contentType: finalized.contentType,
      sizeBytes: finalized.uploadedBytes,
      tier: String(session.context.tier || uploadContext.tier),
      maxBytes: session.maxBytes,
      expiresAt: expiresAt.toISOString(),
      url: `/v1/social/dms/attachments/${finalized.attachmentId}`
    });
  });

  app.delete("/v1/social/dms/:threadId/attachments/uploads/:uploadId", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const userId = req.user.sub as string;
    const { threadId, uploadId } = z.object({
      threadId: z.string().min(3),
      uploadId: z.string().min(8)
    }).parse(req.params);

    const rootDir = path.resolve(env.ATTACHMENT_STORAGE_DIR, "social-dms");
    const session = getUploadSession(rootDir, uploadId);
    if (!session) return rep.send({ ok: true });
    if (String(session.context.threadId || "") !== threadId) return rep.send({ ok: true });
    if (String(session.context.uploaderUserId || "") !== userId) return rep.code(403).send({ error: "BAD_UPLOADER" });

    destroyUploadSession(rootDir, uploadId);
    return rep.send({ ok: true });
  });

  app.post("/v1/social/dms/:threadId/attachments/upload", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const userId = req.user.sub as string;
    const { threadId } = z.object({ threadId: z.string().min(3) }).parse(req.params);

    const uploadContext = await resolveDmAttachmentUploadContext(userId, threadId);
    if (uploadContext.error === "THREAD_NOT_FOUND") return rep.code(404).send({ error: "THREAD_NOT_FOUND" });
    if (uploadContext.error === "OFFICIAL_ACCOUNT_NO_REPLY") return rep.code(403).send({ error: "OFFICIAL_ACCOUNT_NO_REPLY" });

    let filePart: any = null;
    for await (const part of req.parts()) {
      if (part.type !== "file") continue;
      if (!filePart) {
        filePart = part;
      } else {
        part.file.resume();
      }
    }
    if (!filePart) return rep.code(400).send({ error: "FILE_REQUIRED" });

    const attachmentId = ulidLike();
    const originalName = safeAttachmentFileName(filePart.filename);
    const contentType = String(filePart.mimetype || "application/octet-stream").slice(0, 255);
    const expiresAt = new Date(Date.now() + (env.ATTACHMENT_TTL_DAYS * 24 * 60 * 60 * 1000));

    const rootDir = path.resolve(env.ATTACHMENT_STORAGE_DIR, "social-dms");
    const threadDir = path.resolve(rootDir, threadId);
    ensureDir(rootDir);
    ensureDir(threadDir);

    const relPath = path.join(threadId, `${attachmentId}_${randomId(8)}_${originalName}`);
    const absPath = path.resolve(rootDir, relPath);
    if (!absPath.startsWith(threadDir + path.sep)) {
      return rep.code(400).send({ error: "BAD_FILE_PATH" });
    }

    let sizeBytes = 0;
    try {
      sizeBytes = await streamToFileWithLimit(filePart.file, absPath, uploadContext.maxUploadBytes);
    } catch (error: any) {
      try { fs.unlinkSync(absPath); } catch {}
      if (String(error?.message || "") === "TOO_LARGE") {
        return rep.code(413).send({ error: "TOO_LARGE", maxBytes: uploadContext.maxUploadBytes });
      }
      return rep.code(500).send({ error: "UPLOAD_FAILED" });
    }

    await q(
      `INSERT INTO social_dm_attachments
        (id,thread_id,message_id,uploader_user_id,object_key,file_name,content_type,size_bytes,expires_at)
       VALUES
        (:id,:threadId,NULL,:uploaderUserId,:objectKey,:fileName,:contentType,:sizeBytes,:expiresAt)`,
      {
        id: attachmentId,
        threadId,
        uploaderUserId: userId,
        objectKey: relPath,
        fileName: originalName,
        contentType,
        sizeBytes,
        expiresAt: toMariaTimestamp(expiresAt)
      }
    );

    return rep.send({
      attachmentId,
      fileName: originalName,
      contentType,
      sizeBytes,
      tier: uploadContext.tier,
      maxBytes: uploadContext.maxUploadBytes,
      expiresAt: expiresAt.toISOString(),
      url: `/v1/social/dms/attachments/${attachmentId}`
    });
  });

  app.get("/v1/social/dms/attachments/:attachmentId", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const userId = req.user.sub as string;
    const { attachmentId } = z.object({ attachmentId: z.string().min(3) }).parse(req.params);

    const rows = await q<{
      id: string;
      thread_id: string;
      object_key: string;
      file_name: string;
      content_type: string;
      size_bytes: number;
      expires_at: string;
    }>(
      `SELECT a.id,a.thread_id,a.object_key,a.file_name,a.content_type,a.size_bytes,a.expires_at
       FROM social_dm_attachments a
       JOIN social_dm_threads t ON t.id=a.thread_id
       WHERE a.id=:attachmentId
         AND (t.user_a=:userId OR t.user_b=:userId)
       LIMIT 1`,
      { attachmentId, userId }
    );

    if (!rows.length) return rep.code(404).send({ error: "NOT_FOUND" });
    const attachment = rows[0];
    if (new Date(attachment.expires_at).getTime() < Date.now()) return rep.code(410).send({ error: "EXPIRED" });

    const rootDir = path.resolve(env.ATTACHMENT_STORAGE_DIR, "social-dms");
    const absPath = path.resolve(rootDir, attachment.object_key);
    if (!absPath.startsWith(rootDir + path.sep)) return rep.code(400).send({ error: "BAD_FILE_PATH" });
    if (!fs.existsSync(absPath)) return rep.code(404).send({ error: "FILE_MISSING" });

    rep.header("Content-Type", attachment.content_type || "application/octet-stream");
    rep.header("Content-Disposition", `inline; filename="${attachment.file_name || "attachment"}"`);
    return rep.send(fs.createReadStream(absPath));
  });

  app.get("/v1/social/dms/:threadId/messages", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const userId = req.user.sub as string;
    const { threadId } = z.object({ threadId: z.string().min(3) }).parse(req.params);
    const { limit, before } = DmMessagesQuery.parse(req.query || {});

    const thread = await q<{ id: string }>(
      `SELECT id FROM social_dm_threads WHERE id=:threadId AND (user_a=:userId OR user_b=:userId) LIMIT 1`,
      { threadId, userId }
    );
    if (!thread.length) return rep.code(404).send({ error: "THREAD_NOT_FOUND" });

    const rows = before
      ? await q<{ id: string; sender_user_id: string; content: string; created_at: string; sender_name: string; sender_display_name: string | null; sender_pfp_url: string | null }>(
        `SELECT m.id, m.sender_user_id, m.content, m.created_at, u.username AS sender_name, u.display_name AS sender_display_name, u.pfp_url AS sender_pfp_url
         FROM social_dm_messages m
         JOIN users u ON u.id=m.sender_user_id
         WHERE m.thread_id=:threadId
           AND m.created_at < :before
         ORDER BY m.created_at DESC
         LIMIT :limit`,
        { threadId, before, limit }
      )
      : await q<{ id: string; sender_user_id: string; content: string; created_at: string; sender_name: string; sender_display_name: string | null; sender_pfp_url: string | null }>(
        `SELECT m.id, m.sender_user_id, m.content, m.created_at, u.username AS sender_name, u.display_name AS sender_display_name, u.pfp_url AS sender_pfp_url
         FROM social_dm_messages m
         JOIN users u ON u.id=m.sender_user_id
         WHERE m.thread_id=:threadId
         ORDER BY m.created_at DESC
         LIMIT :limit`,
        { threadId, limit }
      );

    const hasMore = rows.length >= limit;
    const orderedRows = rows.slice().reverse();
    const attachmentsByMessageId = await getDmMessageAttachmentsByMessageIds(orderedRows.map((row) => row.id));

    return {
      messages: orderedRows.map((row) => ({
        ...(() => {
          const isOfficial = isOfficialAccountName(row.sender_name);
          return {
            badgeDetails: isOfficial ? [buildOfficialBadgeDetail()] : [],
            isOfficial,
            isNoReply: isOfficial
          };
        })(),
        id: row.id,
        authorId: row.sender_user_id,
        author: row.sender_display_name || row.sender_name,
        pfp_url: row.sender_pfp_url,
        content: row.content,
        createdAt: row.created_at,
        attachments: attachmentsByMessageId.get(row.id) || []
      })),
      hasMore
    };
  });

  app.post("/v1/social/dms/:threadId/messages", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const userId = req.user.sub as string;
    const { threadId } = z.object({ threadId: z.string().min(3) }).parse(req.params);
    const body = parseBody(SendDm, req.body);

    const thread = await q<{ id: string; user_a: string; user_b: string }>(
      `SELECT id,user_a,user_b FROM social_dm_threads WHERE id=:threadId AND (user_a=:userId OR user_b=:userId) LIMIT 1`,
      { threadId, userId }
    );

    if (!thread.length) return rep.code(404).send({ error: "THREAD_NOT_FOUND" });

    const counterparty = await getDmCounterpartyMeta(threadId, userId);
    if (counterparty?.isNoReply) return rep.code(403).send({ error: "OFFICIAL_ACCOUNT_NO_REPLY" });

    const id = ulidLike();
    const attachmentIds = body.attachmentIds || [];
    const content = String(body.content || "").trim();
    if (!content && !attachmentIds.length) return rep.code(400).send({ error: "EMPTY_MESSAGE" });

    let resolvedAttachments: Array<{
      id: string;
      fileName: string;
      contentType: string;
      sizeBytes: number;
      expiresAt: string;
      url: string;
    }> = [];

    if (attachmentIds.length) {
      const params: Record<string, any> = { threadId };
      const inList = attachmentIds.map((attId, index) => (params[`a${index}`] = attId, `:a${index}`)).join(",");
      const attachmentRows = await q<{
        id: string;
        thread_id: string;
        uploader_user_id: string;
        message_id: string | null;
        file_name: string;
        content_type: string;
        size_bytes: number;
        expires_at: string;
      }>(
        `SELECT id,thread_id,uploader_user_id,message_id,file_name,content_type,size_bytes,expires_at
         FROM social_dm_attachments
         WHERE thread_id=:threadId
           AND id IN (${inList})`,
        params
      );

      if (attachmentRows.length !== attachmentIds.length) return rep.code(400).send({ error: "BAD_ATTACHMENT" });

      for (const attachment of attachmentRows) {
        if (attachment.thread_id !== threadId) return rep.code(400).send({ error: "BAD_ATTACHMENT_SCOPE" });
        if (attachment.uploader_user_id !== userId) return rep.code(403).send({ error: "BAD_ATTACHMENT_OWNER" });
        if (attachment.message_id) return rep.code(400).send({ error: "ATTACHMENT_ALREADY_LINKED" });
        if (new Date(attachment.expires_at).getTime() < Date.now()) return rep.code(410).send({ error: "ATTACHMENT_EXPIRED" });
      }

      resolvedAttachments = attachmentRows.map((attachment) => ({
        id: attachment.id,
        fileName: attachment.file_name,
        contentType: attachment.content_type,
        sizeBytes: attachment.size_bytes,
        expiresAt: new Date(attachment.expires_at).toISOString(),
        url: `/v1/social/dms/attachments/${attachment.id}`
      }));
    }

    const finalContent = content || "Attachment";
    await q(
      `INSERT INTO social_dm_messages (id,thread_id,sender_user_id,content) VALUES (:id,:threadId,:userId,:content)`,
      { id, threadId, userId, content: finalContent }
    );

    for (const attachmentId of attachmentIds) {
      await q(
        `UPDATE social_dm_attachments
         SET message_id=:messageId
         WHERE id=:attachmentId`,
        { messageId: id, attachmentId }
      );
    }

    await q(`UPDATE social_dm_threads SET last_message_at=NOW() WHERE id=:threadId`, { threadId });

    if (broadcastToUser) {
      const sender = await q<{ username: string; display_name: string | null; pfp_url: string | null }>(
        `SELECT username,display_name,pfp_url FROM users WHERE id=:userId LIMIT 1`,
        { userId }
      );
      const otherUserId = thread[0].user_a === userId ? thread[0].user_b : thread[0].user_a;
      const createdAt = new Date().toISOString();
      const isOfficial = isOfficialAccountName(sender[0]?.username || "");
      const payload = {
        threadId,
        message: {
          id,
          authorId: userId,
          author: sender[0]?.display_name || sender[0]?.username || userId,
          pfp_url: sender[0]?.pfp_url ?? null,
          content: finalContent,
          createdAt,
          attachments: resolvedAttachments,
          badgeDetails: isOfficial ? [buildOfficialBadgeDetail()] : [],
          isOfficial,
          isNoReply: isOfficial
        }
      };
      await broadcastToUser(userId, "SOCIAL_DM_MESSAGE_CREATE", payload);
      await broadcastToUser(otherUserId, "SOCIAL_DM_MESSAGE_CREATE", payload);
    }

    return { ok: true, messageId: id };
  });

  app.delete("/v1/social/dms/:threadId/messages/:messageId", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const userId = req.user.sub as string;
    const { threadId, messageId } = DmMessageParams.parse(req.params);

    const thread = await q<{ id: string; user_a: string; user_b: string }>(
      `SELECT id,user_a,user_b FROM social_dm_threads WHERE id=:threadId AND (user_a=:userId OR user_b=:userId) LIMIT 1`,
      { threadId, userId }
    );
    if (!thread.length) return rep.code(404).send({ error: "THREAD_NOT_FOUND" });

    const message = await q<{ id: string; sender_user_id: string }>(
      `SELECT id,sender_user_id FROM social_dm_messages WHERE id=:messageId AND thread_id=:threadId LIMIT 1`,
      { messageId, threadId }
    );
    if (!message.length) return rep.code(404).send({ error: "MESSAGE_NOT_FOUND" });
    if (message[0].sender_user_id !== userId) return rep.code(403).send({ error: "MISSING_PERMS" });

    await q(`DELETE FROM social_dm_messages WHERE id=:messageId`, { messageId });

    if (broadcastToUser) {
      const otherUserId = thread[0].user_a === userId ? thread[0].user_b : thread[0].user_a;
      const payload = { threadId, messageId };
      await broadcastToUser(userId, "SOCIAL_DM_MESSAGE_DELETE", payload);
      await broadcastToUser(otherUserId, "SOCIAL_DM_MESSAGE_DELETE", payload);
    }

    return { ok: true };
  });

  app.post("/v1/social/dms/:threadId/call-signals", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const userId = req.user.sub as string;
    const { threadId } = DmCallSignalParams.parse(req.params);
    const body = parseBody(DmCallSignalBody, req.body);

    const thread = await q<{ id: string; user_a: string; user_b: string }>(
      `SELECT id,user_a,user_b FROM social_dm_threads WHERE id=:threadId AND (user_a=:userId OR user_b=:userId) LIMIT 1`,
      { threadId, userId }
    );
    if (!thread.length) return rep.code(404).send({ error: "THREAD_NOT_FOUND" });

    const counterparty = await getDmCounterpartyMeta(threadId, userId);
    if (counterparty?.isNoReply || await isOfficialAccountUserId(body.targetUserId)) {
      return rep.code(403).send({ error: "OFFICIAL_ACCOUNT_NO_REPLY" });
    }

    const otherUserId = thread[0].user_a === userId ? thread[0].user_b : thread[0].user_a;
    if (body.targetUserId !== otherUserId) return rep.code(400).send({ error: "INVALID_TARGET" });

    const id = ulidLike();
    await q(
      `INSERT INTO social_dm_call_signals (id,thread_id,from_user_id,target_user_id,type,payload_json)
       VALUES (:id,:threadId,:fromUserId,:targetUserId,:type,:payloadJson)`,
      { id, threadId, fromUserId: userId, targetUserId: body.targetUserId, type: body.type, payloadJson: JSON.stringify(body.payload ?? {}) }
    );

    // Broadcast via WebSocket
    const signal = {
      id,
      threadId,
      fromUserId: userId,
      type: body.type,
      payload: body.payload ?? {},
      createdAt: new Date().toISOString()
    };
    if (broadcastCallSignal) {
      await broadcastCallSignal(body.targetUserId, signal);
    }

    return { ok: true, id };
  });

  app.get("/v1/social/dms/:threadId/call-signals", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const userId = req.user.sub as string;
    const { threadId } = DmCallSignalParams.parse(req.params);
    const { afterId } = DmCallSignalQuery.parse(req.query || {});

    const thread = await q<{ id: string }>(
      `SELECT id FROM social_dm_threads WHERE id=:threadId AND (user_a=:userId OR user_b=:userId) LIMIT 1`,
      { threadId, userId }
    );
    if (!thread.length) return rep.code(404).send({ error: "THREAD_NOT_FOUND" });

    const rows = await q<{ id: string; from_user_id: string; type: string; payload_json: string | null; created_at: string }>(
      `SELECT id,from_user_id,type,payload_json,created_at
       FROM social_dm_call_signals
       WHERE thread_id=:threadId
         AND target_user_id=:userId
         AND created_at >= DATE_SUB(NOW(), INTERVAL 2 MINUTE)
         AND (:afterId IS NULL OR id > :afterId)
       ORDER BY id ASC
       LIMIT 100`,
      { threadId, userId, afterId: afterId ?? null }
    );

    return {
      signals: rows.map((row) => ({
        id: row.id,
        fromUserId: row.from_user_id,
        type: row.type,
        payload: row.payload_json ? JSON.parse(row.payload_json) : {},
        createdAt: row.created_at
      }))
    };
  });
}
