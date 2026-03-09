import { q } from "./db.js";
import { isOfficialAccountName } from "./officialAccount.js";

export function normalizeUsername(value: string | null | undefined): string {
  return String(value || "").trim();
}

export function isReservedUsername(value: string | null | undefined): boolean {
  return isOfficialAccountName(normalizeUsername(value));
}

export async function isUsernameTaken(username: string, excludeUserId?: string): Promise<boolean> {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) return false;

  const rows = excludeUserId
    ? await q<{ id: string }>(
      `SELECT id
       FROM users
       WHERE LOWER(username)=LOWER(:username)
         AND id<>:excludeUserId
       LIMIT 1`,
      { username: normalizedUsername, excludeUserId }
    )
    : await q<{ id: string }>(
      `SELECT id
       FROM users
       WHERE LOWER(username)=LOWER(:username)
       LIMIT 1`,
      { username: normalizedUsername }
    );

  return rows.length > 0;
}
