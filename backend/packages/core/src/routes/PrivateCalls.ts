import { q } from "../db.js";
import type { FastifyInstance } from "fastify";
import { ulidLike } from "@ods/shared/ids.js";
import crypto from "crypto";
import { env } from "../env.js";
import { signMembershipToken } from "../membershipToken.js";
import { isOfficialAccountUserId } from "../officialAccount.js";

// Error Code Reference:
// 404: Active call not found
// 420: Database error / record not found
// 421: Missing caller parameter
// 422: Missing callid parameter
// 509: Not friends with target user
// 510: Missing target_id in body
// 511: Official node not configured (voice unavailable)
// 512: Missing or invalid userId on token

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create an ephemeral voice channel in the private-calls system guild on the
 * official server-node and record the call in the PRIVATE_CALLS table.
 *
 * Returns null (without throwing) when the official node is not configured so
 * the caller can decide how to handle a "voice unavailable" situation.
 */
async function generate_voice_channel(
  user1_id: string,
  user2_id: string
): Promise<{
  call_id: string;
  channel_id: string;
  guild_id: string;
  node_base_url: string;
} | null> {
  if (!user1_id || !user2_id) throw new Error("User ID missing");
  if (user1_id === user2_id) throw new Error("Cannot call yourself");

  // Check if either user is already in an active call
  const existing = await q(
    `SELECT id
     FROM PRIVATE_CALLS
     WHERE active = TRUE
       AND ended_at IS NULL
       AND (user_1 = :u1 OR user_2 = :u1
            OR user_1 = :u2 OR user_2 = :u2)
     LIMIT 1`,
    { u1: user1_id, u2: user2_id }
  );
  if (existing.length) throw new Error("User already in an active call");

  const nodeBaseUrl = env.OFFICIAL_NODE_BASE_URL?.replace(/\/$/, "");
  const nodeServerId = env.OFFICIAL_NODE_SERVER_ID;
  const guildId = env.PRIVATE_CALLS_GUILD_ID;
  const syncSecret = env.CORE_NODE_SYNC_SECRET;

  // If node is not configured we still create a DB record but without a real
  // channel — the call_id is still useful for signalling purposes.
  const call_id = ulidLike();
  const token = crypto.randomBytes(32).toString("hex");

  if (!nodeBaseUrl || !nodeServerId || !guildId || !syncSecret) {
    // Persist a skeleton call record so status checks work
    await q(
      `INSERT INTO PRIVATE_CALLS
         (id, user_1, user_2, channel_id, token, created_at, active)
       VALUES
         (:id, :u1, :u2, '', :token, NOW(), TRUE)`,
      { id: call_id, u1: user1_id, u2: user2_id, token }
    );
    return null;
  }

  // Call the server-node internal API to provision the voice channel
  const channelName = `call-${call_id.slice(0, 8)}`;

  const resp = await fetch(`${nodeBaseUrl}/v1/internal/private-call-channel`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-node-sync-secret": syncSecret
    },
    body: JSON.stringify({ guildId, channelName, user1Id: user1_id, user2Id: user2_id })
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`Failed to create voice channel on node: ${resp.status} ${errText}`);
  }

  const data = (await resp.json()) as { channelId: string; guildId: string };
  const channel_id = data.channelId;

  // Persist the full call record
  await q(
    `INSERT INTO PRIVATE_CALLS
       (id, user_1, user_2, channel_id, guild_id, node_base_url, token, created_at, active)
     VALUES
       (:id, :u1, :u2, :channel, :guild, :nodeUrl, :token, NOW(), TRUE)`,
    {
      id: call_id,
      u1: user1_id,
      u2: user2_id,
      channel: channel_id,
      guild: guildId,
      nodeUrl: nodeBaseUrl,
      token
    }
  );

  return { call_id, channel_id, guild_id: guildId, node_base_url: nodeBaseUrl };
}

/**
 * Delete the ephemeral voice channel from the server-node and remove the two
 * users from the system guild.  Safe to call multiple times (idempotent).
 */
