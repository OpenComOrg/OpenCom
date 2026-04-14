import fs from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "./env.js";
import { q } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../../../../");

const GLOBAL_SAMPLE_LIMIT = 2000;
const ROUTE_SAMPLE_LIMIT = 300;
const HEAVY_STATS_TTL_MS = 15_000;
const USER_COUNT_OFFSET_FILE = path.join(os.homedir(), "user.txt");

type RouteMetricState = {
  key: string;
  method: string;
  route: string;
  count: number;
  totalDurationMs: number;
  maxDurationMs: number;
  lastDurationMs: number;
  errorCount: number;
  lastStatus: number;
  lastSeenAt: string | null;
  samples: number[];
};

type StorageRootSnapshot = {
  id: string;
  label: string;
  path: string;
  exists: boolean;
  bytes: number;
  fileCount: number;
  directoryCount: number;
  diskTotalBytes: number | null;
  diskFreeBytes: number | null;
  diskUsedBytes: number | null;
};

type HeavyStatsSnapshot = {
  generatedAt: string;
  database: Record<string, number>;
  storage: {
    generatedAt: string;
    totalTrackedBytes: number;
    roots: StorageRootSnapshot[];
  };
};

const requestMetricsByRoute = new Map<string, RouteMetricState>();
const globalDurationSamples: number[] = [];
const globalStatusCounts = {
  success: 0,
  redirect: 0,
  clientError: 0,
  serverError: 0,
};

const serviceStartedAt = Date.now();
let totalRequestCount = 0;
let totalDurationMs = 0;
let maxDurationMs = 0;
let inFlightRequests = 0;
let cachedHeavyStats: { expiresAt: number; value: HeavyStatsSnapshot } | null = null;
let heavyStatsPromise: Promise<HeavyStatsSnapshot> | null = null;

function boundedPush(values: number[], value: number, limit: number) {
  values.push(value);
  if (values.length > limit) values.shift();
}

function roundMetric(value: number, precision = 2) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function percentile(values: number[], targetPercentile: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(
    0,
    Math.min(
      sorted.length - 1,
      Math.ceil((targetPercentile / 100) * sorted.length) - 1,
    ),
  );
  return sorted[index] ?? 0;
}

function resolveTrackedPath(rawPath: string) {
  const trimmed = String(rawPath || "").trim();
  if (!trimmed) return "";
  if (path.isAbsolute(trimmed)) return trimmed;

  const cwdResolved = path.resolve(process.cwd(), trimmed);
  if (existsSync(cwdResolved)) return cwdResolved;
  return path.resolve(repoRoot, trimmed);
}

async function findExistingPath(absPath: string) {
  let current = path.resolve(absPath);
  while (true) {
    try {
      await fs.access(current);
      return current;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return null;
      current = parent;
    }
  }
}

async function scanDirectoryFootprint(absPath: string): Promise<{
  exists: boolean;
  bytes: number;
  fileCount: number;
  directoryCount: number;
}> {
  try {
    const stat = await fs.stat(absPath);
    if (!stat.isDirectory()) {
      return {
        exists: true,
        bytes: Number(stat.size || 0),
        fileCount: 1,
        directoryCount: 0,
      };
    }
  } catch {
    return { exists: false, bytes: 0, fileCount: 0, directoryCount: 0 };
  }

  let bytes = 0;
  let fileCount = 0;
  let directoryCount = 0;

  async function walk(currentPath: string) {
    directoryCount += 1;
    let entries: Array<{
      name: string;
      isDirectory: () => boolean;
      isSymbolicLink: () => boolean;
    }> = [];
    try {
      entries = (await fs.readdir(currentPath, {
        withFileTypes: true,
      })) as typeof entries;
    } catch {
      return;
    }

    await Promise.all(
      entries.map(async (entry) => {
        const entryPath = path.join(currentPath, entry.name);
        try {
          if (entry.isDirectory()) {
            await walk(entryPath);
            return;
          }
          if (entry.isSymbolicLink()) return;
          const stat = await fs.stat(entryPath);
          fileCount += 1;
          bytes += Number(stat.size || 0);
        } catch {
          // Ignore entries that disappear mid-scan or are unreadable.
        }
      }),
    );
  }

  await walk(absPath);

  return {
    exists: true,
    bytes,
    fileCount,
    directoryCount,
  };
}

