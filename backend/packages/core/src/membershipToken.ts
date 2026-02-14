import { SignJWT, importJWK } from "jose";
import { env } from "./env.js";

export type PlatformRole = "user" | "admin" | "owner";

export async function signMembershipToken(
  nodeServerId: string,
  userId: string,
  roles: string[],
  platformRole: PlatformRole,
  coreServerId?: string
): Promise<string> {
  const privateJwk = JSON.parse(env.CORE_MEMBERSHIP_PRIVATE_JWK);
  const priv = await importJWK(privateJwk, "RS256");

  return new SignJWT({
    server_id: nodeServerId,
    core_server_id: coreServerId ?? nodeServerId,
    roles,
    platform_role: platformRole
  })
    .setProtectedHeader({ alg: "RS256", kid: privateJwk.kid })
    .setIssuer(env.CORE_ISSUER)
    .setAudience(nodeServerId)
    .setSubject(userId)
    .setExpirationTime("10m")
    .sign(priv);
}
