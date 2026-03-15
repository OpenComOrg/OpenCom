import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { ZodError } from "zod";
import { env } from "./env.js";
import fs from "node:fs";
import path from "node:path";

const MAX_IMAGE_BYTES = 25 * 1024 * 1024; // 25MB for raw image uploads
const MAX_MULTIPART_BYTES = Math.max(
  MAX_IMAGE_BYTES,
  env.ATTACHMENT_MAX_BYTES,
  env.ATTACHMENT_BOOST_MAX_BYTES
);

export function buildHttp() {
  const app = Fastify({
    logger: { level: env.CORE_LOG_LEVEL },
    bodyLimit: MAX_MULTIPART_BYTES,
    disableRequestLogging: true
  });

  app.register(cors, { origin: true, credentials: true });
  app.register(rateLimit, { max: 240, timeWindow: "1 minute" });
  app.addContentTypeParser(
    ["application/octet-stream", "application/offset+octet-stream"],
    (req, payload, done) => {
      done(null, payload);
    }
  );
  app.register(multipart, { limits: { fileSize: MAX_MULTIPART_BYTES } });

  app.register(jwt, { secret: env.CORE_JWT_ACCESS_SECRET });

  app.addHook("onResponse", async (req, rep) => {
    if (rep.statusCode >= 500) {
      writeCoreLogLine(`[${new Date().toISOString()}] [ERROR] [core-http] ${req.method} ${req.url} -> ${rep.statusCode}`);
      return;
    }
    if (rep.statusCode >= 400) {
      writeCoreLogLine(`[${new Date().toISOString()}] [WARN] [core-http] ${req.method} ${req.url} -> ${rep.statusCode}`);
    }
  });

  app.setErrorHandler((error, req, rep) => {
    if (error instanceof ZodError) {
      return rep.code(400).send({ error: "VALIDATION_ERROR", issues: error.issues });
    }
    const message = error instanceof Error ? error.message : "";
    if (message === "INVALID_JSON_BODY") {
      return rep.code(400).send({ error: "INVALID_JSON_BODY" });
    }

    req.log.error({ err: error }, "Unhandled request error");
    writeCoreLogLine(`[${new Date().toISOString()}] [ERROR] [core-http] ${req.method} ${req.url} ${message || "UNKNOWN_ERROR"}`);
    return rep.code(500).send({ error: "INTERNAL_SERVER_ERROR" });
  });

  // Note: refresh tokens use separate secret manually (not via plugin)
  app.get("/health", async () => ({ ok: true }));

  return app;
}

let coreLogDirReady = false;

function writeCoreLogLine(line: string) {
  if (!env.CORE_LOG_TO_FILE) return;
  try {
    if (!coreLogDirReady) {
      fs.mkdirSync(env.CORE_LOG_DIR, { recursive: true });
      coreLogDirReady = true;
    }
    const day = new Date().toISOString().slice(0, 10);
    const filePath = path.join(env.CORE_LOG_DIR, `core-${day}.log`);
    fs.appendFileSync(filePath, `${line}\n`, "utf8");
  } catch {
    // do not crash app on log sink errors
  }
}
