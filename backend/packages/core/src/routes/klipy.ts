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
});

type KlipyFormat = {
  url?: string;
  preview?: string;
  dims?: number[];
};

type NormalizedKlipyMedia = {
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

function normalizeKlipyPayload(payload: unknown) {
  const results = Array.isArray((payload as any)?.results)
    ? (payload as any).results
    : Array.isArray((payload as any)?.result?.files)
      ? (payload as any).result.files
      : Array.isArray((payload as any)?.files)
        ? (payload as any).files
        : [];

  const normalized: NormalizedKlipyMedia[] = [];
  const seen = new Set<string>();
  const fromV2 = Array.isArray((payload as any)?.results);

  results.forEach((item: unknown, index: number) => {
    const nextItem = fromV2 ? normalizeV2Item(item, index) : normalizeGenericItem(item, index);
    if (!nextItem) return;
    const dedupeKey = `${nextItem.id}:${nextItem.sourceUrl}`;
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

export async function klipyRoutes(app: FastifyInstance) {
  app.get(
    "/v1/media/klipy/search",
    { preHandler: [app.authenticate] } as any,
    async (req: any, rep) => {
      const query = KlipyQuery.parse(req.query || {});
      if (!query.q) return rep.code(400).send({ error: "QUERY_REQUIRED" });

      try {
        return await fetchKlipyPayload(app, "/v2/search", {
          q: query.q,
          pos: query.pos || "",
          limit: String(query.limit),
        });
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
      try {
        return await fetchKlipyPayload(app, "/v2/featured", {
          pos: query.pos || "",
          limit: String(query.limit),
        });
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
