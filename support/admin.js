import {
  CATEGORY_OPTIONS,
  PRIORITY_OPTIONS,
  STATUS_OPTIONS,
  STORAGE_KEYS,
  describeEmailDelivery,
  escapeHtml,
  formatDateTime,
  getCoreApiBase,
  labelFor,
  messageMarkup,
  saveCoreApiBase,
  ticketBadgesMarkup,
} from "./common.js";

const state = {
  coreApi: getCoreApiBase(),
  accessToken: window.localStorage.getItem(STORAGE_KEYS.accessToken) || "",
  refreshToken: window.localStorage.getItem(STORAGE_KEYS.refreshToken) || "",
  panelPassword: window.sessionStorage.getItem(STORAGE_KEYS.panelPassword) || "",
  me: null,
  adminStatus: null,
  overview: null,
  tickets: [],
  selectedTicket: null,
};

const elements = {
  statusBanner: document.getElementById("admin-status-banner"),
  sessionSummary: document.getElementById("admin-session-summary"),
  coreApiForm: document.getElementById("admin-core-api-form"),
  coreApiInput: document.getElementById("admin-core-api-input"),
  authCard: document.getElementById("admin-auth-card"),
  appShell: document.getElementById("admin-app-shell"),
  loginForm: document.getElementById("admin-login-form"),
  loginEmail: document.getElementById("admin-login-email"),
  loginPassword: document.getElementById("admin-login-password"),
  panelPasswordForm: document.getElementById("admin-panel-password-form"),
  panelPasswordInput: document.getElementById("admin-panel-password-input"),
  clearPanelPasswordButton: document.getElementById("admin-clear-panel-password-btn"),
  logoutButton: document.getElementById("admin-logout-btn"),
  refreshButton: document.getElementById("admin-refresh-btn"),
  overviewCards: document.getElementById("admin-overview-cards"),
  filterForm: document.getElementById("admin-filter-form"),
  filterStatus: document.getElementById("admin-filter-status"),
  filterCategory: document.getElementById("admin-filter-category"),
  filterPriority: document.getElementById("admin-filter-priority"),
  filterAssignee: document.getElementById("admin-filter-assignee"),
  filterQuery: document.getElementById("admin-filter-query"),
  ticketList: document.getElementById("admin-ticket-list"),
  detailTitle: document.getElementById("admin-detail-title"),
  detailBadges: document.getElementById("admin-detail-badges"),
  detailEmpty: document.getElementById("admin-detail-empty"),
  detailContent: document.getElementById("admin-detail-content"),
  detailSummary: document.getElementById("admin-detail-summary"),
  metaForm: document.getElementById("admin-ticket-meta-form"),
  metaSubject: document.getElementById("admin-meta-subject"),
  metaCategory: document.getElementById("admin-meta-category"),
  metaPriority: document.getElementById("admin-meta-priority"),
  metaStatus: document.getElementById("admin-meta-status"),
  metaAssignedUserId: document.getElementById("admin-meta-assigned-user-id"),
  assignMeButton: document.getElementById("admin-assign-me-btn"),
  clearAssigneeButton: document.getElementById("admin-clear-assignee-btn"),
  messageList: document.getElementById("admin-message-list"),
  replyForm: document.getElementById("admin-reply-form"),
  replyNextStatus: document.getElementById("admin-reply-next-status"),
  replyInternal: document.getElementById("admin-reply-internal"),
  replyMessage: document.getElementById("admin-reply-message"),
};

function setBanner(message, tone = "info") {
  elements.statusBanner.textContent = message;
  elements.statusBanner.className = `status-banner ${tone}`;
}

function setTokens(accessToken, refreshToken) {
  state.accessToken = accessToken || "";
  state.refreshToken = refreshToken || "";
  if (state.accessToken) window.localStorage.setItem(STORAGE_KEYS.accessToken, state.accessToken);
  else window.localStorage.removeItem(STORAGE_KEYS.accessToken);
  if (state.refreshToken) window.localStorage.setItem(STORAGE_KEYS.refreshToken, state.refreshToken);
  else window.localStorage.removeItem(STORAGE_KEYS.refreshToken);
}

function setPanelPassword(value) {
  state.panelPassword = value.trim();
  elements.panelPasswordInput.value = state.panelPassword;
  if (state.panelPassword) window.sessionStorage.setItem(STORAGE_KEYS.panelPassword, state.panelPassword);
  else window.sessionStorage.removeItem(STORAGE_KEYS.panelPassword);
}

function hasSupportAccess() {
  const adminStatus = state.adminStatus;
  if (!adminStatus) return false;
  return (
    Boolean(state.panelPassword) ||
    adminStatus.isPlatformAdmin === true ||
    adminStatus.isPlatformOwner === true ||
    (Array.isArray(adminStatus.permissions) && adminStatus.permissions.includes("manage_support"))
  );
}

