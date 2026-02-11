import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ulidLike } from "@ods/shared/ids.js";
import { q } from "../db.js";

const AddFriend = z.object({ username: z.string().min(2).max(32) });
const OpenDm = z.object({ friendId: z.string().min(3) });
const SendDm = z.object({ content: z.string().min(1).max(4000) });

function sortPair(a: string, b: string) {
  return a < b ? [a, b] as const : [b, a] as const;
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
    const body = AddFriend.parse(req.body);

    const target = await q<{ id: string; username: string; display_name: string | null }>(
      `SELECT id, username, display_name FROM users WHERE LOWER(username)=LOWER(:username) LIMIT 1`,
      { username: body.username }
    );

    if (!target.length) return rep.code(404).send({ error: "USER_NOT_FOUND" });
    if (target[0].id === userId) return rep.code(400).send({ error: "CANNOT_FRIEND_SELF" });

    const friendId = target[0].id;

    await q(
      `INSERT IGNORE INTO friendships (user_id, friend_user_id) VALUES (:userId, :friendId), (:friendId, :userId)`,
      { userId, friendId }
    );

    const threadId = await ensureThread(userId, friendId);

    return {
      ok: true,
      friend: {
        id: friendId,
        username: target[0].display_name || target[0].username,
        status: "online"
      },
      threadId
    };
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
    const body = OpenDm.parse(req.body);

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
    const body = SendDm.parse(req.body);

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
}
