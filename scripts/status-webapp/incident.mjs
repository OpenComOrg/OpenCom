#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_INCIDENTS_PATH = path.join(__dirname, "site", "incidents.json");
const VALID_IMPACTS = new Set(["none", "minor", "major", "critical"]);
const VALID_STATUSES = new Set(["investigating", "identified", "monitoring", "resolved"]);

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help || !parsed.command) {
    printUsage();
    return;
  }

  const incidentsPath = parsed.incidentsPath || DEFAULT_INCIDENTS_PATH;
  await ensureDir(path.dirname(incidentsPath));
  const store = await readJsonFile(incidentsPath, { incidents: [] });
  if (!Array.isArray(store.incidents)) store.incidents = [];

  if (parsed.command === "list") {
    printIncidentList(store.incidents);
    return;
  }

  if (parsed.command === "add") {
    const now = new Date().toISOString();
    const status = normalizedStatus(parsed.flags.status || "investigating");
    const impact = normalizedImpact(parsed.flags.impact || "major");
    const title = String(parsed.flags.title || "").trim();
    const message = String(parsed.flags.message || "").trim();
    if (!title) throw new Error("Missing --title");
    if (!message) throw new Error("Missing --message");

    const incident = {
      id: `inc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      title,
      message,
      impact,
      status,
      createdAt: now,
      updatedAt: now,
      resolvedAt: status === "resolved" ? now : null,
      updates: [
        {
          at: now,
          status,
          message
        }
      ]
    };

    store.incidents.unshift(incident);
    await writeJsonFile(incidentsPath, store);
    console.log(`[incident] created ${incident.id}`);
    return;
  }

  if (parsed.command === "update") {
    const id = String(parsed.flags.id || "").trim();
    if (!id) throw new Error("Missing --id");
    const incident = store.incidents.find((item) => item.id === id);
    if (!incident) throw new Error(`Incident not found: ${id}`);

    const now = new Date().toISOString();
    let changed = false;

    if (parsed.flags.title != null) {
      const title = String(parsed.flags.title || "").trim();
      if (!title) throw new Error("Title cannot be empty");
      incident.title = title;
      changed = true;
    }
    if (parsed.flags.impact != null) {
      incident.impact = normalizedImpact(parsed.flags.impact);
      changed = true;
    }
    if (parsed.flags.status != null) {
      incident.status = normalizedStatus(parsed.flags.status);
      incident.resolvedAt = incident.status === "resolved" ? now : null;
      changed = true;
    }

    const message = parsed.flags.message != null ? String(parsed.flags.message || "").trim() : "";
    if (message) {
      incident.message = message;
      incident.updates = Array.isArray(incident.updates) ? incident.updates : [];
      incident.updates.push({
        at: now,
        status: incident.status,
        message
      });
      changed = true;
    }

    if (!changed) throw new Error("Nothing to update. Provide at least one field.");
    incident.updatedAt = now;

    await writeJsonFile(incidentsPath, store);
    console.log(`[incident] updated ${incident.id}`);
    return;
  }

  if (parsed.command === "resolve") {
    const id = String(parsed.flags.id || "").trim();
    if (!id) throw new Error("Missing --id");
    const incident = store.incidents.find((item) => item.id === id);
    if (!incident) throw new Error(`Incident not found: ${id}`);

    const now = new Date().toISOString();
    const message = String(parsed.flags.message || "Incident resolved.").trim();
    incident.status = "resolved";
    incident.resolvedAt = now;
    incident.updatedAt = now;
    incident.message = message;
    incident.updates = Array.isArray(incident.updates) ? incident.updates : [];
    incident.updates.push({
      at: now,
      status: "resolved",
      message
    });

    await writeJsonFile(incidentsPath, store);
    console.log(`[incident] resolved ${incident.id}`);
    return;
  }

  throw new Error(`Unknown command: ${parsed.command}`);
}

function parseArgs(argv) {
  const out = {
    command: "",
    help: false,
    incidentsPath: "",
    flags: {}
  };

  if (argv.length && !argv[0].startsWith("-")) {
    out.command = argv[0];
    argv = argv.slice(1);
  }

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "-h" || token === "--help") {
      out.help = true;
      continue;
    }
    if (token === "--incidents") {
      out.incidentsPath = String(argv[i + 1] || "");
      i += 1;
      continue;
    }
    if (!token.startsWith("--")) throw new Error(`Unknown argument: ${token}`);
    const key = token.slice(2);
    const value = argv[i + 1];
    if (value == null || value.startsWith("--")) throw new Error(`Missing value for ${token}`);
    out.flags[key] = value;
    i += 1;
  }
  return out;
}

function printUsage() {
  console.log(`Usage: node scripts/status-webapp/incident.mjs <command> [options]

Commands:
  add       --title "..." --message "..." [--impact minor|major|critical] [--status investigating|identified|monitoring|resolved]
  update    --id "..." [--title "..."] [--message "..."] [--impact ...] [--status ...]
  resolve   --id "..." [--message "..."]
  list

Options:
  --incidents <path>  incidents file path (default: scripts/status-webapp/site/incidents.json)
  -h, --help          Show help
`);
}

function normalizedImpact(value) {
  const impact = String(value || "").trim().toLowerCase();
  if (!VALID_IMPACTS.has(impact)) {
    throw new Error(`Invalid impact: ${value}. Use one of: ${Array.from(VALID_IMPACTS).join(", ")}`);
  }
  return impact;
}

function normalizedStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  if (!VALID_STATUSES.has(status)) {
    throw new Error(`Invalid status: ${value}. Use one of: ${Array.from(VALID_STATUSES).join(", ")}`);
  }
  return status;
}

function printIncidentList(incidents) {
  if (!incidents.length) {
    console.log("No incidents.");
    return;
  }
  for (const incident of incidents) {
    console.log(`${incident.id} | ${incident.status} | ${incident.impact} | ${incident.title}`);
  }
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

async function writeJsonFile(filePath, payload) {
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

main().catch((error) => {
  console.error(`[incident] ${error.message || "FAILED"}`);
  process.exit(1);
});