async function rawRequest(path, options = {}) {
  return fetch(`${state.coreApi}${path}`, options);
}

async function refreshAccessToken() {
  if (!state.refreshToken) return false;
  const response = await rawRequest("/v1/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: state.refreshToken }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    setTokens("", "");
    return false;
  }
  setTokens(data.accessToken || "", data.refreshToken || "");
  return Boolean(data.accessToken);
}

async function api(path, options = {}, retry = true) {
  const headers = {
    ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
    ...(options.headers || {}),
  };
  if (state.accessToken) headers.Authorization = `Bearer ${state.accessToken}`;
  if (state.panelPassword) headers["x-admin-panel-password"] = state.panelPassword;

  const response = await rawRequest(path, { ...options, headers });

  if (response.status === 401 && retry && state.refreshToken) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return api(path, options, false);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `HTTP_${response.status}`);
    error.payload = data;
    throw error;
  }
  return data;
}

function populateSelect(select, options, includeAllLabel = "") {
  const entries = includeAllLabel ? [["", includeAllLabel], ...options] : [...options];
  select.innerHTML = entries
    .map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`)
    .join("");
}

function renderOverview() {
  if (!state.overview) {
    elements.overviewCards.innerHTML = "";
    return;
  }

  const cards = [
    ["Total", state.overview.totalTickets],
    ["Unresolved", state.overview.unresolvedTickets],
    ["Unassigned", state.overview.unassignedTickets],
    ["Waiting", Number(state.overview.byStatus.waiting_on_staff || 0)],
  ];

  elements.overviewCards.innerHTML = cards
    .map(
      ([label, value]) => `
        <article class="mini-card">
          <span>${escapeHtml(String(label))}</span>
          <strong>${escapeHtml(String(value))}</strong>
        </article>
      `
    )
    .join("");
}

function renderTicketList() {
  if (!state.tickets.length) {
    elements.ticketList.innerHTML = `<div class="empty-state compact">No support tickets match the current filter.</div>`;
    return;
  }

  elements.ticketList.innerHTML = state.tickets
    .map((ticket) => {
      const active = state.selectedTicket?.ticket?.id === ticket.id ? "active" : "";
      return `
        <button type="button" class="ticket-row ${active}" data-ticket-id="${escapeHtml(ticket.id)}">
          <div class="ticket-row-head">
            <strong>${escapeHtml(ticket.reference)}</strong>
            <span>${escapeHtml(labelFor(STATUS_OPTIONS, ticket.status))}</span>
          </div>
          <p>${escapeHtml(ticket.subject)}</p>
          <div class="ticket-row-meta">
            <span>${escapeHtml(ticket.contactEmail)}</span>
            <span>${escapeHtml(labelFor(CATEGORY_OPTIONS, ticket.category))}</span>
            <span>${escapeHtml(formatDateTime(ticket.lastActivityAt))}</span>
          </div>
        </button>
      `;
    })
    .join("");

  elements.ticketList.querySelectorAll("[data-ticket-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const ticketId = button.getAttribute("data-ticket-id");
      if (!ticketId) return;
      loadTicketDetail(ticketId).catch((error) => {
        setBanner(String(error.message || "Failed to load ticket detail."), "error");
      });
    });
  });
}

function renderSelectedTicket() {
  const ticket = state.selectedTicket?.ticket;
  const messages = state.selectedTicket?.messages || [];

  if (!ticket) {
    elements.detailEmpty.classList.remove("hidden");
    elements.detailContent.classList.add("hidden");
    elements.detailTitle.textContent = "Select a ticket";
    elements.detailBadges.innerHTML = "";
    return;
  }

  elements.detailEmpty.classList.add("hidden");
  elements.detailContent.classList.remove("hidden");
  elements.detailTitle.textContent = `${ticket.reference} · ${ticket.subject}`;
  elements.detailBadges.innerHTML = ticketBadgesMarkup(ticket);
  elements.detailSummary.innerHTML = `
    <div class="detail-cell">
      <span>Requester</span>
      <strong>${escapeHtml(ticket.requesterName || "Not provided")}</strong>
    </div>
    <div class="detail-cell">
      <span>Contact email</span>
      <strong>${escapeHtml(ticket.contactEmail)}</strong>
    </div>
    <div class="detail-cell">
      <span>OpenCom user</span>
      <strong>${escapeHtml(ticket.opencomUsername || ticket.opencomUserId || "Not linked")}</strong>
    </div>
    <div class="detail-cell">
      <span>Assigned to</span>
      <strong>${escapeHtml(ticket.assignedTo?.username || ticket.assignedTo?.userId || "Unassigned")}</strong>
    </div>
    <div class="detail-cell">
      <span>Created</span>
      <strong>${escapeHtml(formatDateTime(ticket.createdAt))}</strong>
    </div>
    <div class="detail-cell">
      <span>Last activity</span>
      <strong>${escapeHtml(formatDateTime(ticket.lastActivityAt))}</strong>
    </div>
  `;

  elements.metaSubject.value = ticket.subject;
  elements.metaCategory.value = ticket.category;
  elements.metaPriority.value = ticket.priority;
  elements.metaStatus.value = ticket.status;
  elements.metaAssignedUserId.value = ticket.assignedTo?.userId || "";
  elements.messageList.innerHTML = messages.map((message) => messageMarkup(message)).join("");
}

function updateSessionSummary() {
  if (!state.me) {
    elements.sessionSummary.textContent = "Not signed in.";
    return;
  }

  const accessBits = [];
  if (state.adminStatus?.isPlatformOwner) accessBits.push("owner");
  else if (state.adminStatus?.isPlatformAdmin) accessBits.push("platform admin");
  if (Array.isArray(state.adminStatus?.permissions) && state.adminStatus.permissions.includes("manage_support")) {
    accessBits.push("support permission");
  }
  if (state.panelPassword) accessBits.push("panel password loaded");
  elements.sessionSummary.textContent = `${state.me.username} (${state.me.email})${accessBits.length ? ` · ${accessBits.join(", ")}` : ""}`;
}

function syncVisibleState() {
  updateSessionSummary();
  const loggedIn = Boolean(state.accessToken && state.me);
  const allowed = loggedIn && hasSupportAccess();
  elements.authCard.classList.toggle("hidden", false);
  elements.appShell.classList.toggle("hidden", !allowed);

  if (!loggedIn) {
    setBanner("Sign in to access the support queue.", "info");
    return;
  }

  if (!allowed) {
    setBanner("Your account is signed in, but you still need support permission, platform admin access, or the panel password.", "error");
    return;
  }

  setBanner("Support admin ready.", "success");
}

async function loadSession() {
  if (!state.accessToken) {
    state.me = null;
    state.adminStatus = null;
    syncVisibleState();
    return;
  }

  try {
    const [me, adminStatus] = await Promise.all([api("/v1/me"), api("/v1/me/admin-status")]);
    state.me = me;
    state.adminStatus = adminStatus;
  } catch (error) {
    state.me = null;
    state.adminStatus = null;
    setTokens("", "");
    throw error;
  } finally {
    syncVisibleState();
  }
}

async function loadOverview() {
  state.overview = await api("/v1/admin/support/overview");
  renderOverview();
}

function buildTicketQueryString() {
  const params = new URLSearchParams();
  const status = elements.filterStatus.value;
  const category = elements.filterCategory.value;
  const priority = elements.filterPriority.value;
  const query = elements.filterQuery.value.trim();
  const assignee = elements.filterAssignee.value;

  if (status) params.set("status", status);
  if (category) params.set("category", category);
  if (priority) params.set("priority", priority);
  if (query) params.set("query", query);
  if (assignee === "__me__" && state.me?.id) params.set("assignedToUserId", state.me.id);
  else if (assignee === "__unassigned__") params.set("assignedToUserId", "__unassigned__");

  return params.toString();
}

async function loadTickets() {
  const query = buildTicketQueryString();
  const data = await api(`/v1/admin/support/tickets${query ? `?${query}` : ""}`);
  state.tickets = Array.isArray(data.tickets) ? data.tickets : [];
  renderTicketList();
}

async function loadTicketDetail(ticketId) {
  const detail = await api(`/v1/admin/support/tickets/${encodeURIComponent(ticketId)}`);
  state.selectedTicket = detail;
  renderSelectedTicket();
  renderTicketList();
}

async function refreshAll() {
  if (!hasSupportAccess()) return;
  await Promise.all([loadOverview(), loadTickets()]);
  if (state.selectedTicket?.ticket?.id) {
    await loadTicketDetail(state.selectedTicket.ticket.id);
  }
}

async function handleLogin(event) {
  event.preventDefault();
  setBanner("Signing in...", "info");
  try {
    const response = await rawRequest("/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: elements.loginEmail.value.trim(),
        password: elements.loginPassword.value,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP_${response.status}`);
    setTokens(data.accessToken || "", data.refreshToken || "");
    elements.loginPassword.value = "";
    await loadSession();
    if (hasSupportAccess()) await refreshAll();
  } catch (error) {
    setBanner(String(error.message || "Login failed."), "error");
  }
}

