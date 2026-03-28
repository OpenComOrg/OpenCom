import { FastifyInstance } from "fastify";
import { z } from "zod";
import fs from "node:fs";
import crypto from "node:crypto";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { ulidLike } from "@ods/shared/ids.js";
import { q } from "../db.js";
import { hashPassword } from "../crypto.js";
import { parseBody } from "../validation.js";
import { getActiveManualBoostGrant, getBoostTrialWindow, reconcileBoostBadge } from "../boost.js";
import { env } from "../env.js";
import { buildOfficialBadgeDetail, getOfficialAccount, isOfficialAccountName, isOfficialBadgeId } from "../officialAccount.js";
import {
  OFFICIAL_MESSAGE_MAX_LENGTH,
  getNewUserOfficialMessageConfig,
  saveNewUserOfficialMessageConfig,
  sendOfficialMessageToUser,
} from "../officialMessages.js";
import {
  PLATFORM_PANEL_PERMISSIONS,
  type PlatformPanelPermission,
  getPanelStaffAssignment,
  listPanelStaffAssignments,
  normalizePlatformPermissions,
  requirePanelAccess,
  requirePanelPermission,
  serializePlatformPermissions,
} from "../panelAccess.js";
import {
  getPlatformAccess as getLegacyPlatformAccess,
  requestHasPanelPassword,
} from "../platformStaff.js";
import { getAdminStatsSnapshot } from "../adminStats.js";
import { deleteProfileImage, saveProfileImageFromBuffer } from "../storage.js";
import { isS3StorageEnabled, uploadFileToObjectStorage } from "../objectStorage.js";
import {
  appendUploadChunk,
  createUploadSession,
  DEFAULT_UPLOAD_CHUNK_BYTES,
  destroyUploadSession,
  finalizeUploadSession,
  getUploadSession,
} from "../uploadSessions.js";
import { sendAccountBanEmail } from "../mail.js";
import { spawn } from "node:child_process";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

// ─── Client upload helpers ────────────────────────────────────────────────────

export type ClientPlatform =
  | "windows"
  | "linux_deb"
  | "linux_rpm"
  | "linux_snap"
  | "linux_tar"
  | "android"
  | "ios"
  | "macos";

const CLIENT_MIME_TO_EXT: Record<string, string> = {
  "application/x-msdownload":               "exe",
  "application/vnd.android.package-archive": "apk",
  "application/vnd.debian.binary-package":  "deb",
  "application/x-debian-package":           "deb",
  "application/x-rpm":                      "rpm",
  "application/x-snap":                     "snap",
  "application/x-tar":                      "tar",
  "application/gzip":                       "tar.gz",
  "application/x-gzip":                     "tar.gz",
  "application/octet-stream":               "bin",
};

const CLIENT_EXT_TO_MIME: Record<string, string> = {
  ".exe":  "application/x-msdownload",
  ".apk":  "application/vnd.android.package-archive",
  ".deb":  "application/x-debian-package",
  ".rpm":  "application/x-rpm",
  ".snap": "application/x-snap",
  ".tar":  "application/x-tar",
  ".gz":   "application/gzip",
};

const EXT_TO_PLATFORM: Record<string, ClientPlatform> = {
  ".exe":  "windows",
  ".apk":  "android",
  ".deb":  "linux_deb",
  ".rpm":  "linux_rpm",
  ".snap": "linux_snap",
  ".gz":   "linux_tar",
  ".tar":  "linux_tar",
};

function resolveClientMime(rawMime: string | undefined, filename: string | undefined): string | null {
  const mime = String(rawMime || "").trim().toLowerCase();
  if (mime && mime !== "application/octet-stream" && CLIENT_MIME_TO_EXT[mime]) return mime;
  const ext = path.extname(filename || "").toLowerCase();
  return CLIENT_EXT_TO_MIME[ext] ?? null;
}

function resolveClientPlatform(filename: string): ClientPlatform | null {
  const ext = path.extname(filename || "").toLowerCase();
  return EXT_TO_PLATFORM[ext] ?? null;
}

async function saveClientFile(
  storageDir: string,
  platform: ClientPlatform,
  version: string,
  source: NodeJS.ReadableStream,
  mimeType: string,
  maxBytes: number,
): Promise<{ filePath: string; fileSize: number; checksum: string } | null> {
  const ext = CLIENT_MIME_TO_EXT[mimeType] ?? "bin";
  const clientDir = path.join(storageDir, "clients", platform);
  const filename = `${platform}_${version}_${crypto.randomBytes(6).toString("hex")}.${ext}`;
  const filepath = path.join(clientDir, filename);
  const relativePath = `clients/${platform}/${filename}`;
  try {
    fs.mkdirSync(clientDir, { recursive: true });
    const hash = crypto.createHash("sha256");
    let fileSize = 0;
    const out = fs.createWriteStream(filepath, { flags: "w" });
    const hasher = new Transform({
      transform(chunk, _encoding, callback) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        fileSize += buf.length;
        if (fileSize > maxBytes) {
          callback(new Error("TOO_LARGE"));
          return;
        }
        hash.update(buf);
        callback(null, buf);
      },
    });

    await pipeline(source, hasher, out);
    if (!fileSize) {
      try { fs.unlinkSync(filepath); } catch {}
      return null;
    }

    return { filePath: relativePath, fileSize, checksum: hash.digest("hex") };
  } catch (error) {
    try { fs.unlinkSync(filepath); } catch {}
    if ((error as Error)?.message === "TOO_LARGE") throw error;
    return null;
  }
}

function buildClientStorageTarget(
  platform: ClientPlatform,
  version: string,
  mimeType: string,
) {
  const ext = CLIENT_MIME_TO_EXT[mimeType] ?? "bin";
  const filename = `${platform}_${version}_${crypto.randomBytes(6).toString("hex")}.${ext}`;
  return {
    filePath: `clients/${platform}/${filename}`,
  };
}

