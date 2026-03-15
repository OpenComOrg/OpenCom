import fs from "node:fs";
import path from "node:path";
import { ensureDir, randomId } from "./storage.js";

export const DEFAULT_UPLOAD_CHUNK_BYTES = 5 * 1024 * 1024;

const SESSION_DIR = "_upload_sessions";
const SESSION_TTL_MS = 6 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

let lastCleanupAt = 0;

export type UploadSessionContext = Record<string, string | number | boolean | null>;

export type UploadSession = {
  uploadId: string;
  attachmentId: string;
  fileName: string;
  contentType: string;
  expectedSizeBytes: number;
  uploadedBytes: number;
  maxBytes: number;
  chunkSizeBytes: number;
  tempObjectKey: string;
  finalObjectKey: string;
  createdAt: string;
  expiresAt: string;
  context: UploadSessionContext;
};

type CreateUploadSessionInput = {
  rootDir: string;
  attachmentId: string;
  fileName: string;
  contentType: string;
  expectedSizeBytes: number;
  maxBytes: number;
  finalObjectKey: string;
  context?: UploadSessionContext;
  chunkSizeBytes?: number;
};

export function createUploadSession(input: CreateUploadSessionInput): UploadSession {
  cleanupExpiredUploadSessions(input.rootDir);

  const uploadId = randomId(18);
  const sessionDir = ensureSessionDir(input.rootDir);
  const tempObjectKey = path.join(SESSION_DIR, `${uploadId}.part`);
  const session: UploadSession = {
    uploadId,
    attachmentId: input.attachmentId,
    fileName: input.fileName,
    contentType: input.contentType,
    expectedSizeBytes: input.expectedSizeBytes,
    uploadedBytes: 0,
    maxBytes: input.maxBytes,
    chunkSizeBytes: normalizeChunkSize(input.chunkSizeBytes),
    tempObjectKey,
    finalObjectKey: input.finalObjectKey,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    context: input.context || {}
  };

  fs.writeFileSync(resolveStoragePath(input.rootDir, tempObjectKey), "");
  fs.writeFileSync(sessionMetaPath(sessionDir, uploadId), JSON.stringify(session), "utf8");
  return session;
}

export function getUploadSession(rootDir: string, uploadId: string): UploadSession | null {
  cleanupExpiredUploadSessions(rootDir);

  const metaPath = sessionMetaPath(ensureSessionDir(rootDir), uploadId);
  if (!fs.existsSync(metaPath)) return null;

  try {
    const raw = fs.readFileSync(metaPath, "utf8");
    const session = JSON.parse(raw) as UploadSession;
    if (!session?.uploadId || session.uploadId !== uploadId) return null;
    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      destroyUploadSession(rootDir, uploadId);
      return null;
    }
    session.uploadedBytes = getUploadSize(rootDir, session.tempObjectKey);
    return session;
  } catch {
    destroyUploadSession(rootDir, uploadId);
    return null;
  }
}

export async function appendUploadChunk(
  rootDir: string,
  uploadId: string,
  readable: NodeJS.ReadableStream,
  offset: number
) {
  const session = getUploadSession(rootDir, uploadId);
  if (!session) return { error: "NOT_FOUND" as const };

  const currentSize = getUploadSize(rootDir, session.tempObjectKey);
  if (currentSize !== offset) {
    return {
      error: "OFFSET_MISMATCH" as const,
      uploadedBytes: currentSize,
      expectedSizeBytes: session.expectedSizeBytes
    };
  }

  const writtenBytes = await streamChunkToFile(
    resolveStoragePath(rootDir, session.tempObjectKey),
    readable,
    currentSize,
    session.expectedSizeBytes,
    session.maxBytes,
    session.chunkSizeBytes
  );

  session.uploadedBytes = currentSize + writtenBytes;
  persistUploadSession(rootDir, session);

  return {
    error: null,
    session,
    uploadedBytes: session.uploadedBytes,
    expectedSizeBytes: session.expectedSizeBytes,
    complete: session.uploadedBytes === session.expectedSizeBytes
  };
}