async function readDiskSnapshot(absPath: string) {
  const existingPath = await findExistingPath(absPath);
  if (!existingPath) {
    return {
      diskTotalBytes: null,
      diskFreeBytes: null,
      diskUsedBytes: null,
    };
  }

  try {
    const stat = await fs.statfs(existingPath);
    const blockSize = Number(stat.bsize || 0);
    const totalBlocks = Number(stat.blocks || 0);
    const freeBlocks = Number(stat.bavail || 0);
    const diskTotalBytes = blockSize * totalBlocks;
    const diskFreeBytes = blockSize * freeBlocks;
    return {
      diskTotalBytes,
      diskFreeBytes,
      diskUsedBytes: Math.max(0, diskTotalBytes - diskFreeBytes),
    };
  } catch {
    return {
      diskTotalBytes: null,
      diskFreeBytes: null,
      diskUsedBytes: null,
    };
  }
}

async function collectStorageStats() {
  const roots = await Promise.all(
    [
      {
        id: "profiles",
        label: "Profile media",
        path: resolveTrackedPath(env.PROFILE_IMAGE_STORAGE_DIR),
      },
      {
        id: "attachments",
        label: "Core attachments",
        path: resolveTrackedPath(env.ATTACHMENT_STORAGE_DIR),
      },
      {
        id: "downloads",
        label: "Download artifacts",
        path: resolveTrackedPath(env.DOWNLOADS_STORAGE_DIR),
      },
      {
        id: "logs",
        label: "Core logs",
        path: resolveTrackedPath(env.CORE_LOG_DIR),
      },
    ].map(async (root) => {
      const footprint = await scanDirectoryFootprint(root.path);
      const disk = await readDiskSnapshot(root.path);
      return {
        ...root,
        ...footprint,
        ...disk,
      };
    }),
  );

  return {
    generatedAt: new Date().toISOString(),
    totalTrackedBytes: roots.reduce((sum, root) => sum + Number(root.bytes || 0), 0),
    roots: roots.sort((left, right) => right.bytes - left.bytes),
  };
}

