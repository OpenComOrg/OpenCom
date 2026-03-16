import {
  app,
  BrowserWindow,
  Notification,
  dialog,
  shell,
  ipcMain,
  session,
  desktopCapturer,
} from "electron";
import { createServer } from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import log from "electron-log";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REMOTE_FALLBACK_URL = process.env.OPENCOM_APP_URL || "https://opencom.online";
const CORE_API_URL = process.env.OPENCOM_CORE_API_URL || "https://api.opencom.online";
const UPDATE_CHECK_URL =
  process.env.OPENCOM_UPDATE_CHECK_URL || "/downloads/desktop/latest";
const AUTO_UPDATE_CHECK_ENABLED =
  String(process.env.OPENCOM_DISABLE_AUTO_UPDATE_CHECK || "").trim() !== "1";
const LOCAL_INDEX = path.join(__dirname, "web", "index.html");
const LOCAL_ICON = path.join(__dirname, "web", "logo.png");
const RPC_HOST = process.env.OPENCOM_RPC_HOST || "127.0.0.1";
const RPC_PORT = Number(process.env.OPENCOM_RPC_PORT || 6483);

let rpcServer = null;
let mainWindow = null;
const rpcAuthState = {
  accessToken: "",
  coreApi: ""
};

const desktopUpdateState = {
  currentVersion: app.getVersion(),
  latestVersion: "",
  productName: "OpenCom",
  platform: process.platform,
  arch: process.arch,
  checking: false,
  checkedAt: "",
  updateAvailable: false,
  artifact: null,
  downloadedPath: "",
  lastAction: "idle",
  error: "",
  sourceUrl: ""
};

let autoUpdateCheckScheduled = false;

const SESSION_FILE_NAME = "data.json";

function getSessionFilePath() {
  const userDataDir = app.getPath("userData");
  return path.join(userDataDir, SESSION_FILE_NAME);
}

function getSessionKey() {
  return crypto
    .createHash("sha256")
    .update(`${app.getName()}::${app.getPath("userData")}::opencom-session`)
    .digest();
}

function obfuscateSession(payload) {
  const json = JSON.stringify(payload || {});
  const input = Buffer.from(json, "utf8");
  const key = getSessionKey();
  const out = Buffer.allocUnsafe(input.length);
  for (let i = 0; i < input.length; i += 1) out[i] = input[i] ^ key[i % key.length];
  return out.toString("base64");
}

function deobfuscateSession(raw) {
  const input = Buffer.from(String(raw || ""), "base64");
  if (!input.length) return {};
  const key = getSessionKey();
  const out = Buffer.allocUnsafe(input.length);
  for (let i = 0; i < input.length; i += 1) out[i] = input[i] ^ key[i % key.length];
  return JSON.parse(out.toString("utf8"));
}

function readDesktopSession() {
  try {
    const filePath = getSessionFilePath();
    if (!fs.existsSync(filePath)) return {};
    const encoded = fs.readFileSync(filePath, "utf8").trim();
    if (!encoded) return {};
    return deobfuscateSession(encoded);
  } catch (error) {
    log.warn("Failed reading desktop session", error);
    return {};
  }
}

function writeDesktopSession(session) {
  try {
    const filePath = getSessionFilePath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const encoded = obfuscateSession(session || {});
    fs.writeFileSync(filePath, encoded, "utf8");
    return true;
  } catch (error) {
    log.error("Failed writing desktop session", error);
    return false;
  }
}

function getDesktopUpdateState() {
  return {
    ...desktopUpdateState,
    artifact: desktopUpdateState.artifact
      ? { ...desktopUpdateState.artifact }
      : null,
  };
}

