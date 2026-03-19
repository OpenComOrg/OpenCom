import { q } from "../db.js";
import type { FastifyInstance } from "fastify";
import { ulidLike } from "@ods/shared/ids.js";
import crypto from "crypto";
import { env } from "../env.js";
import { signMembershipToken } from "../membershipToken.js";
import { isOfficialAccountUserId } from "../officialAccount.js";
import { sendMobilePushToUser } from "../pushNotifications.js";

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

type BroadcastToUser = (targetUserId: string, t: string, d: any) => Promise<void>;

type PrivateCallRow = {
  id: string;
  user_1: string;
  user_2: string;
  channel_id: string;
  guild_id: string | null;
  node_base_url: string | null;
  active: number;
  created_at: string;
  ended_at: string | null;
};

type PrivateCallStatusResult = {
  active: boolean;
  connectedParticipantIds: string[];
  staleReason: string | null;
};

const PRIVATE_CALL_STALE_GRACE_MS = 45_000;

function buildAppDeepLink(path: string) {
  const normalized = String(path || "").replace(/^\/+/, "");
  return `opencom://${normalized}`;
}

function is_private_call_active(call: Pick<PrivateCallRow, "active" | "ended_at">) {
  return !!call.active && !call.ended_at;
}

function is_same_private_call_pair(
  call: Pick<PrivateCallRow, "user_1" | "user_2">,
  user1Id: string,
  user2Id: string
) {
  return (
    (call.user_1 === user1Id && call.user_2 === user2Id) ||
    (call.user_1 === user2Id && call.user_2 === user1Id)
  );
}

function is_private_call_stale(call: Pick<PrivateCallRow, "created_at">) {
  const createdAtMs = new Date(call.created_at).getTime();
  if (!Number.isFinite(createdAtMs)) return true;
  return Date.now() - createdAtMs >= PRIVATE_CALL_STALE_GRACE_MS;
}

async function end_private_call(
  call: Pick<
    PrivateCallRow,
    "id" | "user_1" | "user_2" | "channel_id" | "node_base_url"
  >,
  endedBy: string,
  broadcastToUser?: BroadcastToUser
) {
  await q(
    `UPDATE PRIVATE_CALLS
     SET ended_at = COALESCE(ended_at, NOW()), active = FALSE
     WHERE id = :id`,
    { id: call.id }
  );

  if (call.channel_id && call.node_base_url) {
    await cleanup_voice_channel(
      call.channel_id,
      call.node_base_url,
      call.user_1,
      call.user_2
    );
  }

  if (!broadcastToUser) return;

  const payload = {
    callId: call.id,
    channelId: call.channel_id,
    endedBy,
    endedAt: new Date().toISOString()
  };
  await broadcastToUser(call.user_1, "PRIVATE_CALL_ENDED", payload);
  await broadcastToUser(call.user_2, "PRIVATE_CALL_ENDED", payload);
}

async function fetch_private_call_channel_status(
  call: Pick<PrivateCallRow, "channel_id" | "node_base_url" | "user_1" | "user_2">
) {
  const syncSecret = env.CORE_NODE_SYNC_SECRET;
  if (!syncSecret || !call.channel_id || !call.node_base_url) {
    return null;
  }

  try {
    const resp = await fetch(
      `${call.node_base_url.replace(/\/$/, "")}/v1/internal/private-call-channel/${encodeURIComponent(call.channel_id)}/status`,
      {
        headers: {
          "x-node-sync-secret": syncSecret
        }
      }
    );

    if (resp.status === 404) {
      return { channelMissing: true, connectedParticipantIds: [] as string[] };
    }

    if (!resp.ok) {
      return null;
    }

    const data = (await resp.json()) as {
      connectedUserIds?: string[];
      voiceStates?: Array<{ userId?: string }>;
    };
    const rawUserIds = Array.isArray(data.connectedUserIds)
      ? data.connectedUserIds
      : Array.isArray(data.voiceStates)
        ? data.voiceStates.map((row) => row?.userId || "")
        : [];
    const connectedParticipantIds = [...new Set(rawUserIds)].filter(
      (userId) => userId === call.user_1 || userId === call.user_2
    );

    return { channelMissing: false, connectedParticipantIds };
  } catch {
    return null;
  }
}

async function reconcile_private_call_state(
  call: PrivateCallRow,
  broadcastToUser?: BroadcastToUser,
  options: { requireConnected?: boolean; requiredUserId?: string } = {}
): Promise<PrivateCallStatusResult> {
  if (!is_private_call_active(call)) {
    return { active: false, connectedParticipantIds: [], staleReason: "already_ended" };
  }

  const shouldRequireConnected = options.requireConnected === true;
  const requiredUserId = options.requiredUserId || "";
  const canCheckNodeState =
    !!call.channel_id && !!call.guild_id && !!call.node_base_url && !!env.CORE_NODE_SYNC_SECRET;

  if (!canCheckNodeState) {
    if (!shouldRequireConnected && !is_private_call_stale(call)) {
      return { active: true, connectedParticipantIds: [], staleReason: null };
    }

    await end_private_call(call, "system", broadcastToUser);
    return {
      active: false,
      connectedParticipantIds: [],
      staleReason: shouldRequireConnected ? "not_connected" : "missing_voice_channel"
    };
  }

  const status = await fetch_private_call_channel_status(call);
  if (!status) {
    if (!is_private_call_stale(call)) {
      return { active: true, connectedParticipantIds: [], staleReason: null };
    }

    await end_private_call(call, "system", broadcastToUser);
    return {
      active: false,
      connectedParticipantIds: [],
      staleReason: "status_unavailable"
    };
  }

  if (
    status.connectedParticipantIds.length > 0 &&
    (!shouldRequireConnected ||
      !requiredUserId ||
      status.connectedParticipantIds.includes(requiredUserId))
  ) {
    return {
      active: true,
      connectedParticipantIds: status.connectedParticipantIds,
      staleReason: null
    };
  }

  if (!status.channelMissing && !shouldRequireConnected && !is_private_call_stale(call)) {
    return { active: true, connectedParticipantIds: [], staleReason: null };
  }

  await end_private_call(call, "system", broadcastToUser);
  return {
    active: false,
    connectedParticipantIds: [],
    staleReason: status.channelMissing ? "channel_missing" : "not_connected"
  };
}

