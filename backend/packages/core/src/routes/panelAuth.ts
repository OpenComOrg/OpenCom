import { FastifyInstance } from "fastify";
import { z } from "zod";
import crypto from "node:crypto";
import { ulidLike } from "@ods/shared/ids.js";
import { q } from "../db.js";
import { verifyPassword, sha256Hex } from "../crypto.js";
import { parseBody } from "../validation.js";
import {
  buildOtpAuthUri,
  decryptTotpSecret,
  encryptTotpSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  verifyTotpToken,
} from "../adminTwoFactor.js";
import { getPanelAccess, getPanelAdminIdentity } from "../panelAccess.js";
import { env } from "../env.js";

const PANEL_ACCESS_TOKEN_TTL = "8h";
const PANEL_REFRESH_TOKEN_TTL_MS = 45 * 24 * 60 * 60 * 1000;
const PANEL_SETUP_TOKEN_TTL_MS = 15 * 60 * 1000;
const PANEL_RECOVERY_CODE_COUNT = 10;

const PanelLoginBody = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(200),
  totpToken: z.string().trim().optional(),
  recoveryCode: z.string().trim().optional(),
});

const PanelSetupCompleteBody = z.object({
  setupToken: z.string().trim().min(16).max(300),
  totpToken: z.string().trim().regex(/^\d{6}$/),
});

const PanelRefreshBody = z.object({
  refreshToken: z.string().trim().min(16).max(300),
});

const PanelLogoutBody = z.object({
  refreshToken: z.string().trim().min(16).max(300).optional(),
});

type PanelAdminAuthRow = {
  id: string;
  email: string;
  username: string;
  password_hash: string;
  role: "owner" | "admin" | "staff";
  two_factor_enabled: number;
  force_two_factor_setup: number;
  totp_secret_encrypted: string | null;
  disabled_at: string | null;
};

type PanelSetupTokenRow = {
  id: number;
  admin_id: string;
  secret_encrypted: string;
  expires_at: string;
  consumed_at: string | null;
  disabled_at: string | null;
};

function randomToken() {
  return crypto.randomBytes(32).toString("hex");
}

function toSqlTimestamp(msFromEpoch: number): string {
  return new Date(msFromEpoch).toISOString().slice(0, 19).replace("T", " ");
}

async function getPanelAdminByEmail(email: string) {
  const rows = await q<PanelAdminAuthRow>(
    `SELECT id,email,username,password_hash,role,two_factor_enabled,
            force_two_factor_setup,totp_secret_encrypted,disabled_at
       FROM panel_admin_users
      WHERE LOWER(email)=LOWER(:email)
      LIMIT 1`,
    { email: email.trim() },
  );
  return rows[0] ?? null;
}

async function getPanelAdminById(adminId: string) {
  const rows = await q<PanelAdminAuthRow>(
    `SELECT id,email,username,password_hash,role,two_factor_enabled,
            force_two_factor_setup,totp_secret_encrypted,disabled_at
       FROM panel_admin_users
      WHERE id=:adminId
      LIMIT 1`,
    { adminId },
  );
  return rows[0] ?? null;
}

async function buildPanelStatus(adminId: string) {
  const identity = await getPanelAdminIdentity(adminId);
  if (!identity) return null;

  const access = await getPanelAccess(adminId);
  return {
    id: identity.id,
    email: identity.email,
    username: identity.username,
    platformRole: access.platformRole,
    isPlatformAdmin: access.isPlatformAdmin,
    isPlatformOwner: access.isPlatformOwner,
    canAccessPanel: access.canAccessPanel,
    permissions: access.permissions,
    staffAssignment: access.staffAssignment,
  };
}

async function issuePanelSession(app: FastifyInstance, adminId: string) {
  const accessToken = app.jwt.sign(
    { sub: adminId, typ: "panel_access", scope: "panel_admin" },
    { expiresIn: PANEL_ACCESS_TOKEN_TTL },
  );

  const refreshToken = randomToken();
  const refreshId = ulidLike();
  const tokenHash = sha256Hex(refreshToken);
  const expiresAt = toSqlTimestamp(Date.now() + PANEL_REFRESH_TOKEN_TTL_MS);

  await q(
    `INSERT INTO panel_admin_refresh_tokens (id,admin_id,token_hash,expires_at)
     VALUES (:id,:adminId,:tokenHash,:expiresAt)`,
    { id: refreshId, adminId, tokenHash, expiresAt },
  );

  return { accessToken, refreshToken };
}

