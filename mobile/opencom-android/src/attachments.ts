import type { MessageAttachment } from "./types";

const MIME_BY_EXTENSION: Record<string, string> = {
  ".gif": "image/gif",
  ".heic": "image/heic",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".json": "application/json",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
  ".wav": "audio/wav",
  ".webm": "video/webm",
  ".webp": "image/webp",
  ".zip": "application/zip",
};

export function getAttachmentDisplayName(
  attachment: Pick<MessageAttachment, "fileName" | "filename"> | null | undefined,
): string {
  return (
    String(attachment?.fileName || attachment?.filename || "").trim() ||
    "attachment"
  );
}

export function sanitizeFileName(fileName: string): string {
  const cleaned = String(fileName || "attachment")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/[\u0000-\u001f]+/g, "")
    .trim()
    .slice(0, 220);
  return cleaned || "attachment";
}

export function guessMimeTypeFromFileName(
  fileName: string,
  fallback?: string | null,
): string {
  const fallbackValue = String(fallback || "").trim();
  if (fallbackValue) return fallbackValue;

  const extension = /\.[^.]+$/.exec(String(fileName || "").toLowerCase())?.[0];
  return MIME_BY_EXTENSION[extension || ""] || "application/octet-stream";
}

export function isImageAttachment(
  attachment: Pick<MessageAttachment, "mimeType" | "contentType" | "fileName" | "filename">,
): boolean {
  const type = String(
    attachment?.mimeType || attachment?.contentType || "",
  ).trim();
  if (type) return type.toLowerCase().startsWith("image/");

  const name = getAttachmentDisplayName(attachment).toLowerCase();
  return /\.(gif|heic|jpeg|jpg|png|svg|webp)$/.test(name);
}

export function formatBytes(size: number | null | undefined): string {
  const value = Number(size);
  if (!Number.isFinite(value) || value <= 0) return "";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function isFilePickerCancellation(error: unknown): boolean {
  const message = String(
    error instanceof Error ? error.message : error || "",
  ).toLowerCase();
  return message.includes("cancelled by the user") || message.includes("canceled by the user");
}