/**
 * Create an ephemeral voice channel in the private-calls system guild on the
 * official server-node and record the call in the PRIVATE_CALLS table.
 *
 * Returns null (without throwing) when the official node is not configured so
 * the caller can decide how to handle a "voice unavailable" situation.
 */
async function generate_voice_channel(
  user1_id: string,
  user2_id: string,
  broadcastToUser?: BroadcastToUser
): Promise<{
  call_id: string;
  channel_id: string;
  guild_id: string;
  node_base_url: string;
} | null> {
  if (!user1_id || !user2_id) throw new Error("User ID missing");
  if (user1_id === user2_id) throw new Error("Cannot call yourself");

  // Reconcile any stale call records before we decide a user is still busy.
  const existing = await q<PrivateCallRow>(
    `SELECT id, user_1, user_2, channel_id, guild_id, node_base_url, active, created_at, ended_at
     FROM PRIVATE_CALLS
     WHERE active = TRUE
       AND ended_at IS NULL
       AND (user_1 = :u1 OR user_2 = :u1
            OR user_1 = :u2 OR user_2 = :u2)
     ORDER BY created_at DESC`,
    { u1: user1_id, u2: user2_id }
  );
  for (const call of existing) {
    const reconciled = await reconcile_private_call_state(call, broadcastToUser);
    if (
      reconciled.active &&
      reconciled.connectedParticipantIds.length === 0 &&
      is_same_private_call_pair(call, user1_id, user2_id)
    ) {
      await end_private_call(call, "system", broadcastToUser);
      continue;
    }
    if (reconciled.active) {
      throw new Error("User already in an active call");
    }
  }

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
  broadcastToUser?: BroadcastToUser
) {
  // ── GET STATUS ─────────────────────────────────────────────────────────────

  app.post("/call/get_status", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const caller = req.user.sub as string;
    const call_id: string | undefined = req.body?.callId ?? req.body?.callid;
    const requireConnected = req.body?.requireConnected === true;

    if (!caller) return rep.send({ error: true, code: 421 });
    if (!call_id) return rep.send({ error: true, code: 422 });

    const existing = await q<PrivateCallRow>(
      `SELECT id, user_1, user_2, channel_id, guild_id, node_base_url, active, created_at, ended_at
       FROM PRIVATE_CALLS
       WHERE id = :callId
         AND (user_1 = :caller OR user_2 = :caller)
       LIMIT 1`,
      { callId: call_id, caller }
    );

    if (existing.length) {
      const status = await reconcile_private_call_state(
        existing[0],
        broadcastToUser,
        { requireConnected, requiredUserId: caller }
      );
      return rep.send({
        success: true,
        active: status.active,
        connected: status.connectedParticipantIds.includes(caller),
        connectedUserIds: status.connectedParticipantIds,
        staleReason: status.staleReason
      });
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
      callResult = await generate_voice_channel(userId, target_id, broadcastToUser);
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

    const callerRows = await q<{
      username: string;
      display_name: string | null;
      pfp_url: string | null;
    }>(
      `SELECT username,display_name,pfp_url FROM users WHERE id=:userId LIMIT 1`,
      { userId }
    );
    const callerName =
      callerRows[0]?.display_name || callerRows[0]?.username || "Unknown";
    const callerPfp = callerRows[0]?.pfp_url ?? null;

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
          callerName,
          callerPfp,
          targetId: target_id,
          createdAt
        };
        await broadcastToUser(userId, "PRIVATE_CALL_CREATE", callPayload);
        await broadcastToUser(target_id, "PRIVATE_CALL_CREATE", callPayload);
      }
    }

    if (callResult) {
      await sendMobilePushToUser({
        userId: target_id,
        title: "Incoming call",
        body: `${callerName} is calling you`,
        data: {
          deepLink: buildAppDeepLink(`dm/${thread[0].id}`),
          kind: "call",
          callId: callResult.call_id,
          callerId: userId,
          callerName,
          callerPfp,
          threadId: thread[0].id
        }
      });
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

    const calls = await q<PrivateCallRow>(
      `SELECT id, user_1, user_2, channel_id, guild_id, node_base_url, active, created_at, ended_at
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

    const status = await reconcile_private_call_state(call, broadcastToUser);
    if (!status.active || !call.channel_id || !call.guild_id || !call.node_base_url) {
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

    const calls = await q<PrivateCallRow>(
      `SELECT id, user_1, user_2, channel_id, guild_id, node_base_url, active, created_at, ended_at
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
    await end_private_call(call, userId, broadcastToUser);

    return rep.send({ success: true, message: "Call ended successfully" });
  });
}
