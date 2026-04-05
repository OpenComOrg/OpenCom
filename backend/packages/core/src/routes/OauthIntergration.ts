import { FastifyInstance } from "fastify/types/instance";
import { q } from "../db"
import { parseBody } from "src/validation";
import { z } from "zod"
import { success } from "zod/v4-mini";
import { sha256Hex, verifyPassword } from "../crypto";
import { env } from "../env";
import crypto from "node:crypto"

const oauth_format = z.object({
  secret: z.string(),
  app_id: z.string()
})
const LoginOAuth = z.object({
  email: z.string().email(),
  password: z.string()
});
function randomToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

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
  app.post("/v1/oauth/login", async (req, rep) => {
      const body = parseBody(LoginOAuth, req.body);

      const users = await q<{
        id: string;
        password_hash: string;
        username: string;
        email: string;
        email_verified_at: string | null;
        banned_at: string | null;
      }>(
        `SELECT u.id, u.password_hash, u.username, u.email, u.email_verified_at, ab.created_at AS banned_at
         FROM users u
         LEFT JOIN account_bans ab ON ab.user_id = u.id
         WHERE u.email = :email
         LIMIT 1`,
        { email: body.email }
      );

      if (!users.length) return rep.code(401).send({ error: "INVALID_CREDENTIALS" });

      const u = users[0];
      if (u.banned_at) return rep.code(403).send({ error: "ACCOUNT_BANNED" });

      const ok = await verifyPassword(u.password_hash, body.password);
      if (!ok) return rep.code(401).send({ error: "INVALID_CREDENTIALS" });

      if (env.AUTH_REQUIRE_EMAIL_VERIFICATION && !u.email_verified_at) {
        return rep.code(403).send({ error: "EMAIL_NOT_VERIFIED" });
      }


      const secretCode = randomToken();
      const now = new Date().toISOString().slice(0, 19).replace("T", " ");


      await q(
        `INSERT INTO oauth_sessions (user_id, secret_code, last_login)
         VALUES (:userId, :secretCode, :lastLogin)`,
        { userId: u.id, secretCode, lastLogin: now }
      );

      return rep.send({
        user: { id: u.id, email: u.email, username: u.username },
        secret: secretCode,
        message: "OAuth secret generated successfully"
      });
    });
  app.get("/v1/oauth/login/user", async (req: any, rep) => {
    const { token } = req.query;
    if (!token) return rep.code(400).send({ success: false, message: "Missing token" });

    // Look up the OAuth link
    const links = await q(
      `SELECT * FROM oauth_links WHERE token = :token LIMIT 1`,
      { token }
    );

    if (!links.length) return rep.code(404).send({ success: false, message: "Invalid token" });

    const link = links[0];

    // Find the user session for this secret
    const sessions = await q(
      `SELECT os.user_id, u.username, u.email
       FROM oauth_sessions os
       JOIN users u ON u.id = os.user_id
       WHERE os.secret_code = :secret`,
      { secret: link.secret_code }
    );

    if (!sessions.length) {
      return rep.send({ success: false, requires_login: true, message: "User not logged in" });
    }

    const user = sessions[0];

    // Return session + meta
    return rep.send({
      success: true,
      user: { id: user.user_id, username: user.username, email: user.email },
      app_id: link.app_id,
      scopes: JSON.parse(link.scopes)
    });
  });
}
