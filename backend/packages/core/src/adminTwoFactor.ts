import crypto from "node:crypto";
import { sha256Hex } from "./crypto.js";
import { env } from "./env.js";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const TOTP_DIGITS = 6;
const TOTP_STEP_SECONDS = 30;
const TOTP_ALLOWED_DRIFT_STEPS = 1;

const ENCRYPTION_KEY = crypto
  .createHash("sha256")
  .update(env.ADMIN_2FA_ENCRYPTION_KEY || env.CORE_JWT_ACCESS_SECRET)
  .digest();

function normalizeBase32(value: string) {
  return String(value || "")
    .toUpperCase()
    .replace(/=+$/g, "")
    .replace(/\s+/g, "");
}

function encodeBase32(buffer: Buffer) {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

function decodeBase32(value: string) {
  const normalized = normalizeBase32(value);
  if (!normalized) throw new Error("INVALID_TOTP_SECRET");

  let bits = 0;
  let current = 0;
  const bytes: number[] = [];

  for (const ch of normalized) {
    const index = BASE32_ALPHABET.indexOf(ch);
    if (index < 0) throw new Error("INVALID_TOTP_SECRET");

    current = (current << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((current >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

function formatTotpCounter(counter: number) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  return buf;
}

function generateHotp(secret: Buffer, counter: number, digits = TOTP_DIGITS) {
  const hmac = crypto
    .createHmac("sha1", secret)
    .update(formatTotpCounter(counter))
    .digest();

  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const modulo = 10 ** digits;
  return String(binary % modulo).padStart(digits, "0");
}

function normalizeTotpCandidate(value: string) {
  const normalized = String(value || "").trim();
  return /^\d{6}$/.test(normalized) ? normalized : "";
}

export function generateTotpSecret(byteLength = 20) {
  const length = Number.isFinite(byteLength) ? Math.max(10, Math.floor(byteLength)) : 20;
  return encodeBase32(crypto.randomBytes(length));
}

export function buildOtpAuthUri({
  secret,
  accountName,
  issuer = env.ADMIN_2FA_ISSUER,
}: {
  secret: string;
  accountName: string;
  issuer?: string;
}) {
  const normalizedSecret = normalizeBase32(secret);
  const normalizedAccountName = String(accountName || "admin").trim() || "admin";
  const normalizedIssuer = String(issuer || "OpenCom Admin").trim() || "OpenCom Admin";
  const label = encodeURIComponent(`${normalizedIssuer}:${normalizedAccountName}`);

  const query = new URLSearchParams({
    secret: normalizedSecret,
    issuer: normalizedIssuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });

  return `otpauth://totp/${label}?${query.toString()}`;
}

export function generateTotpToken(secret: string, timestampMs = Date.now()) {
  const secretBuffer = decodeBase32(secret);
  const counter = Math.floor(Math.max(0, timestampMs) / 1000 / TOTP_STEP_SECONDS);
  return generateHotp(secretBuffer, counter, TOTP_DIGITS);
}

export function verifyTotpToken(secret: string, candidate: string, timestampMs = Date.now()) {
  const normalizedCandidate = normalizeTotpCandidate(candidate);
  if (!normalizedCandidate) return false;

  const secretBuffer = decodeBase32(secret);
  const baseCounter = Math.floor(Math.max(0, timestampMs) / 1000 / TOTP_STEP_SECONDS);

  for (let drift = -TOTP_ALLOWED_DRIFT_STEPS; drift <= TOTP_ALLOWED_DRIFT_STEPS; drift += 1) {
    const counter = baseCounter + drift;
    if (counter < 0) continue;
    const token = generateHotp(secretBuffer, counter, TOTP_DIGITS);
    if (token === normalizedCandidate) return true;
  }

  return false;
}

export function normalizeRecoveryCode(value: string) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function hashRecoveryCode(value: string) {
  return sha256Hex(normalizeRecoveryCode(value));
}

function generateSingleRecoveryCode() {
  const raw = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

export function generateRecoveryCodes(count = 10) {
  const targetCount = Number.isFinite(count) ? Math.max(4, Math.floor(count)) : 10;
  const output: string[] = [];
  const seen = new Set<string>();

  while (output.length < targetCount) {
    const code = generateSingleRecoveryCode();
    const normalized = normalizeRecoveryCode(code);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(code);
  }

  return output;
}

export function encryptTotpSecret(secret: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

export function decryptTotpSecret(payload: string) {
  const [ivRaw, tagRaw, ciphertextRaw] = String(payload || "").split(".");
  if (!ivRaw || !tagRaw || !ciphertextRaw) throw new Error("INVALID_ENCRYPTED_2FA_SECRET");

  const iv = Buffer.from(ivRaw, "base64");
  const tag = Buffer.from(tagRaw, "base64");
  const ciphertext = Buffer.from(ciphertextRaw, "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const secret = decrypted.toString("utf8").trim();
  if (!secret) throw new Error("INVALID_ENCRYPTED_2FA_SECRET");
  return secret;
}
