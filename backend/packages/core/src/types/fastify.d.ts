import "fastify";
import type { PresenceUpdate } from "@ods/shared/events.js";

declare module "fastify" {
  interface FastifyInstance {
    authenticate: any;
    authenticatePanelAdmin: any;
    pgPresenceUpsert: (userId: string, next: PresenceUpdate) => Promise<void>;
  }
  interface FastifyRequest {
    panelAdmin?: {
      id: string;
      email: string;
      username: string;
      role: "owner" | "admin" | "staff";
    };
  }
}
