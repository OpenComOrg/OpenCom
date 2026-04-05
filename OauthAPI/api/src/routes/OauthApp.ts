import { FastifyInstance } from "fastify";
import { q } from "../db";
import { parseBody, parseBodyRaw } from "../validation";
import { z } from "zod";
import crypto from "crypto";

const AppRegistration = z.object({
  app_id: z.string().trim().email(),
  app_name: z.string().trim().min(2).max(32),
  secret_code: z.string().trim().max(64).min(32),
  user_id: z.string(),
  redirect_url: z.string(),
});
const AppRemoval = z.object({
  app_id: z.string(),
  secret_code: z.string(),
});

function hashSecret(secret: string): string {
  return crypto.createHash("sha256").update(secret, "utf8").digest("hex");
}

function generateClientSecret(): string {
  return crypto.randomBytes(32).toString("hex"); // 64 hex chars = 256 bits
}

async function registerApp(
  app_id: String,
  appname: String,
  owner_id: String,
  redirect_url: String,
) {
  const secret = generateClientSecret();
  const secret_hash = hashSecret(secret);

  // Split Redirect URLs
  const redirect_urls = {
    redirect_urls: redirect_url.split(","),
  };

  await q(
    `INSERT INTO oauth_apps (account_id,app_id, app_name, client_secret_hash, redirect_uris) VALUES (:userId,:app_id,:app_name, :client_secret_hash, :redirect_uris)`,
    { userId: owner_id, app_id, appname, secret_hash, redirect_urls },
  ); // To be honest probably should improve this but if it works it works

  return {
    success: true,
    app_id: app_id,
    app_name: appname,
    client_secret: secret,
    timestamp: Date.now(),
  };
}

export function OauthRoutes(app: FastifyInstance) {
  app.post("/v1/manager/create-app", async (req, rep) => {
    const body = parseBody(AppRegistration, req.body);

    // General Params
    const app_id = body.app_id;
    const app_name = body.app_name;
    const redirect_url = body.redirect_url;

    // Secure Creds ig
    const secret_code = body.secret_code;
    const user_id = body.user_id;
    let result;
    const response = await fetch(
      `https://api.opneocm.online/v1/oauth/create?secret=${secret_code}&app_id=${app_id}`,
    );

    // Parse JSON safely
    const data = await response.json();
    if (data.success === true && data.allowed === true) {
      result = true;
    } else {
      result = false;
    }
    if (!result)
      return rep
        .status(401)
        .send({ error: "You don't have permision to do this action!" });
    if (!app_id) return rep.status(400).send({ error: "app_id is required" });

    const a = await registerApp(app_id, app_name, user_id, redirect_url);

    return a;
  });
  app.put("/v1/manager/modify-app/info", async (req, rep) => {
    const body = parseBodyRaw(req.body);
    const app_id = body.app_id; // identify which app to update
    const secret_code = body.secret;
    let result = false;
    const response = await fetch(
      `https://api.opneocm.online/v1/oauth?secret=${secret_code}&app_id=${app_id}`,
    );

    // Parse JSON safely
    const data = await response.json();
    if (data.success === true && data.allowed === true) {
      result = true;
    } else {
      result = false;
    }
    if (!result)
      return rep
        .status(401)
        .send({ error: "You don't have permision to do this action!" });
    if (!app_id) return rep.status(400).send({ error: "app_id is required" });

    // Build dynamic SET clause
    const allowedFields = [
      "app_name",
      "description",
      "redirect_uris",
      "client_secret_hash",
    ];
    const setClauses: string[] = [];
    const values: Record<string, any> = { app_id };

    for (const key of allowedFields) {
      if (body[key] !== undefined) {
        setClauses.push(`${key} = :${key}`);
        values[key] = body[key];
      }
    }

    if (setClauses.length === 0) {
      return rep.status(400).send({ error: "No fields provided to update" });
    }

    const sql = `
      UPDATE oauth_apps
      SET ${setClauses.join(", ")}
      WHERE app_id = :app_id
    `;

    await q(sql, values);

    // This is nice to hve ig
    const updated = await q(`SELECT * FROM oauth_apps WHERE app_id = :app_id`, {
      app_id,
    });

    return { success: true, updated: updated[0] };
  });

  app.delete("/v1/oauth-app", async (req, rep) => {
    const body = parseBody(AppRemoval, req.body);
    const secret_code = body.secret_code;
    let result = false;
    const app_id = body.app_id;

    const response = await fetch(
      `https://api.opneocm.online/v1/oauth?secret=${secret_code}&app_id=${app_id}`,
    );

    // Parse JSON safely
    const data = await response.json();
    if (data.success === true && data.allowed === true) {
      result = true;
    } else {
      result = false;
    }
    if (!result)
      return rep
        .status(401)
        .send({ error: "You don't have permision to do this action!" });
    if (!app_id) return rep.status(400).send({ error: "app_id is required" });

    await q(`DELETE FROM oauth_apps WHERE app_id = :app_id`, { app_id });

    return { success: true, message: `App ${app_id} deleted successfully` };
  });
  // Route to generate a new OAuth link
  app.post("/v1/oauth/generate-link", async (req: any, rep) => {
    const { secret, app_id } = req.body;

    // Check the secret exists and app is allowed
    const allowed = await q(
      `SELECT osa.app_id
        FROM oauth_sessions os
        JOIN oauth_session_apps osa ON os.session_id = osa.session_id
        WHERE os.secret_code = :secret AND osa.app_id = :app_id`,
      { secret, app_id },
    );

    if (!allowed.length) {
      return rep
        .code(403)
        .send({ success: false, message: "App not allowed for this secret" });
    }

    // Get the allowed scopes from your database
    const scopes = await q(
      `SELECT scope_name FROM oauth_scopes WHERE app_id = :app_id`,
      { app_id },
    );

    const scopeList = scopes.map((s) => s.scope_name);

    const oauthLinkToken = generateClientSecret();

    await q(
      `INSERT INTO oauth_links (token, app_id, secret_code, scopes, created_at)
      VALUES (:token, :app_id, :secret, :scopes, NOW())`,
      {
        token: oauthLinkToken,
        app_id,
        secret,
        scopes: JSON.stringify(scopeList),
      },
    );

    return rep.send({
      success: true,
      oauth_link: `https://api.opencom.online/v1/oauth/login/user?token=${oauthLinkToken}`,
      scopes: scopeList,
    });
  });
}
