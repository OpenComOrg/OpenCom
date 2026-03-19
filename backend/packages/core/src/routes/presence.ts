import type { FastifyInstance } from "fastify";
import type { PresenceUpdate } from "@ods/shared/events.js";
import { z } from "zod";
import { normalizeRichPresenceInput, RichPresence, presenceGetMany } from "../presence.js";
import { q } from "../db.js";

type PresenceSnapshot = {
  status: PresenceUpdate["status"];
  customStatus: string | null;
  richPresence: any | null;
};

type BroadcastPresence = (
  userId: string,
  presence: PresenceSnapshot,
) => Promise<void>;

function parseJsonIfString(value: unknown) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

const RichPresenceActivity = z.preprocess(
  parseJsonIfString,
  RichPresence.nullable(),
);

const RichPresenceBody = z.preprocess((value) => {
  const parsed = parseJsonIfString(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return parsed;
  }
  if (Object.prototype.hasOwnProperty.call(parsed, "activity")) {
    return {
      ...parsed,
      activity: parseJsonIfString((parsed as Record<string, unknown>).activity),
    };
  }
  return { activity: parsed };
}, z.object({
  activity: RichPresenceActivity,
}));

async function loadPresenceSnapshot(userId: string): Promise<PresenceSnapshot> {
  const latest = (await presenceGetMany([userId]))[userId];
  if (latest) {
    return {
      status: latest.status as PresenceUpdate["status"],
      customStatus: latest.customStatus,
      richPresence: latest.richPresence,
    };
  }
  return {
    status: "online",
    customStatus: null,
    richPresence: null,
  };
}

export async function presenceRoutes(
  app: FastifyInstance,
  broadcastPresence?: BroadcastPresence,
) {
  app.get("/v1/presence", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const raw = (req.query as { userIds?: string }).userIds;
    const userIds = typeof raw === "string" ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [];
    const result = await presenceGetMany(userIds);
    return rep.send(result);
  });

  app.post("/v1/presence/rpc", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const userId = req.user.sub as string;
    const body = RichPresenceBody.parse(req.body);
    const activity = normalizeRichPresenceInput(body.activity);
    const activityJson = activity ? JSON.stringify(activity) : null;

    await q(
      `INSERT INTO presence (user_id, status, custom_status, rich_presence_json, updated_at)
       VALUES (:userId, 'online', NULL, :activityJson, NOW())
       ON DUPLICATE KEY UPDATE rich_presence_json=:activityJson, updated_at=NOW()`,
      { userId, activityJson }
    );

    if (broadcastPresence) {
      await broadcastPresence(userId, await loadPresenceSnapshot(userId));
    }

    return rep.send({ ok: true, activity });
  });

  app.delete("/v1/presence/rpc", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const userId = req.user.sub as string;
    await q(`UPDATE presence SET rich_presence_json=NULL, updated_at=NOW() WHERE user_id=:userId`, { userId });

    if (broadcastPresence) {
      await broadcastPresence(userId, await loadPresenceSnapshot(userId));
    }

    return rep.send({ ok: true });
  });
}