export function finalizeUploadSession(rootDir: string, uploadId: string): UploadSession | null {
  const session = getUploadSession(rootDir, uploadId);
  if (!session) return null;

  const tempPath = resolveStoragePath(rootDir, session.tempObjectKey);
  const finalPath = resolveStoragePath(rootDir, session.finalObjectKey);
  const uploadedBytes = getUploadSize(rootDir, session.tempObjectKey);
  if (uploadedBytes !== session.expectedSizeBytes) {
    throw new Error("INCOMPLETE_UPLOAD");
  }

  ensureDir(path.dirname(finalPath));
  fs.renameSync(tempPath, finalPath);
  unlinkIfExists(sessionMetaPath(ensureSessionDir(rootDir), uploadId));
  return {
    ...session,
    uploadedBytes
  };
}

export function destroyUploadSession(rootDir: string, uploadId: string) {
  const sessionDir = ensureSessionDir(rootDir);
  const metaPath = sessionMetaPath(sessionDir, uploadId);
  const tempPath = resolveStoragePath(rootDir, path.join(SESSION_DIR, `${uploadId}.part`));

  unlinkIfExists(metaPath);
  unlinkIfExists(tempPath);
}

function ensureSessionDir(rootDir: string) {
  ensureDir(rootDir);
  const sessionDir = resolveStoragePath(rootDir, SESSION_DIR);
  ensureDir(sessionDir);
  return sessionDir;
}

function sessionMetaPath(sessionDir: string, uploadId: string) {
  return path.join(sessionDir, `${uploadId}.json`);
}

function getUploadSize(rootDir: string, tempObjectKey: string) {
  try {
    return Number(fs.statSync(resolveStoragePath(rootDir, tempObjectKey)).size || 0);
  } catch {
    return 0;
  }
}

function persistUploadSession(rootDir: string, session: UploadSession) {
  const sessionDir = ensureSessionDir(rootDir);
  const nextSession: UploadSession = {
    ...session,
    uploadedBytes: getUploadSize(rootDir, session.tempObjectKey)
  };
  fs.writeFileSync(
    sessionMetaPath(sessionDir, session.uploadId),
    JSON.stringify(nextSession),
    "utf8"
  );
}

function normalizeChunkSize(chunkSizeBytes?: number) {
  const requested = Number(chunkSizeBytes || DEFAULT_UPLOAD_CHUNK_BYTES);
  if (!Number.isFinite(requested) || requested <= 0) return DEFAULT_UPLOAD_CHUNK_BYTES;
  return Math.min(Math.floor(requested), DEFAULT_UPLOAD_CHUNK_BYTES);
}

function cleanupExpiredUploadSessions(rootDir: string) {
  const now = Date.now();
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
  lastCleanupAt = now;

  const sessionDir = ensureSessionDir(rootDir);
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(sessionDir);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    const metaPath = path.join(sessionDir, entry);
    try {
      const raw = fs.readFileSync(metaPath, "utf8");
      const session = JSON.parse(raw) as UploadSession;
      if (new Date(session.expiresAt).getTime() > now) continue;
      destroyUploadSession(rootDir, session.uploadId);
    } catch {
      unlinkIfExists(metaPath);
    }
  }
}

function unlinkIfExists(filePath: string) {
  try {
    fs.unlinkSync(filePath);
  } catch {}
}

function streamChunkToFile(
  filePath: string,
  readable: NodeJS.ReadableStream,
  offset: number,
  expectedSizeBytes: number,
  maxBytes: number,
  maxChunkBytes: number
): Promise<number> {
  return new Promise((resolve, reject) => {
    let written = 0;
    const out = fs.createWriteStream(filePath, { flags: "a" });

    readable.on("data", (chunk: Buffer) => {
      written += chunk.length;
      const nextTotal = offset + written;
      if (written > maxChunkBytes) {
        destroyReadable(readable, new Error("CHUNK_TOO_LARGE"));
        return;
      }
      if (nextTotal > maxBytes || nextTotal > expectedSizeBytes) {
        destroyReadable(readable, new Error("TOO_LARGE"));
      }
    });

    readable.on("error", (error) => {
      out.destroy();
      reject(error);
    });
    out.on("error", reject);
    out.on("finish", () => resolve(written));

    readable.pipe(out);
  });
}

function destroyReadable(readable: NodeJS.ReadableStream, error: Error) {
  const target = readable as { destroy?: (err?: Error) => void };
  if (typeof target.destroy === "function") {
    target.destroy(error);
  }
}

function resolveStoragePath(rootDir: string, relPath: string) {
  const root = path.resolve(rootDir);
  const absPath = path.resolve(root, relPath);
  if (!absPath.startsWith(root + path.sep) && absPath !== root) {
    throw new Error("INVALID_PATH");
  }
  return absPath;
}
