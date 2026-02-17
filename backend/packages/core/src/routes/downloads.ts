import { FastifyInstance } from "fastify";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { env } from "../env.js";

const DOWNLOAD_FILE_MAP: Record<string, string> = {
  "opencom.exe": "OpenCom.exe",
  "opencom.deb": "OpenCom.deb",
  "opencom.tar.gz": "OpenCom.tar.gz"
};

const MIME_BY_EXT: Record<string, string> = {
  ".exe": "application/octet-stream",
  ".deb": "application/vnd.debian.binary-package",
  ".gz": "application/gzip"
};

function resolveDownloadFilename(requested: string): string | null {
  const normalized = String(requested || "").trim();
  if (!normalized) return null;
  if (DOWNLOAD_FILE_MAP[normalized.toLowerCase()]) return DOWNLOAD_FILE_MAP[normalized.toLowerCase()];
  const exact = Object.values(DOWNLOAD_FILE_MAP).find((name) => name === normalized);
  return exact || null;
}

export async function downloadRoutes(app: FastifyInstance) {
  app.get("/downloads/:filename", async (req: any, rep) => {
    const { filename } = z.object({ filename: z.string().min(1).max(120) }).parse(req.params);
    const mappedName = resolveDownloadFilename(filename);
    if (!mappedName) return rep.code(404).send({ error: "NOT_FOUND" });

    const baseDir = path.resolve(process.cwd(), env.DOWNLOADS_STORAGE_DIR);
    const filePath = path.join(baseDir, mappedName);
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(baseDir)) return rep.code(403).send({ error: "FORBIDDEN" });
    if (!fs.existsSync(resolved)) return rep.code(404).send({ error: "NOT_FOUND" });

    const stat = fs.statSync(resolved);
    const contentType = MIME_BY_EXT[path.extname(mappedName).toLowerCase()] || "application/octet-stream";
    rep.header("Content-Type", contentType);
    rep.header("Content-Length", String(stat.size));
    rep.header("Cache-Control", "public, max-age=600");
    rep.header("Content-Disposition", `attachment; filename="${mappedName}"`);
    return rep.send(fs.createReadStream(resolved));
  });
}
