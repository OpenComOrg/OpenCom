import { FastifyInstance } from "fastify";
import { verifyMembershipToken } from "./verifyMembership.js";
import { env } from "../env.js";

export async function registerRestAuth(app: FastifyInstance) {
  app.decorateRequest("auth", null);

  app.decorate("authenticate", async (req: any, rep: any) => {
    const h = req.headers["authorization"];
    const token = typeof h === "string" && h.startsWith("Bearer ") ? h.slice(7) : null;
    if (!token) return rep.code(401).send({ error: "UNAUTHORIZED" });

    try {
      const claims = await verifyMembershipToken(token);

      // Critical: bind token to THIS node
      if (claims.server_id !== env.NODE_SERVER_ID) {
        return rep.code(401).send({ error: "UNAUTHORIZED" });
      }

      const roles = Array.isArray((claims as any).roles) ? (claims as any).roles : [];
      const isPlatformStaff = roles.includes("platform_admin") || roles.includes("platform_owner");

      req.auth = {
        userId: claims.sub,
        serverId: claims.server_id,
        coreServerId: claims.core_server_id || claims.server_id,
        roles,
        isPlatformStaff,
        token
      };
    } catch {
      return rep.code(401).send({ error: "UNAUTHORIZED" });
    }
  });
}
