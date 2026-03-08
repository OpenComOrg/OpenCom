import { ulidLike } from "@ods/shared/ids.js";
import { q } from "./db.js";

export const OFFICIAL_ACCOUNT_USERNAME = "opencom";
export const OFFICIAL_BADGE_ID = "OFFICIAL";

export type OfficialBadgeDetail = {
  id: string;
  name: string;
  icon: string;
  bgColor: string;
  fgColor: string;
  createdAt: string | null;
};

export type OfficialAccount = {
  id: string;
  username: string;
  display_name: string | null;
  pfp_url: string | null;
  email?: string | null;
};

export type DmCounterpartyMeta = {
  userId: string;
  username: string;
  displayName: string | null;
  pfpUrl: string | null;
  isOfficial: boolean;
  isNoReply: boolean;
  badgeDetails: OfficialBadgeDetail[];
};

export function isOfficialAccountName(value: string | null | undefined): boolean {
  return String(value || "").trim().toLowerCase() === OFFICIAL_ACCOUNT_USERNAME;
}

export function isOfficialBadgeId(value: string | null | undefined): boolean {
  return String(value || "").trim().toLowerCase() === OFFICIAL_BADGE_ID.toLowerCase();
}

export function buildOfficialBadgeDetail(createdAt: string | null = null): OfficialBadgeDetail {
  return {
    id: OFFICIAL_BADGE_ID,
    name: "OFFICIAL",
    icon: "✓",
    bgColor: "#1292ff",
    fgColor: "#ffffff",
    createdAt
  };
}

export function buildOfficialDmMeta(user: {
  id: string;
  username: string;
  display_name: string | null;
  pfp_url: string | null;
}): DmCounterpartyMeta {
  const isOfficial = isOfficialAccountName(user.username);
  return {
    userId: user.id,
    username: user.username,
    displayName: user.display_name,
    pfpUrl: user.pfp_url,
    isOfficial,
    isNoReply: isOfficial,
    badgeDetails: isOfficial ? [buildOfficialBadgeDetail()] : []
  };
}

export async function getOfficialAccount(): Promise<OfficialAccount | null> {
  const rows = await q<OfficialAccount>(
    `SELECT id,username,display_name,pfp_url,email
     FROM users
     WHERE LOWER(username)=LOWER(:username)
     LIMIT 1`,
    { username: OFFICIAL_ACCOUNT_USERNAME }
  );
  return rows[0] || null;
}

export async function isOfficialAccountUserId(userId: string): Promise<boolean> {
  if (!userId) return false;
  const rows = await q<{ id: string }>(
    `SELECT id
     FROM users
     WHERE id=:userId
       AND LOWER(username)=LOWER(:username)
     LIMIT 1`,
    { userId, username: OFFICIAL_ACCOUNT_USERNAME }
  );
  return rows.length > 0;
}

export async function getDmCounterpartyMeta(threadId: string, userId: string): Promise<DmCounterpartyMeta | null> {
  const rows = await q<{
    other_user_id: string;
    other_username: string;
    other_display_name: string | null;
    other_pfp_url: string | null;
  }>(
    `SELECT CASE WHEN t.user_a=:userId THEN t.user_b ELSE t.user_a END AS other_user_id,
            u.username AS other_username,
            u.display_name AS other_display_name,
            u.pfp_url AS other_pfp_url
     FROM social_dm_threads t
     JOIN users u ON u.id = CASE WHEN t.user_a=:userId THEN t.user_b ELSE t.user_a END
     WHERE t.id=:threadId
       AND (t.user_a=:userId OR t.user_b=:userId)
     LIMIT 1`,
    { threadId, userId }
  );

  if (!rows.length) return null;

  return buildOfficialDmMeta({
    id: rows[0].other_user_id,
    username: rows[0].other_username,
    display_name: rows[0].other_display_name,
    pfp_url: rows[0].other_pfp_url
  });
}

export async function ensureSocialDmThread(userId: string, friendId: string): Promise<string> {
  const [userA, userB] = userId < friendId ? [userId, friendId] : [friendId, userId];
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
