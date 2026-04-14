import { FastifyInstance } from "fastify";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../env.js";
import { q } from "../db.js";
import { getObjectStreamFromStorage, isS3StorageEnabled } from "../objectStorage.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../../../../");

// ─── Static file map (legacy / manually dropped builds) ───────────────────────
const DOWNLOAD_FILE_MAP: Record<string, string> = {
  "opencom.apk":                    "OpenCom.apk",
  "opencom.exe":                    "OpenCom.exe",
  "opencom.deb":                    "OpenCom.deb",
  "opencom.rpm":                    "OpenCom.rpm",
  "opencom.snap":                   "OpenCom.snap",
  "opencom.tar.gz":                 "OpenCom.tar.gz",
  "desktop-release-manifest.json":  "desktop-release-manifest.json",
  "linux-release-manifest.json":    "linux-release-manifest.json",
  "linux-release.sha256":           "linux-release.sha256",
};

const DESKTOP_RELEASE_ARTIFACTS = [
  { platform: "win32",  kind: "nsis",    fileName: "OpenCom.exe"    },
  { platform: "linux",  kind: "deb",     fileName: "OpenCom.deb"    },
  { platform: "linux",  kind: "rpm",     fileName: "OpenCom.rpm"    },
  { platform: "linux",  kind: "snap",    fileName: "OpenCom.snap"   },
  { platform: "linux",  kind: "tarball", fileName: "OpenCom.tar.gz" },
] as const;

const MIME_BY_EXT: Record<string, string> = {
  ".apk":    "application/vnd.android.package-archive",
  ".deb":    "application/vnd.debian.binary-package",
  ".exe":    "application/octet-stream",
  ".gz":     "application/gzip",
  ".json":   "application/json; charset=utf-8",
  ".rpm":    "application/x-rpm",
  ".sha256": "text/plain; charset=utf-8",
  ".snap":   "application/octet-stream",
};

// ─── DB client row shape ───────────────────────────────────────────────────────
type ClientRow = {
  id: string;
  type: string;
  version: string;
  channel: string;
  file_path: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  checksum_sha256: string | null;
  release_notes: string | null;
  created_at: string;
};

// ─── Zod schemas ──────────────────────────────────────────────────────────────
const desktopLatestQuerySchema = z.object({
  platform:       z.string().trim().min(1).max(32).optional(),
  arch:           z.string().trim().min(1).max(32).optional(),
  currentVersion: z.string().trim().min(1).max(64).optional(),
});

