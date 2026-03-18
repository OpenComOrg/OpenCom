export const STORAGE_KEYS = {
  coreApi: "opencom_support_core_api",
  publicRecentTicket: "opencom_support_recent_ticket",
  accessToken: "opencom_support_access_token",
  refreshToken: "opencom_support_refresh_token",
  panelPassword: "opencom_support_panel_password",
};

export const CATEGORY_OPTIONS = [
  ["unban_appeal", "Unban appeal"],
  ["account_help", "Account help"],
  ["billing", "Billing"],
  ["bug_report", "Bug report"],
  ["feature_request", "Feature request"],
  ["safety", "Safety"],
  ["other", "Other"],
];

export const PRIORITY_OPTIONS = [
  ["low", "Low"],
  ["normal", "Normal"],
  ["high", "High"],
  ["urgent", "Urgent"],
];

export const STATUS_OPTIONS = [
  ["open", "Open"],
  ["waiting_on_staff", "Waiting on staff"],
  ["waiting_on_user", "Waiting on user"],
  ["resolved", "Resolved"],
  ["closed", "Closed"],
];

function normalizeApiBase(rawValue) {
  const trimmed = String(rawValue || "").trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return `${parsed.origin}${parsed.pathname}`.replace(/\/$/, "");
  } catch {
    return "";
  }
}

export function getCoreApiBase() {
  const fromQuery = new URLSearchParams(window.location.search).get("coreApi");
  const fromStorage = window.localStorage.getItem(STORAGE_KEYS.coreApi) || "";
  const queryBase = normalizeApiBase(fromQuery);
  if (queryBase) return queryBase;
  const storageBase = normalizeApiBase(fromStorage);
  if (storageBase) return storageBase;

  const host = String(window.location.hostname || "").toLowerCase();
  if (host.endsWith(".opencom.online") || host === "opencom.online") {
    return "https://api.opencom.online";
  }
  return "http://localhost:3001";
}

export function saveCoreApiBase(nextValue) {
  const normalized = normalizeApiBase(nextValue);
  if (normalized) window.localStorage.setItem(STORAGE_KEYS.coreApi, normalized);
  else window.localStorage.removeItem(STORAGE_KEYS.coreApi);
  return getCoreApiBase();
}

export function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function labelFor(options, value) {
  const entry = options.find(([id]) => id === value);
  return entry ? entry[1] : String(value || "");
}

export function formatDateTime(value) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

export function describeEmailDelivery(delivery) {
  if (!delivery || !delivery.state) return "No email update information available.";
  if (delivery.state === "sent") return "Email updates were sent successfully.";
  if (delivery.state === "unavailable") return "Ticket saved, but SMTP is not configured so no email update was sent.";
  if (delivery.state === "failed") return `Ticket saved, but the email update failed${delivery.error ? ` (${delivery.error})` : ""}.`;
  return "No email update was sent for this action.";
}

export function ticketBadgesMarkup(ticket) {
  return [
    `<span class="chip dark">${escapeHtml(labelFor(STATUS_OPTIONS, ticket.status))}</span>`,
    `<span class="chip warm">${escapeHtml(labelFor(CATEGORY_OPTIONS, ticket.category))}</span>`,
    `<span class="chip cool">${escapeHtml(labelFor(PRIORITY_OPTIONS, ticket.priority))}</span>`,
  ].join("");
}

export function messageMarkup(message, options = {}) {
  const roleLabel = message.isInternalNote
    ? "Internal note"
    : message.authorType === "staff"
      ? "Support team"
      : message.authorType === "system"
        ? "System"
        : "Requester";
  const classes = [
    "message-card",
    message.authorType === "staff" ? "message-card-staff" : "",
    message.authorType === "system" ? "message-card-system" : "",
    message.isInternalNote ? "message-card-internal" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const internalChip =
    message.isInternalNote && options.showInternalChip !== false
      ? `<span class="inline-chip">Staff only</span>`
      : "";

  return `
    <article class="${classes}">
      <div class="message-meta">
        <div>
          <strong>${escapeHtml(message.authorName || roleLabel)}</strong>
          <span>${escapeHtml(roleLabel)}</span>
        </div>
        <div class="message-meta-right">
          ${internalChip}
          <time>${escapeHtml(formatDateTime(message.createdAt))}</time>
        </div>
      </div>
      <div class="message-body">${escapeHtml(message.body).replace(/\n/g, "<br />")}</div>
    </article>
  `;
}