async function countRows(
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

async function countIfTableExists(tableName: string, sql?: string) {
  const rows = await q<{ count: number }>(
    `SELECT COUNT(*) AS count
     FROM information_schema.tables
     WHERE table_schema = DATABASE()
       AND table_name = :tableName`,
    { tableName },
  );
  if (!Number(rows[0]?.count || 0)) return 0;
  return countRows(
    sql || `SELECT COUNT(*) AS count FROM ${tableName}`,
    {},
    { fallbackOnMissingTable: true },
  );
}

async function readUserCountOffset() {
  try {
    const raw = await fs.readFile(USER_COUNT_OFFSET_FILE, "utf8");
    const trimmed = raw.trim();
    if (!trimmed) return 0;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return 0;
    return Math.trunc(parsed);
  } catch {
    return 0;
  }
}

async function collectDatabaseStats() {
  const [
    users,
    bannedUsers,
    refreshSessions,
    activeRefreshSessions,
    platformAdmins,
    staffAssignments,
    servers,
    memberships,
    friendships,
    socialDmThreads,
    socialDmMessages,
    socialDmAttachments,
    publishedBlogs,
    draftBlogs,
    boostGrantsActive,
    activeInvites,
    boostBadgeMembers,
    boostStripeMembers,
    badgeDefinitions,
    supportTicketsTotal,
    supportTicketsOpen,
    userCountOffset,
  ] = await Promise.all([
    countRows(`SELECT COUNT(*) AS count FROM users`, {}, { fallbackOnMissingTable: true }),
    countRows(`SELECT COUNT(*) AS count FROM account_bans`, {}, { fallbackOnMissingTable: true }),
    countRows(`SELECT COUNT(*) AS count FROM refresh_tokens`, {}, { fallbackOnMissingTable: true }),
    countRows(
      `SELECT COUNT(*) AS count FROM refresh_tokens WHERE revoked_at IS NULL AND expires_at > NOW()`,
      {},
      { fallbackOnMissingTable: true },
    ),
    countRows(`SELECT COUNT(*) AS count FROM platform_admins`, {}, { fallbackOnMissingTable: true }),
    countRows(`SELECT COUNT(*) AS count FROM platform_staff_assignments`, {}, { fallbackOnMissingTable: true }),
    countRows(`SELECT COUNT(*) AS count FROM servers`, {}, { fallbackOnMissingTable: true }),
    countRows(`SELECT COUNT(*) AS count FROM memberships`, {}, { fallbackOnMissingTable: true }),
    countRows(`SELECT COUNT(*) AS count FROM friendships`, {}, { fallbackOnMissingTable: true }),
    countRows(`SELECT COUNT(*) AS count FROM social_dm_threads`, {}, { fallbackOnMissingTable: true }),
    countRows(`SELECT COUNT(*) AS count FROM social_dm_messages`, {}, { fallbackOnMissingTable: true }),
    countRows(`SELECT COUNT(*) AS count FROM social_dm_attachments`, {}, { fallbackOnMissingTable: true }),
    countRows(
      `SELECT COUNT(*) AS count FROM blog_posts WHERE status='published' AND published_at IS NOT NULL`,
      {},
      { fallbackOnMissingTable: true },
    ),
    countRows(
      `SELECT COUNT(*) AS count FROM blog_posts WHERE status<>'published' OR published_at IS NULL`,
      {},
      { fallbackOnMissingTable: true },
    ),
    countRows(
      `SELECT COUNT(*) AS count
       FROM admin_boost_grants
       WHERE revoked_at IS NULL
         AND (expires_at IS NULL OR expires_at > NOW())`,
      {},
      { fallbackOnMissingTable: true },
    ),
    countIfTableExists(
      "invites",
      `SELECT COUNT(*) AS count
       FROM invites
       WHERE expires_at IS NULL OR expires_at > NOW()`,
    ),
    countIfTableExists(
      "user_badges",
      `SELECT COUNT(*) AS count
       FROM user_badges
       WHERE badge='boost'`,
    ),
    countIfTableExists(
      "user_subscriptions",
      `SELECT COUNT(DISTINCT user_id) AS count
       FROM user_subscriptions
       WHERE status IN ('active','trialing','past_due')`,
    ),
    countIfTableExists("badge_definitions"),
    countIfTableExists("support_tickets"),
    countIfTableExists(
      "support_tickets",
      `SELECT COUNT(*) AS count
       FROM support_tickets
       WHERE status IN ('open','waiting_on_staff','waiting_on_user')`,
    ),
    readUserCountOffset(),
  ]);

  const usersWithOffset = users + userCountOffset;

  return {
    users: usersWithOffset,
    usersBase: users,
    usersFileOffset: userCountOffset,
    bannedUsers,
    refreshSessions,
    activeRefreshSessions,
    platformAdmins,
    staffAssignments,
    servers,
    memberships,
    friendships,
    socialDmThreads,
    socialDmMessages,
    socialDmAttachments,
    publishedBlogs,
    draftBlogs,
    boostGrantsActive,
    activeInvites,
    boostBadgeMembers,
    boostStripeMembers,
    badgeDefinitions,
    supportTicketsTotal,
    supportTicketsOpen,
  };
}

async function computeHeavyStats(): Promise<HeavyStatsSnapshot> {
  const [database, storage] = await Promise.all([
    collectDatabaseStats(),
    collectStorageStats(),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    database,
    storage,
  };
}

async function getHeavyStats() {
  if (cachedHeavyStats && cachedHeavyStats.expiresAt > Date.now()) {
    return cachedHeavyStats.value;
  }

  if (!heavyStatsPromise) {
    heavyStatsPromise = computeHeavyStats()
      .then((value) => {
        cachedHeavyStats = {
          expiresAt: Date.now() + HEAVY_STATS_TTL_MS,
          value,
        };
        return value;
      })
      .finally(() => {
        heavyStatsPromise = null;
      });
  }

  return heavyStatsPromise;
}

export function beginTrackedRequest() {
  inFlightRequests += 1;
  return process.hrtime.bigint();
}

export function recordTrackedRequest(input: {
  startNs: bigint;
  method: string;
  route: string;
  statusCode: number;
}) {
  const durationMs = Number(process.hrtime.bigint() - input.startNs) / 1_000_000;
  const normalizedDurationMs = Math.max(0, durationMs);
  const method = String(input.method || "GET").toUpperCase();
  const route = String(input.route || "/unknown");
  const key = `${method} ${route}`;

  inFlightRequests = Math.max(0, inFlightRequests - 1);
  totalRequestCount += 1;
  totalDurationMs += normalizedDurationMs;
  maxDurationMs = Math.max(maxDurationMs, normalizedDurationMs);
  boundedPush(globalDurationSamples, normalizedDurationMs, GLOBAL_SAMPLE_LIMIT);

  if (input.statusCode >= 500) globalStatusCounts.serverError += 1;
  else if (input.statusCode >= 400) globalStatusCounts.clientError += 1;
  else if (input.statusCode >= 300) globalStatusCounts.redirect += 1;
  else globalStatusCounts.success += 1;

  const current =
    requestMetricsByRoute.get(key) ||
    {
      key,
      method,
      route,
      count: 0,
      totalDurationMs: 0,
      maxDurationMs: 0,
      lastDurationMs: 0,
      errorCount: 0,
      lastStatus: 0,
      lastSeenAt: null,
      samples: [],
    };

  current.count += 1;
  current.totalDurationMs += normalizedDurationMs;
  current.maxDurationMs = Math.max(current.maxDurationMs, normalizedDurationMs);
  current.lastDurationMs = normalizedDurationMs;
  current.lastStatus = input.statusCode;
  current.lastSeenAt = new Date().toISOString();
  if (input.statusCode >= 400) current.errorCount += 1;
  boundedPush(current.samples, normalizedDurationMs, ROUTE_SAMPLE_LIMIT);
  requestMetricsByRoute.set(key, current);
}

function buildRequestStatsSnapshot() {
  const routes = Array.from(requestMetricsByRoute.values()).map((metric) => {
    const avgMs = metric.count ? metric.totalDurationMs / metric.count : 0;
    const p95Ms = percentile(metric.samples, 95);
    const errorRate = metric.count ? metric.errorCount / metric.count : 0;
    return {
      key: metric.key,
      method: metric.method,
      route: metric.route,
      count: metric.count,
      avgMs: roundMetric(avgMs),
      p95Ms: roundMetric(p95Ms),
      maxMs: roundMetric(metric.maxDurationMs),
      lastMs: roundMetric(metric.lastDurationMs),
      errorCount: metric.errorCount,
      errorRate: roundMetric(errorRate * 100),
      lastStatus: metric.lastStatus,
      lastSeenAt: metric.lastSeenAt,
    };
  });

  return {
    startedAt: new Date(serviceStartedAt).toISOString(),
    uptimeSec: roundMetric(process.uptime(), 1),
    inFlight: inFlightRequests,
    totalCount: totalRequestCount,
    avgMs: roundMetric(totalRequestCount ? totalDurationMs / totalRequestCount : 0),
    p95Ms: roundMetric(percentile(globalDurationSamples, 95)),
    maxMs: roundMetric(maxDurationMs),
    recentSampleSize: globalDurationSamples.length,
    routeCount: routes.length,
    statusCounts: { ...globalStatusCounts },
    slowestRoutes: routes
      .filter((route) => route.count > 0)
      .sort((left, right) => {
        if (right.avgMs !== left.avgMs) return right.avgMs - left.avgMs;
        return right.p95Ms - left.p95Ms;
      })
      .slice(0, 8),
    busiestRoutes: routes
      .filter((route) => route.count > 0)
      .sort((left, right) => {
        if (right.count !== left.count) return right.count - left.count;
        return right.avgMs - left.avgMs;
      })
      .slice(0, 8),
    errorRoutes: routes
      .filter((route) => route.errorCount > 0)
      .sort((left, right) => {
        if (right.errorCount !== left.errorCount) {
          return right.errorCount - left.errorCount;
        }
        return right.errorRate - left.errorRate;
      })
      .slice(0, 8),
  };
}

function buildRuntimeSnapshot() {
  const memory = process.memoryUsage();
  const totalSystemMemory = os.totalmem();
  const freeSystemMemory = os.freemem();
  const systemUsedMemory = Math.max(0, totalSystemMemory - freeSystemMemory);

  return {
    service: {
      startedAt: new Date(serviceStartedAt).toISOString(),
      uptimeSec: roundMetric(process.uptime(), 1),
      pid: process.pid,
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      hostname: os.hostname(),
      cpuCount: os.cpus().length,
      loadAverage: os.loadavg().map((value) => roundMetric(value, 2)),
      memory: {
        rssBytes: Number(memory.rss || 0),
        heapUsedBytes: Number(memory.heapUsed || 0),
        heapTotalBytes: Number(memory.heapTotal || 0),
        externalBytes: Number(memory.external || 0),
        arrayBuffersBytes: Number(memory.arrayBuffers || 0),
        systemTotalBytes: Number(totalSystemMemory || 0),
        systemFreeBytes: Number(freeSystemMemory || 0),
        systemUsedBytes: Number(systemUsedMemory || 0),
      },
    },
  };
}

function formatDeploymentProvider(value: string | undefined) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  const normalized = trimmed.toLowerCase();
  if (normalized === "aws" || normalized === "amazon" || normalized === "amazon web services") {
    return "AWS";
  }
  if (normalized === "self-hosted" || normalized === "selfhosted") {
    return "Self-hosted";
  }
  return trimmed
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function inferDeploymentProvider() {
  const configured = formatDeploymentProvider(env.DEPLOYMENT_PROVIDER);
  if (configured) return configured;

  const dbHost = String(env.DB_HOST || "").toLowerCase();
  const endpoint = String(env.S3_ENDPOINT || "").toLowerCase();
  const gcsProject = String(env.GCS_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || "").toLowerCase();
  if (
    dbHost.includes("amazonaws.com") ||
    endpoint.includes("amazonaws.com") ||
    process.env.AWS_REGION ||
    process.env.AWS_DEFAULT_REGION
  ) {
    return "AWS";
  }
  if (
    dbHost.includes("googleusercontent.com") ||
    dbHost.includes("cloudsql") ||
    env.STORAGE_PROVIDER === "gcs" ||
    !!gcsProject
  ) {
    return "GCP";
  }

  return "Self-hosted";
}

function classifyDatabaseProvider(host: string) {
  const normalizedHost = String(host || "").trim().toLowerCase();
  if (!normalizedHost) return "MySQL";
  if (normalizedHost.includes("googleusercontent.com") || normalizedHost.includes("cloudsql")) {
    return "Cloud SQL";
  }
  if (normalizedHost.includes("rds.amazonaws.com")) return "Amazon RDS";
  if (normalizedHost.includes("amazonaws.com")) return "AWS-managed MySQL";
  return "MySQL";
}

function classifyStorageProvider() {
  if (env.STORAGE_PROVIDER === "gcs") return "Google Cloud Storage";
  if (env.STORAGE_PROVIDER === "cdn") return "OpenCom CDN";
  if (env.STORAGE_PROVIDER !== "s3") return "Local filesystem";
  if (String(env.S3_ENDPOINT || "").toLowerCase().includes("amazonaws.com")) {
    return "Amazon S3";
  }
  return "S3-compatible object storage";
}

function inferComputeClass(provider: string) {
  const configured = String(env.DEPLOYMENT_COMPUTE_CLASS || "").trim();
  if (configured) return configured.toUpperCase();
  if (provider === "AWS") return "EC2";
  return "VM";
}

function inferOperatingSystem() {
  const configured = String(env.DEPLOYMENT_OS_NAME || "").trim();
  if (configured) return configured;

  try {
    const raw = readFileSync("/etc/os-release", "utf8");
    const match = raw.match(/^PRETTY_NAME="?([^"\n]+)"?/m);
    if (match?.[1]) return match[1].trim();
  } catch {
    // Fall back to runtime platform metadata below.
  }

  const version = String(typeof os.version === "function" ? os.version() : "").trim();
  if (version) return version;

  const platform = String(os.platform() || "linux").trim();
  return platform ? platform.charAt(0).toUpperCase() + platform.slice(1) : "Linux";
}

function buildInfrastructureSnapshot() {
  const provider = inferDeploymentProvider();
  const computeClass = inferComputeClass(provider);
  const operatingSystem = inferOperatingSystem();
  const region =
    env.DEPLOYMENT_REGION ||
    env.S3_REGION ||
    process.env.AWS_REGION ||
    process.env.AWS_DEFAULT_REGION ||
    null;
  const databaseProvider = classifyDatabaseProvider(env.DB_HOST);
  const storageProvider = classifyStorageProvider();

  return {
    provider,
    computeClass,
    region,
    stackName: env.DEPLOYMENT_STACK_NAME || null,
    environment: env.NODE_ENV,
    operatingSystem,
    appBaseUrl: env.APP_BASE_URL,
    supportBaseUrl: env.SUPPORT_BASE_URL,
    runtimeHost: os.hostname(),
    database: {
      provider: databaseProvider,
      host: env.DB_HOST,
      port: env.DB_PORT,
      name: env.DB_NAME,
    },
    storage: {
      provider: storageProvider,
      mode: env.STORAGE_PROVIDER,
      bucket: env.STORAGE_PROVIDER === "local" ? null : env.CORE_STORAGE_BUCKET || env.CORE_S3_BUCKET || null,
      region: env.S3_REGION || region,
      endpoint: env.S3_ENDPOINT || null,
    },
  };
}

export async function getAdminStatsSnapshot() {
  const heavy = await getHeavyStats();
  const runtime = buildRuntimeSnapshot();
  const requests = buildRequestStatsSnapshot();
  const infrastructure = buildInfrastructureSnapshot();

  return {
    generatedAt: new Date().toISOString(),
    ...runtime,
    infrastructure,
    requests,
    database: heavy.database,
    storage: heavy.storage,
  };
}
