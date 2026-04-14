import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { Storage } from "@google-cloud/storage";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { env } from "./env.js";

const objectKeyPrefix = normalizePrefix(env.S3_KEY_PREFIX || "");
const cdnBaseUrl = normalizeBaseUrl(env.CDN_BASE_URL);
let s3Client: S3Client | null | undefined;
let gcsClient: Storage | null | undefined;

export function isObjectStorageEnabled() {
  return env.STORAGE_PROVIDER === "s3"
    || env.STORAGE_PROVIDER === "gcs"
    || env.STORAGE_PROVIDER === "cdn";
}

// Kept for compatibility with existing call sites.
export function isS3StorageEnabled() {
  return isObjectStorageEnabled();
}

export async function uploadFileToObjectStorage(
  namespace: string,
  objectKey: string,
  absoluteFilePath: string,
  contentType?: string,
) {
  if (!isObjectStorageEnabled()) return;

  const key = resolveObjectKey(namespace, objectKey);
  const bucket = resolveBucketName();
  const baseMeta = {
    provider: env.STORAGE_PROVIDER,
    bucket,
    key,
    absoluteFilePath,
    contentType: contentType || null,
  };
  let sizeBytes = 0;

  try {
    const stat = await fs.promises.stat(absoluteFilePath);
    sizeBytes = stat.size;
  } catch (error) {
    console.error("[core:storage] put_object:failed", { ...baseMeta, error });
    throw error;
  }

  const meta = { ...baseMeta, sizeBytes };
  console.info("[core:storage] put_object:start", meta);

  try {
    if (env.STORAGE_PROVIDER === "cdn") {
      if (!bucket) return;
      const blob = await fs.openAsBlob(absoluteFilePath, {
        type: contentType || "application/octet-stream",
      });
      await uploadToCdn(bucket, key, blob, path.basename(objectKey) || "upload");
    } else if (env.STORAGE_PROVIDER === "gcs") {
      const gcsBucket = getGcsBucket();
      if (!gcsBucket) return;
      await gcsBucket.upload(absoluteFilePath, {
        destination: key,
        metadata: contentType ? { contentType } : undefined,
      });
    } else {
      const client = getS3Client();
      if (!client || !bucket) return;
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: fs.createReadStream(absoluteFilePath),
          ContentType: contentType,
        }),
      );
    }
    console.info("[core:storage] put_object:success", meta);
  } catch (error) {
    console.error("[core:storage] put_object:failed", { ...meta, error });
    throw error;
  }
}

export async function uploadBufferToObjectStorage(
  namespace: string,
  objectKey: string,
  body: Buffer,
  contentType?: string,
) {
  if (!isObjectStorageEnabled()) return;

  const key = resolveObjectKey(namespace, objectKey);
  const bucket = resolveBucketName();
  const meta = {
    provider: env.STORAGE_PROVIDER,
    bucket,
    key,
    contentType: contentType || null,
    sizeBytes: body.length,
  };

  console.info("[core:storage] put_object:start", meta);
  try {
    if (env.STORAGE_PROVIDER === "cdn") {
      if (!bucket) return;
      const blob = new Blob([body], { type: contentType || "application/octet-stream" });
      await uploadToCdn(bucket, key, blob, path.basename(objectKey) || "upload");
    } else if (env.STORAGE_PROVIDER === "gcs") {
      const gcsBucket = getGcsBucket();
      if (!gcsBucket) return;
      await gcsBucket.file(key).save(body, {
        resumable: false,
        contentType,
      });
    } else {
      const client = getS3Client();
      if (!client || !bucket) return;
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
    }
    console.info("[core:storage] put_object:success", meta);
  } catch (error) {
    console.error("[core:storage] put_object:failed", { ...meta, error });
    throw error;
  }
}

export async function getObjectStreamFromStorage(
  namespace: string,
  objectKey: string,
): Promise<Readable | null> {
  const key = resolveObjectKey(namespace, objectKey);

  if (env.STORAGE_PROVIDER === "cdn") {
    const bucket = resolveBucketName();
    if (!bucket) return null;
    return getObjectStreamFromCdn(bucket, key);
  }

  if (env.STORAGE_PROVIDER === "gcs") {
    const gcsBucket = getGcsBucket();
    if (!gcsBucket) return null;
    const file = gcsBucket.file(key);
    const [exists] = await file.exists();
    if (!exists) return null;
    return file.createReadStream();
  }

  const client = getS3Client();
  const bucket = resolveBucketName();
  if (!client || !bucket) return null;
  try {
    const result = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );
    return toReadable(result.Body);
  } catch (error) {
    if (isS3NotFound(error)) return null;
    throw error;
  }
}

