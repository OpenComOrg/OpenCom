import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ulidLike } from "@ods/shared/ids.js";
import { q } from "../db.js";
import { hashPassword, verifyPassword, sha256Hex } from "../crypto.js";
import crypto from "node:crypto";
import { parseBody } from "../validation.js";
import { env } from "../env.js";
import { sendVerificationEmail } from "../mail.js";

const Register = z.object({
  email: z.string().email(),
  username: z.string().min(2).max(32),
  password: z.string().min(8).max(200)
});

const Login = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const VerifyEmail = z.object({
  token: z.string().min(16)
});

const ResendVerification = z.object({
  email: z.string().email()
});

const ACCESS_TOKEN_TTL = "12h";
const REFRESH_TOKEN_TTL_MS = 365 * 24 * 60 * 60 * 1000; // 1 year

function randomToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function toSqlTimestamp(msFromEpoch: number): string {
  return new Date(msFromEpoch).toISOString().slice(0, 19).replace("T", " ");
}

async function issueEmailVerificationToken(userId: string): Promise<string> {
  const token = randomToken();
  const tokenHash = sha256Hex(token);
  const expiresAt = toSqlTimestamp(Date.now() + (env.AUTH_EMAIL_VERIFICATION_TOKEN_TTL_MINUTES * 60 * 1000));

  await q(
    `INSERT INTO email_verification_tokens (id,user_id,token_hash,expires_at)
     VALUES (:id,:userId,:tokenHash,:expiresAt)`,
    { id: ulidLike(), userId, tokenHash, expiresAt }
  );

  return token;
}

async function sendEmailVerificationForUser(userId: string, email: string) {
  const token = await issueEmailVerificationToken(userId);
  await sendVerificationEmail(email, token);
}

