import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { env } from "./env.js";
import { createLogger } from "./logger.js";

const logger = createLogger("http");

export function buildHttp() {
  const app = Fastify({ logger: false, bodyLimit: 10 * 1024 * 1024, disableRequestLogging: true }); // 10MB limit
  app.register(cors, { origin: true, credentials: true });
  app.register(rateLimit, { max: 300, timeWindow: "1 minute" });

  if (env.DEBUG_HTTP) {
    app.addHook("onRequest", async (req) => {
      logger.debug("HTTP request", {
        method: req.method,
        url: req.url,
        reqId: req.id,
        userId: (req as any).user?.sub
      });
    });
    app.addHook("onResponse", async (req, rep) => {
      logger.debug("HTTP response", {
        method: req.method,
        url: req.url,
        reqId: req.id,
        statusCode: rep.statusCode
      });
    });
  }

  app.setErrorHandler((error, req, rep) => {
    logger.error("Unhandled HTTP error", error, {
      method: req.method,
      url: req.url,
      reqId: req.id,
      userId: (req as any).user?.sub
    });
    if (!rep.sent) rep.status(500).send({ error: "INTERNAL_SERVER_ERROR" });
  });

  return app;
}
