import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ulidLike } from "@ods/shared/ids.js";
import { q } from "../db.js";
import { parseBody } from "../validation.js";

const FavouriteMediaBody = z.object({
  sourceKind: z.enum(["server_attachment", "dm_attachment", "external_url"]),
  sourceUrl: z.string().min(1).max(4096),
  pageUrl: z.string().max(4096).optional(),
  title: z.string().max(255).optional(),
  fileName: z.string().max(255).optional(),
  contentType: z.string().max(255).optional(),
  serverId: z.string().min(3).max(64).optional(),
  threadId: z.string().min(3).max(64).optional(),
  messageId: z.string().min(3).max(64).optional(),
});

const FavouriteMediaParams = z.object({
  favouriteId: z.string().min(3).max(64),
});

type FavouriteMediaRow = {
  id: string;
  user_id: string;
  source_kind: "server_attachment" | "dm_attachment" | "external_url";
  source_url: string;
  page_url: string | null;
  title: string | null;
  file_name: string | null;
  content_type: string | null;
  server_id: string | null;
  thread_id: string | null;
  message_id: string | null;
  created_at: string;
  updated_at: string;
};

function normalizeShortText(value: unknown, maxLength: number) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function normalizeUrlValue(value: unknown) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  return trimmed.slice(0, 4096);
}

function hashSourceUrl(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function mapFavouriteMedia(row: FavouriteMediaRow) {
  return {
    id: row.id,
    sourceKind: row.source_kind,
    sourceUrl: row.source_url,
    pageUrl: row.page_url,
    title: row.title,
    fileName: row.file_name,
    contentType: row.content_type,
    serverId: row.server_id,
    threadId: row.thread_id,
    messageId: row.message_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function FavouriteGifRoutes(app: FastifyInstance) {
  app.get(
    "/v1/social/favourites/media",
    { preHandler: [app.authenticate] } as any,
    async (req: any) => {
      const userId = req.user.sub as string;
      const rows = await q<FavouriteMediaRow>(
        `SELECT id,user_id,source_kind,source_url,page_url,title,file_name,content_type,
                server_id,thread_id,message_id,created_at,updated_at
         FROM favourite_media
         WHERE user_id=:userId
         ORDER BY updated_at DESC, created_at DESC`,
        { userId },
      );

      return {
        favourites: rows.map(mapFavouriteMedia),
      };
    },
  );

  app.post(
    "/v1/social/favourites/media",
    { preHandler: [app.authenticate] } as any,
    async (req: any, rep) => {
      const userId = req.user.sub as string;
      const body = parseBody(FavouriteMediaBody, req.body);
      const sourceUrl = normalizeUrlValue(body.sourceUrl);
      if (!sourceUrl) {
        return rep.code(400).send({ error: "SOURCE_URL_REQUIRED" });
      }

      const sourceUrlHash = hashSourceUrl(sourceUrl);
      const existing = await q<FavouriteMediaRow>(
        `SELECT id,user_id,source_kind,source_url,page_url,title,file_name,content_type,
                server_id,thread_id,message_id,created_at,updated_at
         FROM favourite_media
         WHERE user_id=:userId
           AND source_kind=:sourceKind
           AND source_url_hash=:sourceUrlHash
         LIMIT 1`,
        {
          userId,
          sourceKind: body.sourceKind,
          sourceUrlHash,
        },
      );

      if (existing.length) {
        return rep.send({
          favourite: mapFavouriteMedia(existing[0]),
          created: false,
        });
      }

      const id = ulidLike();
      await q(
        `INSERT INTO favourite_media
          (id,user_id,source_kind,source_url_hash,source_url,page_url,title,file_name,
           content_type,server_id,thread_id,message_id)
         VALUES
          (:id,:userId,:sourceKind,:sourceUrlHash,:sourceUrl,:pageUrl,:title,:fileName,
           :contentType,:serverId,:threadId,:messageId)`,
        {
          id,
          userId,
          sourceKind: body.sourceKind,
          sourceUrlHash,
          sourceUrl,
          pageUrl: normalizeShortText(body.pageUrl, 4096),
          title: normalizeShortText(body.title, 255),
          fileName: normalizeShortText(body.fileName, 255),
          contentType: normalizeShortText(body.contentType, 255),
          serverId: normalizeShortText(body.serverId, 64),
          threadId: normalizeShortText(body.threadId, 64),
          messageId: normalizeShortText(body.messageId, 64),
        },
      );

      const created = await q<FavouriteMediaRow>(
        `SELECT id,user_id,source_kind,source_url,page_url,title,file_name,content_type,
                server_id,thread_id,message_id,created_at,updated_at
         FROM favourite_media
         WHERE id=:id
         LIMIT 1`,
        { id },
      );

      return rep.code(201).send({
        favourite: created.length ? mapFavouriteMedia(created[0]) : null,
        created: true,
      });
    },
  );

  app.delete(
    "/v1/social/favourites/media/:favouriteId",
    { preHandler: [app.authenticate] } as any,
    async (req: any, rep) => {
      const userId = req.user.sub as string;
      const { favouriteId } = FavouriteMediaParams.parse(req.params);

      const existing = await q<{ id: string }>(
        `SELECT id
         FROM favourite_media
         WHERE id=:favouriteId
           AND user_id=:userId
         LIMIT 1`,
        { favouriteId, userId },
      );

      if (!existing.length) {
        return rep.code(404).send({ error: "FAVOURITE_NOT_FOUND" });
      }

      await q(
        `DELETE FROM favourite_media
         WHERE id=:favouriteId
           AND user_id=:userId`,
        { favouriteId, userId },
      );

      return rep.send({ ok: true });
    },
  );
}