export async function authRoutes(app: FastifyInstance) {

  app.decorate("authenticate", async function (request: any, reply: any) {
    try {
      await request.jwtVerify();
    } catch {
      reply.code(401).send({ error: "UNAUTHORIZED" });
    }
  });

  app.post("/v1/auth/register", async (req, rep) => {
    const body = parseBody(Register, req.body);

    const existing = await q(`SELECT id FROM users WHERE email=:email`, { email: body.email });
    if (existing.length) return rep.code(409).send({ error: "EMAIL_TAKEN" });

    const id = ulidLike();
    const pwHash = await hashPassword(body.password);

    await q(
      `INSERT INTO users (id,email,username,password_hash) VALUES (:id,:email,:username,:passwordHash)`,
      { id, email: body.email, username: body.username, passwordHash: pwHash }
    );

    if (env.AUTH_REQUIRE_EMAIL_VERIFICATION) {
      try {
        await sendEmailVerificationForUser(id, body.email);
      } catch (error) {
        await q(`DELETE FROM users WHERE id=:id`, { id });
        if ((error as Error)?.message === "SMTP_NOT_CONFIGURED") {
          return rep.code(500).send({ error: "SMTP_NOT_CONFIGURED" });
        }
        return rep.code(500).send({ error: "EMAIL_SEND_FAILED" });
      }
    }

    // Bootstrap platform founder on first registration if unset
    await q(`INSERT INTO platform_config (id, founder_user_id) VALUES (1, NULL) ON DUPLICATE KEY UPDATE id=id`);
    const founder = await q<{ founder_user_id: string | null }>(`SELECT founder_user_id FROM platform_config WHERE id=1`);
    if (!founder.length || !founder[0].founder_user_id) {
      await q(`UPDATE platform_config SET founder_user_id=:id WHERE id=1`, { id });
      await q(`INSERT INTO platform_admins (user_id,added_by) VALUES (:id,:id) ON DUPLICATE KEY UPDATE user_id=user_id`, { id });
      await q(`INSERT INTO user_badges (user_id,badge) VALUES (:id,'PLATFORM_FOUNDER') ON DUPLICATE KEY UPDATE user_id=user_id`, { id });
      await q(`INSERT INTO user_badges (user_id,badge) VALUES (:id,'PLATFORM_ADMIN') ON DUPLICATE KEY UPDATE user_id=user_id`, { id });
    }

    return rep.send({
      id,
      email: body.email,
      username: body.username,
      emailVerificationRequired: env.AUTH_REQUIRE_EMAIL_VERIFICATION
    });
  });

  app.post("/v1/auth/login", async (req, rep) => {
    const body = parseBody(Login, req.body);
    const users = await q<{ id: string; password_hash: string; username: string; email: string; email_verified_at: string | null }>(
      `SELECT id,password_hash,username,email,email_verified_at FROM users WHERE email=:email`,
      { email: body.email }
    );
    if (!users.length) return rep.code(401).send({ error: "INVALID_CREDENTIALS" });

    const u = users[0];
    const ok = await verifyPassword(u.password_hash, body.password);
    if (!ok) return rep.code(401).send({ error: "INVALID_CREDENTIALS" });
    if (env.AUTH_REQUIRE_EMAIL_VERIFICATION && !u.email_verified_at) {
      return rep.code(403).send({ error: "EMAIL_NOT_VERIFIED" });
    }

    const accessToken = app.jwt.sign({ sub: u.id, typ: "access" }, { expiresIn: ACCESS_TOKEN_TTL });

    const refresh = randomToken();
    const refreshId = ulidLike();
    const tokenHash = sha256Hex(refresh);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS).toISOString().slice(0, 19).replace("T", " ");

    await q(
      `INSERT INTO refresh_tokens (id,user_id,token_hash,expires_at) VALUES (:id,:userId,:tokenHash,:expiresAt)`,
      { id: refreshId, userId: u.id, tokenHash, expiresAt }
    );

    return rep.send({
      user: { id: u.id, email: u.email, username: u.username },
      accessToken,
      refreshToken: refresh
    });
  });

  app.post("/v1/auth/verify-email", async (req, rep) => {
    const body = parseBody(VerifyEmail, req.body);
    const tokenHash = sha256Hex(body.token);
    const rows = await q<{ id: string; user_id: string; expires_at: string; used_at: string | null }>(
      `SELECT id,user_id,expires_at,used_at
       FROM email_verification_tokens
       WHERE token_hash=:tokenHash
       ORDER BY created_at DESC
       LIMIT 1`,
      { tokenHash }
    );

    if (!rows.length) return rep.code(400).send({ error: "INVALID_VERIFICATION_TOKEN" });
    const record = rows[0];
    if (record.used_at) return rep.code(400).send({ error: "VERIFICATION_TOKEN_USED" });
    if (new Date(record.expires_at).getTime() < Date.now()) return rep.code(400).send({ error: "VERIFICATION_TOKEN_EXPIRED" });

    await q(
      `UPDATE users SET email_verified_at=COALESCE(email_verified_at, NOW()) WHERE id=:userId`,
      { userId: record.user_id }
    );
    await q(
      `UPDATE email_verification_tokens SET used_at=NOW() WHERE id=:id`,
      { id: record.id }
    );

    return rep.send({ ok: true });
  });

  app.post("/v1/auth/resend-verification", async (req, rep) => {
    const body = parseBody(ResendVerification, req.body);
    if (!env.AUTH_REQUIRE_EMAIL_VERIFICATION) return rep.send({ ok: true });

    const rows = await q<{ id: string; email: string; email_verified_at: string | null }>(
      `SELECT id,email,email_verified_at FROM users WHERE email=:email LIMIT 1`,
      { email: body.email }
    );
    if (!rows.length) return rep.send({ ok: true });
    if (rows[0].email_verified_at) return rep.send({ ok: true });

    try {
      await sendEmailVerificationForUser(rows[0].id, rows[0].email);
      return rep.send({ ok: true });
    } catch (error) {
      if ((error as Error)?.message === "SMTP_NOT_CONFIGURED") {
        return rep.code(500).send({ error: "SMTP_NOT_CONFIGURED" });
      }
      return rep.code(500).send({ error: "EMAIL_SEND_FAILED" });
    }
  });

  app.post("/v1/auth/refresh", async (req, rep) => {
    const body = parseBody(z.object({ refreshToken: z.string().min(10) }), req.body);
    const tokenHash = sha256Hex(body.refreshToken);

    const rows = await q<{ id: string; user_id: string; revoked_at: string | null; expires_at: string }>(
      `SELECT id,user_id,revoked_at,expires_at FROM refresh_tokens WHERE token_hash=:tokenHash`,
      { tokenHash }
    );
    if (!rows.length) return rep.code(401).send({ error: "INVALID_REFRESH" });

    const rt = rows[0];
    if (rt.revoked_at) return rep.code(401).send({ error: "REFRESH_REVOKED" });
    if (new Date(rt.expires_at).getTime() < Date.now()) return rep.code(401).send({ error: "REFRESH_EXPIRED" });

    const nextRefresh = randomToken();
    const nextRefreshId = ulidLike();
    const nextTokenHash = sha256Hex(nextRefresh);
    const nextExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS).toISOString().slice(0, 19).replace("T", " ");

    await q(
      `INSERT INTO refresh_tokens (id,user_id,token_hash,expires_at)
       VALUES (:id,:userId,:tokenHash,:expiresAt)`,
      { id: nextRefreshId, userId: rt.user_id, tokenHash: nextTokenHash, expiresAt: nextExpiresAt }
    );
    // Rotate refresh token on every refresh for better redundancy and session continuity.
    await q(`UPDATE refresh_tokens SET revoked_at=NOW() WHERE id=:id`, { id: rt.id });

    const accessToken = app.jwt.sign({ sub: rt.user_id, typ: "access" }, { expiresIn: ACCESS_TOKEN_TTL });
    return rep.send({ accessToken, refreshToken: nextRefresh });
  });

  app.get("/v1/me", { preHandler: [app.authenticate] } as any, async (req: any) => {
    const userId = req.user.sub as string;
    const rows = await q<{ id: string; email: string; username: string }>(
      `SELECT id,email,username FROM users WHERE id=:userId`,
      { userId }
    );
    return rows[0] ?? null;
  });

  app.get("/v1/auth/sessions", { preHandler: [app.authenticate] } as any, async (req: any) => {
    const userId = req.user.sub as string;

    const rows = await q<{ id: string; created_at: string; expires_at: string; revoked_at: string | null; device_id: string | null }>(
      `SELECT id, created_at, expires_at, revoked_at, device_id 
       FROM refresh_tokens 
       WHERE user_id=:userId AND revoked_at IS NULL AND expires_at > NOW()
       ORDER BY created_at DESC`,
      { userId }
    );

    const sessions = rows.map((row, index) => ({
      id: row.id,
      deviceName: row.device_id ? `Device ${row.device_id.slice(0, 8)}` : `Session ${index + 1}`,
      lastActive: row.created_at,
      expiresAt: row.expires_at,
      isCurrent: index === 0 // Most recent session is considered current
    }));

    return { sessions };
  });

  app.delete("/v1/auth/sessions/:sessionId", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const userId = req.user.sub as string;
    const { sessionId } = z.object({ sessionId: z.string().min(3) }).parse(req.params);

    const rows = await q<{ user_id: string }>(
      `SELECT user_id FROM refresh_tokens WHERE id=:sessionId`,
      { sessionId }
    );

    if (!rows.length) return rep.code(404).send({ error: "SESSION_NOT_FOUND" });
    if (rows[0].user_id !== userId) return rep.code(403).send({ error: "FORBIDDEN" });

    await q(
      `UPDATE refresh_tokens SET revoked_at=NOW() WHERE id=:sessionId`,
      { sessionId }
    );

    return rep.send({ success: true });
  });

  app.patch("/v1/auth/password", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const userId = req.user.sub as string;
    const body = parseBody(z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8).max(200)
    }), req.body);

    const users = await q<{ password_hash: string }>(
      `SELECT password_hash FROM users WHERE id=:userId`,
      { userId }
    );
    if (!users.length) return rep.code(404).send({ error: "USER_NOT_FOUND" });

    const ok = await verifyPassword(users[0].password_hash, body.currentPassword);
    if (!ok) return rep.code(401).send({ error: "INVALID_PASSWORD" });

    const newHash = await hashPassword(body.newPassword);
    await q(
      `UPDATE users SET password_hash=:newHash WHERE id=:userId`,
      { userId, newHash }
    );

    return rep.send({ success: true });
  });

}
