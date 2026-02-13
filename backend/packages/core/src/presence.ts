import { PresenceUpdate } from "@ods/shared/events.js";
import { q } from "./db.js";

export async function presenceUpsert(userId: string, presence: PresenceUpdate) {
  await q(
    `INSERT INTO presence (user_id, status, custom_status, updated_at)
     VALUES (:userId, :status, :customStatus, NOW())
     ON DUPLICATE KEY UPDATE
       status=VALUES(status), custom_status=VALUES(custom_status), updated_at=NOW()`,
    { userId, status: presence.status, customStatus: presence.customStatus ?? null }
  );
}
