const REFRESH_MS = 30000;

const el = {
  hero: document.getElementById("hero"),
  title: document.getElementById("pageTitle"),
  subtitle: document.getElementById("pageSubtitle"),
  overallLabel: document.getElementById("overallLabel"),
  overallPill: document.getElementById("overallPill"),
  lastChecked: document.getElementById("lastChecked"),
  componentsGrid: document.getElementById("componentsGrid"),
  incidentsList: document.getElementById("incidentsList"),
  incidentHint: document.getElementById("incidentHint")
};

const stateClass = {
  operational: "state-operational",
  degraded: "state-degraded",
  major_outage: "state-major_outage"
};

function normalizeState(value) {
  const state = String(value || "").trim().toLowerCase();
  return stateClass[state] ? state : "operational";
}

function fmtDateTime(value) {
  if (!value) return "unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toLocaleString();
}

function fmtDate(value) {
  if (!value) return "unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toLocaleString();
}

function buildHistoryBars(component, historyDays) {
  const bars = document.createElement("div");
  bars.className = "uptime-bars";
  bars.style.gridTemplateColumns = `repeat(${historyDays}, minmax(0, 1fr))`;

  const map = new Map((component.history || []).map((entry) => [entry.date, normalizeState(entry.state)]));
  const days = [];
  for (let i = historyDays - 1; i >= 0; i -= 1) {
    const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = date.toISOString().slice(0, 10);
    days.push({ key, state: map.get(key) || "operational" });
  }

  for (const day of days) {
    const bar = document.createElement("span");
    bar.className = `uptime-bar ${stateClass[day.state]}`;
    bar.title = `${day.key}: ${day.state.replace("_", " ")}`;
    bars.appendChild(bar);
  }
  return bars;
}

function renderComponents(status) {
  const components = Array.isArray(status.components) ? status.components : [];
  const historyDays = Number(status?.monitor?.historyDays || 60);
  el.componentsGrid.innerHTML = "";

  if (!components.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No component data yet.";
    el.componentsGrid.appendChild(empty);
    return;
  }

  for (const component of components) {
    const card = document.createElement("article");
    card.className = "component";

    const head = document.createElement("div");
    head.className = "component-head";

    const nameWrap = document.createElement("div");
    nameWrap.className = "component-name";

    const name = document.createElement("h4");
    name.textContent = component.name || component.id || "Component";

    const meta = document.createElement("p");
    meta.className = "component-meta";
    const rt = Number(component.responseTimeMs || 0);
    const code = Number(component.statusCode || 0);
    meta.textContent = `${component.url || ""} | ${code ? `HTTP ${code}` : "No response"} | ${rt}ms`;

    nameWrap.append(name, meta);

    const pill = document.createElement("span");
    const state = normalizeState(component.state);
    pill.className = `state-pill ${stateClass[state]}`;
    pill.textContent = component.label || state.replace("_", " ");

    head.append(nameWrap, pill);

    const uptimeRow = document.createElement("div");
    uptimeRow.className = "uptime-row";
    uptimeRow.appendChild(buildHistoryBars(component, historyDays));

    const labels = document.createElement("div");
    labels.className = "uptime-labels";
    labels.innerHTML = `<span>${historyDays} days ago</span><span>Today</span>`;
    uptimeRow.appendChild(labels);

    card.append(head, uptimeRow);
    el.componentsGrid.appendChild(card);
  }
}

function renderIncidents(incidentsPayload) {
  const incidents = Array.isArray(incidentsPayload?.incidents) ? incidentsPayload.incidents : [];
  el.incidentsList.innerHTML = "";

  if (!incidents.length) {
    el.incidentHint.textContent = "No incidents reported.";
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "Everything looks stable.";
    el.incidentsList.appendChild(empty);
    return;
  }

  const activeCount = incidents.filter((incident) => String(incident.status || "").toLowerCase() !== "resolved").length;
  el.incidentHint.textContent = activeCount > 0 ? `${activeCount} active incident${activeCount === 1 ? "" : "s"}` : "No active incidents.";

  for (const incident of incidents) {
    const item = document.createElement("article");
    const impact = String(incident.impact || "none").toLowerCase();
    item.className = `incident impact-${impact}`;

    const head = document.createElement("div");
    head.className = "incident-head";

    const title = document.createElement("h4");
    title.className = "incident-title";
    title.textContent = incident.title || "Untitled incident";

    const status = document.createElement("span");
    status.className = `state-pill ${stateClass[normalizeState(incident.status === "resolved" ? "operational" : "degraded")]}`;
    status.textContent = String(incident.status || "investigating").replace("_", " ");

    head.append(title, status);

    const message = document.createElement("p");
    message.className = "incident-message";
    message.textContent = incident.message || "";

    const meta = document.createElement("p");
    meta.className = "incident-meta";
    meta.textContent = `Impact: ${impact} | Updated: ${fmtDate(incident.updatedAt || incident.createdAt)}`;

    item.append(head, message, meta);
    el.incidentsList.appendChild(item);
  }
}

function renderStatus(status) {
  const page = status?.page || {};
  document.title = page.title || "Status";
  el.title.textContent = page.title || "Status";
  el.subtitle.textContent = page.subtitle || "";

  if (page.heroImageUrl) {
    el.hero.style.backgroundImage = `linear-gradient(180deg, rgba(9, 16, 24, 0.2), rgba(8, 12, 21, 0.72)), url("${page.heroImageUrl}")`;
    el.hero.style.backgroundSize = "cover";
    el.hero.style.backgroundPosition = "center";
  } else {
    el.hero.style.backgroundImage = "";
  }

  const overallState = normalizeState(status?.overall?.state);
  el.overallLabel.textContent = status?.overall?.label || "Status unavailable";
  el.overallPill.className = `state-pill ${stateClass[overallState]}`;
  el.overallPill.textContent = overallState === "operational" ? "Operational" : overallState === "degraded" ? "Degraded" : "Outage";
  el.lastChecked.textContent = `Last updated: ${fmtDateTime(status.generatedAt)}`;

  renderComponents(status || {});
}

async function fetchJson(fileName) {
  const response = await fetch(`${fileName}?t=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function refresh() {
  try {
    const [status, incidents] = await Promise.all([fetchJson("./status.json"), fetchJson("./incidents.json")]);
    renderStatus(status);
    renderIncidents(incidents);
  } catch (error) {
    el.overallLabel.textContent = "Status data unavailable";
    el.overallPill.className = "state-pill state-major_outage";
    el.overallPill.textContent = "Offline";
    el.lastChecked.textContent = `Failed to load status data (${error.message || "ERROR"})`;
  }
}

refresh();
setInterval(refresh, REFRESH_MS);
