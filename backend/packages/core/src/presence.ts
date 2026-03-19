import { PresenceUpdate } from "@ods/shared/events.js";
import { q } from "./db.js";
import { z } from "zod";
import { env } from "./env.js";

function isValidRichPresenceImageReference(value: string) {
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

function normalizeRichPresenceImageReference(value: string) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  const base = env.PROFILE_IMAGE_BASE_URL.replace(/\/$/, "");
  if (trimmed.startsWith("users/")) return `${base}/${trimmed}`;
  if (trimmed.startsWith("/users/")) return `${base}${trimmed}`;
  return trimmed;
}

const richPresenceImageUrl = z.string()
  .trim()
  .max(1024)
  .refine(
    isValidRichPresenceImageReference,
    "Use an uploaded image path or a valid http(s) URL",
  )
  .transform(normalizeRichPresenceImageReference);

export const RichPresence = z.object({
  name: z.string().trim().min(1).max(128).optional().nullable(),
  details: z.string().trim().max(128).optional().nullable(),
  state: z.string().trim().max(128).optional().nullable(),
  largeImageUrl: richPresenceImageUrl.optional().nullable(),
  largeImageText: z.string().trim().max(128).optional().nullable(),
  smallImageUrl: richPresenceImageUrl.optional().nullable(),
  smallImageText: z.string().trim().max(128).optional().nullable(),
  buttons: z.array(z.object({
    label: z.string().trim().min(1).max(32),
    url: z.string().trim().url().max(1024)
  })).max(2).optional(),
  startTimestamp: z.number().int().positive().optional().nullable(),
  endTimestamp: z.number().int().positive().optional().nullable()
}).strict();

export function normalizeRichPresenceInput(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  let nextValue = value;
  if (typeof nextValue === "string") {
    try {
      nextValue = JSON.parse(nextValue);
    } catch {
      nextValue = value;
    }
  }
  return RichPresence.parse(nextValue);
}

export async function presenceUpsert(userId: string, presence: PresenceUpdate) {
  const richPresence = normalizeRichPresenceInput((presence as any).richPresence);
  const richPresenceJson = richPresence == null ? null : JSON.stringify(richPresence);
  await q(
    `INSERT INTO presence (user_id, status, custom_status, rich_presence_json, updated_at)
     VALUES (:userId, :status, :customStatus, CASE WHEN :hasRichPresence=1 THEN :richPresenceJson ELSE NULL END, NOW())
     ON DUPLICATE KEY UPDATE
       status=VALUES(status),
       custom_status=VALUES(custom_status),
       rich_presence_json=CASE WHEN :hasRichPresence=1 THEN :richPresenceJson ELSE rich_presence_json END,
       updated_at=NOW()`,
    {
      userId,
      status: presence.status,
      customStatus: presence.customStatus ?? null,
      hasRichPresence: richPresence !== undefined ? 1 : 0,
      richPresenceJson
    }
  );
}

export type PresenceRow = { user_id: string; status: string; custom_status: string | null; rich_presence_json: string | null };

export async function presenceGetMany(userIds: string[]): Promise<Record<string, { status: string; customStatus: string | null; richPresence: any | null }>> {
  if (userIds.length === 0) return {};
  const seen = new Set<string>();
  const unique = userIds.filter((id) => id && seen.size < 200 && !seen.has(id) && (seen.add(id), true));
  if (unique.length === 0) return {};
  const placeholders = unique.map((_, i) => `:id${i}`).join(", ");
  const params = Object.fromEntries(unique.map((id, i) => [`id${i}`, id]));
  const rows = await q<PresenceRow>(
    `SELECT user_id, status, custom_status, rich_presence_json FROM presence WHERE user_id IN (${placeholders})`,
    params
  );
  const out: Record<string, { status: string; customStatus: string | null; richPresence: any | null }> = {};
  for (const row of rows) {
    let richPresence: any = null;
    if (row.rich_presence_json) {
      try {
        richPresence = RichPresence.parse(JSON.parse(row.rich_presence_json));
      } catch {
        richPresence = null;
      }
    }
    out[row.user_id] = { status: row.status, customStatus: row.custom_status, richPresence };
  }
  return out;
}
