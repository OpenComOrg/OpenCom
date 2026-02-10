import { PresenceUpdate } from "@ods/shared/events.js";
import { q } from "./db.js";

export async function presenceUpsert(userId: string, presence: PresenceUpdate) {
  await q(
    `INSERT INTO presence (user_id, status, custom_status, updated_at)
     VALUES ($1,$2,$3, now())
     ON CONFLICT (user_id) DO UPDATE
       SET status=excluded.status, custom_status=excluded.custom_status, updated_at=now()`,
    [userId, presence.status, presence.customStatus ?? null]
  );
}