function setDesktopUpdateState(patch = {}) {
  Object.assign(desktopUpdateState, patch || {});
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

function resolveUrlAgainstBase(baseUrl, target) {
  const rawBase = String(baseUrl || "").trim();
  const rawTarget = String(target || "").trim();
  if (!rawTarget) return "";
  try {
    return new URL(rawTarget, rawBase || undefined).toString();
  } catch {
    return rawTarget;
  }
}

function resolveUpdateCheckUrl() {
  const explicit = String(UPDATE_CHECK_URL || "").trim();
  if (!explicit) return resolveUrlAgainstBase(CORE_API_URL, "/downloads/desktop/latest");
  if (/^https?:\/\//i.test(explicit)) return explicit;
  return resolveUrlAgainstBase(CORE_API_URL, explicit);
}

function isInstallableArtifact(fileName = "") {
  return /\.(exe|deb)$/i.test(String(fileName || "").trim());
}

function appendVersionToFileName(fileName = "", version = "") {
  const parsed = path.parse(String(fileName || "").trim() || "OpenCom-update");
  const normalizedVersion = String(version || "").trim().replace(/[^a-zA-Z0-9._-]+/g, "-");
  if (!normalizedVersion) return parsed.base || "OpenCom-update";
  return `${parsed.name}-${normalizedVersion}${parsed.ext || ""}`;
}

async function downloadUpdateArtifact(url, destinationPath, expectedSha256 = "") {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`UPDATE_DOWNLOAD_${response.status}`);
  }

  const payload = Buffer.from(await response.arrayBuffer());
  if (expectedSha256) {
    const digest = crypto.createHash("sha256").update(payload).digest("hex");
    if (digest.toLowerCase() !== String(expectedSha256).trim().toLowerCase()) {
      throw new Error("UPDATE_CHECKSUM_MISMATCH");
    }
  }

  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.writeFileSync(destinationPath, payload);
  return destinationPath;
}

function hasMatchingDownloadedUpdate(destinationPath, artifact = null) {
  if (!destinationPath || !artifact?.size) return false;
  try {
    const stat = fs.statSync(destinationPath);
    return stat.isFile() && stat.size === artifact.size;
  } catch {
    return false;
  }
}

