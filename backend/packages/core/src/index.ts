import { buildHttp } from "./http.js";
import { authRoutes } from "./routes/auth.js";
import { panelAuthRoutes } from "./routes/panelAuth.js";
import { deviceRoutes } from "./routes/devices.js";
import { dmRoutes } from "./routes/dms.js";
import { socialRoutes } from "./routes/social.js";
import { serverRoutes } from "./routes/servers.js";
import { jwksRoutes } from "./routes/jwks.js";
import { profileRoutes } from "./routes/profile.js";
import { inviteRoutes } from "./routes/invites.js";
import { presenceRoutes } from "./routes/presence.js";
import { adminRoutes } from "./routes/admin.js";
import { attachCoreGateway } from "./routes/gateway.js";
import { nodeSyncRoutes } from "./routes/nodeSync.js";
import { extensionRoutes } from "./routes/extensions.js";
import { billingRoutes } from "./routes/billing.js";
import { downloadRoutes } from "./routes/downloads.js";
import { linkPreviewRoutes } from "./routes/linkPreview.js";
import { pushRoutes } from "./routes/push.js";
import { themeRoutes } from "./routes/themes.js";
import { blogRoutes } from "./routes/blogs.js";
import { FavouriteGifRoutes } from "./routes/FavouriteGifs.js";
import { klipyRoutes } from "./routes/klipy.js";
import { emoteRoutes } from "./routes/emotes.js";
import { supportRoutes } from "./routes/support.js";
import { coreEnvFilePath, env } from "./env.js";
import { makeRedis } from "./redis.js";
import { presenceUpsert } from "./presence.js";
import { CallRoutes } from "./routes/PrivateCalls.js";
import { PresenceUpdate } from "@ods/shared/events.js";
import { pool } from "./db.js";
import { resolveSmtpConfig } from "./smtp.js";

const app = buildHttp();
let redis: Awaited<ReturnType<typeof makeRedis>> | null = null;
let isShuttingDown = false;

async function shutdown(reason: string, requestedExitCode = 0) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  let exitCode = requestedExitCode;
  app.log.info({ reason }, "Shutting down core server");

  try {
    await app.close();
  } catch (error) {
    exitCode = 1;
    app.log.error({ err: error }, "Failed to close Fastify server");
  }

  try {
    await pool.end();
  } catch (error) {
    exitCode = 1;
    app.log.error({ err: error }, "Failed to close MySQL pool");
  }

  if (redis) {
    try {
      await redis.stop();
    } catch (error) {
      exitCode = 1;
      app.log.error({ err: error }, "Failed to close Redis clients");
    }
  }

  process.exit(exitCode);
}

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

async function start() {
  console.info("[core:storage] configuration", {
    envFile: coreEnvFilePath,
    provider: env.STORAGE_PROVIDER,
    bucket: env.CORE_S3_BUCKET ?? null,
    region: env.S3_REGION ?? null,
  });
  try {
    const smtp = resolveSmtpConfig();
    console.info("[core:smtp] configuration", {
      envFile: coreEnvFilePath,
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      from: smtp.from,
      debugLogging: ["1", "true", "yes", "on"].includes(String(process.env.SMTP_DEBUG_LOGGING || "").trim().toLowerCase()),
      debugVerifyBeforeSend: ["1", "true", "yes", "on"].includes(String(process.env.SMTP_DEBUG_VERIFY_BEFORE_SEND || "").trim().toLowerCase())
    });
  } catch (error) {
    console.warn("[core:smtp] not configured", {
      envFile: coreEnvFilePath,
      error: String((error as Error)?.message || error)
    });
  }

  const missingPrivateCallConfig = [
    ["OFFICIAL_NODE_BASE_URL", env.OFFICIAL_NODE_BASE_URL],
    ["OFFICIAL_NODE_SERVER_ID", env.OFFICIAL_NODE_SERVER_ID],
    ["PRIVATE_CALLS_GUILD_ID", env.PRIVATE_CALLS_GUILD_ID],
    ["CORE_NODE_SYNC_SECRET", env.CORE_NODE_SYNC_SECRET],
  ].filter(([, value]) => !value).map(([key]) => key);

  if (missingPrivateCallConfig.length) {
    app.log.warn(
      {
        missing: missingPrivateCallConfig,
        setupScript: "node scripts/create-private-calls-guild.mjs",
      },
      "Private-call voice provisioning is disabled until the official-node configuration is completed",
    );
  }

  // attach helper to app
  (app as any).pgPresenceUpsert = presenceUpsert;

  // Redis is required for cross-instance gateway fanout and presence signaling.
  redis = await makeRedis(env.REDIS_URL);
  await redis.start();

  const gw = attachCoreGateway(app, redis);

  await authRoutes(app);
  await panelAuthRoutes(app);
  await deviceRoutes(app);
  await serverRoutes(app);
  await jwksRoutes(app);
  await profileRoutes(app);
  await inviteRoutes(app);
  await presenceRoutes(app, async (userId: string, presence: PresenceUpdate) => {
    await redis!.pub.publish(
      "core:presence",
      JSON.stringify({ userId, presence }),
    );
  });
  await adminRoutes(app, gw.broadcastToUser);
  await supportRoutes(app);
  await blogRoutes(app);
  await dmRoutes(app, gw.broadcastDM);
  await socialRoutes(app, gw.broadcastCallSignal, gw.broadcastToUser);
  await nodeSyncRoutes(app);
  await extensionRoutes(app);
  await billingRoutes(app);
  await linkPreviewRoutes(app);
  await downloadRoutes(app);
  await pushRoutes(app);
  await themeRoutes(app);
  await emoteRoutes(app);
  await klipyRoutes(app);
  await CallRoutes(app, gw.broadcastToUser);
  await FavouriteGifRoutes(app);

  await app.listen({ port: env.CORE_PORT, host: env.CORE_HOST });
}

start().catch((error) => {
  app.log.error({ err: error }, "Core server failed to start");
  void shutdown("STARTUP_FAILURE", 1);
});
