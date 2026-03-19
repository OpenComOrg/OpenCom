import { FastifyInstance } from "fastify";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../env.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../../../../");

const DOWNLOAD_FILE_MAP: Record<string, string> = {
  "opencom.apk": "OpenCom.apk",
  "opencom.exe": "OpenCom.exe",
  "opencom.deb": "OpenCom.deb",
  "opencom.snap": "OpenCom.snap",
  "opencom.tar.gz": "OpenCom.tar.gz",
  "desktop-release-manifest.json": "desktop-release-manifest.json",
  "linux-release-manifest.json": "linux-release-manifest.json",
  "linux-release.sha256": "linux-release.sha256",
};

const DESKTOP_RELEASE_ARTIFACTS = [
  { platform: "win32", kind: "nsis", fileName: "OpenCom.exe" },
  { platform: "linux", kind: "deb", fileName: "OpenCom.deb" },
  { platform: "linux", kind: "snap", fileName: "OpenCom.snap" },
  { platform: "linux", kind: "tarball", fileName: "OpenCom.tar.gz" },
] as const;

const MIME_BY_EXT: Record<string, string> = {
  ".apk": "application/vnd.android.package-archive",
  ".deb": "application/vnd.debian.binary-package",
  ".exe": "application/octet-stream",
  ".gz": "application/gzip",
  ".json": "application/json; charset=utf-8",
  ".sha256": "text/plain; charset=utf-8",
  ".snap": "application/octet-stream",
};

const desktopLatestQuerySchema = z.object({
  platform: z.string().trim().min(1).max(32).optional(),
  arch: z.string().trim().min(1).max(32).optional(),
  currentVersion: z.string().trim().min(1).max(64).optional(),
});

function resolveDownloadsBaseDir() {
  const configured = String(env.DOWNLOADS_STORAGE_DIR || "").trim();
  if (!configured) {
    return path.resolve(repoRoot, "frontend/public/downloads");
  }
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
  const exact = Object.values(DOWNLOAD_FILE_MAP).find((name) => name === normalized);
  return exact || null;
}

function compareVersionStrings(a = "", b = "") {
  const left = String(a || "")
    .split(/[^0-9]+/)
    .filter(Boolean)
    .map((part) => Number(part));
  const right = String(b || "")
    .split(/[^0-9]+/)
    .filter(Boolean)
    .map((part) => Number(part));
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (left[index] || 0) - (right[index] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function getRequestOrigin(req: any) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim();
  const forwardedHost = String(req.headers["x-forwarded-host"] || "")
    .split(",")[0]
    .trim();
  const host = forwardedHost || String(req.headers.host || "").split(",")[0].trim();
  if (!host) return "";
  const protocol = forwardedProto || req.protocol || "https";
  return `${protocol}://${host}`;
}

function safeJoinDownloadFile(baseDir: string, fileName: string) {
  const target = path.resolve(baseDir, fileName);
  return target.startsWith(baseDir) ? target : "";
}

function loadDesktopPackageMetadata() {
  const packageJsonPath = path.join(repoRoot, "client", "package.json");
  try {
    const raw = fs.readFileSync(packageJsonPath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      version: typeof parsed?.version === "string" ? parsed.version.trim() : "",
      productName:
        typeof parsed?.build?.productName === "string" && parsed.build.productName.trim()
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
      platform: artifact.platform,
      kind: artifact.kind,
      fileName: artifact.fileName,
      size: stat.size,
      downloadPath,
      downloadUrl: origin ? `${origin}${downloadPath}` : downloadPath,
    });
  }

  return artifacts;
}

function pickPreferredDesktopArtifact(platform = "", artifacts: Array<{
  platform: string;
  kind: string;
  fileName: string;
  size: number;
  downloadPath: string;
  downloadUrl: string;
}>) {
  const normalizedPlatform = String(platform || "").trim().toLowerCase();
  if (normalizedPlatform === "win32" || normalizedPlatform === "windows") {
    return artifacts.find((artifact) => artifact.platform === "win32") || null;
  }
  if (normalizedPlatform === "linux") {
    return (
      artifacts.find((artifact) => artifact.platform === "linux" && artifact.kind === "deb") ||
      artifacts.find((artifact) => artifact.platform === "linux" && artifact.kind === "snap") ||
      artifacts.find((artifact) => artifact.platform === "linux" && artifact.kind === "tarball") ||
      null
    );
  }
  if (normalizedPlatform === "darwin" || normalizedPlatform === "mac" || normalizedPlatform === "macos") {
    return null;
  }
  return artifacts[0] || null;
}

export async function downloadRoutes(app: FastifyInstance) {
  app.get("/downloads/desktop/latest", async (req: any) => {
    const query = desktopLatestQuerySchema.parse(req.query || {});
    const baseDir = resolveDownloadsBaseDir();
    const origin = getRequestOrigin(req);
    const packageMetadata = loadDesktopPackageMetadata();
    const artifacts = listAvailableDesktopArtifacts(baseDir, origin);
    const artifact = pickPreferredDesktopArtifact(query.platform || "", artifacts);
    const currentVersion = String(query.currentVersion || "").trim();
    const latestVersion = packageMetadata.version || "";
    const updateAvailable = Boolean(
      artifact &&
        latestVersion &&
        (!currentVersion || compareVersionStrings(latestVersion, currentVersion) > 0),
    );

    return {
      ok: Boolean(artifact && latestVersion),
      checkedAt: new Date().toISOString(),
      productName: packageMetadata.productName,
      platform: query.platform || null,
      arch: query.arch || null,
      currentVersion: currentVersion || null,
      latestVersion: latestVersion || null,
      updateAvailable,
      artifact,
      availableArtifacts: artifacts,
    };
  });

  app.get("/downloads/:filename", async (req: any, rep) => {
    const { filename } = z.object({ filename: z.string().min(1).max(120) }).parse(req.params);
    const mappedName = resolveDownloadFilename(filename);
    if (!mappedName) return rep.code(404).send({ error: "NOT_FOUND" });

    const baseDir = resolveDownloadsBaseDir();
    const resolved = safeJoinDownloadFile(baseDir, mappedName);
    if (!resolved) return rep.code(403).send({ error: "FORBIDDEN" });
    if (!fs.existsSync(resolved)) return rep.code(404).send({ error: "NOT_FOUND" });

    const stat = fs.statSync(resolved);
    const contentType =
      MIME_BY_EXT[path.extname(mappedName).toLowerCase()] || "application/octet-stream";
    rep.header("Content-Type", contentType);
    rep.header("Content-Length", String(stat.size));
    rep.header("Cache-Control", "public, max-age=600");
    rep.header("Content-Disposition", `attachment; filename="${mappedName}"`);
    return rep.send(fs.createReadStream(resolved));
  });
}
