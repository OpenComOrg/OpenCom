import {
  CATEGORY_OPTIONS,
  PRIORITY_OPTIONS,
  STORAGE_KEYS,
  describeEmailDelivery,
  escapeHtml,
  formatDateTime,
  getCoreApiBase,
  messageMarkup,
  ticketBadgesMarkup,
} from "./common.js";

const state = {
  coreApi: getCoreApiBase(),
  currentTicket: null,
  currentAccessKey: "",
};

const elements = {
  statusBanner: document.getElementById("public-status-banner"),
  createForm: document.getElementById("ticket-create-form"),
  createResult: document.getElementById("create-result"),
  lookupForm: document.getElementById("ticket-lookup-form"),
  lookupReference: document.getElementById("lookup-reference"),
  lookupAccessKey: document.getElementById("lookup-access-key"),
  loadRecentButton: document.getElementById("load-recent-ticket-btn"),
  threadCard: document.getElementById("ticket-thread-card"),
  threadTitle: document.getElementById("ticket-thread-title"),
  threadBadges: document.getElementById("ticket-thread-badges"),
  threadSummary: document.getElementById("ticket-thread-summary"),
  threadMessages: document.getElementById("ticket-thread-messages"),
  replyForm: document.getElementById("ticket-reply-form"),
  replyMessage: document.getElementById("ticket-reply-message"),
};

const FIELD_LABELS = {
  requesterName: "your name",
  contactEmail: "contact email",
  opencomUsername: "OpenCom username",
  subject: "subject",
  category: "ticket type",
  priority: "priority",
  message: "details",
  reference: "ticket reference",
  accessKey: "private access key",
};

function setBanner(message, tone = "info") {
  elements.statusBanner.textContent = message;
  elements.statusBanner.className = `status-banner ${tone}`;
}

function renderSelectOptions(select, options) {
  select.innerHTML = options
    .map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`)
    .join("");
}

function saveRecentTicket(ticket, accessKey) {
  const payload = {
    reference: ticket.reference,
    accessKey,
    requesterName: ticket.requesterName || "",
    storedAt: new Date().toISOString(),
  };
  window.localStorage.setItem(STORAGE_KEYS.publicRecentTicket, JSON.stringify(payload));
}

function loadRecentTicket() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.publicRecentTicket);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.reference || !parsed?.accessKey) return null;
    return parsed;
  } catch {
    return null;
  }
}

function trimValue(value) {
  return String(value || "").trim();
}

function describeValidationIssues(issues) {
  if (!Array.isArray(issues) || !issues.length) return "The request did not pass validation.";
  return issues
    .slice(0, 2)
    .map((issue) => {
      const path = Array.isArray(issue?.path) ? issue.path : [];
      const fieldKey = String(path[path.length - 1] || "");
      const label = FIELD_LABELS[fieldKey] || fieldKey || "request";
      return `${label}: ${String(issue?.message || "Invalid value.")}`;
    })
    .join(" ");
}

function buildApiErrorMessage(data, fallback) {
  if (data?.error === "VALIDATION_ERROR") {
    return describeValidationIssues(data.issues);
  }
  return String(data?.error || fallback);
}

async function request(path, options = {}) {
  const response = await fetch(`${state.coreApi}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(buildApiErrorMessage(data, `HTTP_${response.status}`));
    error.payload = data;
    throw error;
  }
  return data;
}

function buildCreatePayload() {
  const formData = new FormData(elements.createForm);
  const payload = {
    contactEmail: trimValue(formData.get("contactEmail")),
    subject: trimValue(formData.get("subject")),
    category: trimValue(formData.get("category")),
    priority: trimValue(formData.get("priority")),
    message: trimValue(formData.get("message")),
  };
  const requesterName = trimValue(formData.get("requesterName"));
  const opencomUsername = trimValue(formData.get("opencomUsername"));
  if (requesterName) payload.requesterName = requesterName;
  if (opencomUsername) payload.opencomUsername = opencomUsername;
  return payload;
}

function validateCreatePayload(payload) {
  if (payload.subject.length < 4) return "Subject must be at least 4 characters.";
  if (payload.message.length < 10) return "Details must be at least 10 characters.";
  return "";
}

function showCreateResult(data) {
  elements.createResult.classList.remove("hidden");
  elements.createResult.innerHTML = `
    <p class="panel-kicker">Ticket created</p>
    <h3>${escapeHtml(data.ticket.reference)}</h3>
    <p>${escapeHtml(data.ticket.subject)}</p>
    <div class="detail-grid">
      <div class="detail-cell">
        <span>Reference</span>
        <strong>${escapeHtml(data.ticket.reference)}</strong>
      </div>
      <div class="detail-cell">
        <span>Access key</span>
        <strong class="mono-wrap">${escapeHtml(data.accessKey)}</strong>
      </div>
    </div>
    <p class="helper-copy">${escapeHtml(describeEmailDelivery(data.emailDelivery))}</p>
  `;
}

function renderTicket(detail) {
  state.currentTicket = detail.ticket;
  elements.threadCard.classList.remove("hidden");
  elements.threadTitle.textContent = `${detail.ticket.reference} · ${detail.ticket.subject}`;
  elements.threadBadges.innerHTML = ticketBadgesMarkup(detail.ticket);
  elements.threadSummary.innerHTML = `
    <div class="detail-cell">
      <span>Requester</span>
      <strong>${escapeHtml(detail.ticket.requesterName || "Not provided")}</strong>
    </div>
    <div class="detail-cell">
      <span>Contact email</span>
      <strong>${escapeHtml(detail.ticket.contactEmail)}</strong>
    </div>
    <div class="detail-cell">
      <span>Created</span>
      <strong>${escapeHtml(formatDateTime(detail.ticket.createdAt))}</strong>
    </div>
    <div class="detail-cell">
      <span>Last activity</span>
      <strong>${escapeHtml(formatDateTime(detail.ticket.lastActivityAt))}</strong>
    </div>
  `;
  elements.threadMessages.innerHTML = detail.messages.map((message) => messageMarkup(message)).join("");
}

