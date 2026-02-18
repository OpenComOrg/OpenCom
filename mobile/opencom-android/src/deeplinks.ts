import type { DeepLinkTarget } from "./types";

const INVITE_CODE_RE = /^[a-zA-Z0-9_-]{3,32}$/;

export function parseDeepLink(inputUrl: string): DeepLinkTarget | null {
  const raw = String(inputUrl || "").trim();
  if (!raw) return null;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  const parts = buildPathParts(parsed);
  if (!parts.length) return null;

  if (parts[0] === "login") return { kind: "login" };

  if (parts[0] === "join" && parts[1] && INVITE_CODE_RE.test(parts[1])) {
    return { kind: "join", code: parts[1] };
  }

  if (parts[0] === "server" && parts[1]) {
    return { kind: "server", serverId: parts[1] };
  }

  if (parts[0] === "channel" && parts[1] && parts[2] && parts[3]) {
    return {
      kind: "channel",
      serverId: parts[1],
      guildId: parts[2],
      channelId: parts[3]
    };
  }

  return null;
}

function buildPathParts(parsed: URL): string[] {
  const host = parsed.host || "";
  const fromPath = (parsed.pathname || "")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parsed.protocol === "opencom:") {
    return [host, ...fromPath].filter(Boolean);
  }

  if (parsed.protocol === "http:" || parsed.protocol === "https:") {
    return fromPath;
  }

  return [];
}
