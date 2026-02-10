import "fastify";

declare module "fastify" {
  interface FastifyInstance {
    authenticate: any;
  }
  interface FastifyRequest {
    auth: {
      userId: string;
      serverId: string;
      roles: string[];
      isPlatformStaff: boolean;
      token: string;
    } | null;
  }
}