async function lookupTicket(reference, accessKey) {
  setBanner("Opening support ticket...", "info");
  const detail = await request("/v1/support/tickets/lookup", {
    method: "POST",
    body: JSON.stringify({ reference, accessKey }),
  });
  state.currentAccessKey = accessKey;
  saveRecentTicket(detail.ticket, accessKey);
  renderTicket(detail);
  const params = new URLSearchParams(window.location.search);
  params.set("reference", detail.ticket.reference);
  params.set("accessKey", accessKey);
  window.history.replaceState({}, "", `?${params.toString()}`);
  setBanner("Support ticket loaded.", "success");
}

async function handleCreateSubmit(event) {
  event.preventDefault();
  const payload = buildCreatePayload();
  const validationMessage = validateCreatePayload(payload);
  if (validationMessage) {
    setBanner(validationMessage, "error");
    return;
  }

  setBanner("Submitting support ticket...", "info");
  try {
    const created = await request("/v1/support/tickets", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    showCreateResult(created);
    elements.lookupReference.value = created.ticket.reference;
    elements.lookupAccessKey.value = created.accessKey;
    saveRecentTicket(created.ticket, created.accessKey);
    await lookupTicket(created.ticket.reference, created.accessKey);
    elements.createForm.reset();
  } catch (error) {
    setBanner(String(error.message || "Failed to submit ticket."), "error");
  }
}

async function handleLookupSubmit(event) {
  event.preventDefault();
  const reference = trimValue(elements.lookupReference.value);
  const accessKey = trimValue(elements.lookupAccessKey.value);
  if (!reference || !accessKey) return;
  if (reference.length < 8) {
    setBanner("Ticket reference must be at least 8 characters.", "error");
    return;
  }
  if (accessKey.length < 12) {
    setBanner("Private access key must be at least 12 characters.", "error");
    return;
  }

  try {
    await lookupTicket(reference, accessKey);
  } catch (error) {
    setBanner(
      error.message === "SUPPORT_TICKET_NOT_FOUND"
        ? "Ticket not found. Check the reference and access key."
        : String(error.message || "Failed to load ticket."),
      "error"
    );
  }
}

async function handleReplySubmit(event) {
  event.preventDefault();
  if (!state.currentTicket || !state.currentAccessKey) return;

  const recent = loadRecentTicket();
  const requesterName = recent?.requesterName || "";
  const message = elements.replyMessage.value.trim();
  if (!message) return;

  setBanner("Sending reply...", "info");
  try {
    const detail = await request(`/v1/support/tickets/${encodeURIComponent(state.currentTicket.reference)}/replies`, {
      method: "POST",
      body: JSON.stringify({
        accessKey: state.currentAccessKey,
        requesterName,
        message,
      }),
    });
    renderTicket(detail);
    elements.replyMessage.value = "";
    saveRecentTicket(detail.ticket, state.currentAccessKey);
    setBanner("Reply added to the ticket.", "success");
  } catch (error) {
    setBanner(
      error.message === "SUPPORT_TICKET_NOT_FOUND"
        ? "Ticket not found. Reload it before replying."
        : String(error.message || "Failed to send reply."),
      "error"
    );
  }
}

function handleLoadRecentTicket() {
  const recent = loadRecentTicket();
  if (!recent) {
    setBanner("No recent support ticket was found in this browser.", "info");
    return;
  }
  elements.lookupReference.value = recent.reference;
  elements.lookupAccessKey.value = recent.accessKey;
  lookupTicket(recent.reference, recent.accessKey).catch((error) => {
    setBanner(String(error.message || "Failed to load the recent ticket."), "error");
  });
}

function boot() {
  renderSelectOptions(elements.createForm.elements.category, CATEGORY_OPTIONS);
  renderSelectOptions(elements.createForm.elements.priority, PRIORITY_OPTIONS);

  elements.createForm.addEventListener("submit", handleCreateSubmit);
  elements.lookupForm.addEventListener("submit", handleLookupSubmit);
  elements.replyForm.addEventListener("submit", handleReplySubmit);
  elements.loadRecentButton.addEventListener("click", handleLoadRecentTicket);

  const params = new URLSearchParams(window.location.search);
  const queryCategory = trimValue(params.get("category"));
  const queryUsername = trimValue(params.get("opencomUsername"));
  const queryEmail = trimValue(params.get("contactEmail"));
  const queryReference = params.get("reference") || "";
  const queryAccessKey = params.get("accessKey") || "";

  if (queryCategory && CATEGORY_OPTIONS.some(([value]) => value === queryCategory)) {
    elements.createForm.elements.category.value = queryCategory;
  }
  if (queryUsername) {
    elements.createForm.elements.opencomUsername.value = queryUsername;
  }
  if (queryEmail) {
    elements.createForm.elements.contactEmail.value = queryEmail;
  }

  if (queryReference && queryAccessKey) {
    elements.lookupReference.value = queryReference;
    elements.lookupAccessKey.value = queryAccessKey;
    lookupTicket(queryReference, queryAccessKey).catch(() => {
      setBanner("Saved ticket parameters are no longer valid. Check the reference and access key.", "error");
    });
    return;
  }

  const recent = loadRecentTicket();
  if (recent) {
    elements.lookupReference.value = recent.reference;
    elements.lookupAccessKey.value = recent.accessKey;
  }
}

boot();