function handlePanelPasswordSave(event) {
  event.preventDefault();
  setPanelPassword(elements.panelPasswordInput.value);
  syncVisibleState();
  if (hasSupportAccess()) {
    refreshAll().catch((error) => {
      setBanner(String(error.message || "Failed to load support queue."), "error");
    });
  }
}

function handleLogout() {
  setTokens("", "");
  state.me = null;
  state.adminStatus = null;
  state.overview = null;
  state.tickets = [];
  state.selectedTicket = null;
  setPanelPassword("");
  renderOverview();
  renderTicketList();
  renderSelectedTicket();
  syncVisibleState();
}

async function handleMetaSave(event) {
  event.preventDefault();
  const ticketId = state.selectedTicket?.ticket?.id;
  if (!ticketId) return;

  setBanner("Saving ticket changes...", "info");
  try {
    const updated = await api(`/v1/admin/support/tickets/${encodeURIComponent(ticketId)}`, {
      method: "PUT",
      body: JSON.stringify({
        subject: elements.metaSubject.value.trim(),
        category: elements.metaCategory.value,
        priority: elements.metaPriority.value,
        status: elements.metaStatus.value,
        assignedToUserId: elements.metaAssignedUserId.value.trim() || null,
      }),
    });
    state.selectedTicket = updated;
    renderSelectedTicket();
    await Promise.all([loadOverview(), loadTickets()]);
    setBanner(describeEmailDelivery(updated.emailDelivery), "success");
  } catch (error) {
    setBanner(String(error.message || "Failed to save ticket."), "error");
  }
}