export async function deleteObjectFromStorage(namespace: string, objectKey: string) {
  const key = resolveObjectKey(namespace, objectKey);

  if (env.STORAGE_PROVIDER === "cdn") {
    const bucket = resolveBucketName();
    if (!bucket) return;
    await deleteObjectFromCdn(bucket, key);
    return;
  }

  if (env.STORAGE_PROVIDER === "gcs") {
    const gcsBucket = getGcsBucket();
    if (!gcsBucket) return;
    try {
      await gcsBucket.file(key).delete();
    } catch (error) {
      if (!isGcsNotFound(error)) throw error;
    }
    return;
  }

  const client = getS3Client();
  const bucket = resolveBucketName();
  if (!client || !bucket) return;
  try {
    await client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );
  } catch (error) {
    if (!isS3NotFound(error)) throw error;
  }
}

function resolveObjectKey(namespace: string, objectKey: string) {
  const cleanNamespace = normalizePrefix(namespace);
  const cleanObjectKey = String(objectKey || "").replace(/^\/+/, "");
  return [objectKeyPrefix, cleanNamespace, cleanObjectKey].filter(Boolean).join("/");
}

function normalizePrefix(value: string) {
  return String(value || "").trim().replace(/^\/+/, "").replace(/\/+$/, "");
}

function normalizeBaseUrl(value: string) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function resolveBucketName() {
  return env.CORE_STORAGE_BUCKET || env.CORE_S3_BUCKET || null;
}

function getS3Client() {
  if (env.STORAGE_PROVIDER !== "s3") return null;
  if (s3Client !== undefined) return s3Client;

  s3Client = new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
      ? {
          accessKeyId: env.S3_ACCESS_KEY_ID,
          secretAccessKey: env.S3_SECRET_ACCESS_KEY,
        }
      : undefined,
  });
  return s3Client;
}

function getGcsClient() {
  if (env.STORAGE_PROVIDER !== "gcs") return null;
  if (gcsClient !== undefined) return gcsClient;
  gcsClient = new Storage({
    projectId: env.GCS_PROJECT_ID,
  });
  return gcsClient;
}

function getGcsBucket() {
  const client = getGcsClient();
  const bucket = resolveBucketName();
  if (!client || !bucket) return null;
  return client.bucket(bucket);
}

async function uploadToCdn(bucket: string, objectKey: string, body: Blob, filename: string) {
  const form = new FormData();
  form.append("bucket", bucket);
  form.append("path", objectKey);
  form.append("file", body, filename);

  const response = await fetch(`${cdnBaseUrl}/v1/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.CDN_SHARED_TOKEN}`,
    },
    body: form,
  });

  if (!response.ok) {
    throw new Error(`CDN_UPLOAD_FAILED:${response.status}`);
  }
}

async function getObjectStreamFromCdn(bucket: string, objectKey: string): Promise<Readable | null> {
  const response = await fetch(buildCdnFileUrl(bucket, objectKey));
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`CDN_READ_FAILED:${response.status}`);
  }
  if (!response.body) return null;
  return Readable.fromWeb(response.body as ReadableStream);
}

async function deleteObjectFromCdn(bucket: string, objectKey: string) {
  const response = await fetch(buildCdnFileUrl(bucket, objectKey), {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${env.CDN_SHARED_TOKEN}`,
    },
  });
  if (response.status === 404) return;
  if (!response.ok) {
    throw new Error(`CDN_DELETE_FAILED:${response.status}`);
  }
}

function buildCdnFileUrl(bucket: string, objectKey: string) {
  return `${cdnBaseUrl}/v1/files/${encodeURIComponent(bucket)}/${encodeObjectPath(objectKey)}`;
}

function encodeObjectPath(value: string) {
  return String(value || "")
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function toReadable(value: unknown): Readable | null {
  if (!value) return null;
  if (value instanceof Readable) return value;
  const candidate = value as {
    pipe?: unknown;
    transformToWebStream?: () => unknown;
    [Symbol.asyncIterator]?: () => AsyncIterator<Uint8Array>;
  };
  if (typeof candidate.pipe === "function") return candidate as unknown as Readable;
  if (typeof candidate.transformToWebStream === "function") {
    return Readable.fromWeb(candidate.transformToWebStream() as any);
  }
  if (typeof candidate[Symbol.asyncIterator] === "function") {
    return Readable.from(candidate as AsyncIterable<Uint8Array>);
  }
  return null;
}

function isS3NotFound(error: unknown) {
  const err = error as { name?: string; $metadata?: { httpStatusCode?: number } } | null;
  return err?.name === "NoSuchKey" || err?.$metadata?.httpStatusCode === 404;
}

function isGcsNotFound(error: unknown) {
  const err = error as { code?: number } | null;
  return err?.code === 404;
}
