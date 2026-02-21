#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONFIG_PATH = path.join(__dirname, "config.json");
const DEFAULT_SITE_DIR = path.join(__dirname, "site");
const DEFAULT_STATUS_PATH = path.join(DEFAULT_SITE_DIR, "status.json");

const VALID_STATES = new Set(["operational", "degraded", "major_outage"]);

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  const configPath = args.configPath || DEFAULT_CONFIG_PATH;
  const statusPath = args.statusPath || DEFAULT_STATUS_PATH;
  const watchSeconds = Number(args.watchSeconds || 0);

  const config = await loadConfig(configPath);
  await ensureDir(path.dirname(statusPath));

  if (watchSeconds > 0) {
    for (;;) {
      try {
        await runOnce(config, statusPath);
      } catch (error) {
        console.error(`[status-monitor] run failed: ${error.message || "UNKNOWN_ERROR"}`);
      }
      await sleep(watchSeconds * 1000);
    }
  }

  await runOnce(config, statusPath);
}

async function runOnce(config, statusPath) {
  const startedAt = Date.now();
  const previous = await readJsonFile(statusPath, {
    generatedAt: null,
    overall: { state: "operational", label: "All Systems Operational" },
    page: buildPageMetadata(config),
    components: []
  });

  const checks = await Promise.all(config.components.map((component) => checkComponent(component, config.monitor.timeoutMs)));
  const nowIso = new Date().toISOString();
  const today = dayKey(new Date());
  const historyDays = Math.max(1, Number(config.monitor.historyDays || 60));

  const previousById = new Map((previous.components || []).map((component) => [component.id, component]));
  const components = checks.map((check) => {
    const oldComponent = previousById.get(check.id) || {};
    const history = normalizeHistory(oldComponent.history, historyDays);
    const mergedHistory = upsertTodayHistory(history, today, check.state);

    return {
      id: check.id,
      name: check.name,
      url: check.url,
      method: check.method,
      state: check.state,
      label: stateLabel(check.state),
      ok: check.state === "operational",
      statusCode: check.statusCode,
      responseTimeMs: check.responseTimeMs,
      error: check.error || "",
      lastCheckedAt: nowIso,
      history: mergedHistory
    };
  });

  const overallState = deriveOverallState(components.map((component) => component.state));
  const payload = {
    generatedAt: nowIso,
    page: buildPageMetadata(config),
    overall: {
      state: overallState,
      label: overallLabel(overallState)
    },
    monitor: {
      historyDays,
      timeoutMs: Number(config.monitor.timeoutMs || 8000),
      durationMs: Date.now() - startedAt
    },
    components
  };

  await fs.writeFile(statusPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(
    `[status-monitor] ${payload.overall.label} (${components
      .map((component) => `${component.name}:${component.state}`)
      .join(", ")})`
  );
}

async function checkComponent(component, timeoutMs) {
  const startedAt = Date.now();
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), timeoutMs);
  let response = null;

  try {
    response = await fetch(component.url, {
      method: String(component.method || "GET").toUpperCase(),
      redirect: "follow",
      signal: ctrl.signal
    });
  } catch (error) {
    clearTimeout(timeout);
    const elapsed = Date.now() - startedAt;
    return {
      id: component.id,
      name: component.name,
      url: component.url,
      method: String(component.method || "GET").toUpperCase(),
      state: "major_outage",
      statusCode: 0,
      responseTimeMs: elapsed,
      error: error?.name === "AbortError" ? `Timeout after ${timeoutMs}ms` : String(error?.message || "REQUEST_FAILED")
    };
  }

  clearTimeout(timeout);
  const elapsed = Date.now() - startedAt;
  const statusCode = Number(response?.status || 0);
  const isOperational = statusCode >= 200 && statusCode < 400;

  return {
    id: component.id,
    name: component.name,
    url: component.url,
    method: String(component.method || "GET").toUpperCase(),
    state: isOperational ? "operational" : "major_outage",
    statusCode,
    responseTimeMs: elapsed,
    error: isOperational ? "" : `HTTP ${statusCode}`
  };
}

function deriveOverallState(states) {
  if (states.some((state) => state === "major_outage")) return "major_outage";
  if (states.some((state) => state === "degraded")) return "degraded";
  return "operational";
}

