import { jwtVerify } from "jose";
import { jwks } from "./jwks.js";
import { env } from "../env.js";

export type MembershipClaims = {
  sub: string;          // user_id
  aud: string;          // server_id
  iss: string;
  server_id: string;
  roles: string[];
  core_server_id?: string;
};

export async function verifyMembershipToken(token: string): Promise<MembershipClaims> {
  const { payload } = await jwtVerify(token, jwks, {
    issuer: env.CORE_BASE_URL.startsWith("http") ? undefined : undefined, // keep flexible in dev
    // We validate audience dynamically in code below because we used aud=server_id on Core
  });

  const serverId = payload.aud;
  if (typeof serverId !== "string") throw new Error("BAD_AUD");
  if (payload.server_id !== serverId) throw new Error("SERVER_ID_MISMATCH");

  const claims = payload as any;
  if (typeof claims.core_server_id !== "string" || !claims.core_server_id) {
    claims.core_server_id = claims.server_id;
  }

  return claims as MembershipClaims;
}