const clientVersionCheckSchema = z.object({
  platform:       z.enum(["windows", "linux_deb", "linux_rpm", "linux_snap", "linux_tar", "android", "ios", "macos"]),
  channel:        z.enum(["stable", "beta", "nightly"]).default("stable"),
  currentVersion: z.string().trim().min(1).max(64).optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function resolveDownloadsBaseDir() {
  const configured = String(env.DOWNLOADS_STORAGE_DIR || "").trim();
  if (!configured) return path.resolve(repoRoot, "frontend/public/downloads");
  if (path.isAbsolute(configured)) return configured;
  const cwdResolved = path.resolve(process.cwd(), configured);
  if (fs.existsSync(cwdResolved)) return cwdResolved;
  return path.resolve(repoRoot, configured);
}

function resolveDownloadFilename(requested: string): string | null {
  const normalized = String(requested || "").trim();
  if (!normalized) return null;
  if (DOWNLOAD_FILE_MAP[normalized.toLowerCase()]) {
    return DOWNLOAD_FILE_MAP[normalized.toLowerCase()];
  }
  return Object.values(DOWNLOAD_FILE_MAP).find((name) => name === normalized) || null;
}

function compareVersionStrings(a = "", b = "") {
  const left  = String(a || "").split(/[^0-9]+/).filter(Boolean).map(Number);
  const right = String(b || "").split(/[^0-9]+/).filter(Boolean).map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] || 0) - (right[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function getRequestOrigin(req: any) {
  const proto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const host  = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  if (!host) return "";
  return `${proto || req.protocol || "https"}://${host}`;
}

function safeJoinDownloadFile(baseDir: string, fileName: string) {
  const target = path.resolve(baseDir, fileName);
  return target.startsWith(baseDir) ? target : "";
}

function loadDesktopPackageMetadata() {
  const pkgPath = path.join(repoRoot, "client", "package.json");
  try {
    const parsed = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    return {
      version:     typeof parsed?.version === "string" ? parsed.version.trim() : "",
      productName: typeof parsed?.build?.productName === "string" && parsed.build.productName.trim()
        ? parsed.build.productName.trim()
        : "OpenCom",
    };
  } catch {
    return { version: "", productName: "OpenCom" };
  }
}

function listAvailableDesktopArtifacts(baseDir: string, origin = "") {
  const artifacts = [];
  for (const artifact of DESKTOP_RELEASE_ARTIFACTS) {
    const filePath = safeJoinDownloadFile(baseDir, artifact.fileName);
    if (!filePath || !fs.existsSync(filePath)) continue;
    const stat = fs.statSync(filePath);
    const downloadPath = `/downloads/${encodeURIComponent(artifact.fileName)}`;
    artifacts.push({
      platform:    artifact.platform,
      kind:        artifact.kind,
      fileName:    artifact.fileName,
      size:        stat.size,
      downloadPath,
      downloadUrl: origin ? `${origin}${downloadPath}` : downloadPath,
    });
  }
  return artifacts;
}

function pickPreferredDesktopArtifact(platform = "", artifacts: ReturnType<typeof listAvailableDesktopArtifacts>) {
  const p = platform.trim().toLowerCase();
  if (p === "win32" || p === "windows") {
    return artifacts.find((a) => a.platform === "win32") || null;
  }
  if (p === "linux") {
    return (
      artifacts.find((a) => a.platform === "linux" && a.kind === "deb")     ||
      artifacts.find((a) => a.platform === "linux" && a.kind === "rpm")     ||
      artifacts.find((a) => a.platform === "linux" && a.kind === "snap")    ||
      artifacts.find((a) => a.platform === "linux" && a.kind === "tarball") ||
      null
    );
  }
  if (p === "darwin" || p === "mac" || p === "macos") return null;
  return artifacts[0] || null;
}

function serializeClientRow(row: ClientRow, origin = "") {
  const downloadPath = `/v1/client/builds/${encodeURIComponent(row.id)}/download`;
  // Keep client build downloads behind the API proxy route rather than
  // surfacing any storage-backed URL that may exist in older DB rows.
  const downloadUrl = origin ? `${origin}${downloadPath}` : downloadPath;

  return {
    id:           row.id,
    type:         row.type,
    version:      row.version,
    channel:      row.channel,
    fileName:     row.file_name,
    mimeType:     row.mime_type,
    fileSize:     row.file_size,
    checksum:     row.checksum_sha256 ?? null,
    releaseNotes: row.release_notes ?? null,
    downloadUrl,
    publishedAt:  row.created_at,
  };
}

// ─── Routes ───────────────────────────────────────────────────────────────────
export async function downloadRoutes(app: FastifyInstance) {
  async function proxyIfConfigured(req: any, rep: any) {
    if (!env.DOWNLOADS_SERVICE_URL) return false;
    if (!env.DOWNLOADS_INTERNAL_TOKEN) {
      rep.code(503).send({ error: "DOWNLOADS_SERVICE_UNAVAILABLE" });
      return true;
    }
    try {
      const target = new URL(`${env.DOWNLOADS_SERVICE_URL.replace(/\/$/, "")}${req.raw.url || req.url || ""}`);
      const response = await fetch(target.toString(), {
        headers: {
          "x-core-internal-secret": env.DOWNLOADS_INTERNAL_TOKEN,
          "x-opencom-public-origin": getRequestOrigin(req),
        },
      });
      rep.code(response.status);
      for (const [key, value] of response.headers.entries()) {
        if (key.toLowerCase() === "transfer-encoding") continue;
        rep.header(key, value);
      }
      if (response.body) return rep.send(response.body);
      return rep.send(await response.arrayBuffer());
    } catch {
      rep.code(502).send({ error: "DOWNLOADS_PROXY_FAILED" });
      return true;
    }
  }

  // ── Legacy file-based latest check (reads from disk / package.json) ──────────
  app.get("/downloads/desktop/latest", async (req: any, rep) => {
    if (await proxyIfConfigured(req, rep)) return;
    const query   = desktopLatestQuerySchema.parse(req.query || {});
    const baseDir = resolveDownloadsBaseDir();
    const origin  = getRequestOrigin(req);
    const meta    = loadDesktopPackageMetadata();
    const artifacts = listAvailableDesktopArtifacts(baseDir, origin);
    const artifact  = pickPreferredDesktopArtifact(query.platform || "", artifacts);

    const currentVersion = String(query.currentVersion || "").trim();
    const latestVersion  = meta.version || "";
    const updateAvailable = Boolean(
      artifact &&
      latestVersion &&
      (!currentVersion || compareVersionStrings(latestVersion, currentVersion) > 0),
    );

    return {
      ok:                 Boolean(artifact && latestVersion),
      checkedAt:          new Date().toISOString(),
      productName:        meta.productName,
      platform:           query.platform || null,
      arch:               query.arch || null,
      currentVersion:     currentVersion || null,
      latestVersion:      latestVersion || null,
      updateAvailable,
      artifact,
      availableArtifacts: artifacts,
    };
  });

  // ── DB-backed version check — used by the desktop / mobile client ────────────
  // GET /v1/client/latest?platform=windows&channel=stable&currentVersion=1.0.0
  //
  // Returns the active build for the given platform+channel and whether an
  // update is available relative to the caller's currentVersion.
  app.get("/v1/client/latest", async (req: any, rep) => {
    if (await proxyIfConfigured(req, rep)) return;
    const queryParsed = clientVersionCheckSchema.safeParse(req.query || {});
    if (!queryParsed.success) {
      return rep.code(400).send({
        error:   "INVALID_QUERY",
        details: queryParsed.error.flatten().fieldErrors,
      });
    }

    const { platform, channel, currentVersion } = queryParsed.data;

    const rows = await q<ClientRow>(
      `SELECT id, type, version, channel, file_path, file_name, mime_type,
              file_size, checksum_sha256, release_notes, created_at
         FROM client
        WHERE type     = :platform
          AND channel  = :channel
          AND is_active = TRUE
        ORDER BY created_at DESC
        LIMIT 1`,
      { platform, channel },
    );

    if (!rows.length) {
      return rep.code(404).send({ error: "NO_BUILD_FOUND" });
    }

    const origin = getRequestOrigin(req);
    const latest = serializeClientRow(rows[0], origin);

    const updateAvailable = Boolean(
      currentVersion
        ? compareVersionStrings(latest.version, currentVersion) > 0
        : true,
    );

    return {
      ok:             true,
      checkedAt:      new Date().toISOString(),
      platform,
      channel,
      currentVersion: currentVersion || null,
      updateAvailable,
      latest,
    };
  });

  // ── DB-backed: list all active builds across every platform ─────────────────
  // GET /v1/client/builds?channel=stable
  app.get("/v1/client/builds", async (req: any, rep) => {
    if (await proxyIfConfigured(req, rep)) return;
    const { channel } = z
      .object({ channel: z.enum(["stable", "beta", "nightly"]).default("stable") })
      .parse(req.query || {});

    const origin = getRequestOrigin(req);

    // One row per platform, latest active build only
    const rows = await q<ClientRow>(
      `SELECT c.id, c.type, c.version, c.channel, c.file_path, c.file_name,
              c.mime_type, c.file_size, c.checksum_sha256, c.release_notes, c.created_at
         FROM client c
         INNER JOIN (
           SELECT type, MAX(created_at) AS latest_at
             FROM client
            WHERE channel   = :channel
              AND is_active = TRUE
            GROUP BY type
         ) newest ON newest.type = c.type AND newest.latest_at = c.created_at
        WHERE c.channel   = :channel
          AND c.is_active = TRUE
        ORDER BY c.type ASC`,
      { channel },
    );

    return {
      ok:      true,
      channel,
      builds:  rows.map((row) => serializeClientRow(row, origin)),
    };
  });

  app.get("/v1/client/builds/:clientId/download", async (req: any, rep) => {
    if (await proxyIfConfigured(req, rep)) return;
    const { clientId } = z
      .object({ clientId: z.string().min(1).max(64) })
      .parse(req.params);

    const rows = await q<ClientRow>(
      `SELECT id, type, version, channel, file_path, file_name, mime_type,
              file_size, checksum_sha256, release_notes, created_at
         FROM client
        WHERE id = :clientId
        LIMIT 1`,
      { clientId },
    );
    if (!rows.length) {
      return rep.code(404).send({ error: "NOT_FOUND" });
    }

    const row = rows[0];
    const relPath = String(row.file_path || "").trim().replace(/^\/+/, "");
    if (!relPath || relPath.includes("..")) {
      return rep.code(404).send({ error: "NOT_FOUND" });
    }

    rep.header("Content-Type", String(row.mime_type || "application/octet-stream"));
    if (Number.isFinite(Number(row.file_size)) && Number(row.file_size) > 0) {
      rep.header("Content-Length", String(Number(row.file_size)));
    }
    rep.header("Cache-Control", "public, max-age=600");
    rep.header(
      "Content-Disposition",
      `attachment; filename="${String(row.file_name || "OpenCom.bin").replace(/"/g, "")}"`,
    );

    if (isS3StorageEnabled()) {
      const objectStream = await getObjectStreamFromStorage("clients", relPath);
      if (objectStream) return rep.send(objectStream);
    }

    const absolutePath = path.resolve(env.PROFILE_IMAGE_STORAGE_DIR, relPath);
    const rootDir = path.resolve(env.PROFILE_IMAGE_STORAGE_DIR);
    if (!absolutePath.startsWith(rootDir + path.sep) && absolutePath !== rootDir) {
      return rep.code(403).send({ error: "FORBIDDEN" });
    }
    if (!fs.existsSync(absolutePath)) {
      return rep.code(404).send({ error: "NOT_FOUND" });
    }

    return rep.send(fs.createReadStream(absolutePath));
  });

  // ── Static file download (unchanged) ────────────────────────────────────────
  app.get("/downloads/:filename", async (req: any, rep) => {
    if (await proxyIfConfigured(req, rep)) return;
    const { filename } = z.object({ filename: z.string().min(1).max(120) }).parse(req.params);
    const mappedName   = resolveDownloadFilename(filename);
    if (!mappedName) return rep.code(404).send({ error: "NOT_FOUND" });

    const baseDir  = resolveDownloadsBaseDir();
    const resolved = safeJoinDownloadFile(baseDir, mappedName);
    if (!resolved)              return rep.code(403).send({ error: "FORBIDDEN" });
    if (!fs.existsSync(resolved)) return rep.code(404).send({ error: "NOT_FOUND" });

    const stat        = fs.statSync(resolved);
    const contentType = MIME_BY_EXT[path.extname(mappedName).toLowerCase()] || "application/octet-stream";
    rep.header("Content-Type",        contentType);
    rep.header("Content-Length",      String(stat.size));
    rep.header("Cache-Control",       "public, max-age=600");
    rep.header("Content-Disposition", `attachment; filename="${mappedName}"`);
    return rep.send(fs.createReadStream(resolved));
  });
}
