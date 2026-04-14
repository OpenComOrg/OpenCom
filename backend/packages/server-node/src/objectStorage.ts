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

const remoteStorageEnabled =
  env.STORAGE_PROVIDER === "s3"
  || env.STORAGE_PROVIDER === "gcs"
  || env.STORAGE_PROVIDER === "cdn";
const bucketName = env.NODE_STORAGE_BUCKET || env.NODE_S3_BUCKET || null;
const objectKeyPrefix = normalizePrefix(env.S3_KEY_PREFIX || "");
const cdnBaseUrl = normalizeBaseUrl(env.CDN_BASE_URL);

const s3Client = env.STORAGE_PROVIDER === "s3"
  ? new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials: env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
        ? {
            accessKeyId: env.S3_ACCESS_KEY_ID,
            secretAccessKey: env.S3_SECRET_ACCESS_KEY,
          }
        : undefined,
    })
  : null;

const gcsClient = env.STORAGE_PROVIDER === "gcs"
  ? new Storage({
      projectId: env.GCS_PROJECT_ID,
    })
  : null;

export function isS3StorageEnabled() {
  return remoteStorageEnabled;
}

export async function uploadFileToObjectStorage(
  namespace: string,
  objectKey: string,
  absoluteFilePath: string,
  contentType?: string,
) {
  const key = resolveObjectKey(namespace, objectKey);
  if (env.STORAGE_PROVIDER === "cdn") {
    if (!bucketName) return;
    const blob = await fs.openAsBlob(absoluteFilePath, {
      type: contentType || "application/octet-stream",
    });
    await uploadToCdn(bucketName, key, blob, path.basename(objectKey) || "upload");
    return;
  }

  if (env.STORAGE_PROVIDER === "gcs") {
    if (!gcsClient || !bucketName) return;
    await gcsClient.bucket(bucketName).upload(absoluteFilePath, {
      destination: key,
      metadata: contentType ? { contentType } : undefined,
    });
    return;
  }

  if (!s3Client || !bucketName) return;
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: fs.createReadStream(absoluteFilePath),
      ContentType: contentType,
    }),
  );
}

export async function getObjectStreamFromStorage(
  namespace: string,
  objectKey: string,
): Promise<Readable | null> {
  const key = resolveObjectKey(namespace, objectKey);
  if (env.STORAGE_PROVIDER === "cdn") {
    if (!bucketName) return null;
    return getObjectStreamFromCdn(bucketName, key);
  }

  if (env.STORAGE_PROVIDER === "gcs") {
    if (!gcsClient || !bucketName) return null;
    const file = gcsClient.bucket(bucketName).file(key);
    const [exists] = await file.exists();
    if (!exists) return null;
    return file.createReadStream();
  }

  if (!s3Client || !bucketName) return null;
  try {
    const result = await s3Client.send(
      new GetObjectCommand({
        Bucket: bucketName,
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
    if (!bucketName) return;
    await deleteObjectFromCdn(bucketName, key);
    return;
  }

  if (env.STORAGE_PROVIDER === "gcs") {
    if (!gcsClient || !bucketName) return;
    try {
      await gcsClient.bucket(bucketName).file(key).delete();
    } catch (error) {
      if (!isGcsNotFound(error)) throw error;
    }
    return;
  }

  if (!s3Client || !bucketName) return;
  try {
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: bucketName,
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
