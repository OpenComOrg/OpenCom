import { FastifyInstance } from "fastify/types/instance";
import { q } from "../db"
import { parseBody } from "src/validation";
import { z } from "zod"
import { success } from "zod/v4-mini";

const oauth_format = z.object({
  secret: z.string(),
  app_id: z.string()
})

export async function OauthIntergrationRoutes(app: FastifyInstance) {

  app.get('/v1/oauth', async (req: any, rep) => {
      const body = parseBody(oauth_format, req.body)

      const code = body.secret
      const id = body.app_id

      const result = await q(
        `SELECT osa.app_id
         FROM oauth_sessions os
         JOIN oauth_session_apps osa ON os.session_id = osa.session_id
         WHERE os.secret_code = :secret AND osa.app_id = :app_id`,
        { code, id }
      );

      if (result.length > 0) {
        return { success: true, allowed: true };
      } else {
        return { success: true, allowed: false  };
      }
  });
  app.get('/v1/create', async (req: any, rep) => {
    const body = parseBody(oauth_format, req.body);

    const code = body.secret;
    const id = body.app_id;

    const existing = await q(
      `SELECT osa.app_id
       FROM oauth_sessions os
       JOIN oauth_session_apps osa ON os.session_id = osa.session_id
       WHERE os.secret_code = :code AND osa.app_id = :id`,
      { code, id }
    );

    if (existing.length > 0) {
      return { success: true, allowed: false, message: "Integration already exists" };
    } else {
      const sessions = await q(
        `SELECT session_id FROM oauth_sessions WHERE secret_code = :code`,
        { code }
      );

      if (sessions.length === 0) {
        return { success: false, allowed: false, message: "Invalid secret code" };
      }

      const sessionId = sessions[0].session_id;

      await q(
        `INSERT INTO oauth_session_apps (session_id, app_id)
         VALUES (:sessionId, :app_id)`,
        { sessionId, app_id: id }
      );

      return { success: true, allowed: true};
    }
  });
}
