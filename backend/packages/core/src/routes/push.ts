import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ulidLike } from "@ods/shared/ids.js";
import { q } from "../db.js";
import { parseBody } from "../validation.js";

const RegisterPushToken = z.object({
  token: z.string().min(20).max(255),
  platform: z.enum(["android", "ios"]).optional().default("android")
});

export async function pushRoutes(app: FastifyInstance) {
  app.post("/v1/push/register", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const userId = req.user.sub as string;
    const body = parseBody(RegisterPushToken, req.body);
    const existing = await q<{ id: string }>(
      `SELECT id FROM mobile_push_tokens WHERE token=:token LIMIT 1`,
      { token: body.token }
    );

    if (existing.length) {
      await q(
        `UPDATE mobile_push_tokens
         SET user_id=:userId, platform=:platform, updated_at=NOW()
         WHERE id=:id`,
        { id: existing[0].id, userId, platform: body.platform }
      );
      return rep.send({ ok: true, id: existing[0].id });
    }

    const id = ulidLike();
    await q(
      `INSERT INTO mobile_push_tokens (id,user_id,token,platform)
       VALUES (:id,:userId,:token,:platform)`,
      { id, userId, token: body.token, platform: body.platform }
    );
    return rep.send({ ok: true, id });
  });
}
