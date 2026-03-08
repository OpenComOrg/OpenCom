import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ulidLike } from "@ods/shared/ids.js";
import { q } from "../db.js";
import { parseBody } from "../validation.js";
import { requirePanelAccess, requirePanelPermission } from "../platformStaff.js";

const BLOG_STATUS = z.enum(["draft", "published"]);

const blogBodySchema = z.object({
  title: z.string().trim().min(3).max(180),
  slug: z.string().trim().min(2).max(96),
  summary: z.string().trim().min(12).max(320),
  coverImageUrl: z.string().trim().url().max(500).optional().or(z.literal("")),
  content: z.string().trim().min(1).max(120000),
  status: BLOG_STATUS,
});

type BlogPostRow = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  cover_image_url: string | null;
  status: "draft" | "published";
  content_md: string;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  author_username: string | null;
};

function normalizeBlogSlug(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

function estimateReadingMinutes(content = "") {
  const wordCount = String(content || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.ceil(wordCount / 220));
}

function mapBlogPost(row: BlogPostRow) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    coverImageUrl: row.cover_image_url || "",
    status: row.status,
    content: row.content_md,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
    authorName: row.author_username || "OpenCom",
    readingMinutes: estimateReadingMinutes(row.content_md),
  };
}

async function ensureUniqueSlug(slug: string, excludeId = "") {
  const existing = await q<{ id: string }>(
    `SELECT id FROM blog_posts WHERE slug=:slug AND (:excludeId='' OR id<>:excludeId) LIMIT 1`,
    { slug, excludeId },
  );
  if (existing.length) throw new Error("BLOG_SLUG_TAKEN");
}

