import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ulidLike } from "@ods/shared/ids.js";
import { q } from "../db.js";
import { parseBody } from "../validation.js";

const THEME_VISIBILITY = z.enum(["private", "public"]);
const TAG_RE = /^[a-z0-9][a-z0-9_-]{1,24}$/i;

const ThemeInput = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(500).nullable().optional(),
  css: z.string().min(1).max(200_000),
  tags: z.array(z.string().min(2).max(25)).max(12).optional(),
  visibility: THEME_VISIBILITY.optional()
});

type ThemeRow = {
  id: string;
  author_user_id: string;
  name: string;
  description: string | null;
  css_text: string;
  tags: string;
  visibility: "private" | "public";
  install_count: number;
  created_at: string;
  updated_at: string;
  author_username?: string;
};

function normalizeTags(input: string[] = []) {
  const clean = input
    .map((item) => String(item || "").trim().toLowerCase())
    .filter((item) => TAG_RE.test(item));
  return [...new Set(clean)].slice(0, 12);
}

function parseTags(json: string) {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return normalizeTags(parsed.map((item) => String(item || "")));
  } catch {
    return [];
  }
}

function serializeTheme(row: ThemeRow, includeCss = false) {
  return {
    id: row.id,
    authorId: row.author_user_id,
    authorUsername: row.author_username || null,
    name: row.name,
    description: row.description ?? null,
    tags: parseTags(row.tags || "[]"),
    visibility: row.visibility,
    installCount: Number(row.install_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(includeCss ? { css: row.css_text || "" } : {})
  };
}

export async function themeRoutes(app: FastifyInstance) {
  app.get("/v1/themes", async (req: any) => {
    const query = z.object({
      q: z.string().max(80).optional(),
      sort: z.enum(["new", "popular"]).optional(),
      limit: z.coerce.number().int().min(1).max(100).optional()
    }).parse(req.query || {});

    const qText = String(query.q || "").trim();
    const sort = query.sort || "new";
    const limit = query.limit || 48;

    const rows = await q<ThemeRow>(
      `SELECT t.id,t.author_user_id,t.name,t.description,t.css_text,t.tags,t.visibility,t.install_count,t.created_at,t.updated_at,u.username AS author_username
       FROM user_themes t
       JOIN users u ON u.id=t.author_user_id
       WHERE t.visibility='public'
         AND (:q = '' OR t.name LIKE :likeQ OR t.description LIKE :likeQ)
       ORDER BY ${sort === "popular" ? "t.install_count DESC, t.updated_at DESC" : "t.updated_at DESC"}
       LIMIT ${limit}`,
      { q: qText, likeQ: `%${qText}%` }
    );

    return { themes: rows.map((row) => serializeTheme(row, false)) };
  });

  app.get("/v1/themes/:id", async (req: any, rep) => {
    const { id } = z.object({ id: z.string().min(3) }).parse(req.params);
    const rows = await q<ThemeRow>(
      `SELECT t.id,t.author_user_id,t.name,t.description,t.css_text,t.tags,t.visibility,t.install_count,t.created_at,t.updated_at,u.username AS author_username
       FROM user_themes t
       JOIN users u ON u.id=t.author_user_id
       WHERE t.id=:id
       LIMIT 1`,
      { id }
    );
    if (!rows.length) return rep.code(404).send({ error: "THEME_NOT_FOUND" });
    if (rows[0].visibility !== "public") return rep.code(403).send({ error: "THEME_NOT_PUBLIC" });
    return { theme: serializeTheme(rows[0], true) };
  });

  app.get("/v1/me/themes", { preHandler: [app.authenticate] } as any, async (req: any) => {
    const userId = req.user.sub as string;
    const rows = await q<ThemeRow>(
      `SELECT id,author_user_id,name,description,css_text,tags,visibility,install_count,created_at,updated_at
       FROM user_themes
       WHERE author_user_id=:userId
       ORDER BY updated_at DESC
       LIMIT 100`,
      { userId }
    );
    return { themes: rows.map((row) => serializeTheme(row, true)) };
  });

  app.post("/v1/themes", { preHandler: [app.authenticate] } as any, async (req: any) => {
    const userId = req.user.sub as string;
    const body = parseBody(ThemeInput, req.body);
    const id = ulidLike();
    const tags = normalizeTags(body.tags || []);
    const visibility = body.visibility || "private";
    await q(
      `INSERT INTO user_themes (id,author_user_id,name,description,css_text,tags,visibility)
       VALUES (:id,:userId,:name,:description,:css,:tags,:visibility)`,
      {
        id,
        userId,
        name: body.name.trim(),
        description: body.description ? body.description.trim() : null,
        css: body.css,
        tags: JSON.stringify(tags),
        visibility
      }
    );
    return { ok: true, themeId: id };
  });

  app.patch("/v1/themes/:id", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const userId = req.user.sub as string;
    const { id } = z.object({ id: z.string().min(3) }).parse(req.params);
    const body = parseBody(ThemeInput.partial().refine((item) => Object.keys(item).length > 0, "NO_CHANGES"), req.body);

    const rows = await q<ThemeRow>(
      `SELECT id,author_user_id,name,description,css_text,tags,visibility,install_count,created_at,updated_at
       FROM user_themes
       WHERE id=:id
       LIMIT 1`,
      { id }
    );
    if (!rows.length) return rep.code(404).send({ error: "THEME_NOT_FOUND" });
    if (rows[0].author_user_id !== userId) return rep.code(403).send({ error: "FORBIDDEN" });

    const tags = body.tags ? normalizeTags(body.tags) : null;

    await q(
      `UPDATE user_themes
       SET name = COALESCE(:name, name),
           description = CASE WHEN :descriptionSet=1 THEN :description ELSE description END,
           css_text = COALESCE(:css, css_text),
           tags = CASE WHEN :tagsSet=1 THEN :tags ELSE tags END,
           visibility = CASE WHEN :visibilitySet=1 THEN :visibility ELSE visibility END
       WHERE id=:id`,
      {
        id,
        name: body.name === undefined ? null : body.name.trim(),
        descriptionSet: body.description !== undefined ? 1 : 0,
        description: body.description ? body.description.trim() : null,
        css: body.css === undefined ? null : body.css,
        tagsSet: body.tags !== undefined ? 1 : 0,
        tags: tags ? JSON.stringify(tags) : null,
        visibilitySet: body.visibility !== undefined ? 1 : 0,
        visibility: body.visibility || null
      }
    );

    return { ok: true };
  });

  app.post("/v1/themes/:id/install", async (req: any, rep) => {
    const { id } = z.object({ id: z.string().min(3) }).parse(req.params);
    const rows = await q<ThemeRow>(`SELECT id,visibility FROM user_themes WHERE id=:id LIMIT 1`, { id });
    if (!rows.length) return rep.code(404).send({ error: "THEME_NOT_FOUND" });
    if (rows[0].visibility !== "public") return rep.code(403).send({ error: "THEME_NOT_PUBLIC" });
    await q(`UPDATE user_themes SET install_count=install_count+1 WHERE id=:id`, { id });
    return { ok: true };
  });
}
