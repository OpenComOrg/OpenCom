import { buildHttp } from "./http.js";
import { attachNodeGateway } from "./gateway.js";
import { guildRoutes } from "./routes/guilds.js";
import { channelRoutes } from "./routes/channels.js";
import { messageRoutes } from "./routes/messages.js";
import { env } from "./env.js";
import { initMediasoup } from "./voice/mediasoup.js";
import { attachmentRoutes } from "./routes/attachments.js";
import { startAttachmentCleanupLoop } from "./jobs/attachmentCleanup.js";
import { startNodeSyncLoop } from "./jobs/nodeSync.js";
import { roleRoutes } from "./routes/roles.js";
import { overwriteRoutes } from "./routes/overwrites.js";
import { memberRoutes } from "./routes/members.js";
import { registerRestAuth } from "./auth/restAuth.js";
import { guildJoinRoutes } from "./routes/guildJoin.js";
import { guildStateRoutes } from "./routes/guildState.js";
import { meRoutes } from "./routes/me.js";
import { discordCompatRoutes } from "./routes/discordCompat.js";


await initMediasoup();
// ...
const app = buildHttp();
await registerRestAuth(app);

const gw = attachNodeGateway(app);

// routes
await guildRoutes(app);
await guildJoinRoutes(app);
await guildStateRoutes(app);

await channelRoutes(app, gw.broadcastGuild);
await messageRoutes(app, gw.broadcastToChannel, gw.broadcastMention);

await roleRoutes(app, gw.broadcastGuild);
await overwriteRoutes(app, gw.broadcastGuild);
await memberRoutes(app, gw.broadcastGuild);
await meRoutes(app)
await discordCompatRoutes(app);

await attachmentRoutes(app);
startAttachmentCleanupLoop();
startNodeSyncLoop();


app.listen({ port: env.NODE_PORT, host: env.NODE_HOST });