async function hashFileSha256(filePath: string) {
  return await new Promise<string>((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function persistClientReleaseRecord(input: {
  actorId: string;
  platform: ClientPlatform;
  version: string;
  channel: "stable" | "beta" | "nightly";
  releaseNotes?: string;
  originalFilename: string;
  savedPath: string;
  mime: string;
  fileSize: number;
  checksum: string;
}) {
  const {
    actorId,
    platform,
    version,
    channel,
    releaseNotes,
    originalFilename,
    savedPath,
    mime,
    fileSize,
    checksum,
  } = input;

  if (isS3StorageEnabled()) {
    try {
      await uploadFileToObjectStorage(
        "clients",
        savedPath,
        path.join(env.PROFILE_IMAGE_STORAGE_DIR, savedPath),
        mime,
      );
    } catch {
      deleteProfileImage(env.PROFILE_IMAGE_STORAGE_DIR, savedPath);
      throw new Error("OBJECT_STORAGE_FAILED");
    }
  }

  await q(
    `UPDATE client SET is_active = FALSE WHERE type = :platform AND channel = :channel AND is_active = TRUE`,
    { platform, channel },
  );

  const clientId = ulidLike();
  await q(
    `INSERT INTO client (
      id, type, version, channel,
      file_path, file_name, mime_type, file_size,
      checksum_sha256, is_active, release_notes, uploaded_by
     ) VALUES (
       :id, :type, :version, :channel,
       :filePath, :fileName, :mimeType, :fileSize,
       :checksum, TRUE, :releaseNotes, :uploadedBy
     )`,
    {
      id: clientId,
      type: platform,
      version,
      channel,
      filePath: savedPath,
      fileName: originalFilename,
      mimeType: mime,
      fileSize,
      checksum,
      releaseNotes: releaseNotes ?? null,
      uploadedBy: actorId || null,
    },
  );

  return {
    id: clientId,
    type: platform,
    version,
    channel,
    filePath: savedPath,
    fileName: originalFilename,
    mimeType: mime,
    fileSize,
    checksum,
    downloadUrl: `${env.PROFILE_IMAGE_BASE_URL}/${savedPath}`,
    releaseNotes: releaseNotes ?? null,
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PLATFORM_ADMIN_BADGE = "PLATFORM_ADMIN";
const PLATFORM_FOUNDER_BADGE = "PLATFORM_FOUNDER";
const RESERVED_BADGE_IDS = new Set([
  "OFFICIAL",
  "official",
  "PLATFORM_ADMIN",
  "platform_admin",
  "PLATFORM_FOUNDER",
  "platform_founder",
  "platform_owner",
  "boost",
]);
const BOOST_GRANT_TYPE = z.enum(["permanent", "temporary"]);
const BOOST_TRIAL_WINDOW_BODY = z.object({
  startsAt: z.string().datetime().nullable(),
  endsAt: z.string().datetime().nullable()
});
const OFFICIAL_WELCOME_MESSAGE_BODY = z.object({
  enabled: z.boolean(),
  content: z.string().max(OFFICIAL_MESSAGE_MAX_LENGTH),
});

// ─── Types ────────────────────────────────────────────────────────────────────

type BroadcastToUser = (targetUserId: string, t: string, d: any) => Promise<void>;

type BadgeDefinitionRow = {
  badge_id: string;
  display_name: string;
  description: string | null;
  icon: string | null;
  image_url: string | null;
  bg_color: string | null;
  fg_color: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

type PanelAdminAccountRow = {
  id: string;
  email: string;
  username: string;
  role: "owner" | "admin" | "staff";
  title: string;
  permissions_json: string | null;
  notes: string | null;
  assigned_by: string | null;
  assigned_by_username: string | null;
  two_factor_enabled: number;
  force_two_factor_setup: number;
  disabled_at: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
};

type PanelStaffScheduleRow = {
  id: string;
  admin_id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  timezone: string;
  shift_type: string;
  note: string | null;
  admin_username: string;
  admin_email: string;
  admin_title: string;
  admin_role: "owner" | "admin" | "staff";
  created_by: string | null;
  created_by_username: string | null;
  updated_by: string | null;
  updated_by_username: string | null;
  created_at: string;
  updated_at: string;
};

// ─── Badge helpers ────────────────────────────────────────────────────────────

const BADGE_IMAGE_MIME_ALIASES: Record<string, string> = {
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
  "image/jfif": "image/jpeg",
  "image/x-png": "image/png",
  "image/x-ms-bmp": "image/bmp",
};

const ALLOWED_BADGE_IMAGE_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/bmp",
]);

const optionalTrimmedString = (max: number) =>
  z.preprocess((value) => {
    if (value == null) return undefined;
    const trimmed = String(value).trim();
    return trimmed ? trimmed : undefined;
  }, z.string().max(max).optional());

const nullableTrimmedString = (max: number) =>
  z.preprocess((value) => {
    if (value == null) return null;
    const trimmed = String(value).trim();
    return trimmed ? trimmed : null;
  }, z.string().max(max).nullable());

function mapMailError(error: unknown): string {
  const code = String((error as Error)?.message || "").trim();
  if (code === "SMTP_NOT_CONFIGURED") return "SMTP_NOT_CONFIGURED";
  if (code === "SMTP_AUTH_FAILED") return "SMTP_AUTH_FAILED";
  if (code === "SMTP_CONNECTION_FAILED") return "SMTP_CONNECTION_FAILED";
  if (code === "EMAIL_SEND_FAILED") return "EMAIL_SEND_FAILED";
  return "EMAIL_SEND_FAILED";
}

function isValidBadgeImageReference(value: string) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return false;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }
  if (trimmed.startsWith("/")) return true;
  if (trimmed.startsWith("users/")) return true;
  return false;
}

function normalizeBadgeImageReference(value: string | null | undefined) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  const base = env.PROFILE_IMAGE_BASE_URL.replace(/\/$/, "");
  if (trimmed.startsWith("users/")) return `${base}/${trimmed}`;
  if (trimmed.startsWith("/users/")) return `${base}${trimmed}`;
  return trimmed;
}

function serializeBadgeDefinition(row: BadgeDefinitionRow) {
  return {
    badgeId: row.badge_id,
    displayName: row.display_name,
    description: row.description || null,
    icon: row.icon || null,
    imageUrl: normalizeBadgeImageReference(row.image_url),
    bgColor: row.bg_color || null,
    fgColor: row.fg_color || null,
    createdByUserId: row.created_by_user_id || null,
    updatedByUserId: row.updated_by_user_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function badgeImageMimeFromFilename(filename: string) {
  const ext = path.extname(filename || "").toLowerCase();
  const map: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".bmp": "image/bmp",
  };
  return map[ext] ?? null;
}

function normalizeBadgeImageMime(mimeType: string | undefined, filename: string | undefined) {
  const rawMime = String(mimeType || "").trim().toLowerCase();
  const canonicalMime = BADGE_IMAGE_MIME_ALIASES[rawMime] ?? rawMime;
  if (canonicalMime && ALLOWED_BADGE_IMAGE_MIMES.has(canonicalMime)) return canonicalMime;
  const filenameMime = badgeImageMimeFromFilename(filename || "");
  if (filenameMime && ALLOWED_BADGE_IMAGE_MIMES.has(filenameMime)) return filenameMime;
  return null;
}

async function setBadge(userId: string, badge: string, enabled: boolean) {
  if (enabled) {
    await q(
      `INSERT INTO user_badges (user_id,badge)
       VALUES (:userId,:badge)
       ON DUPLICATE KEY UPDATE user_id=user_id`,
      { userId, badge }
    );
  } else {
    await q(
      `DELETE FROM user_badges WHERE user_id=:userId AND badge=:badge`,
      { userId, badge }
    );
  }
}

function toMySqlDateTime(value: Date) {
  return value.toISOString().slice(0, 19).replace("T", " ");
}

function uniqueTrimmedStrings(values: string[] | undefined) {
  return Array.from(
    new Set(
      (values || [])
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );
}

function getActorAdminId(req: any) {
  return String(req.panelAdmin?.id || req.user?.sub || "").trim();
}

async function requirePanelOwner(req: any) {
  const access = await requirePanelAccess(req);
  if (!access.isPlatformOwner) throw new Error("ONLY_OWNER");
  return access;
}

function mapPanelAdminAccount(row: PanelAdminAccountRow) {
  return {
    adminId: row.id,
    id: row.id,
    email: row.email,
    username: row.username,
    role: row.role,
    title: row.title || "Staff",
    permissions: normalizePlatformPermissions(row.permissions_json || "[]"),
    notes: row.notes || null,
    assignedBy: row.assigned_by || null,
    assignedByUsername: row.assigned_by_username || null,
    twoFactorEnabled: Boolean(row.two_factor_enabled),
    forceTwoFactorSetup: Boolean(row.force_two_factor_setup),
    disabledAt: row.disabled_at || null,
    lastLoginAt: row.last_login_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPanelStaffSchedule(row: PanelStaffScheduleRow) {
  return {
    id: row.id,
    adminId: row.admin_id,
    shiftDate: row.shift_date,
    startTime: row.start_time,
    endTime: row.end_time,
    timezone: row.timezone || "UTC",
    shiftType: row.shift_type || "support",
    note: row.note || "",
    staff: {
      adminId: row.admin_id,
      username: row.admin_username,
      email: row.admin_email,
      title: row.admin_title || "Staff",
      role: row.admin_role,
    },
    createdBy: row.created_by || null,
    createdByUsername: row.created_by_username || null,
    updatedBy: row.updated_by || null,
    updatedByUsername: row.updated_by_username || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function assertScheduleWindow(startTime: string, endTime: string) {
  if (startTime >= endTime) {
    throw new Error("INVALID_SCHEDULE_WINDOW");
  }
}

function panelRoleRank(role: "owner" | "admin" | "staff") {
  if (role === "owner") return 3;
  if (role === "admin") return 2;
  return 1;
}

function defaultPanelTitle(role: "owner" | "admin" | "staff") {
  if (role === "owner") return "Owner";
  if (role === "admin") return "Admin";
  return "Staff";
}

function normalizePanelAccountPermissions(
  role: "owner" | "admin" | "staff",
  permissions: PlatformPanelPermission[] | undefined,
): PlatformPanelPermission[] {
  if (role === "owner" || role === "admin") {
    return [...PLATFORM_PANEL_PERMISSIONS];
  }
  const normalized = normalizePlatformPermissions(permissions || []);
  return normalized.length ? normalized : ["manage_support"];
}

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const PANEL_PERMISSION_ENUM = z.enum(PLATFORM_PANEL_PERMISSIONS);

const staffAssignmentBodySchema = z.object({
  levelKey: z.string().trim().min(2).max(32),
  title: z.string().trim().min(2).max(96),
  permissions: z.array(PANEL_PERMISSION_ENUM).min(1).max(PLATFORM_PANEL_PERMISSIONS.length),
  notes: z.string().trim().max(255).optional(),
});

const panelAccountListQuerySchema = z.object({
  includeDisabled: z.coerce.boolean().optional(),
});

const panelAccountRoleEnum = z.enum(["owner", "admin", "staff"]);

const panelAccountCreateBodySchema = z.object({
  email: z.string().trim().email().max(190),
  username: z.string().trim().min(2).max(64),
  password: z.string().min(8).max(200),
  role: panelAccountRoleEnum.default("staff"),
  title: z.string().trim().min(2).max(96).optional(),
  permissions: z.array(PANEL_PERMISSION_ENUM).max(PLATFORM_PANEL_PERMISSIONS.length).optional(),
  notes: z.string().trim().max(255).optional(),
});

const panelAccountUpdateBodySchema = z.object({
  email: z.string().trim().email().max(190).optional(),
  username: z.string().trim().min(2).max(64).optional(),
  role: panelAccountRoleEnum.optional(),
  title: z.string().trim().min(2).max(96).optional(),
  permissions: z.array(PANEL_PERMISSION_ENUM).max(PLATFORM_PANEL_PERMISSIONS.length).optional(),
  notes: z.preprocess((value) => {
    if (value === null) return null;
    if (value == null) return undefined;
    const trimmed = String(value).trim();
    return trimmed ? trimmed : null;
  }, z.string().max(255).nullable().optional()),
  disabled: z.boolean().optional(),
});

const panelAccountPasswordBodySchema = z.object({
  password: z.string().min(8).max(200),
  revokeSessions: z.boolean().optional(),
});

const scheduleDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const scheduleTimeSchema = z.string().regex(/^\d{2}:\d{2}$/);

const panelStaffScheduleBodySchema = z.object({
  adminId: z.string().trim().min(3).max(64),
  shiftDate: scheduleDateSchema,
  startTime: scheduleTimeSchema,
  endTime: scheduleTimeSchema,
  timezone: z.string().trim().min(2).max(64).optional(),
  shiftType: z.string().trim().min(2).max(32).optional(),
  note: z.string().trim().max(255).optional(),
});

const panelStaffScheduleListQuerySchema = z.object({
  startDate: scheduleDateSchema.optional(),
  endDate: scheduleDateSchema.optional(),
  adminId: optionalTrimmedString(64),
});

const badgeIdSchema = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(/^[A-Za-z0-9_:-]+$/, "Badge ID can only contain letters, numbers, underscores, colons, and dashes.");

const badgeDefinitionBodySchema = z.object({
  displayName: z.string().trim().min(1).max(64),
  description: nullableTrimmedString(160).optional(),
  icon: nullableTrimmedString(24).optional(),
  imageUrl: z.preprocess((value) => {
    if (value == null) return null;
    const trimmed = String(value).trim();
    return trimmed ? trimmed : null;
  }, z.string().max(600).refine((value) => isValidBadgeImageReference(value), "Invalid badge image reference.").nullable().optional()),
  bgColor: nullableTrimmedString(40).optional(),
  fgColor: nullableTrimmedString(40).optional(),
});

const CLIENT_UPLOAD_FIELDS = z.object({
  version: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .regex(/^\d+\.\d+\.\d+/, "Version must start with semver e.g. 1.0.0"),
  channel: z.enum(["stable", "beta", "nightly"]).default("stable"),
  releaseNotes: z.string().trim().max(2000).optional(),
});

// ─── Panel operations ─────────────────────────────────────────────────────────

type PanelOperationAction = "restart" | "update";
type PanelOperationStatus = "success" | "failed";
type PanelOperationRecord = {
  id: string;
  action: PanelOperationAction;
  status: PanelOperationStatus;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  actorId: string;
  actorUsername: string;
  exitCode: number;
  output: string[];
};
type ActivePanelOperation = {
  id: string;
  action: PanelOperationAction;
  startedAt: string;
  actorId: string;
  actorUsername: string;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../../../../../");
const PANEL_RUNTIME_CONTROL_SCRIPT = path.resolve(
  REPO_ROOT,
  "scripts/ops/panel-runtime-control.sh",
);
const PANEL_TMUX_SESSION = "OpenCom";
const PANEL_START_COMMAND = "./start.sh all";
const PANEL_OPERATION_LOG_LINE_LIMIT = 360;
const PANEL_OPERATION_HISTORY_LIMIT = 20;

let activePanelOperation: ActivePanelOperation | null = null;
const panelOperationHistory: PanelOperationRecord[] = [];

async function requirePanelOperationsAccess(req: any) {
  const access = await requirePanelAccess(req);
  if (!access.isPlatformAdmin && !access.isPlatformOwner) {
    throw new Error("FORBIDDEN");
  }
  return access;
}

async function countRowsSafe(
  sql: string,
  params: Record<string, any> = {},
  options: { fallbackOnMissingTable?: boolean } = {},
) {
  try {
    const rows = await q<{ count: number }>(sql, params);
    return Number(rows[0]?.count || 0);
  } catch (error: any) {
    if (
      options.fallbackOnMissingTable &&
      (error?.code === "ER_NO_SUCH_TABLE" || error?.errno === 1146)
    ) {
      return 0;
    }
    throw error;
  }
}

function pushPanelOperationLog(logLines: string[], line: string) {
  const trimmed = String(line || "").trimEnd();
  if (!trimmed) return;
  logLines.push(trimmed);
  if (logLines.length > PANEL_OPERATION_LOG_LINE_LIMIT) {
    logLines.shift();
  }
}

function addPanelOperationHistory(record: PanelOperationRecord) {
  panelOperationHistory.unshift(record);
  if (panelOperationHistory.length > PANEL_OPERATION_HISTORY_LIMIT) {
    panelOperationHistory.length = PANEL_OPERATION_HISTORY_LIMIT;
  }
}

async function runCommandCapture(command: string, args: string[]) {
  return new Promise<{ exitCode: number; stdout: string; stderr: string }>(
    (resolve) => {
      const child = spawn(command, args, {
        cwd: REPO_ROOT,
        env: process.env,
      });

      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (chunk) => { stdout += String(chunk || ""); });
      child.stderr?.on("data", (chunk) => { stderr += String(chunk || ""); });
      child.on("error", (error) => { stderr += error.message; });
      child.on("close", (code) => {
        resolve({ exitCode: typeof code === "number" ? code : -1, stdout, stderr });
      });
    },
  );
}

async function getPanelRuntimeStatus() {
  const result = await runCommandCapture("bash", [PANEL_RUNTIME_CONTROL_SCRIPT, "status"]);

  const fallback = {
    tmuxInstalled: false,
    sessionName: PANEL_TMUX_SESSION,
    windowName: "",
    sessionExists: false,
    windowExists: false,
    paneTarget: PANEL_TMUX_SESSION,
    startCommand: PANEL_START_COMMAND,
    statusError: result.exitCode === 0 ? null : `STATUS_EXIT_${result.exitCode}`,
  };

  if (result.exitCode !== 0) return fallback;

  try {
    const parsed = JSON.parse(result.stdout);
    return { ...fallback, ...parsed, statusError: null };
  } catch {
    return { ...fallback, statusError: "STATUS_PARSE_FAILED" };
  }
}

async function runPanelOperation(action: PanelOperationAction) {
  const logLines: string[] = [];
  const scriptAction = action === "update" ? "update-and-restart" : "restart";

  const start = Date.now();
  const startedAt = new Date(start).toISOString();
  pushPanelOperationLog(logLines, `[info] Starting ${action === "update" ? "update + restart" : "restart"} flow`);

  const exitCode = await new Promise<number>((resolve) => {
    const child = spawn("bash", [PANEL_RUNTIME_CONTROL_SCRIPT, scriptAction], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        OPENCOM_TMUX_SESSION: PANEL_TMUX_SESSION,
        OPENCOM_START_COMMAND: PANEL_START_COMMAND,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    const attachReader = (stream: NodeJS.ReadableStream | null, prefix: string) => {
      if (!stream) return;
      const reader = createInterface({ input: stream });
      reader.on("line", (line) => { pushPanelOperationLog(logLines, `${prefix} ${line}`); });
    };

    attachReader(child.stdout, "[out]");
    attachReader(child.stderr, "[err]");
    child.on("error", (error) => { pushPanelOperationLog(logLines, `[err] ${error.message}`); resolve(-1); });
    child.on("close", (code) => { resolve(typeof code === "number" ? code : -1); });
  });

  const finishedAt = new Date().toISOString();
  const durationMs = Math.max(0, Date.now() - start);
  pushPanelOperationLog(
    logLines,
    exitCode === 0 ? "[info] Operation completed successfully." : `[err] Operation failed with exit code ${exitCode}.`,
  );

  return { startedAt, finishedAt, durationMs, exitCode, output: logLines };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function adminRoutes(app: FastifyInstance, broadcastToUser?: BroadcastToUser) {
  app.get("/v1/admin/overview", { preHandler: [app.authenticatePanelAdmin] } as any, async (req: any, rep) => {
    try {
      await requirePanelAccess(req);
    } catch {
      return rep.code(403).send({ error: "FORBIDDEN" });
    }

    const founder = await q<any>(
      `SELECT id,username,email,created_at
       FROM panel_admin_users
       WHERE role='owner'
         AND disabled_at IS NULL
       ORDER BY created_at ASC
       LIMIT 1`
    );

    const admins = await q<any>(
      `SELECT id,username,email,role,created_at
       FROM panel_admin_users
       WHERE disabled_at IS NULL
       ORDER BY
         CASE role
           WHEN 'owner' THEN 0
           WHEN 'admin' THEN 1
           ELSE 2
         END,
         created_at ASC`
    );

    const [
      activeBoostGrants,
      staffAssignments,
      publishedBlogs,
      boostBadgeMembers,
      boostStripeMembers,
      badgeDefinitions,
      supportTicketsTotal,
      supportTicketsOpen,
    ] = await Promise.all([
      countRowsSafe(`SELECT COUNT(*) AS count FROM admin_boost_grants WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())`, {}, { fallbackOnMissingTable: true }),
      countRowsSafe(`SELECT COUNT(*) AS count FROM panel_admin_users WHERE role='staff' AND disabled_at IS NULL`),
      countRowsSafe(`SELECT COUNT(*) AS count FROM blog_posts WHERE status='published' AND published_at IS NOT NULL`, {}, { fallbackOnMissingTable: true }),
      countRowsSafe(`SELECT COUNT(*) AS count FROM user_badges WHERE badge='boost'`, {}, { fallbackOnMissingTable: true }),
      countRowsSafe(`SELECT COUNT(DISTINCT user_id) AS count FROM user_subscriptions WHERE status IN ('active','trialing','past_due')`, {}, { fallbackOnMissingTable: true }),
      countRowsSafe(`SELECT COUNT(*) AS count FROM badge_definitions`, {}, { fallbackOnMissingTable: true }),
      countRowsSafe(`SELECT COUNT(*) AS count FROM support_tickets`, {}, { fallbackOnMissingTable: true }),
      countRowsSafe(`SELECT COUNT(*) AS count FROM support_tickets WHERE status IN ('open','waiting_on_staff','waiting_on_user')`, {}, { fallbackOnMissingTable: true }),
    ]);

    const boost_real = boostStripeMembers;
    return {
      founder: founder[0]?.id ? founder[0] : null,
      admins,
      activeBoostGrants,
      staffAssignmentsCount: staffAssignments,
      publishedBlogsCount: publishedBlogs,
      boost_real,
      boostStripeMembers,
      badgeDefinitionsCount: badgeDefinitions,
      supportTicketsTotal,
      supportTicketsOpen,
    };
  });

  app.get("/v1/admin/stats", { preHandler: [app.authenticatePanelAdmin] } as any, async (req: any, rep) => {
    try {
      await requirePanelAccess(req);
    } catch {
      return rep.code(403).send({ error: "FORBIDDEN" });
    }
    return getAdminStatsSnapshot();
  });

  app.get("/v1/admin/operations", { preHandler: [app.authenticatePanelAdmin] } as any, async (req: any, rep) => {
    try {
      await requirePanelOperationsAccess(req);
    } catch {
      return rep.code(403).send({ error: "FORBIDDEN" });
    }
    const runtime = await getPanelRuntimeStatus();
    return { runtime, activeOperation: activePanelOperation, history: panelOperationHistory };
  });

  app.post("/v1/admin/operations/restart", { preHandler: [app.authenticatePanelAdmin] } as any, async (req: any, rep) => {
    try {
      await requirePanelOperationsAccess(req);
    } catch {
      return rep.code(403).send({ error: "FORBIDDEN" });
    }

    if (activePanelOperation) {
      return rep.code(409).send({ error: "OPERATION_IN_PROGRESS", activeOperation: activePanelOperation });
    }

    const actorId = getActorAdminId(req);
    const actorUsername = String(req.panelAdmin?.username || "unknown");
    const operationId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    activePanelOperation = { id: operationId, action: "restart", startedAt: new Date().toISOString(), actorId, actorUsername };

    try {
      const result = await runPanelOperation("restart");
      const record: PanelOperationRecord = {
        id: operationId, action: "restart",
        status: result.exitCode === 0 ? "success" : "failed",
        startedAt: result.startedAt, finishedAt: result.finishedAt,
        durationMs: result.durationMs, actorId, actorUsername,
        exitCode: result.exitCode, output: result.output,
      };
      addPanelOperationHistory(record);
      const runtime = await getPanelRuntimeStatus();
      return rep.code(result.exitCode === 0 ? 200 : 500).send({ operation: record, runtime });
    } finally {
      activePanelOperation = null;
    }
  });

  app.post("/v1/admin/operations/update", { preHandler: [app.authenticatePanelAdmin] } as any, async (req: any, rep) => {
    try {
      await requirePanelOperationsAccess(req);
    } catch {
      return rep.code(403).send({ error: "FORBIDDEN" });
    }

    if (activePanelOperation) {
      return rep.code(409).send({ error: "OPERATION_IN_PROGRESS", activeOperation: activePanelOperation });
    }

    const actorId = getActorAdminId(req);
    const actorUsername = String(req.panelAdmin?.username || "unknown");
    const operationId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    activePanelOperation = { id: operationId, action: "update", startedAt: new Date().toISOString(), actorId, actorUsername };

    try {
      const result = await runPanelOperation("update");
      const record: PanelOperationRecord = {
        id: operationId, action: "update",
        status: result.exitCode === 0 ? "success" : "failed",
        startedAt: result.startedAt, finishedAt: result.finishedAt,
        durationMs: result.durationMs, actorId, actorUsername,
        exitCode: result.exitCode, output: result.output,
      };
      addPanelOperationHistory(record);
      const runtime = await getPanelRuntimeStatus();
      return rep.code(result.exitCode === 0 ? 200 : 500).send({ operation: record, runtime });
    } finally {
      activePanelOperation = null;
    }
  });

  app.get("/v1/admin/users", { preHandler: [app.authenticatePanelAdmin] } as any, async (req: any, rep) => {
    try {
      await requirePanelAccess(req);
    } catch {
      return rep.code(403).send({ error: "FORBIDDEN" });
    }

    const { query } = z.object({ query: z.string().min(1).max(64) }).parse(req.query);
    const users = await q<any>(
      `SELECT u.id,u.username,u.email,IF(ab.user_id IS NULL, 0, 1) AS isBanned
       FROM users u
       LEFT JOIN account_bans ab ON ab.user_id=u.id
       WHERE u.username LIKE :likeQ OR u.email LIKE :likeQ
       ORDER BY u.created_at DESC
       LIMIT 20`,
      { likeQ: `%${query}%` }
    );
    return { users };
  });

  app.get("/v1/admin/badge-definitions", { preHandler: [app.authenticatePanelAdmin] } as any, async (req: any, rep) => {
    try {
      await requirePanelPermission(req, "manage_badges");
    } catch {
      return rep.code(403).send({ error: "FORBIDDEN" });
    }

    const definitions = await q<BadgeDefinitionRow>(
      `SELECT badge_id, display_name, description, icon, image_url, bg_color, fg_color,
              created_by_user_id, updated_by_user_id, created_at, updated_at
       FROM badge_definitions
       ORDER BY updated_at DESC, badge_id ASC`
    );
    return { definitions: definitions.map(serializeBadgeDefinition) };
  });

  app.post("/v1/admin/badge-definitions/upload", { preHandler: [app.authenticatePanelAdmin] } as any, async (req: any, rep) => {
    try {
      await requirePanelPermission(req, "manage_badges");
    } catch {
      return rep.code(403).send({ error: "FORBIDDEN" });
    }

    const actorId = getActorAdminId(req);
    const data = await req.file();
    if (!data) return rep.code(400).send({ error: "MISSING_FILE" });

    const mime = normalizeBadgeImageMime(data.mimetype, data.filename);
    if (!mime) {
      return rep.code(400).send({ error: "INVALID_IMAGE_TYPE", allowed: [...ALLOWED_BADGE_IMAGE_MIMES] });
    }

    const buffer = await data.toBuffer();
    const saved = saveProfileImageFromBuffer(env.PROFILE_IMAGE_STORAGE_DIR, actorId, "asset", buffer, mime);
    if (!saved) return rep.code(500).send({ error: "SAVE_FAILED" });

    if (isS3StorageEnabled()) {
      try {
        await uploadFileToObjectStorage("profiles", saved, path.join(env.PROFILE_IMAGE_STORAGE_DIR, saved), mime);
      } catch {
        deleteProfileImage(env.PROFILE_IMAGE_STORAGE_DIR, saved);
        return rep.code(500).send({ error: "SAVE_FAILED" });
      }
    }

    return { imageUrl: `${env.PROFILE_IMAGE_BASE_URL}/${saved}` };
  });

  app.post("/v1/admin/client/uploads/init", { preHandler: [app.authenticatePanelAdmin] } as any, async (req: any, rep) => {
    try {
      await requirePanelOperationsAccess(req);
    } catch {
      return rep.code(403).send({ error: "FORBIDDEN" });
    }

    const actorId = getActorAdminId(req);
    const body = z.object({
      ...CLIENT_UPLOAD_FIELDS.shape,
      fileName: z.string().trim().min(1).max(255),
      contentType: z.string().trim().max(255).optional(),
      sizeBytes: z.coerce.number().int().min(0),
    }).safeParse(req.body || {});
    if (!body.success) {
      return rep.code(400).send({
        error: "INVALID_FIELDS",
        details: body.error.flatten().fieldErrors,
      });
    }

    const { version, channel, releaseNotes, fileName, contentType, sizeBytes } = body.data;
    if (sizeBytes > env.CLIENT_UPLOAD_MAX_BYTES) {
      return rep.code(413).send({ error: "TOO_LARGE", maxBytes: env.CLIENT_UPLOAD_MAX_BYTES });
    }

    const originalFilename = path.basename(fileName) || "client-build";
    const mime = resolveClientMime(contentType, originalFilename);
    if (!mime) {
      return rep.code(400).send({ error: "UNSUPPORTED_FILE_TYPE", hint: "Supported: .exe .apk .deb .rpm .snap .tar.gz" });
    }

    const platform = resolveClientPlatform(originalFilename);
    if (!platform) {
      return rep.code(400).send({ error: "UNRECOGNISED_PLATFORM", hint: "Cannot determine target platform from file extension." });
    }

    const storageTarget = buildClientStorageTarget(
      platform,
      version,
      mime,
    );
    const session = createUploadSession({
      rootDir: env.PROFILE_IMAGE_STORAGE_DIR,
      attachmentId: ulidLike(),
      fileName: originalFilename,
      contentType: mime,
      expectedSizeBytes: sizeBytes,
      maxBytes: env.CLIENT_UPLOAD_MAX_BYTES,
      finalObjectKey: storageTarget.filePath,
      chunkSizeBytes: DEFAULT_UPLOAD_CHUNK_BYTES,
      context: {
        actorId,
        channel,
        platform,
        version,
        releaseNotes: releaseNotes ?? "",
      },
    });

    return rep.send({
      uploadId: session.uploadId,
      fileName: originalFilename,
      contentType: mime,
      sizeBytes,
      uploadedBytes: 0,
      chunkSizeBytes: session.chunkSizeBytes,
      maxBytes: env.CLIENT_UPLOAD_MAX_BYTES,
      channel,
      platform,
      version,
      expiresAt: session.expiresAt,
    });
  });

  app.put("/v1/admin/client/uploads/:uploadId/chunks", { preHandler: [app.authenticatePanelAdmin] } as any, async (req: any, rep) => {
    try {
      await requirePanelOperationsAccess(req);
    } catch {
      return rep.code(403).send({ error: "FORBIDDEN" });
    }

    const actorId = getActorAdminId(req);
    const { uploadId } = z.object({
      uploadId: z.string().min(8),
    }).parse(req.params);
    const { offset } = z.object({
      offset: z.coerce.number().int().min(0),
    }).parse(req.query || {});

    const session = getUploadSession(env.PROFILE_IMAGE_STORAGE_DIR, uploadId);
    if (!session) return rep.code(404).send({ error: "UPLOAD_NOT_FOUND" });
    if (String(session.context.actorId || "") !== actorId) {
      return rep.code(403).send({ error: "BAD_UPLOADER" });
    }

    const stream = (req.body || req.raw) as NodeJS.ReadableStream | undefined;
    if (!stream || typeof (stream as { pipe?: unknown }).pipe !== "function") {
      return rep.code(400).send({ error: "CHUNK_REQUIRED" });
    }

    try {
      const result = await appendUploadChunk(
        env.PROFILE_IMAGE_STORAGE_DIR,
        uploadId,
        stream,
        offset,
      );
      if (result.error === "NOT_FOUND") return rep.code(404).send({ error: "UPLOAD_NOT_FOUND" });
      if (result.error === "OFFSET_MISMATCH") {
        return rep.code(409).send({
          error: "OFFSET_MISMATCH",
          uploadedBytes: result.uploadedBytes,
          expectedSizeBytes: result.expectedSizeBytes,
        });
      }

      return rep.send({
        ok: true,
        uploadedBytes: result.uploadedBytes,
        expectedSizeBytes: result.expectedSizeBytes,
        complete: result.complete,
      });
    } catch (error: any) {
      destroyUploadSession(env.PROFILE_IMAGE_STORAGE_DIR, uploadId);
      if (String(error?.message || "") === "CHUNK_TOO_LARGE") {
        return rep.code(413).send({ error: "CHUNK_TOO_LARGE", chunkSizeBytes: session.chunkSizeBytes });
      }
      if (String(error?.message || "") === "TOO_LARGE") {
        return rep.code(413).send({ error: "TOO_LARGE", maxBytes: session.maxBytes });
      }
      return rep.code(500).send({ error: "UPLOAD_FAILED" });
    }
  });

  app.post("/v1/admin/client/uploads/:uploadId/complete", { preHandler: [app.authenticatePanelAdmin] } as any, async (req: any, rep) => {
    try {
      await requirePanelOperationsAccess(req);
    } catch {
      return rep.code(403).send({ error: "FORBIDDEN" });
    }

    const actorId = getActorAdminId(req);
    const { uploadId } = z.object({
      uploadId: z.string().min(8),
    }).parse(req.params);

    const session = getUploadSession(env.PROFILE_IMAGE_STORAGE_DIR, uploadId);
    if (!session) return rep.code(404).send({ error: "UPLOAD_NOT_FOUND" });
    if (String(session.context.actorId || "") !== actorId) {
      return rep.code(403).send({ error: "BAD_UPLOADER" });
    }

    let finalized = null as ReturnType<typeof finalizeUploadSession> | null;
    try {
      finalized = finalizeUploadSession(env.PROFILE_IMAGE_STORAGE_DIR, uploadId);
    } catch (error: any) {
      if (String(error?.message || "") === "INCOMPLETE_UPLOAD") {
        return rep.code(400).send({ error: "INCOMPLETE_UPLOAD", uploadedBytes: session.uploadedBytes });
      }
      return rep.code(500).send({ error: "UPLOAD_FAILED" });
    }
    if (!finalized) return rep.code(404).send({ error: "UPLOAD_NOT_FOUND" });

    try {
      const checksum = await hashFileSha256(
        path.join(env.PROFILE_IMAGE_STORAGE_DIR, finalized.finalObjectKey),
      );
      const client = await persistClientReleaseRecord({
        actorId,
        platform: String(session.context.platform || "") as ClientPlatform,
        version: String(session.context.version || ""),
        channel: String(session.context.channel || "stable") as "stable" | "beta" | "nightly",
        releaseNotes: String(session.context.releaseNotes || "").trim() || undefined,
        originalFilename: finalized.fileName,
        savedPath: finalized.finalObjectKey,
        mime: finalized.contentType,
        fileSize: finalized.uploadedBytes,
        checksum,
      });
      return rep.code(201).send({ ok: true, client });
    } catch (error: any) {
      if (String(error?.message || "") === "OBJECT_STORAGE_FAILED") {
        return rep.code(500).send({ error: "OBJECT_STORAGE_FAILED" });
      }
      return rep.code(500).send({ error: "UPLOAD_FAILED" });
    }
  });

  app.delete("/v1/admin/client/uploads/:uploadId", { preHandler: [app.authenticatePanelAdmin] } as any, async (req: any, rep) => {
    try {
      await requirePanelOperationsAccess(req);
    } catch {
      return rep.code(403).send({ error: "FORBIDDEN" });
    }

    const actorId = getActorAdminId(req);
    const { uploadId } = z.object({
      uploadId: z.string().min(8),
    }).parse(req.params);

    const session = getUploadSession(env.PROFILE_IMAGE_STORAGE_DIR, uploadId);
    if (!session) return rep.send({ ok: true });
    if (String(session.context.actorId || "") !== actorId) {
      return rep.code(403).send({ error: "BAD_UPLOADER" });
    }

    destroyUploadSession(env.PROFILE_IMAGE_STORAGE_DIR, uploadId);
    return rep.send({ ok: true });
  });

  app.post("/v1/admin/client/update", { preHandler: [app.authenticatePanelAdmin] } as any, async (req: any, rep) => {
    try {
      await requirePanelOperationsAccess(req)
    } catch {
      return rep.code(403).send({ error: "FORBIDDEN" });
    }

    const actorId = getActorAdminId(req);

    const data = await req.file({ limits: { fileSize: env.CLIENT_UPLOAD_MAX_BYTES } });
    if (!data) return rep.code(400).send({ error: "MISSING_FILE" });

    const fieldsParsed = CLIENT_UPLOAD_FIELDS.safeParse(data.fields ?? {});
    if (!fieldsParsed.success) {
      return rep.code(400).send({ error: "INVALID_FIELDS", details: fieldsParsed.error.flatten().fieldErrors });
    }
    const { version, channel, releaseNotes } = fieldsParsed.data;

    const mime = resolveClientMime(data.mimetype, data.filename);
    if (!mime) {
      return rep.code(400).send({ error: "UNSUPPORTED_FILE_TYPE", hint: "Supported: .exe .apk .deb .rpm .snap .tar.gz" });
    }

    const platform = resolveClientPlatform(data.filename ?? "");
    if (!platform) {
      return rep.code(400).send({ error: "UNRECOGNISED_PLATFORM", hint: "Cannot determine target platform from file extension." });
    }

    const originalFilename = data.filename ?? `${platform}_${version}`;
    let saved: { filePath: string; fileSize: number; checksum: string } | null = null;
    try {
      saved = await saveClientFile(
        env.PROFILE_IMAGE_STORAGE_DIR,
        platform,
        version,
        data.file,
        mime,
        env.CLIENT_UPLOAD_MAX_BYTES,
      );
    } catch (error) {
      if ((error as Error)?.message === "TOO_LARGE" || data.file?.truncated) {
        return rep.code(413).send({ error: "TOO_LARGE", maxBytes: env.CLIENT_UPLOAD_MAX_BYTES });
      }
      throw error;
    }
    if (!saved) {
      return rep.code(500).send({ error: "SAVE_FAILED" });
    }

    const { filePath: savedPath, fileSize, checksum } = saved;

    try {
      const client = await persistClientReleaseRecord({
        actorId,
        platform,
        version,
        channel,
        releaseNotes,
        originalFilename,
        savedPath,
        mime,
        fileSize,
        checksum,
      });
      return rep.code(201).send({ ok: true, client });
    } catch (error: any) {
      if (String(error?.message || "") === "OBJECT_STORAGE_FAILED") {
        return rep.code(500).send({ error: "OBJECT_STORAGE_FAILED" });
      }
      return rep.code(500).send({ error: "UPLOAD_FAILED" });
    }
  });

  app.put("/v1/admin/badge-definitions/:badgeId", { preHandler: [app.authenticatePanelAdmin] } as any, async (req: any, rep) => {
    try {
      await requirePanelPermission(req, "manage_badges");
    } catch {
      return rep.code(403).send({ error: "FORBIDDEN" });
    }

    const actorId = getActorAdminId(req);
    const { badgeId } = z.object({ badgeId: badgeIdSchema }).parse(req.params);
    if (RESERVED_BADGE_IDS.has(badgeId)) {
      return rep.code(400).send({ error: "BADGE_ID_RESERVED" });
    }

    const body = parseBody(badgeDefinitionBodySchema, req.body);
    const definitionParams = {
      badgeId,
      displayName: body.displayName.trim(),
      description: body.description ?? null,
      icon: body.icon ?? null,
      imageUrl: normalizeBadgeImageReference(body.imageUrl),
      bgColor: body.bgColor ?? null,
      fgColor: body.fgColor ?? null,
      actorId,
    };

    await q(
      `INSERT INTO badge_definitions (
         badge_id, display_name, description, icon, image_url, bg_color, fg_color,
         created_by_user_id, updated_by_user_id
       ) VALUES (
         :badgeId, :displayName, :description, :icon, :imageUrl, :bgColor, :fgColor,
         :actorId, :actorId
       )
       ON DUPLICATE KEY UPDATE
         display_name=VALUES(display_name),
         description=VALUES(description),
         icon=VALUES(icon),
         image_url=VALUES(image_url),
         bg_color=VALUES(bg_color),
         fg_color=VALUES(fg_color),
         updated_by_user_id=VALUES(updated_by_user_id),
         updated_at=CURRENT_TIMESTAMP`,
      definitionParams
    );

    const rows = await q<BadgeDefinitionRow>(
      `SELECT badge_id, display_name, description, icon, image_url, bg_color, fg_color,
              created_by_user_id, updated_by_user_id, created_at, updated_at
       FROM badge_definitions
       WHERE badge_id=:badgeId
       LIMIT 1`,
      { badgeId }
    );
    return { definition: rows[0] ? serializeBadgeDefinition(rows[0]) : null };
  });

  app.delete("/v1/admin/badge-definitions/:badgeId", { preHandler: [app.authenticatePanelAdmin] } as any, async (req: any, rep) => {
    try {
      await requirePanelPermission(req, "manage_badges");
    } catch {
      return rep.code(403).send({ error: "FORBIDDEN" });
    }

    const { badgeId } = z.object({ badgeId: badgeIdSchema }).parse(req.params);
    if (RESERVED_BADGE_IDS.has(badgeId)) {
      return rep.code(400).send({ error: "BADGE_ID_RESERVED" });
    }

    await q(`DELETE FROM badge_definitions WHERE badge_id=:badgeId`, { badgeId });
    return { ok: true };
  });

  app.get("/v1/admin/users/:userId/detail", { preHandler: [app.authenticatePanelAdmin] } as any, async (req: any, rep) => {
    try {
      await requirePanelAccess(req);
    } catch {
      return rep.code(403).send({ error: "FORBIDDEN" });
    }

    const { userId } = z.object({ userId: z.string().min(3) }).parse(req.params);
    const userRows = await q<any>(
      `SELECT u.id,u.username,u.email,u.created_at,ab.created_at AS banned_at
       FROM users u
       LEFT JOIN account_bans ab ON ab.user_id=u.id
       WHERE u.id=:userId
       LIMIT 1`,
      { userId }
    );
    if (!userRows.length) return rep.code(404).send({ error: "USER_NOT_FOUND" });

    const badges = await q<{
      badge: string;
      created_at: string | null;
      display_name: string | null;
      description: string | null;
      icon: string | null;
      image_url: string | null;
      bg_color: string | null;
      fg_color: string | null;
    }>(
      `SELECT ub.badge, ub.created_at, bd.display_name, bd.description, bd.icon, bd.image_url, bd.bg_color, bd.fg_color
       FROM user_badges ub
       LEFT JOIN badge_definitions bd ON bd.badge_id=ub.badge
       WHERE ub.user_id=:userId
       ORDER BY ub.created_at DESC`,
      { userId }
    );

    const derivedBadges = [...badges];
    if (isOfficialAccountName(userRows[0].username) && !derivedBadges.some((badge) => isOfficialBadgeId(badge.badge))) {
      derivedBadges.unshift({
        badge: "OFFICIAL",
        created_at: null,
        display_name: "OFFICIAL",
        description: "Official OpenCom account badge.",
        icon: "✓",
        image_url: null,
        bg_color: "#1292ff",
        fg_color: "#ffffff",
      });
    }

    return { user: userRows[0], badges: derivedBadges };
  });

  app.post("/v1/admin/users/:userId/platform-admin", { preHandler: [app.authenticatePanelAdmin] } as any, async (req: any, rep) => {
    try {
      await requirePanelOwner(req);
    } catch {
      return rep.code(403).send({ error: "ONLY_OWNER" });
    }

    const { userId } = z.object({ userId: z.string().min(3) }).parse(req.params);
    const { enabled } = parseBody(z.object({ enabled: z.boolean() }), req.body);

    const target = await q<{ id: string; email: string; username: string }>(
      `SELECT id,email,username FROM users WHERE id=:userId`,
      { userId }
    );
    if (!target.length) return rep.code(404).send({ error: "USER_NOT_FOUND" });

    if (enabled) {
      await q(
        `INSERT INTO platform_admins (user_id,added_by) VALUES (:userId,:actorId) ON DUPLICATE KEY UPDATE user_id=user_id`,
        { userId, actorId: userId }
      );
      await setBadge(userId, PLATFORM_ADMIN_BADGE, true);
    } else {
      await q(`DELETE FROM platform_admins WHERE user_id=:userId`, { userId });
      await setBadge(userId, PLATFORM_ADMIN_BADGE, false);
    }

    return { ok: true };
  });

  app.post("/v1/admin/founder", { preHandler: [app.authenticatePanelAdmin] } as any, async (req: any, rep) => {
    try {
      await requirePanelOwner(req);
    } catch {
      return rep.code(403).send({ error: "ONLY_OWNER" });
    }

    const { userId } = parseBody(z.object({ userId: z.string().min(3) }), req.body);
    const target = await q<{ id: string; email: string; username: string }>(
      `SELECT id,email,username FROM users WHERE id=:userId`,
      { userId }
    );
    if (!target.length) return rep.code(404).send({ error: "USER_NOT_FOUND" });

    const prev = await q<{ founder_user_id: string | null }>(`SELECT founder_user_id FROM platform_config WHERE id=1`);

    await q(
      `INSERT INTO platform_config (id, founder_user_id) VALUES (1,:userId) ON DUPLICATE KEY UPDATE founder_user_id=VALUES(founder_user_id)`,
      { userId }
    );

    if (prev.length && prev[0].founder_user_id) {
      await setBadge(prev[0].founder_user_id, PLATFORM_FOUNDER_BADGE, false);
    }

    await setBadge(userId, PLATFORM_FOUNDER_BADGE, true);
    await setBadge(userId, PLATFORM_ADMIN_BADGE, true);
    await q(
      `INSERT INTO platform_admins (user_id,added_by) VALUES (:userId,:actorId) ON DUPLICATE KEY UPDATE user_id=user_id`,
      { userId, actorId: userId }
    );

    return { ok: true };
  });

  app.post("/v1/admin/users/:userId/badges", { preHandler: [app.authenticatePanelAdmin] } as any, async (req: any, rep) => {
    try {
      await requirePanelPermission(req, "manage_badges");
    } catch {
      return rep.code(403).send({ error: "FORBIDDEN" });
    }

    const { userId } = z.object({ userId: z.string().min(3) }).parse(req.params);
    const body = parseBody(z.object({ badge: z.string().min(2).max(64), enabled: z.boolean() }), req.body);

    if (body.badge === PLATFORM_FOUNDER_BADGE) {
      try {
        await requirePanelOwner(req);
      } catch {
        return rep.code(403).send({ error: "ONLY_OWNER" });
      }
    }

    await setBadge(userId, body.badge, body.enabled);
    return { ok: true };
  });

  app.post("/v1/admin/users/:userId/account-ban", { preHandler: [app.authenticatePanelAdmin] } as any, async (req: any, rep) => {
    const actorId = getActorAdminId(req);
    try {
      await requirePanelPermission(req, "moderate_users");
    } catch {
      return rep.code(403).send({ error: "FORBIDDEN" });
    }

    const { userId } = z.object({ userId: z.string().min(3) }).parse(req.params);
    const body = parseBody(z.object({ reason: z.string().trim().max(240).optional() }), req.body);

    const target = await q<{ id: string; email: string; username: string }>(
      `SELECT id,email,username FROM users WHERE id=:userId`,
      { userId }
    );
    if (!target.length) return rep.code(404).send({ error: "USER_NOT_FOUND" });

    const founder = await q<{ founder_user_id: string | null }>(`SELECT founder_user_id FROM platform_config WHERE id=1 LIMIT 1`);
    if (founder[0]?.founder_user_id === userId) {
      return rep.code(400).send({ error: "CANNOT_BAN_FOUNDER" });
    }

    await q(
      `INSERT INTO account_bans (user_id,banned_by,reason)
       VALUES (:userId,:actorId,:reason)
       ON DUPLICATE KEY UPDATE banned_by=VALUES(banned_by), reason=VALUES(reason), created_at=NOW()`,
      { userId, actorId, reason: body.reason || null }
    );
    await q(
      `UPDATE refresh_tokens SET revoked_at=NOW() WHERE user_id=:userId AND revoked_at IS NULL`,
      { userId }
    );

    let emailDelivery = { state: "skipped", error: null as string | null };
    try {
      await sendAccountBanEmail(target[0].email, { username: target[0].username, reason: body.reason || null });
      emailDelivery = { state: "sent", error: null };
    } catch (error) {
      const mapped = mapMailError(error);
      emailDelivery = mapped === "SMTP_NOT_CONFIGURED"
        ? { state: "unavailable", error: mapped }
        : { state: "failed", error: mapped };
    }

    return { ok: true, userId, banned: true, emailDelivery };
  });

  app.delete("/v1/admin/users/:userId/account-ban", { preHandler: [app.authenticatePanelAdmin] } as any, async (req: any, rep) => {
    try {
      await requirePanelPermission(req, "moderate_users");
    } catch {
      return rep.code(403).send({ error: "FORBIDDEN" });
    }

    const { userId } = z.object({ userId: z.string().min(3) }).parse(req.params);
    await q(`DELETE FROM account_bans WHERE user_id=:userId`, { userId });
    return { ok: true, userId, banned: false };
  });

  app.delete("/v1/admin/users/:userId/account", { preHandler: [app.authenticatePanelAdmin] } as any, async (req: any, rep) => {
    try {
      await requirePanelOwner(req);
    } catch {
      return rep.code(403).send({ error: "ONLY_OWNER" });
    }

    const { userId } = z.object({ userId: z.string().min(3) }).parse(req.params);
    const target = await q<{ id: string }>(`SELECT id FROM users WHERE id=:userId`, { userId });
    if (!target.length) return rep.code(404).send({ error: "USER_NOT_FOUND" });

    const founder = await q<{ founder_user_id: string | null }>(`SELECT founder_user_id FROM platform_config WHERE id=1 LIMIT 1`);
    if (founder[0]?.founder_user_id === userId) {
      return rep.code(400).send({ error: "CANNOT_DELETE_FOUNDER" });
    }

    await q(`DELETE FROM users WHERE id=:userId`, { userId });
    return { ok: true, deletedUserId: userId };
  });

  app.get("/v1/admin/users/:userId/boost", { preHandler: [app.authenticatePanelAdmin] } as any, async (req: any, rep) => {
    try {
      await requirePanelPermission(req, "manage_boosts");
    } catch {
      return rep.code(403).send({ error: "FORBIDDEN" });
    }

    const { userId } = z.object({ userId: z.string().min(3) }).parse(req.params);
    const target = await q<{ id: string }>(`SELECT id FROM users WHERE id=:userId`, { userId });
    if (!target.length) return rep.code(404).send({ error: "USER_NOT_FOUND" });

    const entitlement = await reconcileBoostBadge(userId);
    const trialWindow = await getBoostTrialWindow();
    const activeGrant = await getActiveManualBoostGrant(userId);
    const recentGrants = await q<any>(
      `SELECT id,grant_type,reason,created_at,expires_at,revoked_at,granted_by,revoked_by
       FROM admin_boost_grants
       WHERE user_id=:userId
       ORDER BY created_at DESC
       LIMIT 20`,
      { userId }
    );

    return {
      userId,
      boostActive: entitlement.active,
      boostSource: entitlement.source,
      trialActive: entitlement.trialActive,
      trialStartsAt: entitlement.trialStartsAt,
      trialEndsAt: entitlement.trialEndsAt,
      globalTrialWindow: {
        startsAt: trialWindow.startsAt,
        endsAt: trialWindow.endsAt,
        active: trialWindow.active,
        configured: Boolean(trialWindow.startsAt && trialWindow.endsAt)
      },
      activeGrant,
      recentGrants
    };
  });

  app.get("/v1/admin/boost/trial", { preHandler: [app.authenticatePanelAdmin] } as any, async (req: any, rep) => {
    try {
      await requirePanelPermission(req, "manage_boosts");
    } catch {
      return rep.code(403).send({ error: "FORBIDDEN" });
    }

    const trialWindow = await getBoostTrialWindow();
    return {
      startsAt: trialWindow.startsAt,
      endsAt: trialWindow.endsAt,
      active: trialWindow.active,
      configured: Boolean(trialWindow.startsAt && trialWindow.endsAt)
    };
  });

  app.put("/v1/admin/boost/trial", { preHandler: [app.authenticatePanelAdmin] } as any, async (req: any, rep) => {
    try {
      await requirePanelPermission(req, "manage_boosts");
    } catch {
      return rep.code(403).send({ error: "FORBIDDEN" });
    }

    const body = parseBody(BOOST_TRIAL_WINDOW_BODY, req.body);
    if (Boolean(body.startsAt) !== Boolean(body.endsAt)) {
      return rep.code(400).send({ error: "TRIAL_REQUIRES_BOTH_DATES" });
    }

    const startsAtDate = body.startsAt ? new Date(body.startsAt) : null;
    const endsAtDate = body.endsAt ? new Date(body.endsAt) : null;
    if (startsAtDate && endsAtDate && endsAtDate.getTime() <= startsAtDate.getTime()) {
      return rep.code(400).send({ error: "TRIAL_END_MUST_BE_AFTER_START" });
    }

    await q(`INSERT INTO platform_config (id, founder_user_id) VALUES (1, NULL) ON DUPLICATE KEY UPDATE id=id`);
    await q(
      `UPDATE platform_config SET boost_trial_starts_at=:startsAt, boost_trial_ends_at=:endsAt WHERE id=1`,
      {
        startsAt: startsAtDate ? toMySqlDateTime(startsAtDate) : null,
        endsAt: endsAtDate ? toMySqlDateTime(endsAtDate) : null
      }
    );

    const trialWindow = await getBoostTrialWindow();
    return {
      ok: true,
      startsAt: trialWindow.startsAt,
      endsAt: trialWindow.endsAt,
      active: trialWindow.active,
      configured: Boolean(trialWindow.startsAt && trialWindow.endsAt)
    };
  });

  app.post("/v1/admin/users/:userId/boost/grant", { preHandler: [app.authenticatePanelAdmin] } as any, async (req: any, rep) => {
    const actorId = getActorAdminId(req);
    try {
      await requirePanelPermission(req, "manage_boosts");
    } catch {
      return rep.code(403).send({ error: "FORBIDDEN" });
    }

    const { userId } = z.object({ userId: z.string().min(3) }).parse(req.params);
    const target = await q<{ id: string }>(`SELECT id FROM users WHERE id=:userId`, { userId });
    if (!target.length) return rep.code(404).send({ error: "USER_NOT_FOUND" });

    const body = parseBody(
      z.object({
        grantType: BOOST_GRANT_TYPE,
        durationDays: z.number().int().min(1).max(3650).optional(),
        reason: z.string().trim().min(3).max(240).optional()
      }),
      req.body
    );

    if (body.grantType === "temporary" && !body.durationDays) {
      return rep.code(400).send({ error: "TEMPORARY_GRANT_REQUIRES_DURATION" });
    }

    await q(
      `UPDATE admin_boost_grants SET revoked_at=NOW(), revoked_by=:actorId
       WHERE user_id=:userId AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())`,
      { userId, actorId }
    );

    const expiresAt = body.grantType === "temporary"
      ? toMySqlDateTime(new Date(Date.now() + Number(body.durationDays || 0) * 24 * 60 * 60 * 1000))
      : null;

    await q(
      `INSERT INTO admin_boost_grants (user_id,granted_by,grant_type,reason,expires_at)
       VALUES (:userId,:actorId,:grantType,:reason,:expiresAt)`,
      { userId, actorId, grantType: body.grantType, reason: body.reason || null, expiresAt }
    );

    const entitlement = await reconcileBoostBadge(userId);
    return { ok: true, userId, grantType: body.grantType, expiresAt, boostActive: entitlement.active, boostSource: entitlement.source };
  });

  app.post("/v1/admin/users/:userId/boost/revoke", { preHandler: [app.authenticatePanelAdmin] } as any, async (req: any, rep) => {
    const actorId = getActorAdminId(req);
    try {
      await requirePanelPermission(req, "manage_boosts");
    } catch {
      return rep.code(403).send({ error: "FORBIDDEN" });
    }

    const { userId } = z.object({ userId: z.string().min(3) }).parse(req.params);
    await q(
      `UPDATE admin_boost_grants SET revoked_at=NOW(), revoked_by=:actorId
       WHERE user_id=:userId AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())`,
      { userId, actorId }
    );
    const entitlement = await reconcileBoostBadge(userId);
    return { ok: true, boostActive: entitlement.active, boostSource: entitlement.source };
  });

  app.get("/v1/admin/official-messages/status", { preHandler: [app.authenticatePanelAdmin] } as any, async (req: any, rep) => {
    try {
      await requirePanelPermission(req, "send_official_messages");
    } catch {
      return rep.code(403).send({ error: "FORBIDDEN" });
    }

    const officialAccount = await getOfficialAccount();
    const newUserWelcomeMessage = await getNewUserOfficialMessageConfig();
    const totalReachableRows = await q<{ count: number }>(
      `SELECT COUNT(*) AS count FROM users u LEFT JOIN account_bans ab ON ab.user_id=u.id
       WHERE ab.user_id IS NULL AND LOWER(u.username)<>LOWER(:username)`,
      { username: "opencom" }
    );

    return {
      officialAccount: officialAccount
        ? {
            id: officialAccount.id,
            username: officialAccount.username,
            displayName: officialAccount.display_name,
            email: officialAccount.email || null,
            pfpUrl: officialAccount.pfp_url || null,
            badgeDetails: [buildOfficialBadgeDetail()],
            isNoReply: true
          }
        : null,
      reachableUserCount: Number(totalReachableRows[0]?.count || 0),
      newUserWelcomeMessage: {
        enabled: newUserWelcomeMessage.enabled,
        content: newUserWelcomeMessage.content,
        active: newUserWelcomeMessage.enabled && !!newUserWelcomeMessage.content.trim() && !!officialAccount,
      },
    };
  });

  app.put("/v1/admin/official-messages/welcome", { preHandler: [app.authenticatePanelAdmin] } as any, async (req: any, rep) => {
    try {
      await requirePanelPermission(req, "send_official_messages");
    } catch {
      return rep.code(403).send({ error: "FORBIDDEN" });
    }

    const body = parseBody(OFFICIAL_WELCOME_MESSAGE_BODY, req.body);
    if (body.enabled && !body.content.trim()) {
      return rep.code(400).send({ error: "WELCOME_MESSAGE_REQUIRED" });
    }

    const saved = await saveNewUserOfficialMessageConfig({ enabled: body.enabled, content: body.content });
    return { ok: true, newUserWelcomeMessage: saved };
  });

  app.post("/v1/admin/official-messages/send", { preHandler: [app.authenticatePanelAdmin] } as any, async (req: any, rep) => {
    try {
      await requirePanelPermission(req, "send_official_messages");
    } catch {
      return rep.code(403).send({ error: "FORBIDDEN" });
    }

    const actorId = getActorAdminId(req);
    const body = parseBody(
      z.object({
        recipientMode: z.enum(["all", "selected"]),
        userIds: z.array(z.string().min(3)).max(5000).optional(),
        content: z.string().trim().min(1).max(4000)
      }),
      req.body
    );

    const officialAccount = await getOfficialAccount();
    if (!officialAccount) return rep.code(404).send({ error: "OFFICIAL_ACCOUNT_NOT_FOUND" });

    let recipients: Array<{ id: string; username: string; display_name: string | null; pfp_url: string | null }> = [];
    let skippedUserIds: string[] = [];

    if (body.recipientMode === "all") {
      recipients = await q<{ id: string; username: string; display_name: string | null; pfp_url: string | null }>(
        `SELECT u.id,u.username,u.display_name,u.pfp_url
         FROM users u LEFT JOIN account_bans ab ON ab.user_id=u.id
         WHERE ab.user_id IS NULL AND u.id<>:senderId
         ORDER BY u.created_at DESC`,
        { senderId: officialAccount.id }
      );
    } else {
      const requestedIds = uniqueTrimmedStrings(body.userIds).filter((userId) => userId !== officialAccount.id);
      if (!requestedIds.length) return rep.code(400).send({ error: "RECIPIENTS_REQUIRED" });
      const params: Record<string, string> = { senderId: officialAccount.id };
      const inList = requestedIds.map((userId, index) => { params[`u${index}`] = userId; return `:u${index}`; }).join(",");

      recipients = await q<{ id: string; username: string; display_name: string | null; pfp_url: string | null }>(
        `SELECT u.id,u.username,u.display_name,u.pfp_url
         FROM users u LEFT JOIN account_bans ab ON ab.user_id=u.id
         WHERE ab.user_id IS NULL AND u.id<>:senderId AND u.id IN (${inList})`,
        params
      );
      const foundIds = new Set(recipients.map((user) => user.id));
      skippedUserIds = requestedIds.filter((userId) => !foundIds.has(userId));
    }

    if (!recipients.length) return rep.code(400).send({ error: "NO_ELIGIBLE_RECIPIENTS" });

    const summaryRecipients: Array<{ id: string; username: string; displayName: string | null; threadId: string }> = [];

    for (const recipient of recipients) {
      const sent = await sendOfficialMessageToUser(recipient.id, body.content, { officialAccount, broadcastToUser });
      if (!sent) { skippedUserIds.push(recipient.id); continue; }
      if (summaryRecipients.length < 50) {
        summaryRecipients.push({ id: recipient.id, username: recipient.username, displayName: recipient.display_name, threadId: sent.threadId });
      }
    }

    return { ok: true, recipientMode: body.recipientMode, sentCount: recipients.length, skippedUserIds, recipients: summaryRecipients };
  });

  app.get("/v1/admin/panel-accounts", { preHandler: [app.authenticatePanelAdmin] } as any, async (req: any, rep) => {
    const access = await requirePanelAccess(req);
    if (!access.isPlatformOwner && !access.isPlatformAdmin && !access.permissions.includes("manage_support")) {
      return rep.code(403).send({ error: "FORBIDDEN" });
    }

    const query = panelAccountListQuerySchema.parse(req.query || {});
    const rows = await q<PanelAdminAccountRow>(
      `SELECT pa.id, pa.email, pa.username, pa.role, pa.title, pa.permissions_json,
              pa.notes, pa.assigned_by, assigner.username AS assigned_by_username,
              pa.two_factor_enabled, pa.force_two_factor_setup,
              pa.disabled_at, pa.last_login_at, pa.created_at, pa.updated_at
         FROM panel_admin_users pa
         LEFT JOIN panel_admin_users assigner ON assigner.id=pa.assigned_by
        ${query.includeDisabled ? "" : "WHERE pa.disabled_at IS NULL"}
        ORDER BY CASE pa.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END ASC,
                 pa.username ASC, pa.created_at ASC`,
    );
    return { accounts: rows.map(mapPanelAdminAccount) };
  });

  app.post("/v1/admin/panel-accounts", { preHandler: [app.authenticatePanelAdmin] } as any, async (req: any, rep) => {
    const actorId = getActorAdminId(req);
    const access = await requirePanelAccess(req);
    if (!access.isPlatformOwner && !access.isPlatformAdmin) {
      return rep.code(403).send({ error: "FORBIDDEN" });
    }

    const body = parseBody(panelAccountCreateBodySchema, req.body);
    if (body.role !== "staff" && !access.isPlatformOwner) {
      return rep.code(403).send({ error: "ONLY_OWNER_CAN_CREATE_PRIVILEGED_ROLES" });
    }

    const existing = await q<{ id: string }>(
      `SELECT id FROM panel_admin_users WHERE LOWER(email)=LOWER(:email) LIMIT 1`,
      { email: body.email.trim() },
    );
    if (existing.length) return rep.code(409).send({ error: "ADMIN_EMAIL_EXISTS" });

    const accountId = ulidLike();
    const passwordHash = await hashPassword(body.password);
    const role = body.role;
    const permissions = normalizePanelAccountPermissions(role, body.permissions);

    await q(
      `INSERT INTO panel_admin_users (
         id,email,username,password_hash,role,title,permissions_json,notes,
         assigned_by,two_factor_enabled,force_two_factor_setup,totp_secret_encrypted,disabled_at
       ) VALUES (
         :id,:email,:username,:passwordHash,:role,:title,:permissionsJson,:notes,
         :assignedBy,0,1,NULL,NULL
       )`,
      {
        id: accountId,
        email: body.email.trim(),
        username: body.username.trim(),
        passwordHash,
        role,
        title: body.title?.trim() || defaultPanelTitle(role),
        permissionsJson: serializePlatformPermissions(permissions),
        notes: body.notes?.trim() || null,
        assignedBy: actorId || null,
      },
    );

    const rows = await q<PanelAdminAccountRow>(
      `SELECT pa.id, pa.email, pa.username, pa.role, pa.title, pa.permissions_json,
              pa.notes, pa.assigned_by, assigner.username AS assigned_by_username,
              pa.two_factor_enabled, pa.force_two_factor_setup,
              pa.disabled_at, pa.last_login_at, pa.created_at, pa.updated_at
         FROM panel_admin_users pa
         LEFT JOIN panel_admin_users assigner ON assigner.id=pa.assigned_by
        WHERE pa.id=:accountId LIMIT 1`,
      { accountId },
    );
    return rep.code(201).send({ ok: true, account: rows[0] ? mapPanelAdminAccount(rows[0]) : null });
  });

  app.patch("/v1/admin/panel-accounts/:adminId", { preHandler: [app.authenticatePanelAdmin] } as any, async (req: any, rep) => {
    const actorId = getActorAdminId(req);
    const access = await requirePanelAccess(req);
    if (!access.isPlatformOwner && !access.isPlatformAdmin) {
      return rep.code(403).send({ error: "FORBIDDEN" });
    }

    const { adminId } = z.object({ adminId: z.string().trim().min(3).max(64) }).parse(req.params);
    const body = parseBody(panelAccountUpdateBodySchema, req.body || {});

    const rows = await q<PanelAdminAccountRow>(
      `SELECT pa.id, pa.email, pa.username, pa.role, pa.title, pa.permissions_json,
              pa.notes, pa.assigned_by, assigner.username AS assigned_by_username,
              pa.two_factor_enabled, pa.force_two_factor_setup,
              pa.disabled_at, pa.last_login_at, pa.created_at, pa.updated_at
         FROM panel_admin_users pa
         LEFT JOIN panel_admin_users assigner ON assigner.id=pa.assigned_by
        WHERE pa.id=:adminId LIMIT 1`,
      { adminId },
    );
    const existing = rows[0];
    if (!existing) return rep.code(404).send({ error: "ADMIN_ACCOUNT_NOT_FOUND" });

    const currentRole = existing.role;
    const nextRole = body.role || currentRole;

    if (adminId === actorId && body.disabled === true) return rep.code(400).send({ error: "CANNOT_DISABLE_SELF" });
    if (adminId === actorId && body.role && panelRoleRank(body.role) < panelRoleRank(currentRole)) {
      return rep.code(400).send({ error: "CANNOT_DEMOTE_SELF" });
    }

    if (!access.isPlatformOwner) {
      if (currentRole !== "staff") return rep.code(403).send({ error: "ONLY_OWNER_CAN_EDIT_PRIVILEGED_ROLES" });
      if (nextRole !== "staff") return rep.code(403).send({ error: "ONLY_OWNER_CAN_PROMOTE_ROLES" });
    }

    if (body.email && body.email.trim().toLowerCase() !== existing.email.trim().toLowerCase()) {
      const emailRows = await q<{ id: string }>(
        `SELECT id FROM panel_admin_users WHERE LOWER(email)=LOWER(:email) AND id<>:adminId LIMIT 1`,
        { email: body.email.trim(), adminId },
      );
      if (emailRows.length) return rep.code(409).send({ error: "ADMIN_EMAIL_EXISTS" });
    }

    const permissions = normalizePanelAccountPermissions(
      nextRole,
      body.permissions || normalizePlatformPermissions(existing.permissions_json || "[]"),
    );

    await q(
      `UPDATE panel_admin_users
          SET email=:email, username=:username, role=:role, title=:title,
              permissions_json=:permissionsJson, notes=:notes,
              disabled_at=CASE WHEN :disableMode=1 THEN NOW() WHEN :disableMode=0 THEN NULL ELSE disabled_at END,
              assigned_by=:actorId
        WHERE id=:adminId`,
      {
        adminId,
        email: body.email?.trim() || existing.email,
        username: body.username?.trim() || existing.username,
        role: nextRole,
        title: body.title?.trim() || existing.title || defaultPanelTitle(nextRole),
        permissionsJson: serializePlatformPermissions(permissions),
        notes: body.notes !== undefined ? body.notes : existing.notes,
        disableMode: body.disabled === undefined ? -1 : (body.disabled ? 1 : 0),
        actorId: actorId || null,
      },
    );

    if (body.disabled === true) {
      await q(
        `UPDATE panel_admin_refresh_tokens SET revoked_at=NOW() WHERE admin_id=:adminId AND revoked_at IS NULL`,
        { adminId },
      );
    }

    const updatedRows = await q<PanelAdminAccountRow>(
      `SELECT pa.id, pa.email, pa.username, pa.role, pa.title, pa.permissions_json,
              pa.notes, pa.assigned_by, assigner.username AS assigned_by_username,
              pa.two_factor_enabled, pa.force_two_factor_setup,
              pa.disabled_at, pa.last_login_at, pa.created_at, pa.updated_at
         FROM panel_admin_users pa
         LEFT JOIN panel_admin_users assigner ON assigner.id=pa.assigned_by
        WHERE pa.id=:adminId LIMIT 1`,
      { adminId },
    );
    return { ok: true, account: updatedRows[0] ? mapPanelAdminAccount(updatedRows[0]) : null };
  });

  app.post("/v1/admin/panel-accounts/:adminId/password", { preHandler: [app.authenticatePanelAdmin] } as any, async (req: any, rep) => {
    const actorId = getActorAdminId(req);
    const access = await requirePanelAccess(req);
    if (!access.isPlatformOwner && !access.isPlatformAdmin) {
      return rep.code(403).send({ error: "FORBIDDEN" });
    }

    const { adminId } = z.object({ adminId: z.string().trim().min(3).max(64) }).parse(req.params);
    const body = parseBody(panelAccountPasswordBodySchema, req.body);

    const targetRows = await q<{ id: string; role: "owner" | "admin" | "staff" }>(
      `SELECT id, role FROM panel_admin_users WHERE id=:adminId LIMIT 1`,
      { adminId },
    );
    if (!targetRows.length) return rep.code(404).send({ error: "ADMIN_ACCOUNT_NOT_FOUND" });
    if (!access.isPlatformOwner && targetRows[0].role !== "staff") {
      return rep.code(403).send({ error: "ONLY_OWNER_CAN_RESET_PRIVILEGED_PASSWORDS" });
    }

    const passwordHash = await hashPassword(body.password);
    await q(
      `UPDATE panel_admin_users
          SET password_hash=:passwordHash, two_factor_enabled=0,
              force_two_factor_setup=1, totp_secret_encrypted=NULL, assigned_by=:actorId
        WHERE id=:adminId`,
      { adminId, passwordHash, actorId: actorId || null },
    );

    const shouldRevoke = body.revokeSessions !== false;
    if (shouldRevoke) {
      await q(
        `UPDATE panel_admin_refresh_tokens SET revoked_at=NOW() WHERE admin_id=:adminId AND revoked_at IS NULL`,
        { adminId },
      );
    }

    return { ok: true, adminId, sessionsRevoked: shouldRevoke };
  });

  app.get("/v1/admin/staff/schedules", { preHandler: [app.authenticatePanelAdmin] } as any, async (req: any, rep) => {
    try {
      await requirePanelPermission(req, "manage_support");
    } catch {
      return rep.code(403).send({ error: "FORBIDDEN" });
    }

    const parsed = panelStaffScheduleListQuerySchema.parse(req.query || {});
    const startDate = parsed.startDate || "1970-01-01";
    const endDate = parsed.endDate || "2999-12-31";
    if (startDate > endDate) return rep.code(400).send({ error: "INVALID_DATE_RANGE" });

    const where: string[] = ["s.shift_date >= :startDate", "s.shift_date <= :endDate"];
    const params: Record<string, string> = { startDate, endDate };
    if (parsed.adminId) { where.push("s.admin_id=:adminId"); params.adminId = parsed.adminId; }

    const rows = await q<PanelStaffScheduleRow>(
      `SELECT s.id, s.admin_id, s.shift_date, s.start_time, s.end_time, s.timezone,
              s.shift_type, s.note, s.created_by, creator.username AS created_by_username,
              s.updated_by, updater.username AS updated_by_username, s.created_at, s.updated_at,
              pa.username AS admin_username, pa.email AS admin_email, pa.title AS admin_title, pa.role AS admin_role
         FROM panel_staff_schedules s
         JOIN panel_admin_users pa ON pa.id=s.admin_id
         LEFT JOIN panel_admin_users creator ON creator.id=s.created_by
         LEFT JOIN panel_admin_users updater ON updater.id=s.updated_by
        WHERE ${where.join(" AND ")}
        ORDER BY s.shift_date ASC, s.start_time ASC, s.end_time ASC, s.id ASC`,
      params,
    );

    return { schedules: rows.map(mapPanelStaffSchedule), range: { startDate, endDate } };
  });

  app.post("/v1/admin/staff/schedules", { preHandler: [app.authenticatePanelAdmin] } as any, async (req: any, rep) => {
    try {
      await requirePanelPermission(req, "manage_support");
    } catch {
      return rep.code(403).send({ error: "FORBIDDEN" });
    }

    const body = parseBody(panelStaffScheduleBodySchema, req.body);
    try {
      assertScheduleWindow(body.startTime, body.endTime);
    } catch {
      return rep.code(400).send({ error: "INVALID_SCHEDULE_WINDOW" });
    }

    const targetRows = await q<{ id: string }>(
      `SELECT id FROM panel_admin_users WHERE id=:adminId AND disabled_at IS NULL LIMIT 1`,
      { adminId: body.adminId },
    );
    if (!targetRows.length) return rep.code(404).send({ error: "ADMIN_ACCOUNT_NOT_FOUND" });

    const actorId = getActorAdminId(req);
    const scheduleId = ulidLike();

    await q(
      `INSERT INTO panel_staff_schedules (
         id, admin_id, shift_date, start_time, end_time, timezone, shift_type, note, created_by, updated_by
       ) VALUES (
         :id, :adminId, :shiftDate, :startTime, :endTime, :timezone, :shiftType, :note, :actorId, :actorId
       )`,
      {
        id: scheduleId, adminId: body.adminId, shiftDate: body.shiftDate,
        startTime: body.startTime, endTime: body.endTime,
        timezone: body.timezone || "UTC", shiftType: body.shiftType || "support",
        note: body.note || null, actorId: actorId || null,
      },
    );

    const rows = await q<PanelStaffScheduleRow>(
      `SELECT s.id, s.admin_id, s.shift_date, s.start_time, s.end_time, s.timezone,
              s.shift_type, s.note, s.created_by, creator.username AS created_by_username,
              s.updated_by, updater.username AS updated_by_username, s.created_at, s.updated_at,
              pa.username AS admin_username, pa.email AS admin_email, pa.title AS admin_title, pa.role AS admin_role
         FROM panel_staff_schedules s
         JOIN panel_admin_users pa ON pa.id=s.admin_id
         LEFT JOIN panel_admin_users creator ON creator.id=s.created_by
         LEFT JOIN panel_admin_users updater ON updater.id=s.updated_by
        WHERE s.id=:id LIMIT 1`,
      { id: scheduleId },
    );
    return rep.code(201).send({ ok: true, schedule: rows[0] ? mapPanelStaffSchedule(rows[0]) : null });
  });

  app.put("/v1/admin/staff/schedules/:scheduleId", { preHandler: [app.authenticatePanelAdmin] } as any, async (req: any, rep) => {
    try {
      await requirePanelPermission(req, "manage_support");
    } catch {
      return rep.code(403).send({ error: "FORBIDDEN" });
    }

    const { scheduleId } = z.object({ scheduleId: z.string().trim().min(3).max(64) }).parse(req.params);
    const body = parseBody(panelStaffScheduleBodySchema, req.body);
    try {
      assertScheduleWindow(body.startTime, body.endTime);
    } catch {
      return rep.code(400).send({ error: "INVALID_SCHEDULE_WINDOW" });
    }

    const targetRows = await q<{ id: string }>(
      `SELECT id FROM panel_admin_users WHERE id=:adminId AND disabled_at IS NULL LIMIT 1`,
      { adminId: body.adminId },
    );
    if (!targetRows.length) return rep.code(404).send({ error: "ADMIN_ACCOUNT_NOT_FOUND" });

    const existingRows = await q<{ id: string }>(
      `SELECT id FROM panel_staff_schedules WHERE id=:scheduleId LIMIT 1`,
      { scheduleId },
    );
    if (!existingRows.length) return rep.code(404).send({ error: "SCHEDULE_NOT_FOUND" });

    const actorId = getActorAdminId(req);

    await q(
      `UPDATE panel_staff_schedules
          SET admin_id=:adminId, shift_date=:shiftDate, start_time=:startTime, end_time=:endTime,
              timezone=:timezone, shift_type=:shiftType, note=:note, updated_by=:actorId
        WHERE id=:scheduleId`,
      {
        scheduleId, adminId: body.adminId, shiftDate: body.shiftDate,
        startTime: body.startTime, endTime: body.endTime,
        timezone: body.timezone || "UTC", shiftType: body.shiftType || "support",
        note: body.note || null, actorId: actorId || null,
      },
    );

    const rows = await q<PanelStaffScheduleRow>(
      `SELECT s.id, s.admin_id, s.shift_date, s.start_time, s.end_time, s.timezone,
              s.shift_type, s.note, s.created_by, creator.username AS created_by_username,
              s.updated_by, updater.username AS updated_by_username, s.created_at, s.updated_at,
              pa.username AS admin_username, pa.email AS admin_email, pa.title AS admin_title, pa.role AS admin_role
         FROM panel_staff_schedules s
         JOIN panel_admin_users pa ON pa.id=s.admin_id
         LEFT JOIN panel_admin_users creator ON creator.id=s.created_by
         LEFT JOIN panel_admin_users updater ON updater.id=s.updated_by
        WHERE s.id=:id LIMIT 1`,
      { id: scheduleId },
    );
    return { ok: true, schedule: rows[0] ? mapPanelStaffSchedule(rows[0]) : null };
  });

  app.delete("/v1/admin/staff/schedules/:scheduleId", { preHandler: [app.authenticatePanelAdmin] } as any, async (req: any, rep) => {
    try {
      await requirePanelPermission(req, "manage_support");
    } catch {
      return rep.code(403).send({ error: "FORBIDDEN" });
    }

    const { scheduleId } = z.object({ scheduleId: z.string().trim().min(3).max(64) }).parse(req.params);
    const existingRows = await q<{ id: string }>(
      `SELECT id FROM panel_staff_schedules WHERE id=:scheduleId LIMIT 1`,
      { scheduleId },
    );
    if (!existingRows.length) return rep.code(404).send({ error: "SCHEDULE_NOT_FOUND" });

    await q(`DELETE FROM panel_staff_schedules WHERE id=:scheduleId`, { scheduleId });
    return { ok: true, removedScheduleId: scheduleId };
  });

  app.get("/v1/admin/staff", { preHandler: [app.authenticatePanelAdmin] } as any, async (req: any, rep) => {
    const access = await requirePanelAccess(req);
    if (!access.isPlatformOwner && !access.isPlatformAdmin) {
      return rep.code(403).send({ error: "INSUFFICIENT_ROLE" });
    }
    const staff = await listPanelStaffAssignments();
    return { staff };
  });

  app.put("/v1/admin/staff/:userId", { preHandler: [app.authenticatePanelAdmin] } as any, async (req: any, rep) => {
    const actorId = getActorAdminId(req);
    const access = await requirePanelAccess(req);
    if (!access.isPlatformOwner && !access.isPlatformAdmin) {
      return rep.code(403).send({ error: "INSUFFICIENT_ROLE" });
    }

    const { userId } = z.object({ userId: z.string().min(3) }).parse(req.params);
    const body = parseBody(staffAssignmentBodySchema, req.body);
    const target = await q<{ id: string; role: string }>(
      `SELECT id,role FROM panel_admin_users WHERE id=:userId AND disabled_at IS NULL LIMIT 1`,
      { userId },
    );
    if (!target.length) return rep.code(404).send({ error: "ADMIN_ACCOUNT_NOT_FOUND" });
    if (target[0].role === "owner" || target[0].role === "admin") {
      return rep.code(400).send({ error: "ROLE_ALREADY_HAS_FULL_ACCESS" });
    }

    await q(
      `UPDATE panel_admin_users
       SET role='staff', title=:title, permissions_json=:permissionsJson, notes=:notes, assigned_by=:actorId
       WHERE id=:userId`,
      { userId, title: body.title, permissionsJson: serializePlatformPermissions(body.permissions), notes: body.notes || null, actorId }
    );
    return { ok: true, assignment: await getPanelStaffAssignment(userId) };
  });

  app.delete("/v1/admin/staff/:userId", { preHandler: [app.authenticatePanelAdmin] } as any, async (req: any, rep) => {
    const actorId = getActorAdminId(req);
    const access = await requirePanelAccess(req);
    if (!access.isPlatformOwner && !access.isPlatformAdmin) {
      return rep.code(403).send({ error: "INSUFFICIENT_ROLE" });
    }

    const { userId } = z.object({ userId: z.string().min(3) }).parse(req.params);
    const target = await q<{ id: string; role: string }>(
      `SELECT id,role FROM panel_admin_users WHERE id=:userId AND disabled_at IS NULL LIMIT 1`,
      { userId },
    );
    if (!target.length) return rep.code(404).send({ error: "ADMIN_ACCOUNT_NOT_FOUND" });
    if (target[0].role === "owner" || target[0].role === "admin") {
      return rep.code(400).send({ error: "ROLE_ALREADY_HAS_FULL_ACCESS" });
    }

    await q(
      `UPDATE panel_admin_users SET permissions_json='[]', title='Staff', notes=NULL, assigned_by=:actorId WHERE id=:userId`,
      { userId, actorId },
    );
    return { ok: true, removedUserId: userId };
  });

  app.get("/v1/me/admin-status", { preHandler: [app.authenticate] } as any, async (req: any) => {
    const userId = req.user.sub as string;
    const access = await getLegacyPlatformAccess(userId);
    return {
      platformRole: access.platformRole,
      isPlatformAdmin: access.isPlatformAdmin,
      isPlatformOwner: access.isPlatformOwner,
      canAccessPanel: access.canAccessPanel || requestHasPanelPassword(req),
      permissions: access.permissions,
      staffAssignment: access.staffAssignment
    };
  });
}
