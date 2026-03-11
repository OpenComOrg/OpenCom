import { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { ulidLike } from "@ods/shared/ids.js";
import { q } from "../db.js";
import { hashPassword, verifyPassword, sha256Hex } from "../crypto.js";
import crypto from "node:crypto";
import { parseBody } from "../validation.js";
import { env } from "../env.js";
import { sendPasswordResetEmail, sendSigninEmail, sendVerificationEmail } from "../mail.js";
import { isReservedUsername, isUsernameTaken, normalizeUsername } from "../usernames.js";

const Register = z.object({
  email: z.string().trim().email(),
  username: z.string().trim().min(2).max(32),
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

const ForgotPassword = z.object({
  email: z.string().trim().email()
});

const ResetPassword = z.object({
  token: z.string().min(16),
  newPassword: z.string().min(8).max(200)
});

const ACCESS_TOKEN_TTL = "12h";
const REFRESH_TOKEN_TTL_MS = 365 * 24 * 60 * 60 * 1000; // 1 year

function randomToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function toSqlTimestamp(msFromEpoch: number): string {
  return new Date(msFromEpoch).toISOString().slice(0, 19).replace("T", " ");
}

function firstHeaderValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0]?.trim() || "";
  return typeof value === "string" ? value.trim() : "";
}

function normalizeIp(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "unknown";
  if (trimmed.startsWith("::ffff:")) return trimmed.slice(7);
  return trimmed;
}

function getClientIp(request: FastifyRequest): string {
  const cfIp = firstHeaderValue(request.headers["cf-connecting-ip"]);
  if (cfIp) return normalizeIp(cfIp);

  const forwardedFor = firstHeaderValue(request.headers["x-forwarded-for"]);
  if (forwardedFor) return normalizeIp(forwardedFor.split(",")[0] || forwardedFor);

  return normalizeIp(request.ip);
}

function getClientUserAgent(request: FastifyRequest): string | null {
  const userAgent = firstHeaderValue(request.headers["user-agent"]);
  if (!userAgent) return null;
  return userAgent.slice(0, 512);
}

async function isAccountBanned(userId: string): Promise<boolean> {
  const rows = await q<{ user_id: string }>(
    `SELECT user_id FROM account_bans WHERE user_id=:userId LIMIT 1`,
    { userId }
  );
  return rows.length > 0;
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

async function issuePasswordResetToken(userId: string): Promise<string> {
  const token = randomToken();
  const tokenHash = sha256Hex(token);
  const expiresAt = toSqlTimestamp(Date.now() + (env.AUTH_PASSWORD_RESET_TOKEN_TTL_MINUTES * 60 * 1000));

  await q(
    `UPDATE password_reset_tokens
     SET used_at=NOW()
     WHERE user_id=:userId
       AND used_at IS NULL`,
    { userId }
  );

  await q(
    `INSERT INTO password_reset_tokens (id,user_id,token_hash,expires_at)
     VALUES (:id,:userId,:tokenHash,:expiresAt)`,
    { id: ulidLike(), userId, tokenHash, expiresAt }
  );

  return token;
}

async function sendPasswordResetForUser(userId: string, email: string) {
  const token = await issuePasswordResetToken(userId);
  await sendPasswordResetEmail(email, token);
}

async function rememberSigninIp(userId: string, ip: string, userAgent: string | null): Promise<boolean> {
  const knownIp = await q<{ ip_address: string }>(
    `SELECT ip_address
     FROM known_signin_ips
     WHERE user_id=:userId
       AND ip_address=:ip
     LIMIT 1`,
    { userId, ip }
  );

  const hasSigninHistory = knownIp.length > 0 || (await q<{ user_id: string }>(
    `SELECT user_id
     FROM known_signin_ips
     WHERE user_id=:userId
     LIMIT 1`,
    { userId }
  )).length > 0;

  await q(
    `INSERT INTO known_signin_ips (user_id,ip_address,last_user_agent)
     VALUES (:userId,:ip,:userAgent)
     ON DUPLICATE KEY UPDATE
       last_seen_at=NOW(),
       last_user_agent=VALUES(last_user_agent)`,
    { userId, ip, userAgent }
  );

  return hasSigninHistory && knownIp.length === 0;
}

function mapMailError(error: unknown): string {
  const code = String((error as Error)?.message || "").trim();
  if (code === "SMTP_NOT_CONFIGURED") return "SMTP_NOT_CONFIGURED";
  if (code === "SMTP_AUTH_FAILED") return "SMTP_AUTH_FAILED";
  if (code === "SMTP_CONNECTION_FAILED") return "SMTP_CONNECTION_FAILED";
  if (code === "EMAIL_SEND_FAILED") return "EMAIL_SEND_FAILED";
  return "EMAIL_SEND_FAILED";
}

export async function authRoutes(app: FastifyInstance) {

  app.decorate("authenticate", async function (request: any, reply: any) {
    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send({ error: "UNAUTHORIZED" });
    }

    const userId = request.user?.sub as string | undefined;
    if (!userId) return reply.code(401).send({ error: "UNAUTHORIZED" });

    const users = await q<{ id: string }>(
      `SELECT id FROM users WHERE id=:userId LIMIT 1`,
      { userId }
    );
    if (!users.length) return reply.code(401).send({ error: "ACCOUNT_NOT_FOUND" });

    if (await isAccountBanned(userId)) return reply.code(403).send({ error: "ACCOUNT_BANNED" });
  });

  app.post("/v1/auth/register", async (req, rep) => {
    const body = parseBody(Register, req.body);
    const username = normalizeUsername(body.username);

    const existing = await q(`SELECT id FROM users WHERE email=:email`, { email: body.email });
    if (existing.length) return rep.code(409).send({ error: "EMAIL_TAKEN" });
    if (isReservedUsername(username)) return rep.code(409).send({ error: "USERNAME_RESERVED" });
    if (await isUsernameTaken(username)) return rep.code(409).send({ error: "USERNAME_TAKEN" });

    const id = ulidLike();
    const pwHash = await hashPassword(body.password);

    try {
      await q(
        `INSERT INTO users (id,email,username,password_hash) VALUES (:id,:email,:username,:passwordHash)`,
        { id, email: body.email, username, passwordHash: pwHash }
      );
    } catch (error: any) {
      const message = String(error?.message || "").toLowerCase();
      if (message.includes("username")) return rep.code(409).send({ error: "USERNAME_TAKEN" });
      if (message.includes("email")) return rep.code(409).send({ error: "EMAIL_TAKEN" });
      throw error;
    }

    if (env.AUTH_REQUIRE_EMAIL_VERIFICATION) {
      try {
        await sendEmailVerificationForUser(id, body.email);
      } catch (error) {
        await q(`DELETE FROM users WHERE id=:id`, { id });
        return rep.code(500).send({ error: mapMailError(error) });
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
      username,
      emailVerificationRequired: env.AUTH_REQUIRE_EMAIL_VERIFICATION
    });
  });

  app.post("/v1/auth/login", async (req, rep) => {
    const body = parseBody(Login, req.body);
    const users = await q<{ id: string; password_hash: string; username: string; email: string; email_verified_at: string | null; banned_at: string | null }>(
      `SELECT u.id,u.password_hash,u.username,u.email,u.email_verified_at,ab.created_at AS banned_at
       FROM users u
       LEFT JOIN account_bans ab ON ab.user_id=u.id
       WHERE u.email=:email
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

    const signinIp = getClientIp(req);
    const signinUserAgent = getClientUserAgent(req);
    const signedInAt = new Date();

    const accessToken = app.jwt.sign({ sub: u.id, typ: "access" }, { expiresIn: ACCESS_TOKEN_TTL });

    const refresh = randomToken();
    const refreshId = ulidLike();
    const tokenHash = sha256Hex(refresh);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS).toISOString().slice(0, 19).replace("T", " ");

    await q(
      `INSERT INTO refresh_tokens (id,user_id,token_hash,expires_at) VALUES (:id,:userId,:tokenHash,:expiresAt)`,
      { id: refreshId, userId: u.id, tokenHash, expiresAt }
    );

    try {
      const isSuspiciousSignin = await rememberSigninIp(u.id, signinIp, signinUserAgent);
      if (isSuspiciousSignin) {
        await sendSigninEmail(u.email, {
          ip: signinIp,
          happenedAt: signedInAt,
          userAgent: signinUserAgent
        });
      }
    } catch (error) {
      req.log.warn({ err: error, userId: u.id }, "Failed to process suspicious sign-in alert");
    }

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
      return rep.code(500).send({ error: mapMailError(error) });
    }
  });

  app.post("/v1/auth/forgot-password", async (req, rep) => {
    const body = parseBody(ForgotPassword, req.body);

    const rows = await q<{ id: string; email: string }>(
      `SELECT id,email
       FROM users
       WHERE email=:email
       LIMIT 1`,
      { email: body.email }
    );
    if (!rows.length) return rep.send({ ok: true });

    try {
      await sendPasswordResetForUser(rows[0].id, rows[0].email);
      return rep.send({ ok: true });
    } catch (error) {
      return rep.code(500).send({ error: mapMailError(error) });
    }
  });

  app.post("/v1/auth/reset-password", async (req, rep) => {
    const body = parseBody(ResetPassword, req.body);
    const tokenHash = sha256Hex(body.token);
    const rows = await q<{ id: string; user_id: string; expires_at: string; used_at: string | null }>(
      `SELECT id,user_id,expires_at,used_at
       FROM password_reset_tokens
       WHERE token_hash=:tokenHash
       ORDER BY created_at DESC
       LIMIT 1`,
      { tokenHash }
    );

    if (!rows.length) return rep.code(400).send({ error: "INVALID_PASSWORD_RESET_TOKEN" });
    const record = rows[0];
    if (record.used_at) return rep.code(400).send({ error: "PASSWORD_RESET_TOKEN_USED" });
    if (new Date(record.expires_at).getTime() < Date.now()) {
      return rep.code(400).send({ error: "PASSWORD_RESET_TOKEN_EXPIRED" });
    }

    const users = await q<{ id: string }>(
      `SELECT id
       FROM users
       WHERE id=:userId
       LIMIT 1`,
      { userId: record.user_id }
    );
    if (!users.length) return rep.code(400).send({ error: "INVALID_PASSWORD_RESET_TOKEN" });

    const newHash = await hashPassword(body.newPassword);
    await q(
      `UPDATE users
       SET password_hash=:newHash
       WHERE id=:userId`,
      { userId: record.user_id, newHash }
    );
    await q(
      `UPDATE password_reset_tokens
       SET used_at=NOW()
       WHERE user_id=:userId
         AND used_at IS NULL`,
      { userId: record.user_id }
    );
    await q(
      `UPDATE refresh_tokens
       SET revoked_at=NOW()
       WHERE user_id=:userId
         AND revoked_at IS NULL`,
      { userId: record.user_id }
    );

    return rep.send({ ok: true });
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
    if (await isAccountBanned(rt.user_id)) {
      await q(
        `UPDATE refresh_tokens SET revoked_at=NOW()
         WHERE user_id=:userId AND revoked_at IS NULL`,
        { userId: rt.user_id }
      );
      return rep.code(403).send({ error: "ACCOUNT_BANNED" });
    }

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
