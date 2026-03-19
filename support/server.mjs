import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const port = Number(process.env.SUPPORT_PORT || process.env.PORT || 5174);
const host = process.env.SUPPORT_HOST || "0.0.0.0";

const MIME_BY_EXT = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};

function isAdminHost(rawHost = "") {
  const hostname = String(rawHost || "").split(":")[0].trim().toLowerCase();
  return hostname === "supadmin.opencom.online" || hostname.startsWith("supadmin.");
}

function normalizeRequestTarget(rawValue = "/") {
  let value = String(rawValue || "").trim();
  if (!value) return "/";

  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    try {
      const parsed = new URL(value);
      value = `${parsed.pathname || "/"}${parsed.search || ""}`;
    } catch {
      return "/";
    }
  }

  if (!value.startsWith("/")) value = `/${value}`;
  value = value.replace(/^\/{2,}/, "/");
  return value || "/";
}

function shouldServeHtmlNotFound(req, requestedPath = "") {
  const ext = path.extname(String(requestedPath || "")).toLowerCase();
  if (ext && ext !== ".html") return false;
  const accept = String(req.headers.accept || "").toLowerCase();
  if (!accept) return true;
  return accept.includes("text/html") || accept.includes("*/*");
}

async function serveNotFound(req, res) {
  if (!shouldServeHtmlNotFound(req, req.url || "")) {
    res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "NOT_FOUND" }));
    return;
  }

  try {
    const body = await fs.readFile(path.join(__dirname, "404.html"));
    res.writeHead(404, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    res.end("<h1>404</h1><p>Page not found.</p>");
  }
}

function resolveRequestFile(req) {
  const requestTarget = normalizeRequestTarget(req.url || "/");
  const url = new URL(requestTarget, `http://${req.headers.host || "localhost"}`);
  const pathname = decodeURIComponent(url.pathname || "/");

  if (pathname === "/health") return { kind: "health" };
  if (pathname === "/") {
    return { kind: "file", file: isAdminHost(req.headers.host) ? "admin.html" : "index.html" };
  }
  if (pathname === "/admin") return { kind: "file", file: "admin.html" };
  if (pathname === "/index") return { kind: "file", file: "index.html" };

  const cleaned = pathname.replace(/^\/+/, "");
  const target = path.resolve(__dirname, cleaned);
  if (!target.startsWith(__dirname)) return { kind: "forbidden" };
  return { kind: "path", filePath: target };
}

async function serveFile(filePath, req, res) {
  try {
    const stats = await fs.stat(filePath);
    if (stats.isDirectory()) {
      res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "DIRECTORY_NOT_ALLOWED" }));
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const body = await fs.readFile(filePath);
    res.writeHead(200, {
      "Content-Type": MIME_BY_EXT[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=3600",
    });
    res.end(body);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      await serveNotFound(req, res);
      return;
    }
    res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "INTERNAL_SERVER_ERROR" }));
  }
}

const server = http.createServer(async (req, res) => {
  const resolved = resolveRequestFile(req);

  if (resolved.kind === "health") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (resolved.kind === "forbidden") {
    res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "FORBIDDEN" }));
    return;
  }

  if (resolved.kind === "file") {
    await serveFile(path.join(__dirname, resolved.file), req, res);
    return;
  }

  await serveFile(resolved.filePath, req, res);
});

server.listen(port, host, () => {
  console.log(`OpenCom support portal running on http://${host}:${port}`);
});
