import { buildHttp } from "./http.js";
import { authRoutes } from "./routes/auth.js";
import { deviceRoutes } from "./routes/devices.js";
import { dmRoutes } from "./routes/dms.js";
import { socialRoutes } from "./routes/social.js";
import { serverRoutes } from "./routes/servers.js";
import { jwksRoutes } from "./routes/jwks.js";
import { profileRoutes } from "./routes/profile.js";
import { inviteRoutes } from "./routes/invites.js";
import { adminRoutes } from "./routes/admin.js";
import { attachCoreGateway } from "./routes/gateway.js";
import { env } from "./env.js";
import { makeRedis } from "./redis.js";
import { presenceUpsert } from "./presence.js";

const app = buildHttp();

// attach helper to app
(app as any).pgPresenceUpsert = presenceUpsert;

// Redis (optional but recommended)
const redis = env.REDIS_URL ? await makeRedis(env.REDIS_URL) : null;
if (redis) await redis.start();

const gw = attachCoreGateway(app, redis ?? undefined);

await authRoutes(app);
await deviceRoutes(app);
await serverRoutes(app);
await jwksRoutes(app);
await profileRoutes(app);
await inviteRoutes(app);
await adminRoutes(app);
await dmRoutes(app, gw.broadcastDM);
await socialRoutes(app);

app.listen({ port: env.CORE_PORT, host: "0.0.0.0" });
