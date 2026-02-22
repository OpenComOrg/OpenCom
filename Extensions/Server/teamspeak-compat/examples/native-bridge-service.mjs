#!/usr/bin/env node

import http from "node:http";

const port = Number(process.env.TS_NATIVE_BRIDGE_PORT || 3790);
const authToken = String(process.env.TS_NATIVE_BRIDGE_TOKEN || "").trim();
const maxBodyBytes = 512 * 1024;

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload || {});
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBodyBytes) {
        reject(new Error("PAYLOAD_TOO_LARGE"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        const parsed = text ? JSON.parse(text) : {};
        resolve(parsed && typeof parsed === "object" ? parsed : {});
      } catch {
        reject(new Error("INVALID_JSON"));
      }
    });
    req.on("error", reject);
  });
}

function requireAuth(req) {
  if (!authToken) return true;
  const header = String(req.headers.authorization || "");
  if (!header.startsWith("Bearer ")) return false;
  const provided = header.slice(7).trim();
  return provided === authToken;
}

function defaultExecuteHandler(payload) {
  const commandName = String(payload?.command?.name || payload?.commandName || "").trim().toLowerCase();
  const username = String(payload?.context?.username || payload?.context?.userId || "unknown");
  const args = payload?.args && typeof payload.args === "object" ? payload.args : {};

  if (commandName === "native-ping") {
    const message = String(args.message || payload?.message || "").trim();
    return { content: message ? `native-pong ${message}` : "native-pong" };
  }

  if (commandName === "whoami") {
    return { content: `bridge-user=${username}` };
  }

  return {
    content: `Bridge executed '${commandName || "unknown"}' for ${username}`,
    result: {
      commandName,
      args
    }
  };
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/healthz") {
      return sendJson(res, 200, { ok: true, service: "ts-native-bridge" });
    }

    if (req.method === "POST" && req.url === "/v1/execute") {
      if (!requireAuth(req)) {
        return sendJson(res, 401, { error: "UNAUTHORIZED" });
      }
      const payload = await parseJsonBody(req);
      return sendJson(res, 200, defaultExecuteHandler(payload));
    }

    return sendJson(res, 404, { error: "NOT_FOUND" });
  } catch (error) {
    if (error?.message === "INVALID_JSON") {
      return sendJson(res, 400, { error: "INVALID_JSON" });
    }
    if (error?.message === "PAYLOAD_TOO_LARGE") {
      return sendJson(res, 413, { error: "PAYLOAD_TOO_LARGE" });
    }
    return sendJson(res, 500, { error: "INTERNAL_ERROR" });
  }
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(
    `[ts-native-bridge] listening on http://127.0.0.1:${port}\n`
  );
});