async function cleanup_voice_channel(
  channelId: string,
  nodeBaseUrl: string,
  user1Id: string,
  user2Id: string
): Promise<void> {
  const syncSecret = env.CORE_NODE_SYNC_SECRET;
  if (!syncSecret || !nodeBaseUrl || !channelId) return;

  try {
    await fetch(
      `${nodeBaseUrl.replace(/\/$/, "")}/v1/internal/private-call-channel/${encodeURIComponent(channelId)}`,
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "x-node-sync-secret": syncSecret
        },
        body: JSON.stringify({ user1Id, user2Id })
      }
    );
  } catch {
    // Best-effort — if the node is down the channel will be stale but the call
    // is already marked ended in the core DB.
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────

export async function CallRoutes(
  app: FastifyInstance,
  broadcastToUser?: (targetUserId: string, t: string, d: any) => Promise<void>
) {
  // ── GET STATUS ─────────────────────────────────────────────────────────────

  app.post("/call/get_status", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const caller: string | undefined = req.body?.caller;
    const call_id: string | undefined = req.body?.callid;

    if (!caller) return rep.send({ error: true, code: 421 });
    if (!call_id) return rep.send({ error: true, code: 422 });

    const existing = await q<{ active: number }>(
      `SELECT active
       FROM PRIVATE_CALLS
       WHERE id = :callId
         AND (user_1 = :caller OR user_2 = :caller)
       LIMIT 1`,
      { callId: call_id, caller }
    );

    if (existing.length) {
      return rep.send({ success: true, active: !!existing[0].active });
    }
    return rep.send({ success: false, error: true, code: 420 });
  });

  // ── CREATE CALL ────────────────────────────────────────────────────────────

  app.post("/call/create", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const target_id: string | undefined = req.body?.id;
    const userId = req.user.sub as string;

    if (!userId) return rep.send({ success: false, error: true, code: 512 });
    if (!target_id) return rep.send({ success: false, error: true, code: 510 });
    if (await isOfficialAccountUserId(target_id)) {
      return rep.code(403).send({ success: false, error: true, code: 513, message: "OFFICIAL_ACCOUNT_NO_REPLY" });
    }

    // Verify they are friends
    const rows = await q<{ id: string }>(
      `SELECT u.id
       FROM friendships f
       JOIN users u ON u.id = f.friend_user_id
       WHERE f.user_id = :userId`,
      { userId }
    );
    if (!rows.some(r => r.id === target_id)) {
      return rep.send({ success: false, error: true, code: 509 });
    }

    // Find or create the DM thread
    let thread = await q<{ id: string; user_a: string; user_b: string }>(
      `SELECT id, user_a, user_b
       FROM social_dm_threads
       WHERE (user_a = :userId AND user_b = :targetId)
          OR (user_a = :targetId AND user_b = :userId)
       LIMIT 1`,
      { userId, targetId: target_id }
    );
    if (!thread.length) {
      const newThreadId = ulidLike();
      await q(
        `INSERT INTO social_dm_threads (id, user_a, user_b, last_message_at)
         VALUES (:id, :userA, :userB, NOW())`,
        { id: newThreadId, userA: userId, userB: target_id }
      );
      thread = [{ id: newThreadId, user_a: userId, user_b: target_id }];
    }

    // Insert the system call-request message
    const messageId = ulidLike();
    const content = "__CALL_REQUEST__";
    await q(
      `INSERT INTO social_dm_messages (id, thread_id, sender_user_id, content)
       VALUES (:id, :threadId, :userId, :content)`,
      { id: messageId, threadId: thread[0].id, userId, content }
    );
    await q(
      `UPDATE social_dm_threads SET last_message_at = NOW() WHERE id = :threadId`,
      { threadId: thread[0].id }
    );

    // Provision the voice channel on the official server-node
    let callResult: Awaited<ReturnType<typeof generate_voice_channel>> = null;
    try {
      callResult = await generate_voice_channel(userId, target_id);
    } catch (err: any) {
      app.log.warn(
        { err: err?.message ?? String(err) },
        "private-call: failed to provision voice channel"
      );
    }

    const nodeConfigured = !!(
      env.OFFICIAL_NODE_BASE_URL &&
      env.OFFICIAL_NODE_SERVER_ID &&
      env.PRIVATE_CALLS_GUILD_ID &&
      env.CORE_NODE_SYNC_SECRET
    );

    if (broadcastToUser) {
      const createdAt = new Date().toISOString();

      // Push the DM notification to both participants
      const dmPayload = {
        threadId: thread[0].id,
        message: {
          id: messageId,
          authorId: userId,
          content,
          createdAt,
          attachments: []
        }
      };
      await broadcastToUser(userId, "SOCIAL_DM_MESSAGE_CREATE", dmPayload);
      await broadcastToUser(target_id, "SOCIAL_DM_MESSAGE_CREATE", dmPayload);

      // Push the CALL_CREATE event so both clients can display the incoming-call UI
      if (callResult) {
        const callPayload = {
          callId: callResult.call_id,
          channelId: callResult.channel_id,
          guildId: callResult.guild_id,
          nodeBaseUrl: callResult.node_base_url,
          callerId: userId,
          targetId: target_id,
          createdAt
        };
        await broadcastToUser(userId, "PRIVATE_CALL_CREATE", callPayload);
        await broadcastToUser(target_id, "PRIVATE_CALL_CREATE", callPayload);
      }
    }

    if (!nodeConfigured) {
      return rep.send({
        success: true,
        warning: "voice_unavailable",
        message: "Call request sent but voice channel could not be provisioned (node not configured)"
      });
    }

    if (!callResult) {
      return rep.send({
        success: false,
        error: true,
        message: "Call request sent but voice channel provisioning failed"
      });
    }

    return rep.send({
      success: true,
      call_id: callResult.call_id,
      channel_id: callResult.channel_id,
      guild_id: callResult.guild_id,
      node_base_url: callResult.node_base_url,
      message: "Call created successfully"
    });
  });

  // ── JOIN CALL ──────────────────────────────────────────────────────────────
  //
  // The client calls this right before connecting to voice.  It verifies the
  // caller is a legitimate participant and returns a short-lived membership
  // token they can use to authenticate with the server-node gateway.

  app.post("/call/join", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const userId = req.user.sub as string;
    const call_id: string | undefined = req.body?.callId ?? req.body?.call_id;

    if (!userId) return rep.send({ success: false, error: true, code: 512 });
    if (!call_id) return rep.send({ success: false, error: true, code: 422 });

    const calls = await q<{
      id: string;
      user_1: string;
      user_2: string;
      channel_id: string;
      guild_id: string | null;
      node_base_url: string | null;
      active: number;
    }>(
      `SELECT id, user_1, user_2, channel_id, guild_id, node_base_url, active
       FROM PRIVATE_CALLS
       WHERE id = :callId
       LIMIT 1`,
      { callId: call_id }
    );

    if (!calls.length) {
      return rep.send({ success: false, error: true, code: 420 });
    }

    const call = calls[0];

    // Only the two participants may join
    if (call.user_1 !== userId && call.user_2 !== userId) {
      return rep.code(403).send({ success: false, error: "NOT_A_PARTICIPANT" });
    }

    if (!call.active || !call.channel_id || !call.guild_id || !call.node_base_url) {
      return rep.send({ success: false, error: "CALL_NOT_ACTIVE_OR_NO_VOICE_CHANNEL" });
    }

    const nodeServerId = env.OFFICIAL_NODE_SERVER_ID;
    if (!nodeServerId) {
      return rep.send({ success: false, error: true, code: 511 });
    }

    // Issue a membership token for the official node.
    // core_server_id is set to OFFICIAL_NODE_SERVER_ID so the private-calls
    // guild (whose server_id = OFFICIAL_NODE_SERVER_ID) passes the tenant check.
    const membershipToken = await signMembershipToken(
      nodeServerId,     // aud / server_id
      userId,
      ["user"],         // roles — user is a guild member so no need for platform_admin
      "user",           // platformRole
      nodeServerId      // core_server_id matches guild.server_id
    );

    return rep.send({
      success: true,
      membershipToken,
      nodeBaseUrl: call.node_base_url,
      guildId: call.guild_id,
      channelId: call.channel_id,
      callId: call.id
    });
  });

  // ── END CALL ───────────────────────────────────────────────────────────────

  app.post("/call/end", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const userId = req.user.sub as string;

    if (!userId) return rep.send({ success: false, error: true, code: 512 });

    const calls = await q<{
      id: string;
      user_1: string;
      user_2: string;
      channel_id: string;
      guild_id: string | null;
      node_base_url: string | null;
    }>(
      `SELECT id, user_1, user_2, channel_id, guild_id, node_base_url
       FROM PRIVATE_CALLS
       WHERE active = TRUE
         AND ended_at IS NULL
         AND (user_1 = :uid OR user_2 = :uid)
       LIMIT 1`,
      { uid: userId }
    );

    if (!calls.length) {
      return rep.send({ success: false, error: true, code: 404 });
    }

    const call = calls[0];

    // Mark the call as ended in the DB first (so it's consistent even if
    // the node cleanup below fails)
    await q(
      `UPDATE PRIVATE_CALLS
       SET ended_at = NOW(), active = FALSE
       WHERE id = :id`,
      { id: call.id }
    );

    // Clean up the ephemeral voice channel on the server-node
    if (call.channel_id && call.node_base_url) {
      await cleanup_voice_channel(
        call.channel_id,
        call.node_base_url,
        call.user_1,
        call.user_2
      );
    }

    // Notify both participants
    if (broadcastToUser) {
      const payload = {
        callId: call.id,
        channelId: call.channel_id,
        endedBy: userId,
        endedAt: new Date().toISOString()
      };
      await broadcastToUser(call.user_1, "PRIVATE_CALL_ENDED", payload);
      await broadcastToUser(call.user_2, "PRIVATE_CALL_ENDED", payload);
    }

    return rep.send({ success: true, message: "Call ended successfully" });
  });
}
