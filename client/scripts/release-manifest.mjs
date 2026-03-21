import crypto from "node:crypto";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const clientDir = path.resolve(__dirname, "..");
export const distDir = path.join(clientDir, "dist");
export const packageJsonPath = path.join(clientDir, "package.json");
export const linuxPackagingPath = path.join(clientDir, "packaging", "linux.json");
export const linuxReleaseManifestPath = path.join(distDir, "linux-release-manifest.json");
export const linuxReleaseChecksumsPath = path.join(distDir, "linux-release.sha256");

const LINUX_ARTIFACTS = [
  { kind: "tarball", fileName: "OpenCom.tar.gz", required: true },
  { kind: "deb", fileName: "OpenCom.deb", required: false },
  { kind: "rpm", fileName: "OpenCom.rpm", required: false },
  { kind: "snap", fileName: "OpenCom.snap", required: false }
];

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fsSync.createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

export async function loadClientPackageMetadata() {
  return readJson(packageJsonPath);
}

export async function loadLinuxPackagingConfig() {
  return readJson(linuxPackagingPath);
}

export async function collectLinuxArtifacts() {
  const artifacts = [];
  for (const artifact of LINUX_ARTIFACTS) {
    const absolutePath = path.join(distDir, artifact.fileName);
    try {
      const stat = await fs.stat(absolutePath);
      artifacts.push({
        kind: artifact.kind,
        fileName: artifact.fileName,
        absolutePath,
        relativePath: path.relative(clientDir, absolutePath),
        size: stat.size,
        sha256: await sha256File(absolutePath),
        required: artifact.required
      });
    } catch (error) {
      if (artifact.required) {
        throw new Error(`${artifact.fileName} was not found in client/dist.`);
      }
    }
  }
  return artifacts;
}

function normalizeBaseUrl(value = "") {
  return String(value || "").trim().replace(/\/+$/, "");
}

function buildArtifactSourceUrl(baseUrl, fileName) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  if (!normalizedBaseUrl) return "";
  return `${normalizedBaseUrl}/${encodeURIComponent(fileName)}`;
}

export async function createLinuxReleaseManifest() {
  const [pkg, packaging, artifacts] = await Promise.all([
    loadClientPackageMetadata(),
    loadLinuxPackagingConfig(),
    collectLinuxArtifacts()
  ]);

  const tarballArtifact = artifacts.find((artifact) => artifact.kind === "tarball");
  if (!tarballArtifact) throw new Error("OpenCom.tar.gz is required for Linux release metadata.");

  return {
    generatedAt: new Date().toISOString(),
    name: pkg.name,
    version: pkg.version,
    description: pkg.description,
    homepage: pkg.homepage,
    productName: pkg.build?.productName || packaging.desktopName || "OpenCom",
    releaseBaseUrl: normalizeBaseUrl(packaging.releaseBaseUrl || `${pkg.homepage || ""}/downloads`),
    artifacts: artifacts.map((artifact) => ({
      kind: artifact.kind,
      fileName: artifact.fileName,
      relativePath: artifact.relativePath,
      size: artifact.size,
      sha256: artifact.sha256
    })),
    aur: {
      packageName: packaging.aurPackageName,
      pkgrel: Number(packaging.aurPackageRelease || 1),
      architectures: Array.isArray(packaging.architectures) ? packaging.architectures : ["x86_64"],
      sourceUrl: buildArtifactSourceUrl(
        packaging.releaseBaseUrl || `${pkg.homepage || ""}/downloads`,
        packaging.releaseFileName || tarballArtifact.fileName
      ),
      tarballFileName: packaging.releaseFileName || tarballArtifact.fileName,
      tarballSha256: tarballArtifact.sha256
    }
  };
}

export async function writeLinuxReleaseManifest() {
  const manifest = await createLinuxReleaseManifest();
  await fs.mkdir(distDir, { recursive: true });
  await fs.writeFile(
    linuxReleaseManifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );

  const checksumLines = manifest.artifacts
    .map((artifact) => `${artifact.sha256}  ${artifact.fileName}`)
    .join("\n");
  await fs.writeFile(
    linuxReleaseChecksumsPath,
    checksumLines ? `${checksumLines}\n` : "",
    "utf8"
  );

  return manifest;
}
