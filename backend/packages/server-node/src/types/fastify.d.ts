import "fastify";

declare module "fastify" {
  interface FastifyInstance {
    authenticate: any;
  }
  interface FastifyRequest {
    auth: {
      userId: string;
      serverId: string;
      coreServerId: string;
      roles: string[];
      isPlatformStaff: boolean;
      token: string;
    } | null;
  }
}