async function handleReplySubmit(event) {
  event.preventDefault();
  const ticketId = state.selectedTicket?.ticket?.id;
  if (!ticketId) return;

  const message = elements.replyMessage.value.trim();
  if (!message) return;

  setBanner("Sending support update...", "info");
  try {
    const updated = await api(`/v1/admin/support/tickets/${encodeURIComponent(ticketId)}/reply`, {
      method: "POST",
      body: JSON.stringify({
        message,
        isInternalNote: elements.replyInternal.checked,
        nextStatus: elements.replyNextStatus.value || undefined,
      }),
    });
    state.selectedTicket = updated;
    elements.replyMessage.value = "";
    elements.replyInternal.checked = false;
    elements.replyNextStatus.value = "";
    renderSelectedTicket();
    await Promise.all([loadOverview(), loadTickets()]);
    setBanner(describeEmailDelivery(updated.emailDelivery), "success");
  } catch (error) {
    setBanner(String(error.message || "Failed to send reply."), "error");
  }
}

function handleAssignMe() {
  if (!state.me) return;
  elements.metaAssignedUserId.value = state.me.id;
}

function handleClearAssignee() {
  elements.metaAssignedUserId.value = "";
}

function handleCoreApiSave(event) {
  event.preventDefault();
  state.coreApi = saveCoreApiBase(elements.coreApiInput.value);
  elements.coreApiInput.value = state.coreApi;
  setBanner(`Core API saved as ${state.coreApi}.`, "success");
}

function boot() {
  elements.coreApiInput.value = state.coreApi;
  elements.panelPasswordInput.value = state.panelPassword;

  populateSelect(elements.filterStatus, STATUS_OPTIONS, "All statuses");
  populateSelect(elements.filterCategory, CATEGORY_OPTIONS, "All categories");
  populateSelect(elements.filterPriority, PRIORITY_OPTIONS, "All priorities");
  populateSelect(elements.metaCategory, CATEGORY_OPTIONS);
  populateSelect(elements.metaPriority, PRIORITY_OPTIONS);
  populateSelect(elements.metaStatus, STATUS_OPTIONS);
  populateSelect(elements.replyNextStatus, STATUS_OPTIONS, "Keep current");

  elements.coreApiForm.addEventListener("submit", handleCoreApiSave);
  elements.loginForm.addEventListener("submit", handleLogin);
  elements.panelPasswordForm.addEventListener("submit", handlePanelPasswordSave);
  elements.clearPanelPasswordButton.addEventListener("click", () => {
    setPanelPassword("");
    syncVisibleState();
  });
  elements.logoutButton.addEventListener("click", handleLogout);
  elements.refreshButton.addEventListener("click", () => {
    refreshAll().catch((error) => setBanner(String(error.message || "Failed to refresh support queue."), "error"));
  });
  elements.filterForm.addEventListener("submit", (event) => {
    event.preventDefault();
    loadTickets().catch((error) => setBanner(String(error.message || "Failed to load tickets."), "error"));
  });
  elements.metaForm.addEventListener("submit", handleMetaSave);
  elements.replyForm.addEventListener("submit", handleReplySubmit);
  elements.assignMeButton.addEventListener("click", handleAssignMe);
  elements.clearAssigneeButton.addEventListener("click", handleClearAssignee);

  loadSession()
    .then(async () => {
      if (hasSupportAccess()) {
        await refreshAll();
      }
    })
    .catch((error) => {
      setBanner(String(error.message || "Failed to restore your session."), "error");
    });
}

boot();
