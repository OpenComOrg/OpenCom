import { FastifyInstance } from "fastify";
import { z } from "zod";
import { q } from "../db.js";

const UpdateProfile = z.object({
  displayName: z.string().min(1).max(64).nullable().optional(),
  bio: z.string().max(400).nullable().optional(),
  pfpUrl: z.string().url().nullable().optional(),
  bannerUrl: z.string().url().nullable().optional()
});

export async function profileRoutes(app: FastifyInstance) {
  app.get("/v1/users/:id/profile", async (req, rep) => {
    const { id } = z.object({ id: z.string().min(3) }).parse(req.params);

    const u = await q<any>(
      `SELECT id, username, display_name, bio, pfp_url, banner_url FROM users WHERE id=:id`,
      { id }
    );
    if (!u.length) return rep.code(404).send({ error: "NOT_FOUND" });

    const badges = await q<{ badge: string }>(`SELECT badge FROM user_badges WHERE user_id=:id`, { id });

    const founder = await q<{ founder_user_id: string | null }>(`SELECT founder_user_id FROM platform_config WHERE id=1`);
    const isOwner = founder.length && founder[0].founder_user_id === id;
    const isAdmin = !!(await q<{ user_id: string }>(`SELECT user_id FROM platform_admins WHERE user_id=:id`, { id })).length;

    return {
      id: u[0].id,
      username: u[0].username,
      displayName: u[0].display_name ?? null,
      bio: u[0].bio ?? null,
      pfpUrl: u[0].pfp_url ?? null,
      bannerUrl: u[0].banner_url ?? null,
      badges: badges.map(b => b.badge),
      platformRole: isOwner ? "owner" : (isAdmin ? "admin" : "user"),
      platformTitle: isOwner ? "Platform Owner" : (isAdmin ? "Platform Admin" : null)
    };
  });

  app.patch("/v1/me/profile", { preHandler: [app.authenticate] } as any, async (req: any) => {
    const userId = req.user.sub as string;
    const body = UpdateProfile.parse(req.body);

    await q(
      `UPDATE users SET
         display_name = COALESCE(:displayName, display_name),
         bio = COALESCE(:bio, bio),
         pfp_url = COALESCE(:pfpUrl, pfp_url),
         banner_url = COALESCE(:bannerUrl, banner_url)
       WHERE id=:userId`,
      { userId, displayName: body.displayName ?? null, bio: body.bio ?? null, pfpUrl: body.pfpUrl ?? null, bannerUrl: body.bannerUrl ?? null }
    );

    return { ok: true };
  });
}
