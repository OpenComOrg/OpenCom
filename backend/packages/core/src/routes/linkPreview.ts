import { FastifyInstance } from "fastify";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { z } from "zod";
import { q } from "../db.js";
import { env } from "../env.js";

const URL_RE = /^https?:\/\//i;

function isPrivateHostname(hostname: string) {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "0.0.0.0" || host === "::1") return true;

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }

  if (host.startsWith("fc") || host.startsWith("fd")) return true;
  if (host.startsWith("fe80")) return true;
  return false;
}

function isPrivateIpAddress(address: string) {
  if (isIP(address) === 4) {
    const ipv4 = address.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!ipv4) return false;
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }

  if (isIP(address) === 6) {
    const normalized = address.toLowerCase();
    return normalized === "::1"
      || normalized.startsWith("fc")
      || normalized.startsWith("fd")
      || normalized.startsWith("fe8")
      || normalized.startsWith("fe9")
      || normalized.startsWith("fea")
      || normalized.startsWith("feb");
  }

  return false;
}

function decodeHtmlEntities(input = "") {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractMeta(html: string, key: string, attr: "property" | "name" = "property") {
  const re = new RegExp(`<meta[^>]*${attr}=["']${key}["'][^>]*content=["']([^"']+)["'][^>]*>`, "i");
  const reverseRe = new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*${attr}=["']${key}["'][^>]*>`, "i");
  const match = html.match(re) || html.match(reverseRe);
  return match?.[1] ? decodeHtmlEntities(match[1].trim()) : "";
}

function extractTitle(html: string) {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match?.[1] ? decodeHtmlEntities(match[1].trim()) : "";
}

function normalizeUrl(raw: string) {
  const parsed = new URL(raw);
  parsed.hash = "";
  return parsed.toString();
}

async function assertPreviewTargetAllowed(target: URL, appBaseHost: string) {
  if (target.username || target.password) {
    throw new Error("URL_NOT_ALLOWED");
  }

  const targetHost = target.hostname.toLowerCase();
  if (targetHost !== appBaseHost && isPrivateHostname(targetHost)) {
    throw new Error("URL_NOT_ALLOWED");
  }

  if (targetHost === appBaseHost) return;

  if (isIP(target.hostname) && isPrivateIpAddress(target.hostname)) {
    throw new Error("URL_NOT_ALLOWED");
  }

  const resolved = await lookup(target.hostname, { all: true });
  if (!resolved.length) {
    throw new Error("URL_NOT_ALLOWED");
  }
  if (resolved.some((entry) => isPrivateIpAddress(entry.address))) {
    throw new Error("URL_NOT_ALLOWED");
  }
}

async function fetchPreviewResponse(target: URL, appBaseHost: string, signal: AbortSignal) {
  let current = new URL(target.toString());

  for (let redirectCount = 0; redirectCount < 5; redirectCount += 1) {
    await assertPreviewTargetAllowed(current, appBaseHost);

    const response = await fetch(current.toString(), {
      method: "GET",
      redirect: "manual",
      signal,
      headers: {
        "User-Agent": "OpenComLinkPreview/1.0 (+https://opencom.online)",
        Accept: "text/html,application/xhtml+xml"
      }
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return response;
      current = new URL(location, current);
      continue;
    }

    return response;
  }

  throw new Error("FETCH_FAILED");
}

function inviteCodeFromUrl(url: URL) {
  const match = (url.pathname || "").match(/^\/join\/([a-zA-Z0-9_-]{3,32})\/?$/);
  return match?.[1] || "";
}

function giftCodeFromUrl(url: URL) {
  const match = (url.pathname || "").match(/^\/gift\/([a-zA-Z0-9_-]{8,96})\/?$/);
  return match?.[1] || "";
}

export async function linkPreviewRoutes(app: FastifyInstance) {
  app.get("/v1/link-preview", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const { url } = z.object({ url: z.string().min(8).max(2048) }).parse(req.query || {});
    if (!URL_RE.test(url)) return rep.code(400).send({ error: "INVALID_URL" });

    const serviceBaseUrl = env.GO_INTERNAL_SERVICE_URL || env.LINK_PREVIEW_SERVICE_URL;
    const serviceToken = env.GO_INTERNAL_SERVICE_TOKEN || env.LINK_PREVIEW_INTERNAL_TOKEN;

    if (serviceBaseUrl) {
      if (!serviceToken) {
        return rep.code(503).send({ error: "LINK_PREVIEW_SERVICE_UNAVAILABLE" });
      }
      try {
        const target = new URL(`${serviceBaseUrl.replace(/\/$/, "")}/v1/link-preview`);
        target.searchParams.set("url", url);
        const response = await fetch(target.toString(), {
          headers: {
            "x-core-internal-secret": serviceToken,
          },
        });
        const body = await response.json().catch(() => ({ error: "FETCH_FAILED" }));
        return rep.code(response.status).send(body);
      } catch {
        return rep.code(502).send({ error: "LINK_PREVIEW_PROXY_FAILED" });
      }
    }

    let target: URL;
    try {
      target = new URL(url);
    } catch {
      return rep.code(400).send({ error: "INVALID_URL" });
    }
    if (target.protocol !== "http:" && target.protocol !== "https:") return rep.code(400).send({ error: "INVALID_URL" });
    const appBaseHost = (() => {
      try {
        return new URL(env.APP_BASE_URL).hostname.toLowerCase();
      } catch {
        return "";
      }
    })();
    try {
      await assertPreviewTargetAllowed(target, appBaseHost);
    } catch {
      return rep.code(403).send({ error: "URL_NOT_ALLOWED" });
    }

    const inviteCode = inviteCodeFromUrl(target);
    if (inviteCode) {
      const rows = await q<{
        code: string;
        server_id: string;
        uses: number;
        max_uses: number | null;
        expires_at: string | null;
        server_name: string;
        server_logo_url: string | null;
        server_created_at: string;
        member_count: number;
        online_count: number;
      }>(
        `SELECT i.code,i.server_id,i.uses,i.max_uses,i.expires_at,
                s.name AS server_name,
                s.logo_url AS server_logo_url,
                s.created_at AS server_created_at,
                (SELECT COUNT(*) FROM memberships m WHERE m.server_id=s.id) AS member_count,
                (SELECT COUNT(*)
                 FROM memberships m2
                 JOIN presence p ON p.user_id=m2.user_id
                 WHERE m2.server_id=s.id AND COALESCE(p.status,'offline') <> 'offline') AS online_count
         FROM invites i
         JOIN servers s ON s.id=i.server_id
         WHERE i.code=:code
         LIMIT 1`,
        { code: inviteCode }
      );
      if (!rows.length) return rep.code(404).send({ error: "NOT_FOUND" });
      const inv = rows[0];
      return rep.send({
        url: normalizeUrl(url),
        title: `Join ${inv.server_name} on OpenCom`,
        description: `Invite code ${inv.code}${inv.max_uses ? ` · ${inv.uses}/${inv.max_uses} uses` : ""}`,
        siteName: "OpenCom",
        imageUrl: inv.server_logo_url || "",
        action: { label: "Join Server", url: normalizeUrl(url) },
        hasMeta: true,
        kind: "opencom_invite",
        invite: {
          code: inv.code,
          serverId: inv.server_id,
          serverName: inv.server_name,
          serverLogoUrl: inv.server_logo_url || "",
          memberCount: Number(inv.member_count || 0),
          onlineCount: Number(inv.online_count || 0),
          serverCreatedAt: inv.server_created_at ? new Date(inv.server_created_at).toISOString() : null
        }
      });
    }

    const giftCode = giftCodeFromUrl(target);
    if (giftCode) {
      const rows = await q<{ status: string; expires_at: string; grant_days: number }>(
        `SELECT status,expires_at,grant_days FROM boost_gifts WHERE code=:code LIMIT 1`,
        { code: giftCode }
      );
      if (!rows.length) return rep.code(404).send({ error: "NOT_FOUND" });
      const gift = rows[0];
      const active = gift.status === "active" && new Date(gift.expires_at).getTime() > Date.now();
      return rep.send({
        url: normalizeUrl(url),
        title: "OpenCom Boost Gift",
        description: active ? `${gift.grant_days} day Boost gift ready to redeem.` : "This gift is unavailable.",
        siteName: "OpenCom",
        imageUrl: "",
        action: active ? { label: "Redeem Gift", url: normalizeUrl(url) } : null,
        hasMeta: true,
        kind: "opencom_gift"
      });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    try {
      const response = await fetchPreviewResponse(target, appBaseHost, controller.signal);
      if (!response.ok) return rep.code(404).send({ error: "FETCH_FAILED" });

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("text/html")) {
        return rep.send({
          url: normalizeUrl(url),
          title: "",
          description: "",
          siteName: target.hostname,
          imageUrl: "",
          action: null,
          hasMeta: false
        });
      }

      const html = (await response.text()).slice(0, 200_000);
      const ogTitle = extractMeta(html, "og:title");
      const ogDescription = extractMeta(html, "og:description");
      const ogImage = extractMeta(html, "og:image");
      const ogSiteName = extractMeta(html, "og:site_name");
      const twTitle = extractMeta(html, "twitter:title", "name");
      const twDescription = extractMeta(html, "twitter:description", "name");
      const title = ogTitle || twTitle || extractTitle(html);
      const description = ogDescription || twDescription;

      return rep.send({
        url: normalizeUrl(url),
        title,
        description,
        siteName: ogSiteName || target.hostname,
        imageUrl: ogImage || "",
        action: null,
        hasMeta: Boolean(title || description || ogImage)
      });
    } catch {
      return rep.code(404).send({ error: "FETCH_FAILED" });
    } finally {
      clearTimeout(timer);
    }
  });
}