async function fetchDesktopReleaseInfo() {
  const endpoint = new URL(resolveUpdateCheckUrl());
  endpoint.searchParams.set("platform", process.platform);
  endpoint.searchParams.set("arch", process.arch);
  endpoint.searchParams.set("currentVersion", app.getVersion());

  const response = await fetch(endpoint.toString(), {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`UPDATE_CHECK_${response.status}`);

  const payload = await response.json().catch(() => ({}));
  const artifact =
    payload?.artifact && typeof payload.artifact === "object"
      ? {
          ...payload.artifact,
          downloadUrl: resolveUrlAgainstBase(
            endpoint.toString(),
            payload.artifact.downloadUrl || payload.artifact.downloadPath || "",
          ),
        }
      : null;

  return {
    sourceUrl: endpoint.toString(),
    productName:
      typeof payload?.productName === "string" && payload.productName.trim()
        ? payload.productName.trim()
        : "OpenCom",
    latestVersion:
      typeof payload?.latestVersion === "string" ? payload.latestVersion.trim() : "",
    updateAvailable: Boolean(payload?.updateAvailable),
    checkedAt:
      typeof payload?.checkedAt === "string" && payload.checkedAt.trim()
        ? payload.checkedAt.trim()
        : new Date().toISOString(),
    artifact,
  };
}

async function installAvailableDesktopUpdate() {
  const state = getDesktopUpdateState();
  const artifact = state.artifact;
  if (!artifact?.downloadUrl) {
    return { ok: false, error: "NO_UPDATE_ARTIFACT" };
  }

  if (!isInstallableArtifact(artifact.fileName)) {
    await shell.openExternal(artifact.downloadUrl);
    setDesktopUpdateState({
      lastAction: "opened-download-url",
      error: "",
    });
    return { ok: true, mode: "external", url: artifact.downloadUrl };
  }

  const updateDir = path.join(app.getPath("downloads"), "OpenCom Updates");
  const destinationPath = path.join(
    updateDir,
    appendVersionToFileName(artifact.fileName, state.latestVersion || state.currentVersion),
  );

  try {
    setDesktopUpdateState({
      lastAction: "downloading",
      error: "",
    });

    if (!hasMatchingDownloadedUpdate(destinationPath, artifact)) {
      await downloadUpdateArtifact(
        artifact.downloadUrl,
        destinationPath,
        artifact.sha256 || "",
      );
    }

    setDesktopUpdateState({
      downloadedPath: destinationPath,
      lastAction: "downloaded",
      error: "",
    });

    const confirm = await dialog.showMessageBox({
      type: "info",
      buttons: ["Install now", "Later"],
      defaultId: 0,
      cancelId: 1,
      title: state.productName || "OpenCom",
      message: `${state.productName || "OpenCom"} ${state.latestVersion || ""} is ready to install`,
      detail:
        "Open the downloaded installer/package now. OpenCom may need to close before the update finishes.",
      noLink: true,
    });

    if (confirm.response !== 0) {
      setDesktopUpdateState({ lastAction: "awaiting-install" });
      return { ok: true, mode: "downloaded", path: destinationPath };
    }

    const openError = await shell.openPath(destinationPath);
    if (openError) throw new Error(openError);

    setDesktopUpdateState({
      lastAction: "installer-opened",
      error: "",
    });

    if (/\.exe$/i.test(destinationPath)) {
      setTimeout(() => app.quit(), 400);
    }

    return { ok: true, mode: "installer-opened", path: destinationPath };
  } catch (error) {
    const message = error?.message || String(error);
    setDesktopUpdateState({
      lastAction: "failed",
      error: message,
    });
    log.error("Desktop update install failed", error);
    throw error;
  }
}

async function promptForAvailableDesktopUpdate() {
  const state = getDesktopUpdateState();
  if (!state.updateAvailable || !state.artifact) return state;

  const installable = isInstallableArtifact(state.artifact.fileName);
  const prompt = await dialog.showMessageBox({
    type: "info",
    buttons: [installable ? "Download update" : "Open download", "Later"],
    defaultId: 0,
    cancelId: 1,
    title: state.productName || "OpenCom",
    message: `${state.productName || "OpenCom"} ${state.latestVersion || ""} is available`,
    detail: `You are currently on ${state.currentVersion}. ${
      installable
        ? "OpenCom can download the installer now and hand it off to your system."
        : "OpenCom can open the official download for you now."
    }`,
    noLink: true,
  });

  if (prompt.response !== 0) {
    setDesktopUpdateState({ lastAction: "dismissed" });
    return getDesktopUpdateState();
  }

  await installAvailableDesktopUpdate();
  return getDesktopUpdateState();
}

async function checkForDesktopUpdates({
  promptIfAvailable = false,
} = {}) {
  if (desktopUpdateState.checking) return getDesktopUpdateState();

  setDesktopUpdateState({
    checking: true,
    error: "",
    currentVersion: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
  });

  try {
    const release = await fetchDesktopReleaseInfo();
    const computedUpdateAvailable = Boolean(
      release.artifact &&
        release.latestVersion &&
        compareVersionStrings(release.latestVersion, app.getVersion()) > 0,
    );

    setDesktopUpdateState({
      checking: false,
      checkedAt: release.checkedAt,
      latestVersion: release.latestVersion,
      productName: release.productName,
      artifact: release.artifact,
      sourceUrl: release.sourceUrl,
      updateAvailable: computedUpdateAvailable,
      lastAction: computedUpdateAvailable ? "update-available" : "up-to-date",
      error: "",
    });

    if (promptIfAvailable && computedUpdateAvailable) {
      await promptForAvailableDesktopUpdate();
    }
  } catch (error) {
    const message = error?.message || String(error);
    setDesktopUpdateState({
      checking: false,
      checkedAt: new Date().toISOString(),
      updateAvailable: false,
      artifact: null,
      lastAction: "check-failed",
      error: message,
    });
    log.warn("Desktop update check failed", error);
  }

  return getDesktopUpdateState();
}

function scheduleDesktopUpdateCheck() {
  if (!AUTO_UPDATE_CHECK_ENABLED || autoUpdateCheckScheduled) return;
  autoUpdateCheckScheduled = true;
  setTimeout(() => {
    checkForDesktopUpdates({ promptIfAvailable: true }).catch((error) => {
      log.warn("Desktop update check crashed", error);
    });
  }, 1500);
}

function nativeImageToDataUrl(image) {
  try {
    if (!image || typeof image.isEmpty !== "function" || image.isEmpty()) return "";
    return image.toDataURL();
  } catch {
    return "";
  }
}

async function getDesktopDisplaySources({ includeThumbnails = false } = {}) {
  const sources = await desktopCapturer.getSources({
    types: ["screen", "window"],
    thumbnailSize: includeThumbnails ? { width: 320, height: 180 } : { width: 1, height: 1 },
    fetchWindowIcons: includeThumbnails
  });

  return sources.map((source) => ({
    id: source.id,
    name: source.name,
    type: String(source.id || "").startsWith("screen:") ? "screen" : "window",
    ...(includeThumbnails ? {
      thumbnailDataUrl: nativeImageToDataUrl(source.thumbnail),
      appIconDataUrl: nativeImageToDataUrl(source.appIcon)
    } : {})
  }));
}

function showPromptWindow(promptText = "", defaultValue = "", title = "OpenCom") {
  return new Promise((resolve) => {
    const parentWindow = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null;
    const promptWindow = new BrowserWindow({
      width: 420,
      height: 180,
      parent: parentWindow || undefined,
      modal: Boolean(parentWindow),
      resizable: false,
      minimizable: false,
      maximizable: false,
      show: false,
      title,
      autoHideMenuBar: true,
      ...(fs.existsSync(LOCAL_ICON) ? { icon: LOCAL_ICON } : {}),
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        sandbox: false
      }
    });

    let settled = false;
    const onSubmit = (_event, value) => finish(value);
    const onCancel = () => finish(null);
    const finish = (value) => {
      if (settled) return;
      settled = true;
      ipcMain.removeListener("desktop:prompt:submit", onSubmit);
      ipcMain.removeListener("desktop:prompt:cancel", onCancel);
      resolve(typeof value === "string" ? value : null);
      if (!promptWindow.isDestroyed()) promptWindow.close();
    };

    promptWindow.on("closed", () => finish(null));
    promptWindow.webContents.on("did-finish-load", () => promptWindow.show());
    promptWindow.webContents.on("will-navigate", (event) => event.preventDefault());
    promptWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    ipcMain.on("desktop:prompt:submit", onSubmit);
    ipcMain.on("desktop:prompt:cancel", onCancel);

    const safeText = String(promptText || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const safeDefault = String(defaultValue || "").replace(/\\/g, "\\\\").replace(/`/g, "\\`");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>
      body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#121a2f;color:#e9efff;margin:0;padding:16px}
      p{margin:0 0 12px 0;font-size:14px;line-height:1.35}
      input{width:100%;box-sizing:border-box;padding:8px 10px;border-radius:8px;border:1px solid #3a4d72;background:#0d1426;color:#e9efff}
      .actions{display:flex;gap:8px;justify-content:flex-end;margin-top:12px}
      button{padding:8px 12px;border-radius:8px;border:1px solid #4f6ca1;background:#2d6cdf;color:white;cursor:pointer}
      button.ghost{background:transparent;color:#c5d4ff}
    </style></head><body>
      <p>${safeText}</p>
      <input id="v" />
      <div class="actions"><button class="ghost" id="cancel">Cancel</button><button id="ok">OK</button></div>
      <script>
        const { ipcRenderer } = require("electron");
        const input = document.getElementById("v");
        input.value = \`${safeDefault}\`;
        input.focus();
        input.select();
        document.getElementById("ok").addEventListener("click", () => ipcRenderer.send("desktop:prompt:submit", input.value));
        document.getElementById("cancel").addEventListener("click", () => ipcRenderer.send("desktop:prompt:cancel"));
        window.addEventListener("keydown", (event) => {
          if (event.key === "Enter") ipcRenderer.send("desktop:prompt:submit", input.value);
          if (event.key === "Escape") ipcRenderer.send("desktop:prompt:cancel");
        });
      </script>
    </body></html>`;
    promptWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  });
}

function showDisplaySourcePickerWindow(sources = [], title = "Share your screen") {
  return new Promise((resolve) => {
    if (!Array.isArray(sources) || sources.length === 0) {
      resolve(null);
      return;
    }

    const parentWindow = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null;
    const pickerWindow = new BrowserWindow({
      width: 940,
      height: 680,
      minWidth: 760,
      minHeight: 520,
      parent: parentWindow || undefined,
      modal: Boolean(parentWindow),
      resizable: true,
      minimizable: false,
      maximizable: false,
      show: false,
      title,
      autoHideMenuBar: true,
      ...(fs.existsSync(LOCAL_ICON) ? { icon: LOCAL_ICON } : {}),
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        sandbox: false
      }
    });

    const requestId = crypto.randomUUID();
    const selectChannel = `desktop:display-picker:select:${requestId}`;
    const cancelChannel = `desktop:display-picker:cancel:${requestId}`;
    let settled = false;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      ipcMain.removeListener(selectChannel, onSelect);
      ipcMain.removeListener(cancelChannel, onCancel);
      resolve(typeof value === "string" && value ? value : null);
      if (!pickerWindow.isDestroyed()) pickerWindow.close();
    };

    const onSelect = (_event, value) => {
      const selectedId = typeof value === "string" ? value : "";
      const exists = sources.some((source) => source?.id === selectedId);
      finish(exists ? selectedId : null);
    };
    const onCancel = () => finish(null);

    ipcMain.on(selectChannel, onSelect);
    ipcMain.on(cancelChannel, onCancel);
    pickerWindow.on("closed", () => finish(null));
    pickerWindow.webContents.on("did-finish-load", () => pickerWindow.show());
    pickerWindow.webContents.on("will-navigate", (event) => event.preventDefault());
    pickerWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

    const safeTitle = String(title || "Share your screen").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const pickerSources = JSON.stringify(
      sources.map((source) => ({
        id: String(source?.id || ""),
        name: String(source?.name || ""),
        type: source?.type === "window" ? "window" : "screen",
        thumbnailDataUrl: String(source?.thumbnailDataUrl || ""),
        appIconDataUrl: String(source?.appIconDataUrl || "")
      }))
    ).replace(/</g, "\\u003c");

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${safeTitle}</title><style>
      :root{color-scheme:dark}
      body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0f1729;color:#ebf0ff;margin:0;padding:16px}
      h1{margin:0 0 8px 0;font-size:18px}
      p{margin:0 0 14px 0;color:#b7c6ef}
      .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;max-height:500px;overflow:auto;padding-right:2px}
      .card{display:flex;flex-direction:column;gap:8px;text-align:left;padding:0;border:1px solid #2b3d64;border-radius:10px;background:#121e37;color:#eaf0ff;cursor:pointer}
      .card:hover{border-color:#6e98ff}
      .card.active{border-color:#6e98ff;box-shadow:0 0 0 2px rgba(110,152,255,0.28)}
      .thumb{height:118px;object-fit:cover;width:100%;border-radius:9px 9px 0 0;background:#0b1326}
      .meta{display:flex;align-items:center;gap:8px;padding:0 10px 10px 10px;min-height:56px}
      .meta img{width:18px;height:18px;border-radius:4px;flex:0 0 auto}
      .meta b{display:block;font-size:13px;font-weight:600;line-height:1.3}
      .meta span{display:block;font-size:11px;color:#9eb4e6}
      .actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}
      button{padding:8px 14px;border-radius:8px;border:1px solid #4f6ca1;background:#2f6deb;color:white;cursor:pointer}
      button.ghost{background:transparent;color:#c5d4ff}
      button:disabled{opacity:0.45;cursor:not-allowed}
    </style></head><body>
      <h1>${safeTitle}</h1>
      <p>Select a screen or window to share.</p>
      <div id="grid" class="grid"></div>
      <div class="actions">
        <button class="ghost" id="cancel">Cancel</button>
        <button id="share" disabled>Share</button>
      </div>
      <script>
        const { ipcRenderer } = require("electron");
        const selectChannel = ${JSON.stringify(selectChannel)};
        const cancelChannel = ${JSON.stringify(cancelChannel)};
        const sources = ${pickerSources};
        const grid = document.getElementById("grid");
        const share = document.getElementById("share");
        let selected = "";

        function createCard(source) {
          const card = document.createElement("button");
          card.type = "button";
          card.className = "card";
          card.dataset.id = source.id;

          const thumb = document.createElement("img");
          thumb.className = "thumb";
          thumb.alt = source.name || "Screen source";
          if (source.thumbnailDataUrl) thumb.src = source.thumbnailDataUrl;
          card.appendChild(thumb);

          const meta = document.createElement("div");
          meta.className = "meta";

          if (source.appIconDataUrl) {
            const icon = document.createElement("img");
            icon.src = source.appIconDataUrl;
            icon.alt = "";
            meta.appendChild(icon);
          }

          const labels = document.createElement("div");
          const name = document.createElement("b");
          name.textContent = source.name || "Unknown source";
          const type = document.createElement("span");
          type.textContent = source.type === "window" ? "Window" : "Screen";
          labels.appendChild(name);
          labels.appendChild(type);
          meta.appendChild(labels);
          card.appendChild(meta);

          card.addEventListener("click", () => selectSource(source.id));
          card.addEventListener("dblclick", () => {
            selectSource(source.id);
            submit();
          });
          return card;
        }

        function render() {
          grid.replaceChildren(...sources.map(createCard));
          if (sources.length > 0) selectSource(sources.find((source) => source.type === "screen")?.id || sources[0].id);
        }

        function selectSource(sourceId) {
          selected = sourceId || "";
          for (const node of grid.querySelectorAll(".card")) {
            node.classList.toggle("active", node.dataset.id === selected);
          }
          share.disabled = !selected;
        }

        function submit() {
          if (!selected) return;
          ipcRenderer.send(selectChannel, selected);
        }

        share.addEventListener("click", submit);
        document.getElementById("cancel").addEventListener("click", () => ipcRenderer.send(cancelChannel));
        window.addEventListener("keydown", (event) => {
          if (event.key === "Escape") ipcRenderer.send(cancelChannel);
          if (event.key === "Enter") submit();
        });

        render();
      </script>
    </body></html>`;

    pickerWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  });
}

log.initialize();
log.transports.file.level = "info";

// Vesktop-style approach: thin shell that runs the web client with minimal desktop glue.
app.commandLine.appendSwitch("disable-features", "WidgetLayering");
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-background-timer-throttling");

function getTrustedOrigins() {
  const origins = new Set(["file://"]);
  try {
    const origin = new URL(REMOTE_FALLBACK_URL).origin;
    if (origin) origins.add(origin);
  } catch {}
  return origins;
}

function normalizeOrigin(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === "file:") return "file://";
    return parsed.origin || "";
  } catch {
    if (raw.startsWith("file://")) return "file://";
    return raw;
  }
}

function isTrustedOrigin(value) {
  const origin = normalizeOrigin(value);
  if (!origin) return false;
  if (origin === "file://") return true;
  return getTrustedOrigins().has(origin);
}

function getPermissionRequestOrigin(details = {}, fallback = "") {
  const candidateValues = [
    details?.requestingOrigin,
    details?.securityOrigin,
    details?.requestingUrl,
    fallback
  ];
  for (const candidate of candidateValues) {
    const normalized = normalizeOrigin(candidate);
    if (normalized) return normalized;
  }
  return "";
}

function installMediaHandlers() {
  const ses = session.defaultSession;
  if (!ses) return;
  const allowedPermissions = new Set([
    "media",
    "audioCapture",
    "videoCapture",
    "display-capture",
    "fullscreen",
    "speaker-selection"
  ]);

  ses.setPermissionCheckHandler((_webContents, permission, requestingOrigin, details) => {
    const origin = getPermissionRequestOrigin(details, requestingOrigin);
    if (!isTrustedOrigin(origin)) return false;
    return allowedPermissions.has(permission);
  });

  ses.setPermissionRequestHandler((_webContents, permission, callback, details) => {
    const origin = getPermissionRequestOrigin(details);
    if (!isTrustedOrigin(origin)) return callback(false);
    return callback(allowedPermissions.has(permission));
  });

  if (typeof ses.setDisplayMediaRequestHandler === "function") {
    ses.setDisplayMediaRequestHandler(
      async (request, callback) => {
        try {
          const sources = await desktopCapturer.getSources({
            types: ["screen", "window"],
            thumbnailSize: { width: 640, height: 360 },
            fetchWindowIcons: true
          });
          const picked = sources.find((source) => String(source.id || "").startsWith("screen:")) || sources[0];
          if (!picked) return callback({});
          const wantsAudio = request?.audio === true || (typeof request?.audio === "object" && request.audio !== null);
          if (wantsAudio) {
            callback({ video: picked, audio: "loopback" });
            return;
          }
          callback({ video: picked });
        } catch (error) {
          log.error("Display media request failed", error);
          callback({});
        }
      },
      { useSystemPicker: true }
    );
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: "#141621",
    autoHideMenuBar: true,
    ...(fs.existsSync(LOCAL_ICON) ? { icon: LOCAL_ICON } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: false
    }
  });
  if (process.platform !== "darwin") {
    mainWindow.removeMenu();
  }

  const desktopSearch = new URLSearchParams({
    desktop: "1",
    route: "/app",
    coreApi: CORE_API_URL
  }).toString();

  if (fs.existsSync(LOCAL_INDEX)) {
    mainWindow.loadFile(LOCAL_INDEX, { search: desktopSearch });
  } else {
    const url = new URL(REMOTE_FALLBACK_URL);
    url.pathname = "/app";
    url.searchParams.set("desktop", "1");
    url.searchParams.set("coreApi", CORE_API_URL);
    mainWindow.loadURL(url.toString());
  }

  mainWindow.webContents.on("did-finish-load", () => {
    log.info("Renderer finished load", { url: mainWindow.webContents.getURL() });
  });

  mainWindow.webContents.on("did-fail-load", (_event, code, description, validatedUrl, isMainFrame) => {
    log.error("Renderer failed to load", { code, description, validatedUrl, isMainFrame });
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    log.error("Renderer process gone", details);
  });

  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    if (level >= 2) {
      log.warn("Renderer console", { level, message, line, sourceId });
    }
  });

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

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  return true;
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

ipcMain.handle("desktop:session:get", () => {
  const current = readDesktopSession();
  return {
    accessToken: typeof current.accessToken === "string" ? current.accessToken : "",
    refreshToken: typeof current.refreshToken === "string" ? current.refreshToken : ""
  };
});

ipcMain.handle("desktop:session:set", (_event, payload = {}) => {
  const next = {
    accessToken: typeof payload.accessToken === "string" ? payload.accessToken : "",
    refreshToken: typeof payload.refreshToken === "string" ? payload.refreshToken : ""
  };
  return { ok: writeDesktopSession(next) };
});

ipcMain.handle("desktop:prompt", async (_event, payload = {}) => {
  const text = typeof payload.text === "string" ? payload.text : "";
  const defaultValue = typeof payload.defaultValue === "string" ? payload.defaultValue : "";
  const title = typeof payload.title === "string" && payload.title.trim() ? payload.title.trim() : "OpenCom";
  const value = await showPromptWindow(text, defaultValue, title);
  return { value };
});

ipcMain.handle("desktop:display-sources:get", async () => {
  const sources = await getDesktopDisplaySources();
  return { sources };
});

ipcMain.handle("desktop:display-source:pick", async () => {
  try {
    const sources = await getDesktopDisplaySources({ includeThumbnails: true });
    const sourceId = await showDisplaySourcePickerWindow(sources, "Share your screen");
    return { sourceId: sourceId || null };
  } catch (error) {
    log.error("Display source picker failed", error);
    return { sourceId: null };
  }
});

ipcMain.handle("desktop:app:get-info", () => ({
  version: app.getVersion(),
  platform: process.platform,
  arch: process.arch,
}));

ipcMain.handle("desktop:update:get", () => getDesktopUpdateState());

ipcMain.handle("desktop:update:check", async (_event, payload = {}) => {
  const promptIfAvailable = payload?.promptIfAvailable === true;
  const state = await checkForDesktopUpdates({ promptIfAvailable });
  return state;
});

ipcMain.handle("desktop:update:install", async () => {
  return installAvailableDesktopUpdate();
});

ipcMain.handle("desktop:notify", async (_event, payload = {}) => {
  const title =
    typeof payload.title === "string" && payload.title.trim()
      ? payload.title.trim()
      : "OpenCom";
  const body = typeof payload.body === "string" ? payload.body.trim() : "";
  const tag = typeof payload.tag === "string" ? payload.tag.trim() : "";
  const silent = payload.silent === true;

  if (!Notification.isSupported()) return { ok: false, unsupported: true };

  const notification = new Notification({
    title,
    body,
    silent,
    ...(fs.existsSync(LOCAL_ICON) ? { icon: LOCAL_ICON } : {}),
  });
  notification.on("click", () => {
    focusMainWindow();
  });
  notification.show();

  return { ok: true, tag };
});

ipcMain.handle("desktop:focus-window", () => ({ ok: focusMainWindow() }));

app.whenReady().then(() => {
  installMediaHandlers();
  startLocalRpcBridge();
  createWindow();
  scheduleDesktopUpdateCheck();

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
