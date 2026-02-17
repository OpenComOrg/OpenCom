import { app, BrowserWindow, shell, ipcMain } from "electron";
import { createServer } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import log from "electron-log";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REMOTE_FALLBACK_URL = process.env.OPENCOM_APP_URL || "https://opencom.online";
const LOCAL_INDEX = path.join(__dirname, "web", "index.html");
const RPC_HOST = process.env.OPENCOM_RPC_HOST || "127.0.0.1";
const RPC_PORT = Number(process.env.OPENCOM_RPC_PORT || 6463);

let rpcServer = null;
const rpcAuthState = {
  accessToken: "",
  coreApi: ""
};

log.initialize();
log.transports.file.level = "info";

// Vesktop-style approach: thin shell that runs the web client with minimal desktop glue.
app.commandLine.appendSwitch("disable-features", "WidgetLayering");

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: "#141621",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });

  if (fs.existsSync(LOCAL_INDEX)) {
    mainWindow.loadFile(LOCAL_INDEX, { search: "desktop=1&route=%2Fapp" });
  } else {
    const url = new URL(REMOTE_FALLBACK_URL);
    url.pathname = "/app";
    url.searchParams.set("desktop", "1");
    mainWindow.loadURL(url.toString());
  }

  mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    shell.openExternal(targetUrl);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, targetUrl) => {
    const next = new URL(targetUrl);
    const isLocalApp = next.protocol === "file:";
    const isFallbackOrigin = (() => {
      try {
        return next.origin === new URL(REMOTE_FALLBACK_URL).origin;
      } catch {
        return false;
      }
    })();
    if (!isLocalApp && !isFallbackOrigin) {
      event.preventDefault();
      shell.openExternal(targetUrl);
    }
  });
}

function writeJson(rep, code, payload) {
  rep.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  rep.end(JSON.stringify(payload));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

async function forwardPresenceRpc(pathname, method, body = null) {
  if (!rpcAuthState.accessToken || !rpcAuthState.coreApi) return { ok: false, code: 503, payload: { error: "RPC_NOT_READY" } };
  const base = rpcAuthState.coreApi.replace(/\/$/, "");
  const url = `${base}${pathname}`;
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${rpcAuthState.accessToken}`,
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, code: response.status, payload: data || { error: `HTTP_${response.status}` } };
  return { ok: true, code: 200, payload: data };
}

function startLocalRpcBridge() {
  rpcServer = createServer(async (req, rep) => {
    try {
      const url = new URL(req.url || "/", `http://${RPC_HOST}:${RPC_PORT}`);

      if (req.method === "OPTIONS") {
        rep.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type"
        });
        rep.end();
        return;
      }

      if (url.pathname === "/rpc/health" && req.method === "GET") {
        writeJson(rep, 200, {
          ok: true,
          service: "opencom-rpc-bridge",
          ready: Boolean(rpcAuthState.accessToken && rpcAuthState.coreApi),
          coreApi: rpcAuthState.coreApi || null
        });
        return;
      }

      if (url.pathname === "/rpc/activity" && req.method === "POST") {
        const body = await readJson(req).catch(() => ({}));
        const result = await forwardPresenceRpc("/v1/presence/rpc", "POST", { activity: body?.activity ?? null });
        writeJson(rep, result.code, result.payload);
        return;
      }

      if (url.pathname === "/rpc/activity" && req.method === "DELETE") {
        const result = await forwardPresenceRpc("/v1/presence/rpc", "DELETE");
        writeJson(rep, result.code, result.payload);
        return;
      }

      writeJson(rep, 404, { error: "NOT_FOUND" });
    } catch (error) {
      log.error("RPC bridge error", error);
      writeJson(rep, 500, { error: "RPC_BRIDGE_ERROR" });
    }
  });

  rpcServer.listen(RPC_PORT, RPC_HOST, () => {
    log.info(`OpenCom RPC bridge listening on http://${RPC_HOST}:${RPC_PORT}`);
  });
}

ipcMain.on("rpc:auth", (_event, payload = {}) => {
  const accessToken = typeof payload.accessToken === "string" ? payload.accessToken.trim() : "";
  const coreApi = typeof payload.coreApi === "string" ? payload.coreApi.trim() : "";
  rpcAuthState.accessToken = accessToken;
  rpcAuthState.coreApi = coreApi;
});

ipcMain.handle("rpc:info", () => ({
  host: RPC_HOST,
  port: RPC_PORT,
  ready: Boolean(rpcAuthState.accessToken && rpcAuthState.coreApi)
}));

app.whenReady().then(() => {
  startLocalRpcBridge();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (rpcServer) {
    try { rpcServer.close(); } catch {}
    rpcServer = null;
  }
});
