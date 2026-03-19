import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { env } from "../env.js";

const DEFAULT_KLIPY_BASE_URL = "https://api.klipy.com";

const KlipyQuery = z.object({
  q: z.preprocess((value) => {
    const trimmed = String(value || "").trim();
    return trimmed ? trimmed : undefined;
  }, z.string().min(1).max(200).optional()),
  pos: z.preprocess((value) => {
    const trimmed = String(value || "").trim();
    return trimmed ? trimmed : undefined;
  }, z.string().min(1).max(512).optional()),
  limit: z.coerce.number().int().min(1).max(50).default(24),
  adMinWidth: z.coerce.number().int().min(50).max(4096).optional(),
  adMaxWidth: z.coerce.number().int().min(50).max(4096).optional(),
  adMinHeight: z.coerce.number().int().min(50).max(2500).optional(),
  adMaxHeight: z.coerce.number().int().min(50).max(2500).optional(),
  adPosition: z.coerce.number().int().min(0).max(20).optional(),
  deviceWidth: z.coerce.number().int().min(1).max(10000).optional(),
  deviceHeight: z.coerce.number().int().min(1).max(10000).optional(),
  pixelRatio: z.coerce.number().positive().max(10).optional(),
});

type KlipyFormat = {
  url?: string;
  preview?: string;
  dims?: number[];
};

type NormalizedKlipyMedia = {
  type: "media";
  id: string;
  title: string;
  sourceUrl: string;
  previewUrl: string;
  pageUrl: string;
  contentType: string;
  previewContentType: string;
  width: number | null;
  height: number | null;
};

type NormalizedKlipyAd = {
  type: "ad";
  id: string;
  content: string;
  iframeUrl: string;
  width: number | null;
  height: number | null;
};

