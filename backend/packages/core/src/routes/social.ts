import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ulidLike } from "@ods/shared/ids.js";
import { q } from "../db.js";
import { parseBody } from "../validation.js";

const AddFriend = z.object({ username: z.string().min(2).max(32) });
const OpenDm = z.object({ friendId: z.string().min(3) });
const SendDm = z.object({ content: z.string().min(1).max(4000) });
const UpdateSocialSettings = z.object({ allowFriendRequests: z.boolean() });
const DmMessageParams = z.object({ threadId: z.string().min(3), messageId: z.string().min(3) });
const DmCallSignalParams = z.object({ threadId: z.string().min(3) });
const DmCallSignalQuery = z.object({ afterId: z.string().min(3).optional() });
const DmCallSignalBody = z.object({
  targetUserId: z.string().min(3),
  type: z.enum(["offer", "answer", "ice", "end"]),
  payload: z.any().optional()
});

function sortPair(a: string, b: string) {
  return a < b ? [a, b] as const : [b, a] as const;
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
  const [userA, userB] = sortPair(userId, friendId);
  const existing = await q<{ id: string }>(
    `SELECT id FROM social_dm_threads WHERE user_a=:userA AND user_b=:userB LIMIT 1`,
    { userA, userB }
  );

  if (existing.length) return existing[0].id;

  const id = ulidLike();
  await q(
    `INSERT INTO social_dm_threads (id,user_a,user_b) VALUES (:id,:userA,:userB)`,
    { id, userA, userB }
  );
  return id;
}

export async function socialRoutes(app: FastifyInstance) {
  app.get("/v1/social/friends", { preHandler: [app.authenticate] } as any, async (req: any) => {
    const userId = req.user.sub as string;

    const rows = await q<{ id: string; username: string; display_name: string | null }>(
      `SELECT u.id, u.username, u.display_name
       FROM friendships f
       JOIN users u ON u.id=f.friend_user_id
       WHERE f.user_id=:userId
       ORDER BY f.created_at DESC`,
      { userId }
    );

    return {
      friends: rows.map((row) => ({
        id: row.id,
        username: row.display_name || row.username,
        status: "online"
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

    const isAllowed = target[0].allow_friend_requests === null || target[0].allow_friend_requests === 1;
    if (!isAllowed) return rep.code(403).send({ error: "FRIEND_REQUESTS_DISABLED" });

    const incoming = await q<{ id: string }>(
      `SELECT id FROM friend_requests
       WHERE sender_user_id=:friendId AND recipient_user_id=:userId AND status='pending'
       LIMIT 1`,
      { userId, friendId }
    );

    if (incoming.length) {
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

    const outgoing = await q<{ id: string }>(
      `SELECT id FROM friend_requests
       WHERE sender_user_id=:userId AND recipient_user_id=:friendId AND status='pending'
       LIMIT 1`,
      { userId, friendId }
    );
    if (outgoing.length) return { ok: true, requestId: outgoing[0].id, requestStatus: "pending" };

    const requestId = ulidLike();
    await q(
      `INSERT INTO friend_requests (id,sender_user_id,recipient_user_id,status) VALUES (:id,:userId,:friendId,'pending')`,
      { id: requestId, userId, friendId }
    );

    return { ok: true, requestId, requestStatus: "pending" };
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

    const rows = await q<{ id: string; other_user_id: string; other_username: string; other_display_name: string | null; last_message_at: string | null }>(
      `SELECT t.id,
              CASE WHEN t.user_a=:userId THEN t.user_b ELSE t.user_a END AS other_user_id,
              u.username AS other_username,
              u.display_name AS other_display_name,
              t.last_message_at
       FROM social_dm_threads t
       JOIN users u ON u.id = CASE WHEN t.user_a=:userId THEN t.user_b ELSE t.user_a END
       WHERE t.user_a=:userId OR t.user_b=:userId
       ORDER BY COALESCE(t.last_message_at, t.created_at) DESC`,
      { userId }
    );

    return {
      dms: rows.map((row) => ({
        id: row.id,
        participantId: row.other_user_id,
        name: row.other_display_name || row.other_username,
        lastMessageAt: row.last_message_at
      }))
    };
  });

  app.get("/v1/social/dms/:threadId/messages", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const userId = req.user.sub as string;
    const { threadId } = z.object({ threadId: z.string().min(3) }).parse(req.params);

    const thread = await q<{ id: string }>(
      `SELECT id FROM social_dm_threads WHERE id=:threadId AND (user_a=:userId OR user_b=:userId) LIMIT 1`,
      { threadId, userId }
    );
    if (!thread.length) return rep.code(404).send({ error: "THREAD_NOT_FOUND" });

    const rows = await q<{ id: string; sender_user_id: string; content: string; created_at: string; sender_name: string; sender_display_name: string | null }>(
      `SELECT m.id, m.sender_user_id, m.content, m.created_at, u.username AS sender_name, u.display_name AS sender_display_name
       FROM social_dm_messages m
       JOIN users u ON u.id=m.sender_user_id
       WHERE m.thread_id=:threadId
       ORDER BY m.created_at ASC`,
      { threadId }
    );

    return {
      messages: rows.map((row) => ({
        id: row.id,
        authorId: row.sender_user_id,
        author: row.sender_display_name || row.sender_name,
        content: row.content,
        createdAt: row.created_at
      }))
    };
  });

  app.post("/v1/social/dms/:threadId/messages", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const userId = req.user.sub as string;
    const { threadId } = z.object({ threadId: z.string().min(3) }).parse(req.params);
    const body = parseBody(SendDm, req.body);

    const thread = await q<{ id: string }>(
      `SELECT id FROM social_dm_threads WHERE id=:threadId AND (user_a=:userId OR user_b=:userId) LIMIT 1`,
      { threadId, userId }
    );

    if (!thread.length) return rep.code(404).send({ error: "THREAD_NOT_FOUND" });

    const id = ulidLike();
    await q(
      `INSERT INTO social_dm_messages (id,thread_id,sender_user_id,content) VALUES (:id,:threadId,:userId,:content)`,
      { id, threadId, userId, content: body.content.trim() }
    );

    await q(`UPDATE social_dm_threads SET last_message_at=NOW() WHERE id=:threadId`, { threadId });

    return { ok: true, messageId: id };
  });

  app.delete("/v1/social/dms/:threadId/messages/:messageId", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const userId = req.user.sub as string;
    const { threadId, messageId } = DmMessageParams.parse(req.params);

    const thread = await q<{ id: string }>(
      `SELECT id FROM social_dm_threads WHERE id=:threadId AND (user_a=:userId OR user_b=:userId) LIMIT 1`,
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

    const otherUserId = thread[0].user_a === userId ? thread[0].user_b : thread[0].user_a;
    if (body.targetUserId !== otherUserId) return rep.code(400).send({ error: "INVALID_TARGET" });

    const id = ulidLike();
    await q(
      `INSERT INTO social_dm_call_signals (id,thread_id,from_user_id,target_user_id,type,payload_json)
       VALUES (:id,:threadId,:fromUserId,:targetUserId,:type,:payloadJson)`,
      { id, threadId, fromUserId: userId, targetUserId: body.targetUserId, type: body.type, payloadJson: JSON.stringify(body.payload ?? {}) }
    );

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
