import argon2 from "argon2";
import crypto from "node:crypto";

export async function hashPassword(pw: string): Promise<string> {
  return argon2.hash(pw, { type: argon2.argon2id });
}

export async function verifyPassword(
  hash: string,
  pw: string,
): Promise<boolean> {
  return argon2.verify(hash, pw);
}

export function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}