type NormalizedKlipyItem = NormalizedKlipyMedia | NormalizedKlipyAd;

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value == null || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function getPathValue(source: unknown, path: string) {
  const parts = path.split(".");
  let current: unknown = source;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function firstString(source: unknown, paths: string[]) {
  for (const path of paths) {
    const value = cleanString(getPathValue(source, path));
    if (value) return value;
  }
  return "";
}

function firstNumber(source: unknown, paths: string[]) {
  for (const path of paths) {
    const raw = getPathValue(source, path);
    const value = Number(raw);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function firstBoolean(source: unknown, paths: string[]) {
  for (const path of paths) {
    const raw = getPathValue(source, path);
    if (typeof raw === "boolean") return raw;
    const normalized = cleanString(raw).toLowerCase();
    if (normalized === "1" || normalized === "true") return true;
    if (normalized === "0" || normalized === "false") return false;
  }
  return null;
}

function simpleHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16);
}

function inferContentTypeFromFormatKey(key: string) {
  const normalized = cleanString(key).toLowerCase();
  if (!normalized) return "";
  if (normalized.includes("mp4")) return "video/mp4";
  if (normalized.includes("webm")) return "video/webm";
  return "image/gif";
}

function inferContentTypeFromUrl(url: string) {
  const normalized = cleanString(url).toLowerCase();
  if (!normalized) return "";
  if (normalized.includes(".mp4")) return "video/mp4";
  if (normalized.includes(".webm")) return "video/webm";
  if (normalized.includes(".gif")) return "image/gif";
  if (normalized.includes(".webp")) return "image/webp";
  if (normalized.includes(".png")) return "image/png";
  if (normalized.includes(".jpg") || normalized.includes(".jpeg")) return "image/jpeg";
  return "";
}

function pickPreferredFormat(mediaFormats: Record<string, unknown>, order: string[]) {
  for (const key of order) {
    const candidate = mediaFormats?.[key];
    if (!candidate || typeof candidate !== "object") continue;
    const format = candidate as KlipyFormat;
    const url = cleanString(format.url);
    if (!url) continue;
    const dims = Array.isArray(format.dims) ? format.dims : [];
    return {
      key,
      url,
      previewUrl: cleanString(format.preview) || url,
      width: Number.isFinite(Number(dims[0])) ? Number(dims[0]) : null,
      height: Number.isFinite(Number(dims[1])) ? Number(dims[1]) : null,
      contentType: inferContentTypeFromFormatKey(key),
    };
  }
  return null;
}

function normalizeV2Item(item: unknown, index: number): NormalizedKlipyMedia | null {
  const itemRecord = asRecord(item);
  const mediaFormats = asRecord(itemRecord?.media_formats) || {};
  const preferredSource = pickPreferredFormat(mediaFormats, [
    "gif",
    "mediumgif",
    "tinygif",
    "nanogif",
    "mp4",
    "loopedmp4",
    "tinymp4",
    "nanomp4",
    "webm",
    "tinywebm",
    "nanowebm",
  ]);
  const preferredPreview = pickPreferredFormat(mediaFormats, [
    "tinygif",
    "mediumgif",
    "gif",
    "nanogif",
    "tinymp4",
    "mp4",
    "nanomp4",
    "tinywebm",
    "webm",
    "nanowebm",
  ]);
  const sourceUrl =
    preferredSource?.url ||
    firstString(item, [
      "gif.url",
      "image_url",
      "imageUrl",
      "url",
      "mp4_url",
      "mp4Url",
      "video_url",
      "videoUrl",
    ]);
  if (!sourceUrl) return null;

  const pageUrl =
    firstString(item, ["itemurl", "itemUrl", "share_url", "shareUrl", "url"]) ||
    sourceUrl;
  const title =
    firstString(item, ["title", "content_description", "contentDescription", "name"]) ||
    "Klipy media";
  const contentType =
    preferredSource?.contentType ||
    inferContentTypeFromUrl(sourceUrl) ||
    "image/gif";
  const previewUrl = preferredPreview?.previewUrl || preferredSource?.previewUrl || sourceUrl;
  const previewContentType =
    preferredPreview?.contentType ||
    inferContentTypeFromUrl(previewUrl) ||
    contentType;

  return {
    type: "media",
    id: firstString(item, ["id"]) || `klipy-${index}-${sourceUrl}`,
    title,
    sourceUrl,
    previewUrl,
    pageUrl,
    contentType,
    previewContentType,
    width: preferredSource?.width ?? firstNumber(item, ["width", "w"]),
    height: preferredSource?.height ?? firstNumber(item, ["height", "h"]),
  };
}

function normalizeGenericItem(item: unknown, index: number): NormalizedKlipyMedia | null {
  const sourceUrl = firstString(item, [
    "gif.url",
    "image_url",
    "imageUrl",
    "gif_url",
    "gifUrl",
    "mp4_url",
    "mp4Url",
    "video_url",
    "videoUrl",
    "source_url",
    "sourceUrl",
    "url",
  ]);
  if (!sourceUrl) return null;

  const previewUrl =
    firstString(item, [
      "preview_url",
      "previewUrl",
      "thumbnail_url",
      "thumbnailUrl",
      "poster_url",
      "posterUrl",
      "preview",
    ]) || sourceUrl;
  const pageUrl =
    firstString(item, ["share_url", "shareUrl", "itemurl", "itemUrl", "url"]) ||
    sourceUrl;
  const contentType =
    firstString(item, ["mime_type", "mimeType", "content_type", "contentType"]) ||
    inferContentTypeFromUrl(sourceUrl) ||
    "image/gif";
  const previewContentType =
    inferContentTypeFromUrl(previewUrl) ||
    contentType;

  return {
    type: "media",
    id: firstString(item, ["id", "media_id", "mediaId"]) || `klipy-${index}-${sourceUrl}`,
    title:
      firstString(item, ["title", "name", "caption", "description"]) ||
      "Klipy media",
    sourceUrl,
    previewUrl,
    pageUrl,
    contentType,
    previewContentType,
    width: firstNumber(item, ["width", "w"]),
    height: firstNumber(item, ["height", "h"]),
  };
}

function normalizeAdItem(item: unknown, index: number): NormalizedKlipyAd | null {
  const content = firstString(item, ["content", "html"]);
  const iframeUrl = firstString(item, ["iframe_url", "iframeUrl", "url"]);
  const width = firstNumber(item, ["width", "w"]);
  const height = firstNumber(item, ["height", "h"]);
  const isWebView =
    firstBoolean(item, ["is_webview", "isWebView", "webview", "iframe"]) ?? false;

  if (!content && !iframeUrl) return null;

  return {
    type: "ad",
    id:
      firstString(item, ["id", "ad_id", "adId"]) ||
      `klipy-ad-${index}-${simpleHash(`${content}:${iframeUrl}:${width}:${height}:${isWebView}`)}`,
    content,
    iframeUrl,
    width,
    height,
  };
}

function normalizeKlipyPayload(payload: unknown) {
  const results = Array.isArray((payload as any)?.results)
    ? (payload as any).results
    : Array.isArray((payload as any)?.result?.files)
      ? (payload as any).result.files
      : Array.isArray((payload as any)?.files)
        ? (payload as any).files
        : [];

  const normalized: NormalizedKlipyItem[] = [];
  const seen = new Set<string>();
  const fromV2 = Array.isArray((payload as any)?.results);

  results.forEach((item: unknown, index: number) => {
    const itemType = cleanString(getPathValue(item, "type")).toLowerCase();
    const nextItem =
      itemType === "ad"
        ? normalizeAdItem(item, index)
        : fromV2
          ? normalizeV2Item(item, index)
          : normalizeGenericItem(item, index);
    if (!nextItem) return;
    const dedupeKey =
      nextItem.type === "ad"
        ? `${nextItem.type}:${nextItem.id}:${nextItem.iframeUrl || nextItem.content}`
        : `${nextItem.type}:${nextItem.id}:${nextItem.sourceUrl}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    normalized.push(nextItem);
  });

  return {
    items: normalized,
    next:
      firstString(payload, ["next", "result.next", "result.pos", "pos"]) || "",
  };
}

function resolveKlipyBaseUrl() {
  return cleanString(env.KLIPY_API_BASE_URL) || DEFAULT_KLIPY_BASE_URL;
}

async function fetchKlipyPayload(
  app: FastifyInstance,
  endpoint: string,
  params: Record<string, string>,
  requestHeaders: Record<string, string> = {},
) {
  const apiKey = cleanString(env.KLIPY_API_KEY);
  if (!apiKey) {
    throw Object.assign(new Error("KLIPY_NOT_CONFIGURED"), { statusCode: 503 });
  }

  const baseUrl = resolveKlipyBaseUrl().replace(/\/$/, "");
  const url = new URL(endpoint.replace(/^\//, ""), `${baseUrl}/`);
  url.searchParams.set("key", apiKey);
  const clientKey = cleanString(env.KLIPY_CLIENT_KEY);
  if (clientKey) url.searchParams.set("client_key", clientKey);
  Object.entries(params).forEach(([key, value]) => {
    if (!cleanString(value)) return;
    url.searchParams.set(key, value);
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        ...requestHeaders,
      },
      signal: controller.signal,
    });
    const text = await response.text().catch(() => "");
    let payload: unknown = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = {};
    }

    if (!response.ok) {
      app.log.warn(
        {
          endpoint,
          statusCode: response.status,
          body: text.slice(0, 300),
        },
        "klipy: upstream request failed",
      );
      throw Object.assign(
        new Error(
          firstString(payload, ["error.message", "message"]) ||
            `KLIPY_HTTP_${response.status}`,
        ),
        { statusCode: response.status },
      );
    }

    return normalizeKlipyPayload(payload);
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeHeaderValue(value: unknown) {
  if (Array.isArray(value)) {
    return cleanString(value[0]);
  }
  return cleanString(value);
}

function extractLanguageTag(value: unknown) {
  const raw = normalizeHeaderValue(value);
  if (!raw) return "";
  const [primary] = raw.split(",");
  const [language] = primary.split("-");
  return cleanString(language).slice(0, 2).toUpperCase();
}

function buildKlipyRequestHeaders(req: any) {
  const userAgent = normalizeHeaderValue(req?.headers?.["user-agent"]);
  const acceptLanguage = normalizeHeaderValue(req?.headers?.["accept-language"]);
  return {
    ...(userAgent ? { "User-Agent": userAgent } : {}),
    ...(acceptLanguage ? { "Accept-Language": acceptLanguage } : {}),
  };
}

function buildKlipyAdParams(query: z.infer<typeof KlipyQuery>, req: any, userId: string) {
  const params: Record<string, string> = {};
  if (!userId) return params;

  params.customer_id = userId;

  if (query.adMinWidth) params["ad-min-width"] = String(query.adMinWidth);
  if (query.adMaxWidth) params["ad-max-width"] = String(query.adMaxWidth);
  if (query.adMinHeight) params["ad-min-height"] = String(query.adMinHeight);
  if (query.adMaxHeight) params["ad-max-height"] = String(query.adMaxHeight);
  if (query.adPosition !== undefined) params["ad-position"] = String(query.adPosition);
  if (query.deviceWidth) params["ad-device-w"] = String(query.deviceWidth);
  if (query.deviceHeight) params["ad-device-h"] = String(query.deviceHeight);
  if (query.pixelRatio) params["ad-pxratio"] = String(query.pixelRatio);

  const language = extractLanguageTag(req?.headers?.["accept-language"]);
  if (language) params["ad-language"] = language;

  return params;
}

export async function klipyRoutes(app: FastifyInstance) {
  app.get(
    "/v1/media/klipy/search",
    { preHandler: [app.authenticate] } as any,
    async (req: any, rep) => {
      const query = KlipyQuery.parse(req.query || {});
      if (!query.q) return rep.code(400).send({ error: "QUERY_REQUIRED" });
      const userId = String(req?.auth?.userId || "").trim();
      const adParams = buildKlipyAdParams(query, req, userId);
      const requestHeaders = buildKlipyRequestHeaders(req);

      try {
        return await fetchKlipyPayload(app, "/v2/search", {
          q: query.q,
          pos: query.pos || "",
          limit: String(query.limit),
          ...adParams,
        }, requestHeaders);
      } catch (error) {
        const statusCode =
          Number((error as any)?.statusCode) > 0 ? Number((error as any).statusCode) : 502;
        return rep.code(statusCode).send({
          error: error instanceof Error ? error.message : "KLIPY_REQUEST_FAILED",
        });
      }
    },
  );

  app.get(
    "/v1/media/klipy/featured",
    { preHandler: [app.authenticate] } as any,
    async (req: any, rep) => {
      const query = KlipyQuery.parse(req.query || {});
      const userId = String(req?.auth?.userId || "").trim();
      const adParams = buildKlipyAdParams(query, req, userId);
      const requestHeaders = buildKlipyRequestHeaders(req);
      try {
        return await fetchKlipyPayload(app, "/v2/featured", {
          pos: query.pos || "",
          limit: String(query.limit),
          ...adParams,
        }, requestHeaders);
      } catch (error) {
        const statusCode =
          Number((error as any)?.statusCode) > 0 ? Number((error as any).statusCode) : 502;
        return rep.code(statusCode).send({
          error: error instanceof Error ? error.message : "KLIPY_REQUEST_FAILED",
        });
      }
    },
  );
}