export async function blogRoutes(app: FastifyInstance) {
  app.get("/v1/blogs", async () => {
    const rows = await q<BlogPostRow>(
      `SELECT bp.id, bp.slug, bp.title, bp.summary, bp.cover_image_url, bp.status,
              bp.content_md, bp.created_by, bp.updated_by, bp.created_at,
              bp.updated_at, bp.published_at, u.username AS author_username
         FROM blog_posts bp
         LEFT JOIN users u ON u.id=bp.created_by
        WHERE bp.status='published'
          AND bp.published_at IS NOT NULL
        ORDER BY bp.published_at DESC, bp.created_at DESC
        LIMIT 100`,
    );

    return {
      posts: rows.map((row) => {
        const post = mapBlogPost(row);
        return {
          id: post.id,
          slug: post.slug,
          title: post.title,
          summary: post.summary,
          coverImageUrl: post.coverImageUrl,
          publishedAt: post.publishedAt,
          authorName: post.authorName,
          readingMinutes: post.readingMinutes,
        };
      }),
    };
  });

  app.get("/v1/blogs/:slug", async (req: any, rep) => {
    const { slug } = z.object({ slug: z.string().min(2).max(96) }).parse(
      req.params,
    );
    const normalizedSlug = normalizeBlogSlug(slug);
    if (!normalizedSlug) return rep.code(404).send({ error: "BLOG_NOT_FOUND" });

    const rows = await q<BlogPostRow>(
      `SELECT bp.id, bp.slug, bp.title, bp.summary, bp.cover_image_url, bp.status,
              bp.content_md, bp.created_by, bp.updated_by, bp.created_at,
              bp.updated_at, bp.published_at, u.username AS author_username
         FROM blog_posts bp
         LEFT JOIN users u ON u.id=bp.created_by
        WHERE bp.slug=:slug
          AND bp.status='published'
          AND bp.published_at IS NOT NULL
        LIMIT 1`,
      { slug: normalizedSlug },
    );

    if (!rows.length) return rep.code(404).send({ error: "BLOG_NOT_FOUND" });
    return { post: mapBlogPost(rows[0]) };
  });

  app.get(
    "/v1/admin/blogs",
    { preHandler: [app.authenticate] } as any,
    async (req: any, rep) => {
      try {
        await requirePanelAccess(req);
      } catch {
        return rep.code(403).send({ error: "FORBIDDEN" });
      }

      const rows = await q<BlogPostRow>(
        `SELECT bp.id, bp.slug, bp.title, bp.summary, bp.cover_image_url, bp.status,
                bp.content_md, bp.created_by, bp.updated_by, bp.created_at,
                bp.updated_at, bp.published_at, u.username AS author_username
           FROM blog_posts bp
           LEFT JOIN users u ON u.id=bp.created_by
          ORDER BY
            CASE WHEN bp.published_at IS NULL THEN 1 ELSE 0 END,
            bp.published_at DESC,
            bp.updated_at DESC
          LIMIT 250`,
      );

      return { posts: rows.map((row) => mapBlogPost(row)) };
    },
  );

  app.post(
    "/v1/admin/blogs",
    { preHandler: [app.authenticate] } as any,
    async (req: any, rep) => {
      const actorId = req.user.sub as string;
      try {
        await requirePanelPermission(req, "manage_blogs");
      } catch {
        return rep.code(403).send({ error: "FORBIDDEN" });
      }

      const body = parseBody(blogBodySchema, req.body);
      const slug = normalizeBlogSlug(body.slug);
      if (!slug) return rep.code(400).send({ error: "INVALID_BLOG_SLUG" });
      await ensureUniqueSlug(slug);

      const id = ulidLike();
      const publishedAt =
        body.status === "published"
          ? new Date().toISOString().slice(0, 19).replace("T", " ")
          : null;

      await q(
        `INSERT INTO blog_posts
          (id, slug, title, summary, cover_image_url, status, content_md, created_by, updated_by, published_at)
         VALUES
          (:id, :slug, :title, :summary, :coverImageUrl, :status, :content, :actorId, :actorId, :publishedAt)`,
        {
          id,
          slug,
          title: body.title,
          summary: body.summary,
          coverImageUrl: body.coverImageUrl || null,
          status: body.status,
          content: body.content,
          actorId,
          publishedAt,
        },
      );

      const created = await q<BlogPostRow>(
        `SELECT bp.id, bp.slug, bp.title, bp.summary, bp.cover_image_url, bp.status,
                bp.content_md, bp.created_by, bp.updated_by, bp.created_at,
                bp.updated_at, bp.published_at, u.username AS author_username
           FROM blog_posts bp
           LEFT JOIN users u ON u.id=bp.created_by
          WHERE bp.id=:id
          LIMIT 1`,
        { id },
      );

      return { ok: true, post: mapBlogPost(created[0]) };
    },
  );

  app.put(
    "/v1/admin/blogs/:blogId",
    { preHandler: [app.authenticate] } as any,
    async (req: any, rep) => {
      const actorId = req.user.sub as string;
      try {
        await requirePanelPermission(req, "manage_blogs");
      } catch {
        return rep.code(403).send({ error: "FORBIDDEN" });
      }

      const { blogId } = z.object({ blogId: z.string().min(3) }).parse(
        req.params,
      );
      const body = parseBody(blogBodySchema, req.body);
      const slug = normalizeBlogSlug(body.slug);
      if (!slug) return rep.code(400).send({ error: "INVALID_BLOG_SLUG" });

      const existing = await q<{ id: string; status: "draft" | "published" }>(
        `SELECT id, status FROM blog_posts WHERE id=:blogId LIMIT 1`,
        { blogId },
      );
      if (!existing.length) return rep.code(404).send({ error: "BLOG_NOT_FOUND" });

      await ensureUniqueSlug(slug, blogId);

      const publishedAt =
        body.status === "published"
          ? new Date().toISOString().slice(0, 19).replace("T", " ")
          : null;

      await q(
        `UPDATE blog_posts
            SET slug=:slug,
                title=:title,
                summary=:summary,
                cover_image_url=:coverImageUrl,
                status=:status,
                content_md=:content,
                updated_by=:actorId,
                published_at=CASE
                  WHEN :status='published' AND published_at IS NOT NULL THEN published_at
                  WHEN :status='published' THEN :publishedAt
                  ELSE NULL
                END
          WHERE id=:blogId`,
        {
          blogId,
          slug,
          title: body.title,
          summary: body.summary,
          coverImageUrl: body.coverImageUrl || null,
          status: body.status,
          content: body.content,
          actorId,
          publishedAt,
        },
      );

      const updated = await q<BlogPostRow>(
        `SELECT bp.id, bp.slug, bp.title, bp.summary, bp.cover_image_url, bp.status,
                bp.content_md, bp.created_by, bp.updated_by, bp.created_at,
                bp.updated_at, bp.published_at, u.username AS author_username
           FROM blog_posts bp
           LEFT JOIN users u ON u.id=bp.created_by
          WHERE bp.id=:blogId
          LIMIT 1`,
        { blogId },
      );

      return { ok: true, post: mapBlogPost(updated[0]) };
    },
  );

  app.delete(
    "/v1/admin/blogs/:blogId",
    { preHandler: [app.authenticate] } as any,
    async (req: any, rep) => {
      try {
        await requirePanelPermission(req, "manage_blogs");
      } catch {
        return rep.code(403).send({ error: "FORBIDDEN" });
      }

      const { blogId } = z.object({ blogId: z.string().min(3) }).parse(
        req.params,
      );
      const existing = await q<{ id: string }>(
        `SELECT id FROM blog_posts WHERE id=:blogId LIMIT 1`,
        { blogId },
      );
      if (!existing.length) return rep.code(404).send({ error: "BLOG_NOT_FOUND" });

      await q(`DELETE FROM blog_posts WHERE id=:blogId`, { blogId });
      return { ok: true, deletedBlogId: blogId };
    },
  );
}