export async function panelAuthRoutes(app: FastifyInstance) {
  app.decorate("authenticatePanelAdmin", async function (request: any, reply: any) {
    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send({ error: "UNAUTHORIZED" });
    }

    const tokenType = String(request.user?.typ || "").trim();
    const scope = String(request.user?.scope || "").trim();
    const adminId = String(request.user?.sub || "").trim();
    if (tokenType !== "panel_access" || scope !== "panel_admin" || !adminId) {
      return reply.code(401).send({ error: "UNAUTHORIZED" });
    }

    const admin = await getPanelAdminById(adminId);
    if (!admin || admin.disabled_at) {
      return reply.code(401).send({ error: "UNAUTHORIZED" });
    }

    if (!admin.two_factor_enabled || !admin.totp_secret_encrypted) {
      return reply.code(401).send({ error: "TWO_FACTOR_NOT_CONFIGURED" });
    }

    request.panelAdmin = {
      id: admin.id,
      email: admin.email,
      username: admin.username,
      role: admin.role,
    };
  });

  app.post("/v1/panel/auth/login", async (req, rep) => {
    const body = parseBody(PanelLoginBody, req.body);
    const admin = await getPanelAdminByEmail(body.email);
    if (!admin) return rep.code(401).send({ error: "INVALID_CREDENTIALS" });
    if (admin.disabled_at) return rep.code(403).send({ error: "ACCOUNT_DISABLED" });

    const passwordOk = await verifyPassword(admin.password_hash, body.password);
    if (!passwordOk) return rep.code(401).send({ error: "INVALID_CREDENTIALS" });

    const requiresSetup =
      !admin.two_factor_enabled ||
      Boolean(admin.force_two_factor_setup) ||
      !admin.totp_secret_encrypted;

    if (requiresSetup) {
      const setupToken = randomToken();
      const setupTokenHash = sha256Hex(setupToken);
      const secret = generateTotpSecret();
      const secretEncrypted = encryptTotpSecret(secret);
      const expiresAt = toSqlTimestamp(Date.now() + PANEL_SETUP_TOKEN_TTL_MS);

      await q(
        `UPDATE panel_admin_2fa_setup_tokens
         SET consumed_at=COALESCE(consumed_at, NOW())
         WHERE admin_id=:adminId
           AND consumed_at IS NULL`,
        { adminId: admin.id },
      );

      await q(
        `INSERT INTO panel_admin_2fa_setup_tokens (admin_id,token_hash,secret_encrypted,expires_at)
         VALUES (:adminId,:tokenHash,:secretEncrypted,:expiresAt)`,
        {
          adminId: admin.id,
          tokenHash: setupTokenHash,
          secretEncrypted,
          expiresAt,
        },
      );

      const accountName = admin.email || admin.username;
      return rep.send({
        next: "setup_2fa",
        setupToken,
        setupExpiresAt: expiresAt,
        issuer: env.ADMIN_2FA_ISSUER,
        accountName,
        totpSecret: secret,
        otpauthUri: buildOtpAuthUri({
          secret,
          accountName,
          issuer: env.ADMIN_2FA_ISSUER,
        }),
      });
    }

    const submittedTotp = String(body.totpToken || "").trim();
    const submittedRecoveryCode = String(body.recoveryCode || "").trim();
    if (!submittedTotp && !submittedRecoveryCode) {
      return rep.code(401).send({ error: "TWO_FACTOR_REQUIRED" });
    }

    let usedRecoveryCode = false;
    if (submittedRecoveryCode) {
      const recoveryCodeHash = hashRecoveryCode(submittedRecoveryCode);
      const rows = await q<{ id: number }>(
        `SELECT id
           FROM panel_admin_recovery_codes
          WHERE admin_id=:adminId
            AND code_hash=:codeHash
            AND used_at IS NULL
          LIMIT 1`,
        { adminId: admin.id, codeHash: recoveryCodeHash },
      );

      if (!rows.length) {
        return rep.code(401).send({ error: "INVALID_TWO_FACTOR_TOKEN" });
      }

      await q(
        `UPDATE panel_admin_recovery_codes
         SET used_at=NOW()
         WHERE id=:id`,
        { id: rows[0].id },
      );
      usedRecoveryCode = true;
    } else {
      let decryptedSecret = "";
      try {
        decryptedSecret = decryptTotpSecret(admin.totp_secret_encrypted || "");
      } catch {
        return rep.code(401).send({ error: "TWO_FACTOR_NOT_CONFIGURED" });
      }

      if (!verifyTotpToken(decryptedSecret, submittedTotp)) {
        return rep.code(401).send({ error: "INVALID_TWO_FACTOR_TOKEN" });
      }
    }

    const tokens = await issuePanelSession(app, admin.id);
    await q(`UPDATE panel_admin_users SET last_login_at=NOW() WHERE id=:adminId`, {
      adminId: admin.id,
    });

    const status = await buildPanelStatus(admin.id);
    if (!status) return rep.code(401).send({ error: "UNAUTHORIZED" });

    const remainingRows = await q<{ count: number }>(
      `SELECT COUNT(*) AS count
         FROM panel_admin_recovery_codes
        WHERE admin_id=:adminId
          AND used_at IS NULL`,
      { adminId: admin.id },
    );

    return rep.send({
      next: "complete",
      ...tokens,
      admin: status,
      usedRecoveryCode,
      recoveryCodesRemaining: Number(remainingRows[0]?.count || 0),
    });
  });

  app.post("/v1/panel/auth/setup/complete", async (req, rep) => {
    const body = parseBody(PanelSetupCompleteBody, req.body);
    const tokenHash = sha256Hex(body.setupToken);

    const rows = await q<PanelSetupTokenRow>(
      `SELECT st.id,st.admin_id,st.secret_encrypted,st.expires_at,st.consumed_at,
              pa.disabled_at
         FROM panel_admin_2fa_setup_tokens st
         JOIN panel_admin_users pa ON pa.id=st.admin_id
        WHERE st.token_hash=:tokenHash
        ORDER BY st.created_at DESC
        LIMIT 1`,
      { tokenHash },
    );

    if (!rows.length) {
      return rep.code(400).send({ error: "INVALID_SETUP_TOKEN" });
    }

    const setup = rows[0];
    if (setup.disabled_at) {
      return rep.code(403).send({ error: "ACCOUNT_DISABLED" });
    }
    if (setup.consumed_at) {
      return rep.code(400).send({ error: "SETUP_TOKEN_USED" });
    }
    if (new Date(setup.expires_at).getTime() < Date.now()) {
      return rep.code(400).send({ error: "SETUP_TOKEN_EXPIRED" });
    }

    let secret = "";
    try {
      secret = decryptTotpSecret(setup.secret_encrypted);
    } catch {
      return rep.code(400).send({ error: "INVALID_SETUP_TOKEN" });
    }

    if (!verifyTotpToken(secret, body.totpToken)) {
      return rep.code(400).send({ error: "INVALID_TWO_FACTOR_TOKEN" });
    }

    const secretEncrypted = encryptTotpSecret(secret);
    const recoveryCodes = generateRecoveryCodes(PANEL_RECOVERY_CODE_COUNT);

    await q(
      `UPDATE panel_admin_users
       SET two_factor_enabled=1,
           force_two_factor_setup=0,
           totp_secret_encrypted=:secretEncrypted,
           last_login_at=NOW()
       WHERE id=:adminId`,
      { adminId: setup.admin_id, secretEncrypted },
    );

    await q(`DELETE FROM panel_admin_recovery_codes WHERE admin_id=:adminId`, {
      adminId: setup.admin_id,
    });

    for (const code of recoveryCodes) {
      await q(
        `INSERT INTO panel_admin_recovery_codes (admin_id,code_hash)
         VALUES (:adminId,:codeHash)`,
        {
          adminId: setup.admin_id,
          codeHash: hashRecoveryCode(code),
        },
      );
    }

    await q(
      `UPDATE panel_admin_2fa_setup_tokens
       SET consumed_at=NOW()
       WHERE id=:id`,
      { id: setup.id },
    );

    const tokens = await issuePanelSession(app, setup.admin_id);
    const status = await buildPanelStatus(setup.admin_id);
    if (!status) return rep.code(401).send({ error: "UNAUTHORIZED" });

    return rep.send({
      next: "complete",
      ...tokens,
      admin: status,
      recoveryCodes,
    });
  });

  app.post("/v1/panel/auth/refresh", async (req, rep) => {
    const body = parseBody(PanelRefreshBody, req.body);
    const tokenHash = sha256Hex(body.refreshToken);

    const rows = await q<{
      id: string;
      admin_id: string;
      revoked_at: string | null;
      expires_at: string;
      disabled_at: string | null;
      two_factor_enabled: number;
      totp_secret_encrypted: string | null;
    }>(
      `SELECT rt.id,rt.admin_id,rt.revoked_at,rt.expires_at,
              pa.disabled_at,pa.two_factor_enabled,pa.totp_secret_encrypted
         FROM panel_admin_refresh_tokens rt
         JOIN panel_admin_users pa ON pa.id=rt.admin_id
        WHERE rt.token_hash=:tokenHash
        LIMIT 1`,
      { tokenHash },
    );

    if (!rows.length) return rep.code(401).send({ error: "INVALID_REFRESH" });

    const refresh = rows[0];
    if (refresh.revoked_at) return rep.code(401).send({ error: "REFRESH_REVOKED" });
    if (new Date(refresh.expires_at).getTime() < Date.now()) {
      return rep.code(401).send({ error: "REFRESH_EXPIRED" });
    }
    if (refresh.disabled_at) return rep.code(403).send({ error: "ACCOUNT_DISABLED" });
    if (!refresh.two_factor_enabled || !refresh.totp_secret_encrypted) {
      return rep.code(401).send({ error: "TWO_FACTOR_REQUIRED" });
    }

    const nextRefreshToken = randomToken();
    const nextRefreshTokenHash = sha256Hex(nextRefreshToken);
    const nextRefreshId = ulidLike();
    const nextRefreshExpiresAt = toSqlTimestamp(Date.now() + PANEL_REFRESH_TOKEN_TTL_MS);

    await q(
      `INSERT INTO panel_admin_refresh_tokens (id,admin_id,token_hash,expires_at)
       VALUES (:id,:adminId,:tokenHash,:expiresAt)`,
      {
        id: nextRefreshId,
        adminId: refresh.admin_id,
        tokenHash: nextRefreshTokenHash,
        expiresAt: nextRefreshExpiresAt,
      },
    );

    await q(
      `UPDATE panel_admin_refresh_tokens
       SET revoked_at=NOW()
       WHERE id=:id`,
      { id: refresh.id },
    );

    const accessToken = app.jwt.sign(
      { sub: refresh.admin_id, typ: "panel_access", scope: "panel_admin" },
      { expiresIn: PANEL_ACCESS_TOKEN_TTL },
    );

    const status = await buildPanelStatus(refresh.admin_id);
    if (!status) return rep.code(401).send({ error: "UNAUTHORIZED" });

    return rep.send({
      accessToken,
      refreshToken: nextRefreshToken,
      admin: status,
    });
  });

  app.post(
    "/v1/panel/auth/logout",
    { preHandler: [app.authenticatePanelAdmin] } as any,
    async (req: any) => {
      const body = parseBody(PanelLogoutBody, req.body || {});
      const adminId = String(req.panelAdmin?.id || req.user?.sub || "").trim();

      if (!adminId) return { ok: true };

      if (body.refreshToken) {
        await q(
          `UPDATE panel_admin_refresh_tokens
           SET revoked_at=NOW()
           WHERE admin_id=:adminId
             AND token_hash=:tokenHash
             AND revoked_at IS NULL`,
          {
            adminId,
            tokenHash: sha256Hex(body.refreshToken),
          },
        );
      } else {
        await q(
          `UPDATE panel_admin_refresh_tokens
           SET revoked_at=NOW()
           WHERE admin_id=:adminId
             AND revoked_at IS NULL`,
          { adminId },
        );
      }

      return { ok: true };
    },
  );

  app.get(
    "/v1/panel/me",
    { preHandler: [app.authenticatePanelAdmin] } as any,
    async (req: any, rep) => {
      const adminId = String(req.panelAdmin?.id || req.user?.sub || "").trim();
      const status = await buildPanelStatus(adminId);
      if (!status) return rep.code(401).send({ error: "UNAUTHORIZED" });
      return status;
    },
  );
}