function overallLabel(state) {
  if (state === "major_outage") return "Major Service Outage";
  if (state === "degraded") return "Partial Service Degradation";
  return "All Systems Operational";
}

function stateLabel(state) {
  if (state === "major_outage") return "Outage";
  if (state === "degraded") return "Degraded";
  return "Operational";
}

function normalizeHistory(history, historyDays) {
  const today = new Date();
  const minDate = new Date(today.getTime() - (historyDays - 1) * 24 * 60 * 60 * 1000);
  const minKey = dayKey(minDate);

  const safeEntries = Array.isArray(history)
    ? history.filter((entry) => entry && typeof entry.date === "string" && VALID_STATES.has(entry.state))
    : [];

  const uniqueByDate = new Map();
  for (const entry of safeEntries) {
    if (entry.date < minKey) continue;
    uniqueByDate.set(entry.date, { date: entry.date, state: entry.state });
  }

  return Array.from(uniqueByDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function upsertTodayHistory(history, today, nextState) {
  const output = [...history];
  const last = output[output.length - 1];

  if (!last || last.date !== today) {
    output.push({ date: today, state: nextState });
    return output;
  }

  if (last.state === "major_outage") return output;
  if (last.state === "degraded" && nextState === "operational") return output;
  output[output.length - 1] = { date: today, state: nextState };
  return output;
}

function buildPageMetadata(config) {
  return {
    title: String(config.page.title || "Status"),
    brand: String(config.page.brand || "Platform"),
    subtitle: String(config.page.subtitle || ""),
    heroImageUrl: String(config.page.heroImageUrl || ""),
    supportEmail: String(config.page.supportEmail || "")
  };
}

async function loadConfig(configPath) {
  const raw = await readJsonFile(configPath, null);
  if (!raw || typeof raw !== "object") {
    throw new Error(`Config missing or invalid: ${configPath}`);
  }

  const page = raw.page && typeof raw.page === "object" ? raw.page : {};
  const monitor = raw.monitor && typeof raw.monitor === "object" ? raw.monitor : {};
  const components = Array.isArray(raw.components) ? raw.components : [];

  if (!components.length) {
    throw new Error("Config requires at least one component");
  }

  const normalizedComponents = components.map((component, index) => {
    const id = String(component?.id || `component_${index + 1}`).trim();
    const name = String(component?.name || id).trim();
    const url = String(component?.url || "").trim();
    const method = String(component?.method || "GET").trim().toUpperCase();
    if (!id || !name || !url) throw new Error(`Invalid component at index ${index}`);
    return { id, name, url, method };
  });

  return {
    page: {
      title: String(page.title || "OpenCom Status"),
      brand: String(page.brand || "OpenCom"),
      subtitle: String(page.subtitle || "Live service health"),
      heroImageUrl: String(page.heroImageUrl || ""),
      supportEmail: String(page.supportEmail || "")
    },
    monitor: {
      timeoutMs: Number(monitor.timeoutMs || 8000),
      historyDays: Number(monitor.historyDays || 60)
    },
    components: normalizedComponents
  };
}

function parseArgs(argv) {
  const out = {
    help: false,
    configPath: "",
    statusPath: "",
    watchSeconds: 0
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "-h" || token === "--help") {
      out.help = true;
      continue;
    }
    if (token === "--config") {
      out.configPath = String(argv[i + 1] || "");
      i += 1;
      continue;
    }
    if (token === "--status") {
      out.statusPath = String(argv[i + 1] || "");
      i += 1;
      continue;
    }
    if (token === "--watch") {
      out.watchSeconds = Number(argv[i + 1] || 0);
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  return out;
}

function printUsage() {
  console.log(`Usage: node scripts/status-webapp/monitor.mjs [options]

Options:
  --config <path>   Path to config.json (default: scripts/status-webapp/config.json)
  --status <path>   Output status json path (default: scripts/status-webapp/site/status.json)
  --watch <seconds> Run continuously with this interval
  -h, --help        Show help
`);
}

function dayKey(date) {
  return date.toISOString().slice(0, 10);
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function readJsonFile(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(`[status-monitor] ${error.message || "FAILED"}`);
  process.exit(1);
});
