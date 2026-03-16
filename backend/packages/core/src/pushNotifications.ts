import { q } from "./db.js";

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";

type MobilePushTokenRow = {
  id: string;
  token: string;
  platform: "android" | "ios";
};

type PresenceStatusRow = {
  status: string | null;
};

export type MobilePushInput = {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
};

function isExpoPushToken(token: string) {
  const value = String(token || "").trim();
  return (
    /^ExponentPushToken\[[^\]]+\]$/.test(value) ||
    /^ExpoPushToken\[[^\]]+\]$/.test(value)
  );
}

async function getUserPushTokens(userId: string): Promise<MobilePushTokenRow[]> {
  if (!userId) return [];
  return q<MobilePushTokenRow>(
    `SELECT id,token,platform
     FROM mobile_push_tokens
     WHERE user_id=:userId`,
    { userId },
  );
}

async function isUserOnDoNotDisturb(userId: string): Promise<boolean> {
  if (!userId) return false;
  const rows = await q<PresenceStatusRow>(
    `SELECT status
     FROM presence
     WHERE user_id=:userId
     LIMIT 1`,
    { userId },
  );
  return String(rows[0]?.status || "").trim().toLowerCase() === "dnd";
}

async function deletePushTokens(tokenIds: string[]) {
  if (!Array.isArray(tokenIds) || tokenIds.length === 0) return;
  const params: Record<string, string> = {};
  const inList = tokenIds
    .map((id, index) => {
      params[`id${index}`] = id;
      return `:id${index}`;
    })
    .join(",");
  await q(`DELETE FROM mobile_push_tokens WHERE id IN (${inList})`, params);
}

function normalizeNotificationBody(value: string) {
  const trimmed = String(value || "").replace(/\s+/g, " ").trim();
  if (!trimmed) return "Open OpenCom to view it.";
  return trimmed.slice(0, 160);
}

export async function sendMobilePushToUser(
  input: MobilePushInput,
): Promise<{ sent: number; suppressed: boolean }> {
  const userId = String(input.userId || "").trim();
  if (!userId) return { sent: 0, suppressed: false };

  if (await isUserOnDoNotDisturb(userId)) {
    return { sent: 0, suppressed: true };
  }

  const tokens = (await getUserPushTokens(userId)).filter((row) =>
    isExpoPushToken(row.token),
  );
  if (tokens.length === 0) return { sent: 0, suppressed: false };

  const payload = tokens.map((row) => ({
    to: row.token,
    sound: input.sound === null ? undefined : input.sound || "default",
    title: String(input.title || "").trim() || "OpenCom",
    body: normalizeNotificationBody(input.body),
    data: {
      ...(input.data || {}),
      title: String(input.title || "").trim() || "OpenCom",
    },
  }));

  try {
    const response = await fetch(EXPO_PUSH_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`EXPO_PUSH_${response.status}`);
    }

    const result = await response.json().catch(() => ({} as any));
    const tickets = Array.isArray(result?.data) ? result.data : [];
    const invalidTokenIds: string[] = [];

    tickets.forEach((ticket: any, index: number) => {
      if (ticket?.status !== "error") return;
      const errorCode = String(ticket?.details?.error || "");
      if (
        errorCode === "DeviceNotRegistered" ||
        errorCode === "ExponentPushTokenInvalid"
      ) {
        const tokenId = tokens[index]?.id;
        if (tokenId) invalidTokenIds.push(tokenId);
      }
    });

    if (invalidTokenIds.length) {
      await deletePushTokens(invalidTokenIds);
    }

    return {
      sent: Math.max(0, tokens.length - invalidTokenIds.length),
      suppressed: false,
    };
  } catch (error) {
    console.warn(
      "[mobile-push] delivery failed",
      error instanceof Error ? error.message : String(error || "UNKNOWN_ERROR"),
    );
    return { sent: 0, suppressed: false };
  }
}
