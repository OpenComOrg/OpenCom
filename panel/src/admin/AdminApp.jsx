import { useEffect, useState } from "react";
import { BlogMarkdown } from "../lib/blogMarkdown";
import { uploadFileInChunks } from "../lib/chunkedUploads.js";
import { AdminOverviewDashboard } from "./AdminOverviewDashboard.jsx";

const CORE_API = import.meta.env.VITE_CORE_API_URL || "https://api.opencom.online";
const SERVER_ADMIN_URL =
  import.meta.env.VITE_SERVER_ADMIN_URL ||
  "http://localhost:5173/server-admin.html";
const PANEL_ACCESS_TOKEN_KEY = "opencom_panel_access_token";
const PANEL_REFRESH_TOKEN_KEY = "opencom_panel_refresh_token";

const BUILTIN_BADGE_DEFINITIONS = [
  {
    badgeId: "OFFICIAL",
    displayName: "OFFICIAL",
    description: "Reserved official OpenCom account badge.",
    icon: "✓",
    imageUrl: "",
    bgColor: "#1292ff",
    fgColor: "#ffffff",
    reserved: true,
  },
  {
    badgeId: "PLATFORM_ADMIN",
    displayName: "Platform Admin",
    description: "Platform-wide administrative access.",
    icon: "🔨",
    imageUrl: "",
    bgColor: "#2d6cdf",
    fgColor: "#ffffff",
    reserved: true,
  },
  {
    badgeId: "PLATFORM_FOUNDER",
    displayName: "Platform Founder",
    description: "Founder-level platform badge.",
    icon: "👑",
    imageUrl: "",
    bgColor: "#355ad6",
    fgColor: "#ffffff",
    reserved: true,
  },
  {
    badgeId: "boost",
    displayName: "Boost",
    description: "OpenCom Boost supporter badge.",
    icon: "➕",
    imageUrl: "",
    bgColor: "#4f7ecf",
    fgColor: "#ffffff",
    reserved: true,
  },
];
const KNOWN_BADGES = BUILTIN_BADGE_DEFINITIONS.map((badge) => badge.badgeId);
const RESERVED_BADGE_IDS = new Set(BUILTIN_BADGE_DEFINITIONS.map((badge) => badge.badgeId));
const PANEL_PERMISSION_OPTIONS = [
  {
    id: "moderate_users",
    label: "Moderate users",
    description: "Ban and unban accounts from the platform panel.",
  },
  {
    id: "manage_badges",
    label: "Manage badges",
    description: "Assign or remove platform badges.",
  },
  {
    id: "manage_boosts",
    label: "Manage boosts",
    description: "Grant and revoke manual OpenCom Boost access.",
  },
  {
    id: "send_official_messages",
    label: "Official messages",
    description: "Send platform announcements from the official account.",
  },
  {
    id: "manage_blogs",
    label: "Manage blogs",
    description: "Create, edit, publish, and delete blog posts.",
  },
  {
    id: "manage_support",
    label: "Manage support",
    description: "Access the support-admin panel and handle ticket workflows.",
  },
];

const STAFF_TEMPLATES = [
  {
    id: "moderator",
    title: "Moderator",
    permissions: ["moderate_users"],
  },
  {
    id: "creator",
    title: "Blog Creator",
    permissions: ["manage_blogs"],
  },
  {
    id: "operations",
    title: "Operations",
    permissions: ["manage_badges", "manage_boosts"],
  },
  {
    id: "community-lead",
    title: "Community Lead",
    permissions: ["moderate_users", "send_official_messages", "manage_blogs"],
  },
  {
    id: "support-agent",
    title: "Support Agent",
    permissions: ["manage_support"],
  },
];

const SUPPORT_STATUS_OPTIONS = [
  { id: "open", label: "Open" },
  { id: "waiting_on_staff", label: "Waiting on staff" },
  { id: "waiting_on_user", label: "Waiting on user" },
  { id: "resolved", label: "Resolved" },
  { id: "closed", label: "Closed" },
];

const SUPPORT_CATEGORY_OPTIONS = [
  { id: "unban_appeal", label: "Unban appeal" },
  { id: "account_help", label: "Account help" },
  { id: "billing", label: "Billing" },
  { id: "bug_report", label: "Bug report" },
  { id: "feature_request", label: "Feature request" },
  { id: "message_report", label: "Message report" },
  { id: "safety", label: "Safety" },
  { id: "other", label: "Other" },
];

const SUPPORT_PRIORITY_OPTIONS = [
  { id: "low", label: "Low" },
  { id: "normal", label: "Normal" },
  { id: "high", label: "High" },
  { id: "urgent", label: "Urgent" },
];

const STAFF_SCHEDULE_TYPES = [
  { id: "support", label: "Support queue" },
  { id: "moderation", label: "Moderation" },
  { id: "operations", label: "Operations" },
  { id: "content", label: "Content" },
  { id: "on_call", label: "On-call" },
  { id: "custom", label: "Custom" },
];

const CLIENT_RELEASE_CHANNEL_OPTIONS = [
  { id: "stable", label: "Stable" },
  { id: "beta", label: "Beta" },
  { id: "nightly", label: "Nightly" },
];

function defaultPanelAccountTitle(role = "staff") {
  if (role === "owner") return "Owner";
  if (role === "admin") return "Admin";
  return "Staff";
}

const EMPTY_BLOG_DRAFT = {
  id: "",
  title: "",
  slug: "",
  summary: "",
  coverImageUrl: "",
  content: "## Intro\n\nWrite the update here.\n",
  status: "draft",
};

const EMPTY_BADGE_DRAFT = {
  badgeId: "",
  displayName: "",
  description: "",
  icon: "🏷️",
  imageUrl: "",
  bgColor: "#3a4f72",
  fgColor: "#ffffff",
};

function createBadgeDraft(input = {}) {
  return {
    badgeId: String(input.badgeId || "").trim(),
    displayName: String(input.displayName || "").trim(),
    description: String(input.description || "").trim(),
    icon: String(input.icon || "").trim(),
    imageUrl: String(input.imageUrl || "").trim(),
    bgColor: String(input.bgColor || "").trim(),
    fgColor: String(input.fgColor || "").trim(),
  };
}

function getBadgePreview(input = {}) {
  return {
    badgeId: String(input.badgeId || "").trim(),
    displayName: String(input.displayName || input.badgeId || "Badge").trim(),
    description: String(input.description || "").trim(),
    icon: String(input.icon || "").trim() || "🏷️",
    imageUrl: String(input.imageUrl || "").trim(),
    bgColor: String(input.bgColor || "").trim() || "#3a4f72",
    fgColor: String(input.fgColor || "").trim() || "#ffffff",
  };
}

function resolveBadgeImageUrl(value = "") {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (
    trimmed.startsWith("data:") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://")
  ) {
    return trimmed;
  }
  if (trimmed.startsWith("users/")) {
    return `${CORE_API.replace(/\/$/, "")}/v1/profile-images/${trimmed}`;
  }
  if (trimmed.startsWith("/users/")) {
    return `${CORE_API.replace(/\/$/, "")}/v1/profile-images${trimmed}`;
  }
  if (trimmed.startsWith("/")) {
    return `${CORE_API.replace(/\/$/, "")}${trimmed}`;
  }
  return trimmed;
}

function describeApiError(payload, fallback) {
  if (payload?.error === "VALIDATION_ERROR" && Array.isArray(payload.issues) && payload.issues.length) {
    return payload.issues
      .slice(0, 2)
      .map((issue) => String(issue?.message || "Invalid value."))
      .join(" ");
  }
  if (payload?.error === "TOO_LARGE" && Number(payload?.maxBytes) > 0) {
    return `File is too large. Max upload size is ${formatFileSize(payload.maxBytes)}.`;
  }
  return payload?.error || fallback;
}

function slugifyBlogTitle(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

function formatDateTimeInputValue(value = "") {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseDateTimeInputValue(value = "") {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function formatAdminDateTime(value = "") {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatCompactCount(value = 0) {
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Number(value || 0));
}

function formatFileSize(value = 0) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = numeric;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const precision = size >= 100 || unitIndex === 0 ? 0 : size >= 10 ? 1 : 2;
  return `${size.toFixed(precision)} ${units[unitIndex]}`;
}

function maskEmail(value = "") {
  const trimmed = String(value || "").trim();
  const [name = "", domain = ""] = trimmed.split("@");
  if (!name || !domain) return trimmed || "this admin account";
  const visible = name.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(1, name.length - visible.length))}@${domain}`;
}

function formatAdminDurationMs(value = 0) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return "0s";
  if (numeric < 1_000) return `${Math.round(numeric)}ms`;
  if (numeric < 60_000) return `${(numeric / 1_000).toFixed(numeric >= 10_000 ? 0 : 1)}s`;
  const totalSeconds = Math.round(numeric / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes}m ${seconds}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function formatSupportStatus(value = "") {
  return SUPPORT_STATUS_OPTIONS.find((option) => option.id === value)?.label || value || "Unknown";
}

function formatSupportCategory(value = "") {
  return SUPPORT_CATEGORY_OPTIONS.find((option) => option.id === value)?.label || value || "Other";
}

function formatSupportPriority(value = "") {
  return SUPPORT_PRIORITY_OPTIONS.find((option) => option.id === value)?.label || value || "Normal";
}

function todayDateValue() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysDateValue(days = 0) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

async function api(path, token, panelPassword, options = {}) {
  const hasBody = options.body !== undefined && options.body !== null;
  const hasFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  const authToken = String(token || "").trim();
  if (!authToken) throw new Error("UNAUTHORIZED");
  const response = await fetch(`${CORE_API}${path}`, {
    headers: {
      ...(hasBody && !hasFormData ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${authToken}`,
      ...(options.headers || {})
    },
    ...options
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(describeApiError(err, `HTTP_${response.status}`));
  }

  return response.json();
}

async function panelAuthApi(path, options = {}) {
  const hasBody = options.body !== undefined && options.body !== null;
  const hasFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  const response = await fetch(`${CORE_API}${path}`, {
    headers: {
      ...(hasBody && !hasFormData ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(describeApiError(payload, `HTTP_${response.status}`));
  }
  return payload;
}

export function AdminApp() {
  const [token, setToken] = useState(localStorage.getItem(PANEL_ACCESS_TOKEN_KEY) || "");
  const [refreshToken, setRefreshToken] = useState(localStorage.getItem(PANEL_REFRESH_TOKEN_KEY) || "");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginChallenge, setLoginChallenge] = useState(null);
  const [loginTotpToken, setLoginTotpToken] = useState("");
  const [loginRecoveryCode, setLoginRecoveryCode] = useState("");
  const [loginVerificationMethod, setLoginVerificationMethod] = useState("totp");
  const [loginBusy, setLoginBusy] = useState(false);
  const [setupState, setSetupState] = useState(null);
  const [setupTotpToken, setSetupTotpToken] = useState("");
  const [setupBusy, setSetupBusy] = useState(false);
  const [freshRecoveryCodes, setFreshRecoveryCodes] = useState([]);
  const [status, setStatus] = useState("");
  const [statusType, setStatusType] = useState("info"); // info | success | error
  const [adminOverview, setAdminOverview] = useState({
    founder: null,
    admins: [],
    activeBoostGrants: 0,
    staffAssignmentsCount: 0,
    publishedBlogsCount: 0,
    boostBadgeMembers: 0,
    boostStripeMembers: 0,
    badgeDefinitionsCount: 0,
    supportTicketsTotal: 0,
    supportTicketsOpen: 0,
  });
  const [dashboardStats, setDashboardStats] = useState(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [operationsState, setOperationsState] = useState({
    runtime: null,
    activeOperation: null,
    history: [],
  });
  const [operationsLoading, setOperationsLoading] = useState(false);
  const [operationBusy, setOperationBusy] = useState("");
  const [clientReleaseChannel, setClientReleaseChannel] = useState("stable");
  const [clientBuilds, setClientBuilds] = useState([]);
  const [clientBuildsLoading, setClientBuildsLoading] = useState(false);
  const [clientUploadBusy, setClientUploadBusy] = useState(false);
  const [clientUploadInputKey, setClientUploadInputKey] = useState(0);
  const [clientUploadDraft, setClientUploadDraft] = useState({
    version: "",
    channel: "stable",
    releaseNotes: "",
    file: null,
  });
  const [tab, setTab] = useState("overview");
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState([]);
  const [searching, setSearching] = useState(false);
  const [userActionBusyId, setUserActionBusyId] = useState("");
  const [badgeUserId, setBadgeUserId] = useState("");
  const [inspectedUser, setInspectedUser] = useState(null);
  const [inspectedBadges, setInspectedBadges] = useState([]);
  const [badgeDefinitions, setBadgeDefinitions] = useState([]);
  const [badgeDefinitionsLoading, setBadgeDefinitionsLoading] = useState(false);
  const [badgeDefinitionBusy, setBadgeDefinitionBusy] = useState(false);
  const [badgeUploadBusy, setBadgeUploadBusy] = useState(false);
  const [badgeDraft, setBadgeDraft] = useState(EMPTY_BADGE_DRAFT);
  const [boostUserId, setBoostUserId] = useState("");
  const [boostGrantType, setBoostGrantType] = useState("temporary");
  const [boostDurationDays, setBoostDurationDays] = useState("30");
  const [boostReason, setBoostReason] = useState("");
  const [boostState, setBoostState] = useState(null);
  const [boostLoading, setBoostLoading] = useState(false);
  const [boostTrialState, setBoostTrialState] = useState(null);
  const [boostTrialStartsAt, setBoostTrialStartsAt] = useState("");
  const [boostTrialEndsAt, setBoostTrialEndsAt] = useState("");
  const [boostTrialLoading, setBoostTrialLoading] = useState(false);
  const [boostTrialSaving, setBoostTrialSaving] = useState(false);
  const [adminStatus, setAdminStatus] = useState(null); // { platformRole, isPlatformAdmin, isPlatformOwner }
  const [officialStatus, setOfficialStatus] = useState(null);
  const [officialMessage, setOfficialMessage] = useState("");
  const [officialRecipientMode, setOfficialRecipientMode] = useState("selected");
  const [officialQueuedUsers, setOfficialQueuedUsers] = useState([]);
  const [officialSending, setOfficialSending] = useState(false);
  const [officialReport, setOfficialReport] = useState(null);
  const [officialWelcomeEnabled, setOfficialWelcomeEnabled] = useState(false);
  const [officialWelcomeMessage, setOfficialWelcomeMessage] = useState("");
  const [officialWelcomeSaving, setOfficialWelcomeSaving] = useState(false);
  const [staffAssignments, setStaffAssignments] = useState([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffBusy, setStaffBusy] = useState(false);
  const [staffUserId, setStaffUserId] = useState("");
  const [staffLevelKey, setStaffLevelKey] = useState("moderator");
  const [staffTitle, setStaffTitle] = useState("Moderator");
  const [staffNotes, setStaffNotes] = useState("");
  const [staffPermissions, setStaffPermissions] = useState(["moderate_users"]);
  const [panelAccounts, setPanelAccounts] = useState([]);
  const [panelAccountsLoading, setPanelAccountsLoading] = useState(false);
  const [schedules, setSchedules] = useState([]);
  const [schedulesLoading, setSchedulesLoading] = useState(false);
  const [schedulesBusy, setSchedulesBusy] = useState(false);
  const [scheduleStartDate, setScheduleStartDate] = useState(todayDateValue());
  const [scheduleEndDate, setScheduleEndDate] = useState(addDaysDateValue(13));
  const [scheduleFilterAdminId, setScheduleFilterAdminId] = useState("");
  const [scheduleDraft, setScheduleDraft] = useState({
    id: "",
    adminId: "",
    shiftDate: todayDateValue(),
    startTime: "09:00",
    endTime: "17:00",
    timezone: "UTC",
    shiftType: "support",
    note: "",
  });
  const [supportOverview, setSupportOverview] = useState(null);
  const [supportTickets, setSupportTickets] = useState([]);
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportDetailLoading, setSupportDetailLoading] = useState(false);
  const [supportBusy, setSupportBusy] = useState(false);
  const [supportFilters, setSupportFilters] = useState({
    status: "",
    category: "",
    priority: "",
    assignedToUserId: "",
    query: "",
  });
  const [selectedSupportTicketId, setSelectedSupportTicketId] = useState("");
  const [supportDetail, setSupportDetail] = useState(null);
  const [supportUpdateDraft, setSupportUpdateDraft] = useState({
    subject: "",
    category: "",
    priority: "",
    status: "",
    assignedToUserId: "",
  });
  const [supportReplyMessage, setSupportReplyMessage] = useState("");
  const [supportReplyInternal, setSupportReplyInternal] = useState(false);
  const [supportReplyNextStatus, setSupportReplyNextStatus] = useState("");
  const [shellSearch, setShellSearch] = useState("");
  const [panelAccountBusy, setPanelAccountBusy] = useState(false);
  const [panelAccountDraft, setPanelAccountDraft] = useState({
    id: "",
    email: "",
    username: "",
    password: "",
    role: "staff",
    title: "Staff",
    permissions: ["manage_support"],
    notes: "",
    disabled: false,
  });
  const [panelAccountPasswordDraft, setPanelAccountPasswordDraft] = useState("");
  const [blogPosts, setBlogPosts] = useState([]);
  const [blogLoading, setBlogLoading] = useState(false);
  const [blogBusy, setBlogBusy] = useState(false);
  const [blogForm, setBlogForm] = useState(EMPTY_BLOG_DRAFT);
  const panelPassword = "";

  function showStatus(message, type = "info") {
    setStatus(message);
    setStatusType(type);
  }

  useEffect(() => {
    if (token) localStorage.setItem(PANEL_ACCESS_TOKEN_KEY, token);
    else localStorage.removeItem(PANEL_ACCESS_TOKEN_KEY);
  }, [token]);

  useEffect(() => {
    if (refreshToken) localStorage.setItem(PANEL_REFRESH_TOKEN_KEY, refreshToken);
    else localStorage.removeItem(PANEL_REFRESH_TOKEN_KEY);
  }, [refreshToken]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    document.body.classList.add("admin-mode");
    return () => {
      document.body.classList.remove("admin-mode");
    };
  }, []);

  useEffect(() => {
    if (!token) {
      setAdminStatus(null);
      return;
    }
    loadAdminStatus();
  }, [token]);

  const isPanelUnlocked = !!token;
  const panelPermissions = adminStatus?.permissions || [];
  const canManageStaff =
    adminStatus?.isPlatformAdmin === true ||
    adminStatus?.isPlatformOwner === true;
  const canModerateUsers =
    adminStatus?.isPlatformAdmin === true ||
    adminStatus?.isPlatformOwner === true ||
    panelPermissions.includes("moderate_users");
  const canManageBadges =
    adminStatus?.isPlatformAdmin === true ||
    adminStatus?.isPlatformOwner === true ||
    panelPermissions.includes("manage_badges");
  const canManageBoosts =
    adminStatus?.isPlatformAdmin === true ||
    adminStatus?.isPlatformOwner === true ||
    panelPermissions.includes("manage_boosts");
  const canSendOfficialMessages =
    adminStatus?.isPlatformAdmin === true ||
    adminStatus?.isPlatformOwner === true ||
    panelPermissions.includes("send_official_messages");
  const canManageSupport =
    adminStatus?.isPlatformAdmin === true ||
    adminStatus?.isPlatformOwner === true ||
    panelPermissions.includes("manage_support");
  const canManageBlogs =
    adminStatus?.isPlatformAdmin === true ||
    adminStatus?.isPlatformOwner === true ||
    panelPermissions.includes("manage_blogs");
  const canManageOperations =
    adminStatus?.isPlatformAdmin === true ||
    adminStatus?.isPlatformOwner === true;
  const isStaffAccountsTab = tab === "staff-accounts";
  const isStaffPermissionsTab = tab === "staff-permissions";
  const isStaffSchedulingTab = tab === "staff-scheduling";
  const isStaffSupportTab = tab === "staff-support";
  const isAnyStaffTab =
    isStaffAccountsTab ||
    isStaffPermissionsTab ||
    isStaffSchedulingTab ||
    isStaffSupportTab;

  useEffect(() => {
    if (!isPanelUnlocked || !token) return;
    loadOverview();
  }, [isPanelUnlocked, token]);

  useEffect(() => {
    if (!isPanelUnlocked || !token || tab !== "overview") return;
    loadDashboardStats();
  }, [isPanelUnlocked, token, tab]);

  useEffect(() => {
    if (!isPanelUnlocked || !token) return;
    if (tab === "official" && canSendOfficialMessages) {
      loadOfficialStatus();
    }
    if (tab === "boost" && canManageBoosts) {
      loadBoostTrialWindow();
    }
    if (isStaffAccountsTab && canManageStaff) {
      loadPanelAccounts();
      loadStaffAssignments();
    }
    if (isStaffPermissionsTab && canManageStaff) {
      loadPanelAccounts();
      loadStaffAssignments();
    }
    if (isStaffSchedulingTab && canManageSupport) {
      loadPanelAccounts();
      loadStaffSchedules();
    }
    if (isStaffSupportTab && canManageSupport) {
      loadPanelAccounts();
      loadSupportOverview();
      loadSupportTickets();
    }
    if (tab === "badges" && canManageBadges) {
      loadBadgeDefinitions();
    }
    if (tab === "blogs" && canManageBlogs) {
      loadBlogs();
    }
    if (tab === "operations" && canManageOperations) {
      loadOperationsState();
      loadClientBuilds(clientReleaseChannel, { silent: true });
    }
  }, [
    tab,
    token,
    isPanelUnlocked,
    isStaffAccountsTab,
    isStaffPermissionsTab,
    isStaffSchedulingTab,
    isStaffSupportTab,
    canManageStaff,
    canManageSupport,
    canManageBadges,
    canManageBoosts,
    canSendOfficialMessages,
    canManageBlogs,
    canManageOperations,
    clientReleaseChannel,
  ]);

  useEffect(() => {
    if (!isPanelUnlocked || !token || tab !== "operations" || !canManageOperations) {
      return undefined;
    }
    const pollTimer = window.setInterval(() => {
      loadOperationsState({ silent: true });
    }, 5000);
    return () => window.clearInterval(pollTimer);
  }, [isPanelUnlocked, token, tab, canManageOperations]);

  function clearPanelSession() {
    setToken("");
    setRefreshToken("");
    setAdminStatus(null);
    setLoginChallenge(null);
    setLoginVerificationMethod("totp");
    setSetupState(null);
    setSetupTotpToken("");
    setLoginPassword("");
    setLoginTotpToken("");
    setLoginRecoveryCode("");
    setFreshRecoveryCodes([]);
    setOperationsState({
      runtime: null,
      activeOperation: null,
      history: [],
    });
    setOperationBusy("");
    setPanelAccounts([]);
    setStaffAssignments([]);
    setSchedules([]);
    setSupportOverview(null);
    setSupportTickets([]);
    setSupportDetail(null);
    setSelectedSupportTicketId("");
    setShellSearch("");
    setPanelAccountBusy(false);
    resetPanelAccountDraft();
  }

  async function refreshPanelSession() {
    if (!refreshToken) return null;
    try {
      const data = await panelAuthApi("/v1/panel/auth/refresh", {
        method: "POST",
        body: JSON.stringify({ refreshToken }),
      });
      if (data?.accessToken) setToken(data.accessToken);
      if (data?.refreshToken) setRefreshToken(data.refreshToken);
      if (data?.admin) setAdminStatus(data.admin);
      return data;
    } catch {
      return null;
    }
  }

  async function loadAdminStatus() {
    try {
      const data = await api("/v1/panel/me", token, panelPassword);
      if (data?.canAccessPanel === false) {
        clearPanelSession();
        showStatus("Your admin account does not have panel permissions.", "error");
        return;
      }
      setAdminStatus(data);
      return;
    } catch {
      const refreshed = await refreshPanelSession();
      if (!refreshed?.accessToken) {
        clearPanelSession();
        showStatus("Sign in to access the admin panel.", "info");
        return;
      }

      try {
        const data =
          refreshed.admin ||
          (await api("/v1/panel/me", refreshed.accessToken, panelPassword));
        if (data?.canAccessPanel === false) {
          clearPanelSession();
          showStatus("Your admin account does not have panel permissions.", "error");
          return;
        }
        setAdminStatus(data);
      } catch {
        clearPanelSession();
        showStatus("Your admin session expired. Sign in again.", "error");
      }
    }
  }

  async function submitPanelLogin() {
    if (!loginEmail.trim() || !loginPassword.trim()) {
      showStatus("Enter your admin email and password.", "info");
      return;
    }

    setLoginBusy(true);
    try {
      const data = await panelAuthApi("/v1/panel/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: loginEmail.trim(),
          password: loginPassword,
        }),
      });

      if (data?.next === "setup_2fa") {
        setSetupState(data);
        setLoginChallenge(null);
        setLoginVerificationMethod("totp");
        setSetupTotpToken("");
        setFreshRecoveryCodes([]);
        setLoginTotpToken("");
        setLoginRecoveryCode("");
        showStatus("First login detected. Configure 2FA to continue.", "info");
        return;
      }

      if (data?.next === "verify_2fa" && data?.loginToken) {
        setLoginChallenge({
          loginToken: data.loginToken,
          loginExpiresAt: data.loginExpiresAt || "",
          admin: data.admin || {
            email: loginEmail.trim(),
            username: "",
          },
        });
        setSetupState(null);
        setLoginPassword("");
        setLoginTotpToken("");
        setLoginRecoveryCode("");
        setLoginVerificationMethod("totp");
        showStatus("Password accepted. Verify the sign-in with your authenticator or recovery code.", "info");
        return;
      }

      if (data?.next === "complete" && data?.accessToken) {
        setToken(data.accessToken);
        setRefreshToken(data.refreshToken || "");
        setAdminStatus(data.admin || null);
        setLoginChallenge(null);
        setLoginVerificationMethod("totp");
        setSetupState(null);
        setFreshRecoveryCodes([]);
        setLoginPassword("");
        setLoginTotpToken("");
        setLoginRecoveryCode("");
        showStatus("Admin login successful.", "success");
        return;
      }

      throw new Error("Unexpected login response.");
    } catch (error) {
      showStatus(error.message || "Admin login failed.", "error");
    } finally {
      setLoginBusy(false);
    }
  }

  async function submitPanelLoginVerification() {
    if (!loginChallenge?.loginToken) {
      showStatus("Start with your email and password first.", "info");
      return;
    }

    if (loginVerificationMethod === "totp" && !/^\d{6}$/.test(loginTotpToken.trim())) {
      showStatus("Enter the 6-digit code from your authenticator app.", "info");
      return;
    }

    if (loginVerificationMethod === "recovery" && !loginRecoveryCode.trim()) {
      showStatus("Enter one of your saved recovery codes.", "info");
      return;
    }

    setLoginBusy(true);
    try {
      const data = await panelAuthApi("/v1/panel/auth/login/verify", {
        method: "POST",
        body: JSON.stringify({
          loginToken: loginChallenge.loginToken,
          totpToken: loginVerificationMethod === "totp" ? loginTotpToken.trim() : undefined,
          recoveryCode:
            loginVerificationMethod === "recovery"
              ? loginRecoveryCode.trim() || undefined
              : undefined,
        }),
      });

      if (data?.next === "complete" && data?.accessToken) {
        setToken(data.accessToken);
        setRefreshToken(data.refreshToken || "");
        setAdminStatus(data.admin || null);
        setLoginChallenge(null);
        setLoginVerificationMethod("totp");
        setSetupState(null);
        setFreshRecoveryCodes([]);
        setLoginTotpToken("");
        setLoginRecoveryCode("");
        showStatus(
          data.usedRecoveryCode
            ? `Recovery code accepted. ${data.recoveryCodesRemaining || 0} recovery codes remaining.`
            : "Admin login successful.",
          "success",
        );
        return;
      }

      throw new Error("Unexpected login verification response.");
    } catch (error) {
      showStatus(error.message || "2FA verification failed.", "error");
    } finally {
      setLoginBusy(false);
    }
  }

  async function completePanel2faSetup() {
    if (!setupState?.setupToken) {
      showStatus("Missing setup token. Sign in again.", "error");
      return;
    }
    if (!/^\d{6}$/.test(setupTotpToken.trim())) {
      showStatus("Enter the 6-digit code from your authenticator app.", "info");
      return;
    }

    setSetupBusy(true);
    try {
      const data = await panelAuthApi("/v1/panel/auth/setup/complete", {
        method: "POST",
        body: JSON.stringify({
          setupToken: setupState.setupToken,
          totpToken: setupTotpToken.trim(),
        }),
      });

      if (data?.next === "complete" && data?.accessToken) {
        setToken(data.accessToken);
        setRefreshToken(data.refreshToken || "");
        setAdminStatus(data.admin || null);
        setFreshRecoveryCodes(Array.isArray(data.recoveryCodes) ? data.recoveryCodes : []);
        setLoginChallenge(null);
        setLoginVerificationMethod("totp");
        setSetupState(null);
        setSetupTotpToken("");
        setLoginPassword("");
        setLoginTotpToken("");
        setLoginRecoveryCode("");
        showStatus("2FA setup complete. Save your recovery codes now.", "success");
        return;
      }

      throw new Error("Unexpected 2FA setup response.");
    } catch (error) {
      showStatus(error.message || "2FA setup failed.", "error");
    } finally {
      setSetupBusy(false);
    }
  }

  async function logoutPanel() {
    const currentAccessToken = token;
    const tokenToRevoke = refreshToken;
    try {
      if (currentAccessToken) {
        await api("/v1/panel/auth/logout", currentAccessToken, panelPassword, {
          method: "POST",
          body: JSON.stringify({ refreshToken: tokenToRevoke || undefined }),
        });
      }
    } catch {
      // best effort logout
    }
    clearPanelSession();
    showStatus("Signed out from the staff panel.", "info");
  }

  async function loadOverview({ showSuccess = false } = {}) {
    try {
      const data = await api("/v1/admin/overview", token, panelPassword);
      setAdminOverview(data);
      if (showSuccess) showStatus("Overview loaded.", "success");
    } catch (e) {
      showStatus(`Overview failed: ${e.message}`, "error");
    }
  }

  async function loadDashboardStats({ showSuccess = false } = {}) {
    setDashboardLoading(true);
    try {
      const data = await api("/v1/admin/stats", token, panelPassword);
      setDashboardStats(data);
      if (showSuccess) showStatus("Dashboard stats refreshed.", "success");
    } catch (e) {
      showStatus(`Dashboard stats failed: ${e.message}`, "error");
    } finally {
      setDashboardLoading(false);
    }
  }

  async function refreshDashboard() {
    setDashboardLoading(true);
    try {
      const [overviewData, statsData] = await Promise.all([
        api("/v1/admin/overview", token, panelPassword),
        api("/v1/admin/stats", token, panelPassword),
      ]);
      setAdminOverview(overviewData);
      setDashboardStats(statsData);
      showStatus("Dashboard refreshed.", "success");
    } catch (e) {
      showStatus(`Dashboard refresh failed: ${e.message}`, "error");
    } finally {
      setDashboardLoading(false);
    }
  }

  async function loadClientBuilds(channel = clientReleaseChannel, { silent = false } = {}) {
    setClientBuildsLoading(true);
    try {
      const activeChannel = String(channel || "stable").trim() || "stable";
      const data = await api(
        `/v1/client/builds?channel=${encodeURIComponent(activeChannel)}`,
        token,
        panelPassword,
      );
      setClientReleaseChannel(activeChannel);
      setClientBuilds(Array.isArray(data?.builds) ? data.builds : []);
      if (!silent) {
        showStatus(`Client builds refreshed for ${activeChannel}.`, "success");
      }
    } catch (e) {
      setClientBuilds([]);
      if (!silent) {
        showStatus(e.message || "Failed to load client builds.", "error");
      }
    } finally {
      setClientBuildsLoading(false);
    }
  }

  async function loadOperationsState({ silent = false } = {}) {
    setOperationsLoading(true);
    try {
      const data = await api("/v1/admin/operations", token, panelPassword);
      setOperationsState({
        runtime: data?.runtime || null,
        activeOperation: data?.activeOperation || null,
        history: Array.isArray(data?.history) ? data.history : [],
      });
      if (!silent) {
        showStatus("Operations status refreshed.", "success");
      }
    } catch (e) {
      if (!silent) {
        showStatus(e.message || "Failed to load operations status.", "error");
      }
    } finally {
      setOperationsLoading(false);
    }
  }

  async function uploadClientRelease() {
    if (!clientUploadDraft.version.trim()) {
      showStatus("Enter a client version before uploading.", "info");
      return;
    }
    if (!clientUploadDraft.file) {
      showStatus("Choose a client build file to upload.", "info");
      return;
    }

    setClientUploadBusy(true);
    try {
      const uploadLabel = clientUploadDraft.file.name || "client build";
      showStatus(`Starting upload for ${uploadLabel}...`, "info");
      const data = await uploadFileInChunks({
        file: clientUploadDraft.file,
        initUrl: `${CORE_API}/v1/admin/client/uploads/init`,
        buildChunkUrl: (uploadId, offset) =>
          `${CORE_API}/v1/admin/client/uploads/${encodeURIComponent(uploadId)}/chunks?offset=${encodeURIComponent(offset)}`,
        completeUrl: (uploadId) =>
          `${CORE_API}/v1/admin/client/uploads/${encodeURIComponent(uploadId)}/complete`,
        abortUrl: (uploadId) =>
          `${CORE_API}/v1/admin/client/uploads/${encodeURIComponent(uploadId)}`,
        headers: {
          Authorization: `Bearer ${token}`,
        },
        initBody: {
          version: clientUploadDraft.version.trim(),
          channel: clientUploadDraft.channel,
          ...(clientUploadDraft.releaseNotes.trim()
            ? { releaseNotes: clientUploadDraft.releaseNotes.trim() }
            : {}),
        },
        onProgress: ({ uploadedBytes, totalBytes, complete }) => {
          const percent = totalBytes > 0
            ? Math.min(100, Math.round((uploadedBytes / totalBytes) * 100))
            : 100;
          showStatus(
            complete
              ? `Finishing upload for ${uploadLabel}...`
              : `Uploading ${uploadLabel}... ${percent}%`,
            "info",
          );
        },
      });

      const uploadedChannel = clientUploadDraft.channel;
      setClientUploadDraft({
        version: "",
        channel: uploadedChannel,
        releaseNotes: "",
        file: null,
      });
      setClientUploadInputKey((current) => current + 1);
      await loadClientBuilds(uploadedChannel, { silent: true });
      showStatus(
        `Uploaded ${data?.client?.fileName || "client build"} for ${uploadedChannel}.`,
        "success",
      );
    } catch (e) {
      showStatus(e.message || "Failed to upload client release.", "error");
    } finally {
      setClientUploadBusy(false);
    }
  }

  async function refreshOperationsWorkspace() {
    await Promise.all([
      loadOperationsState({ silent: true }),
      loadClientBuilds(clientReleaseChannel, { silent: true }),
    ]);
    showStatus("Operations workspace refreshed.", "success");
  }

  async function triggerPanelOperation(action) {
    const operationLabel = action === "update" ? "Update + restart" : "Restart";
    const confirmed = window.confirm(
      action === "update"
        ? "Run backend migrations, then restart the tmux OpenCom session?"
        : "Restart the tmux OpenCom session now?",
    );
    if (!confirmed) return;

    setOperationBusy(action);
    try {
      const data = await api(`/v1/admin/operations/${action}`, token, panelPassword, {
        method: "POST",
      });
      const operation = data?.operation || null;
      setOperationsState((current) => ({
        ...current,
        runtime: data?.runtime || current.runtime,
      }));
      await loadOperationsState({ silent: true });
      if (operation?.status === "success") {
        showStatus(`${operationLabel} completed successfully.`, "success");
      } else {
        showStatus(
          `${operationLabel} finished with errors (exit ${operation?.exitCode ?? "unknown"}).`,
          "error",
        );
      }
    } catch (e) {
      if (e.message === "OPERATION_IN_PROGRESS") {
        showStatus("Another operation is already running. Refresh in a few seconds.", "info");
      } else {
        showStatus(e.message || `${operationLabel} failed.`, "error");
      }
      await loadOperationsState({ silent: true });
    } finally {
      setOperationBusy("");
    }
  }

  async function loadOfficialStatus() {
    try {
      const data = await api("/v1/admin/official-messages/status", token, panelPassword);
      setOfficialStatus(data);
      setOfficialWelcomeEnabled(data?.newUserWelcomeMessage?.enabled === true);
      setOfficialWelcomeMessage(data?.newUserWelcomeMessage?.content || "");
    } catch (e) {
      setOfficialStatus(null);
      showStatus(`Official messaging status failed: ${e.message}`, "error");
    }
  }

  async function loadPanelAccounts() {
    setPanelAccountsLoading(true);
    try {
      const query = canManageStaff ? "?includeDisabled=1" : "";
      const data = await api(`/v1/admin/panel-accounts${query}`, token, panelPassword);
      const accounts = Array.isArray(data?.accounts) ? data.accounts : [];
      setPanelAccounts(accounts);
      setStaffUserId((current) => {
        if (current && accounts.some((account) => account.id === current)) return current;
        const firstStaff = accounts.find((account) => account.role === "staff" && !account.disabledAt);
        return firstStaff?.id || accounts[0]?.id || "";
      });
      setPanelAccountDraft((current) => {
        if (current.id && accounts.some((account) => account.id === current.id)) {
          return current;
        }
        return {
          id: "",
          email: "",
          username: "",
          password: "",
          role: "staff",
          title: "Staff",
          permissions: ["manage_support"],
          notes: "",
          disabled: false,
        };
      });
      setScheduleDraft((current) => {
        if (current.adminId && accounts.some((account) => account.id === current.adminId)) {
          return current;
        }
        const firstStaff = accounts.find((account) => account.role === "staff" && !account.disabledAt);
        return {
          ...current,
          adminId: firstStaff?.id || accounts[0]?.id || "",
        };
      });
    } catch (e) {
      setPanelAccounts([]);
      showStatus(`Panel account list failed: ${e.message}`, "error");
    } finally {
      setPanelAccountsLoading(false);
    }
  }

  function resetPanelAccountDraft() {
    setPanelAccountDraft({
      id: "",
      email: "",
      username: "",
      password: "",
      role: "staff",
      title: "Staff",
      permissions: ["manage_support"],
      notes: "",
      disabled: false,
    });
    setPanelAccountPasswordDraft("");
  }

  function openPanelAccountDraft(account) {
    if (!account?.id) {
      resetPanelAccountDraft();
      return;
    }
    setPanelAccountDraft({
      id: account.id,
      email: account.email || "",
      username: account.username || "",
      password: "",
      role: account.role || "staff",
      title: account.title || defaultPanelAccountTitle(account.role || "staff"),
      permissions: Array.isArray(account.permissions) ? account.permissions : [],
      notes: account.notes || "",
      disabled: !!account.disabledAt,
    });
    setPanelAccountPasswordDraft("");
  }

  function togglePanelAccountPermission(permissionId) {
    setPanelAccountDraft((current) => {
      if (current.role !== "staff") {
        return {
          ...current,
          permissions: [...PANEL_PERMISSION_OPTIONS.map((permission) => permission.id)],
        };
      }
      if (current.permissions.includes(permissionId)) {
        return {
          ...current,
          permissions: current.permissions.filter((value) => value !== permissionId),
        };
      }
      return {
        ...current,
        permissions: [...current.permissions, permissionId],
      };
    });
  }

  function updatePanelAccountRole(role) {
    setPanelAccountDraft((current) => ({
      ...current,
      role,
      title: current.title || defaultPanelAccountTitle(role),
      permissions:
        role === "staff"
          ? current.permissions.length
            ? current.permissions
            : ["manage_support"]
          : [...PANEL_PERMISSION_OPTIONS.map((permission) => permission.id)],
    }));
  }

  async function savePanelAccount() {
    if (!panelAccountDraft.email.trim()) {
      showStatus("Panel account email is required.", "info");
      return;
    }
    if (!panelAccountDraft.username.trim()) {
      showStatus("Panel account username is required.", "info");
      return;
    }
    if (!panelAccountDraft.id && !panelAccountDraft.password.trim()) {
      showStatus("Set an initial password for the new panel account.", "info");
      return;
    }
    if (panelAccountDraft.role === "staff" && panelAccountDraft.permissions.length === 0) {
      showStatus("Choose at least one permission for a staff account.", "info");
      return;
    }
    if (!isOwner && panelAccountDraft.role !== "staff") {
      showStatus("Only owner accounts can create or edit admin/owner panel roles.", "info");
      return;
    }

    setPanelAccountBusy(true);
    try {
      if (panelAccountDraft.id) {
        await api(`/v1/admin/panel-accounts/${encodeURIComponent(panelAccountDraft.id)}`, token, panelPassword, {
          method: "PATCH",
          body: JSON.stringify({
            email: panelAccountDraft.email.trim(),
            username: panelAccountDraft.username.trim(),
            role: panelAccountDraft.role,
            title: panelAccountDraft.title.trim() || defaultPanelAccountTitle(panelAccountDraft.role),
            permissions: panelAccountDraft.role === "staff" ? panelAccountDraft.permissions : undefined,
            notes: panelAccountDraft.notes.trim() || null,
            disabled: panelAccountDraft.disabled,
          }),
        });
        showStatus("Panel account updated.", "success");
      } else {
        await api("/v1/admin/panel-accounts", token, panelPassword, {
          method: "POST",
          body: JSON.stringify({
            email: panelAccountDraft.email.trim(),
            username: panelAccountDraft.username.trim(),
            password: panelAccountDraft.password,
            role: panelAccountDraft.role,
            title: panelAccountDraft.title.trim() || defaultPanelAccountTitle(panelAccountDraft.role),
            permissions: panelAccountDraft.role === "staff" ? panelAccountDraft.permissions : undefined,
            notes: panelAccountDraft.notes.trim() || undefined,
          }),
        });
        showStatus("Panel account created.", "success");
      }
      await loadPanelAccounts();
      await loadStaffAssignments();
      await loadOverview();
      if (!panelAccountDraft.id) resetPanelAccountDraft();
    } catch (e) {
      showStatus(e.message || "Failed to save panel account.", "error");
    } finally {
      setPanelAccountBusy(false);
    }
  }

  async function resetPanelAccountPassword() {
    if (!panelAccountDraft.id) {
      showStatus("Select an existing panel account first.", "info");
      return;
    }
    if (!panelAccountPasswordDraft.trim()) {
      showStatus("Enter a new password first.", "info");
      return;
    }
    if (!isOwner && panelAccountDraft.role !== "staff") {
      showStatus("Only owner accounts can reset admin/owner passwords.", "info");
      return;
    }
    const confirmed = window.confirm("Reset this panel account password and force 2FA setup on next login?");
    if (!confirmed) return;

    setPanelAccountBusy(true);
    try {
      await api(`/v1/admin/panel-accounts/${encodeURIComponent(panelAccountDraft.id)}/password`, token, panelPassword, {
        method: "POST",
        body: JSON.stringify({
          password: panelAccountPasswordDraft,
          revokeSessions: true,
        }),
      });
      setPanelAccountPasswordDraft("");
      showStatus("Panel account password reset.", "success");
      await loadPanelAccounts();
    } catch (e) {
      showStatus(e.message || "Failed to reset panel account password.", "error");
    } finally {
      setPanelAccountBusy(false);
    }
  }

  async function loadStaffAssignments() {
    setStaffLoading(true);
    try {
      const data = await api("/v1/admin/staff", token, panelPassword);
      setStaffAssignments(Array.isArray(data.staff) ? data.staff : []);
    } catch (e) {
      setStaffAssignments([]);
      showStatus(`Staff assignments failed: ${e.message}`, "error");
    } finally {
      setStaffLoading(false);
    }
  }

  async function loadStaffSchedules({ showSuccess = false } = {}) {
    if (!canManageSupport) return;
    setSchedulesLoading(true);
    try {
      const params = new URLSearchParams();
      if (scheduleStartDate) params.set("startDate", scheduleStartDate);
      if (scheduleEndDate) params.set("endDate", scheduleEndDate);
      if (scheduleFilterAdminId) params.set("adminId", scheduleFilterAdminId);
      const query = params.toString() ? `?${params.toString()}` : "";
      const data = await api(`/v1/admin/staff/schedules${query}`, token, panelPassword);
      setSchedules(Array.isArray(data?.schedules) ? data.schedules : []);
      if (showSuccess) showStatus("Schedule refreshed.", "success");
    } catch (e) {
      setSchedules([]);
      showStatus(e.message || "Failed to load staff schedules.", "error");
    } finally {
      setSchedulesLoading(false);
    }
  }

  function resetScheduleDraft() {
    setScheduleDraft((current) => ({
      id: "",
      adminId: current.adminId || staffUserId || "",
      shiftDate: todayDateValue(),
      startTime: "09:00",
      endTime: "17:00",
      timezone: current.timezone || "UTC",
      shiftType: "support",
      note: "",
    }));
  }

  function editSchedule(entry) {
    setScheduleDraft({
      id: entry.id || "",
      adminId: entry.adminId || "",
      shiftDate: entry.shiftDate || todayDateValue(),
      startTime: entry.startTime || "09:00",
      endTime: entry.endTime || "17:00",
      timezone: entry.timezone || "UTC",
      shiftType: entry.shiftType || "support",
      note: entry.note || "",
    });
    setTab("staff-scheduling");
  }

  async function saveSchedule() {
    if (!scheduleDraft.adminId.trim()) {
      showStatus("Choose a panel staff account for this shift.", "info");
      return;
    }
    if (!scheduleDraft.shiftDate || !scheduleDraft.startTime || !scheduleDraft.endTime) {
      showStatus("Shift date, start time, and end time are required.", "info");
      return;
    }
    if (scheduleDraft.startTime >= scheduleDraft.endTime) {
      showStatus("Shift end time must be after start time.", "info");
      return;
    }

    setSchedulesBusy(true);
    try {
      const payload = {
        adminId: scheduleDraft.adminId.trim(),
        shiftDate: scheduleDraft.shiftDate,
        startTime: scheduleDraft.startTime,
        endTime: scheduleDraft.endTime,
        timezone: scheduleDraft.timezone.trim() || "UTC",
        shiftType: scheduleDraft.shiftType.trim() || "support",
        note: scheduleDraft.note.trim() || undefined,
      };
      if (scheduleDraft.id) {
        await api(`/v1/admin/staff/schedules/${encodeURIComponent(scheduleDraft.id)}`, token, panelPassword, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        showStatus("Shift updated.", "success");
      } else {
        await api("/v1/admin/staff/schedules", token, panelPassword, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        showStatus("Shift scheduled.", "success");
      }
      await loadStaffSchedules();
      resetScheduleDraft();
    } catch (e) {
      showStatus(e.message || "Failed to save schedule.", "error");
    } finally {
      setSchedulesBusy(false);
    }
  }

  async function deleteSchedule(scheduleId = scheduleDraft.id) {
    const targetId = String(scheduleId || "").trim();
    if (!targetId) {
      showStatus("Select a shift to remove.", "info");
      return;
    }
    const confirmed = window.confirm("Remove this schedule entry?");
    if (!confirmed) return;

    setSchedulesBusy(true);
    try {
      await api(`/v1/admin/staff/schedules/${encodeURIComponent(targetId)}`, token, panelPassword, {
        method: "DELETE",
      });
      if (scheduleDraft.id === targetId) {
        resetScheduleDraft();
      }
      await loadStaffSchedules();
      showStatus("Shift removed.", "success");
    } catch (e) {
      showStatus(e.message || "Failed to remove schedule.", "error");
    } finally {
      setSchedulesBusy(false);
    }
  }

  async function loadSupportOverview() {
    if (!canManageSupport) return;
    try {
      const data = await api("/v1/panel/support/overview", token, panelPassword);
      setSupportOverview(data || null);
    } catch (e) {
      setSupportOverview(null);
      showStatus(`Support overview failed: ${e.message}`, "error");
    }
  }

  async function loadSupportTickets({ showSuccess = false, overrideFilters = null } = {}) {
    if (!canManageSupport) return;
    setSupportLoading(true);
    try {
      const effectiveFilters = overrideFilters || supportFilters;
      const params = new URLSearchParams();
      if (effectiveFilters.status) params.set("status", effectiveFilters.status);
      if (effectiveFilters.category) params.set("category", effectiveFilters.category);
      if (effectiveFilters.priority) params.set("priority", effectiveFilters.priority);
      if (effectiveFilters.assignedToUserId) params.set("assignedToUserId", effectiveFilters.assignedToUserId);
      if (String(effectiveFilters.query || "").trim()) params.set("query", String(effectiveFilters.query || "").trim());
      params.set("limit", "80");
      const data = await api(`/v1/panel/support/tickets?${params.toString()}`, token, panelPassword);
      const tickets = Array.isArray(data?.tickets) ? data.tickets : [];
      setSupportTickets(tickets);
      if (selectedSupportTicketId && !tickets.some((ticket) => ticket.id === selectedSupportTicketId)) {
        setSelectedSupportTicketId("");
        setSupportDetail(null);
      }
      if (showSuccess) showStatus("Support queue refreshed.", "success");
    } catch (e) {
      setSupportTickets([]);
      showStatus(e.message || "Failed to load support tickets.", "error");
    } finally {
      setSupportLoading(false);
    }
  }

  async function openSupportTicket(ticketId) {
    const resolvedTicketId = String(ticketId || "").trim();
    if (!resolvedTicketId) return;

    setSelectedSupportTicketId(resolvedTicketId);
    setSupportDetailLoading(true);
    try {
      const detail = await api(`/v1/panel/support/tickets/${encodeURIComponent(resolvedTicketId)}`, token, panelPassword);
      setSupportDetail(detail || null);
      const ticket = detail?.ticket || {};
      setSupportUpdateDraft({
        subject: ticket.subject || "",
        category: ticket.category || "other",
        priority: ticket.priority || "normal",
        status: ticket.status || "open",
        assignedToUserId: ticket.assignedTo?.userId || "",
      });
      setSupportReplyMessage("");
      setSupportReplyInternal(false);
      setSupportReplyNextStatus("");
    } catch (e) {
      setSupportDetail(null);
      showStatus(e.message || "Failed to load support ticket.", "error");
    } finally {
      setSupportDetailLoading(false);
    }
  }

  async function saveSupportTicketUpdates() {
    if (!selectedSupportTicketId || !supportDetail?.ticket?.id) {
      showStatus("Choose a ticket before saving changes.", "info");
      return;
    }

    setSupportBusy(true);
    try {
      await api(`/v1/panel/support/tickets/${encodeURIComponent(selectedSupportTicketId)}`, token, panelPassword, {
        method: "PUT",
        body: JSON.stringify({
          subject: supportUpdateDraft.subject.trim() || undefined,
          category: supportUpdateDraft.category || undefined,
          priority: supportUpdateDraft.priority || undefined,
          status: supportUpdateDraft.status || undefined,
          assignedToUserId:
            supportUpdateDraft.assignedToUserId === "__unassigned__"
              ? null
              : supportUpdateDraft.assignedToUserId || null,
        }),
      });
      await Promise.all([
        loadSupportOverview(),
        loadSupportTickets(),
      ]);
      await openSupportTicket(selectedSupportTicketId);
      showStatus("Support ticket updated.", "success");
    } catch (e) {
      showStatus(e.message || "Failed to update support ticket.", "error");
    } finally {
      setSupportBusy(false);
    }
  }

  async function sendSupportReply() {
    if (!selectedSupportTicketId || !supportReplyMessage.trim()) {
      showStatus("Write a reply first.", "info");
      return;
    }

    setSupportBusy(true);
    try {
      await api(`/v1/panel/support/tickets/${encodeURIComponent(selectedSupportTicketId)}/reply`, token, panelPassword, {
        method: "POST",
        body: JSON.stringify({
          message: supportReplyMessage.trim(),
          isInternalNote: supportReplyInternal,
          nextStatus: supportReplyNextStatus || undefined,
        }),
      });
      setSupportReplyMessage("");
      setSupportReplyInternal(false);
      setSupportReplyNextStatus("");
      await Promise.all([
        loadSupportOverview(),
        loadSupportTickets(),
      ]);
      await openSupportTicket(selectedSupportTicketId);
      showStatus("Reply sent.", "success");
    } catch (e) {
      showStatus(e.message || "Failed to send support reply.", "error");
    } finally {
      setSupportBusy(false);
    }
  }

  function applyStaffTemplate(template) {
    setStaffLevelKey(template.id);
    setStaffTitle(template.title);
    setStaffPermissions(template.permissions);
  }

  function editStaffAssignment(assignment) {
    const targetAdminId = assignment.adminId || assignment.userId || "";
    setStaffUserId(targetAdminId);
    setStaffLevelKey(assignment.levelKey || "custom");
    setStaffTitle(assignment.title || "Staff");
    setStaffNotes(assignment.notes || "");
    setStaffPermissions(Array.isArray(assignment.permissions) ? assignment.permissions : []);
    const matchingAccount = panelAccounts.find((account) => account.id === targetAdminId);
    if (matchingAccount) openPanelAccountDraft(matchingAccount);
    setTab("staff-permissions");
  }

  function toggleStaffPermission(permissionId) {
    setStaffPermissions((current) => {
      if (current.includes(permissionId)) {
        return current.filter((value) => value !== permissionId);
      }
      return [...current, permissionId];
    });
  }

  async function saveStaffAssignment() {
    if (!staffUserId.trim()) {
      showStatus("Choose an admin panel account first.", "info");
      return;
    }
    if (staffPermissions.length === 0) {
      showStatus("Select at least one panel permission.", "info");
      return;
    }

    setStaffBusy(true);
    try {
      await api(`/v1/admin/staff/${encodeURIComponent(staffUserId.trim())}`, token, panelPassword, {
        method: "PUT",
        body: JSON.stringify({
          levelKey: staffLevelKey.trim() || "custom",
          title: staffTitle.trim() || "Staff",
          permissions: staffPermissions,
          notes: staffNotes.trim() || undefined,
        }),
      });
      await loadStaffAssignments();
      await loadPanelAccounts();
      await loadAdminStatus();
      await loadOverview();
      showStatus("Staff assignment saved.", "success");
    } catch (e) {
      showStatus(e.message || "Failed to save staff assignment.", "error");
    } finally {
      setStaffBusy(false);
    }
  }

  async function removeStaffAssignment(userId = staffUserId) {
    const targetUserId = String(userId || "").trim();
    if (!targetUserId) {
      showStatus("Choose an admin panel account first.", "info");
      return;
    }
    const confirmed = window.confirm("Remove this panel staff assignment?");
    if (!confirmed) return;

    setStaffBusy(true);
    try {
      await api(`/v1/admin/staff/${encodeURIComponent(targetUserId)}`, token, panelPassword, {
        method: "DELETE",
      });
      if (targetUserId === staffUserId) {
        setStaffUserId("");
        setStaffNotes("");
        applyStaffTemplate(STAFF_TEMPLATES[0]);
      }
      await loadStaffAssignments();
      await loadPanelAccounts();
      await loadAdminStatus();
      await loadOverview();
      showStatus("Staff assignment removed.", "success");
    } catch (e) {
      showStatus(e.message || "Failed to remove staff assignment.", "error");
    } finally {
      setStaffBusy(false);
    }
  }

  async function loadBlogs() {
    setBlogLoading(true);
    try {
      const data = await api("/v1/admin/blogs", token, panelPassword);
      const posts = Array.isArray(data.posts) ? data.posts : [];
      setBlogPosts(posts);
      if (!blogForm.id && posts[0]) {
        openBlogEditor(posts[0]);
      }
    } catch (e) {
      setBlogPosts([]);
      showStatus(`Blog loading failed: ${e.message}`, "error");
    } finally {
      setBlogLoading(false);
    }
  }

  function startNewBlogDraft() {
    setBlogForm({ ...EMPTY_BLOG_DRAFT });
  }

  function openBlogEditor(post) {
    setBlogForm({
      id: post.id || "",
      title: post.title || "",
      slug: post.slug || "",
      summary: post.summary || "",
      coverImageUrl: post.coverImageUrl || "",
      content: post.content || "",
      status: post.status || "draft",
    });
  }

  async function saveBlogPost() {
    if (!blogForm.title.trim() || !blogForm.summary.trim() || !blogForm.content.trim()) {
      showStatus("Title, summary, and content are required for blog posts.", "info");
      return;
    }

    const payload = {
      ...blogForm,
      slug: slugifyBlogTitle(blogForm.slug || blogForm.title),
    };
    if (!payload.slug) {
      showStatus("Provide a title or slug for the blog post.", "info");
      return;
    }

    setBlogBusy(true);
    try {
      const method = payload.id ? "PUT" : "POST";
      const path = payload.id
        ? `/v1/admin/blogs/${encodeURIComponent(payload.id)}`
        : "/v1/admin/blogs";
      const data = await api(path, token, panelPassword, {
        method,
        body: JSON.stringify(payload),
      });
      const savedPost = data.post || null;
      if (savedPost) openBlogEditor(savedPost);
      await loadBlogs();
      await loadOverview();
      showStatus(payload.id ? "Blog post updated." : "Blog post created.", "success");
    } catch (e) {
      showStatus(e.message || "Failed to save blog post.", "error");
    } finally {
      setBlogBusy(false);
    }
  }

  async function deleteBlogPost() {
    if (!blogForm.id) {
      showStatus("Select a saved post before deleting it.", "info");
      return;
    }
    const confirmed = window.confirm("Delete this blog post permanently?");
    if (!confirmed) return;

    setBlogBusy(true);
    try {
      await api(`/v1/admin/blogs/${encodeURIComponent(blogForm.id)}`, token, panelPassword, {
        method: "DELETE",
      });
      startNewBlogDraft();
      await loadBlogs();
      await loadOverview();
      showStatus("Blog post deleted.", "success");
    } catch (e) {
      showStatus(e.message || "Failed to delete blog post.", "error");
    } finally {
      setBlogBusy(false);
    }
  }

  async function searchUsers(nextQuery = query) {
    const resolvedQuery = String(nextQuery || "").trim();
    if (!resolvedQuery) {
      showStatus("Enter a search term (username or email).", "info");
      return;
    }
    if (resolvedQuery !== query) setQuery(resolvedQuery);
    setSearching(true);
    try {
      const data = await api(`/v1/admin/users?query=${encodeURIComponent(resolvedQuery)}`, token, panelPassword);
      setUsers((data.users || []).map((user) => ({ ...user, isBanned: user.isBanned === true || user.isBanned === 1 })));
      showStatus(`Found ${(data.users || []).length} users.`, "success");
    } catch (e) {
      showStatus(`Search failed: ${e.message}`, "error");
      setUsers([]);
    } finally {
      setSearching(false);
    }
  }

  async function runGlobalSearch() {
    const value = shellSearch.trim();
    if (!value) {
      showStatus("Type something to search.", "info");
      return;
    }
    if (tab === "users") {
      await searchUsers(value);
      return;
    }
    if (isStaffSupportTab && canManageSupport) {
      const nextFilters = { ...supportFilters, query: value };
      setSupportFilters(nextFilters);
      await loadSupportTickets({ showSuccess: true, overrideFilters: nextFilters });
      return;
    }
    showStatus("Search is currently wired for Users and Support queue tabs.", "info");
  }

  async function refreshUsersAfterAction() {
    const trimmed = query.trim();
    if (!trimmed) return;
    try {
      const data = await api(`/v1/admin/users?query=${encodeURIComponent(trimmed)}`, token, panelPassword);
      setUsers((data.users || []).map((user) => ({ ...user, isBanned: user.isBanned === true || user.isBanned === 1 })));
    } catch {
      // keep previous list if refresh fails; action status already handled by caller
    }
  }

  async function setAdmin(userId, enabled) {
    try {
      await api(`/v1/admin/users/${userId}/platform-admin`, token, panelPassword, {
        method: "POST",
        body: JSON.stringify({ enabled })
      });
      await loadOverview();
      await loadAdminStatus();
      showStatus(enabled ? "User is now platform admin." : "Platform admin removed.", "success");
    } catch (e) {
      showStatus(e.message || "Update failed.", "error");
    }
  }

  async function setAccountBan(userId, shouldBan) {
    if (!userId) return;
    if (userActionBusyId) return;

    if (shouldBan) {
      const confirmed = window.confirm("Ban this account? They will be blocked from login and API access.");
      if (!confirmed) return;
    } else {
      const confirmed = window.confirm("Unban this account?");
      if (!confirmed) return;
    }

    let reason = "";
    if (shouldBan) {
      reason = window.prompt("Ban reason (optional):", "") || "";
    }

    setUserActionBusyId(userId);
    try {
      if (shouldBan) {
        await api(`/v1/admin/users/${userId}/account-ban`, token, panelPassword, {
          method: "POST",
          body: JSON.stringify({ reason: reason.trim() || undefined })
        });
      } else {
        await api(`/v1/admin/users/${userId}/account-ban`, token, panelPassword, {
          method: "DELETE"
        });
      }
      await refreshUsersAfterAction();
      showStatus(shouldBan ? "Account banned." : "Account unbanned.", "success");
    } catch (e) {
      showStatus(e.message || (shouldBan ? "Failed to ban account." : "Failed to unban account."), "error");
    } finally {
      setUserActionBusyId("");
    }
  }

  async function deleteUserAccount(userId) {
    if (!userId) return;
    if (userActionBusyId) return;

    const confirmed = window.confirm("Delete this account permanently? This cannot be undone.");
    if (!confirmed) return;

    setUserActionBusyId(userId);
    try {
      await api(`/v1/admin/users/${userId}/account`, token, panelPassword, { method: "DELETE" });
      await refreshUsersAfterAction();
      if (inspectedUser?.id === userId) {
        setInspectedUser(null);
        setInspectedBadges([]);
      }
      showStatus("Account deleted.", "success");
    } catch (e) {
      showStatus(e.message || "Failed to delete account.", "error");
    } finally {
      setUserActionBusyId("");
    }
  }

  async function setFounder(userId) {
    try {
      await api("/v1/admin/founder", token, panelPassword, {
        method: "POST",
        body: JSON.stringify({ userId })
      });
      await loadOverview();
      await loadAdminStatus();
      showStatus("Founder updated.", "success");
    } catch (e) {
      showStatus(e.message || "Set founder failed.", "error");
    }
  }

  function applyBadgeDraft(input = {}) {
    setBadgeDraft(createBadgeDraft(input));
  }

  async function loadBadgeDefinitions() {
    setBadgeDefinitionsLoading(true);
    try {
      const data = await api("/v1/admin/badge-definitions", token, panelPassword);
      setBadgeDefinitions(data.definitions || []);
    } catch (e) {
      setBadgeDefinitions([]);
      showStatus(e.message || "Failed to load badge definitions.", "error");
    } finally {
      setBadgeDefinitionsLoading(false);
    }
  }

  async function saveBadgeDefinition({ assignAfterSave = false } = {}) {
    const badgeId = badgeDraft.badgeId.trim();
    if (!badgeId) {
      showStatus("Enter a badge ID first.", "info");
      return;
    }
    if (RESERVED_BADGE_IDS.has(badgeId)) {
      showStatus("Built-in badges can be assigned, but their definitions are managed by the platform.", "info");
      return;
    }
    if (!badgeDraft.displayName.trim()) {
      showStatus("Enter a display name for the badge.", "info");
      return;
    }
    if (assignAfterSave && !badgeUserId.trim()) {
      showStatus("Load a user before granting this badge.", "info");
      return;
    }

    setBadgeDefinitionBusy(true);
    try {
      const payload = {
        displayName: badgeDraft.displayName.trim(),
        description: badgeDraft.description.trim() || null,
        icon: badgeDraft.icon.trim() || null,
        imageUrl: badgeDraft.imageUrl.trim() || null,
        bgColor: badgeDraft.bgColor.trim() || null,
        fgColor: badgeDraft.fgColor.trim() || null,
      };
      const data = await api(`/v1/admin/badge-definitions/${encodeURIComponent(badgeId)}`, token, panelPassword, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      if (data.definition) {
        applyBadgeDraft(data.definition);
      }
      await loadBadgeDefinitions();
      if (assignAfterSave) {
        await setBadgeForUser(badgeUserId.trim(), badgeId, true, { silent: true });
        showStatus("Badge definition saved and granted.", "success");
      } else {
        showStatus("Badge definition saved.", "success");
      }
    } catch (e) {
      showStatus(e.message || "Failed to save badge definition.", "error");
    } finally {
      setBadgeDefinitionBusy(false);
    }
  }

  async function deleteBadgeDefinition() {
    const badgeId = badgeDraft.badgeId.trim();
    if (!badgeId) {
      showStatus("Choose a badge definition to delete.", "info");
      return;
    }
    if (RESERVED_BADGE_IDS.has(badgeId)) {
      showStatus("Built-in badge definitions cannot be deleted.", "info");
      return;
    }
    const confirmed = window.confirm(`Delete the "${badgeId}" badge definition? Assigned users would keep the badge ID but lose this custom presentation.`);
    if (!confirmed) return;

    setBadgeDefinitionBusy(true);
    try {
      await api(`/v1/admin/badge-definitions/${encodeURIComponent(badgeId)}`, token, panelPassword, {
        method: "DELETE",
      });
      setBadgeDefinitions((current) => current.filter((definition) => definition.badgeId !== badgeId));
      applyBadgeDraft(EMPTY_BADGE_DRAFT);
      showStatus("Badge definition deleted.", "success");
    } catch (e) {
      showStatus(e.message || "Failed to delete badge definition.", "error");
    } finally {
      setBadgeDefinitionBusy(false);
    }
  }

  async function uploadBadgeImage(file) {
    if (!file) return;
    setBadgeUploadBusy(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const data = await api("/v1/admin/badge-definitions/upload", token, panelPassword, {
        method: "POST",
        body: formData,
      });
      setBadgeDraft((current) => ({
        ...current,
        imageUrl: data.imageUrl || "",
      }));
      showStatus("Badge image uploaded.", "success");
    } catch (e) {
      showStatus(e.message || "Failed to upload badge image.", "error");
    } finally {
      setBadgeUploadBusy(false);
    }
  }

  async function setBadge(enabled) {
    const badgeId = badgeDraft.badgeId.trim();
    if (!badgeUserId.trim() || !badgeId) {
      showStatus("Load a user and choose a badge first.", "info");
      return;
    }
    await setBadgeForUser(badgeUserId.trim(), badgeId, enabled);
  }

  async function setBadgeForUser(userId, badge, enabled, options = {}) {
    if (!userId || !badge) return;
    try {
      await api(`/v1/admin/users/${userId}/badges`, token, panelPassword, {
        method: "POST",
        body: JSON.stringify({ badge, enabled })
      });
      await inspectUser(userId);
      if (!options.silent) {
        showStatus(`Badge ${enabled ? "added" : "removed"}.`, "success");
      }
    } catch (e) {
      if (!options.silent) {
        showStatus(e.message || "Badge action failed.", "error");
      } else {
        throw e;
      }
    }
  }

  async function inspectUser(userId) {
    if (!userId?.trim()) return;
    try {
      const data = await api(`/v1/admin/users/${userId.trim()}/detail`, token, panelPassword);
      setInspectedUser(data.user || null);
      setInspectedBadges(data.badges || []);
      setBadgeUserId(userId.trim());
      setBoostUserId(userId.trim());
      showStatus("Loaded user details.", "success");
    } catch (e) {
      setInspectedUser(null);
      setInspectedBadges([]);
      showStatus(e.message || "Failed to load user details.", "error");
    }
  }

  async function loadBoostState(targetUserId = boostUserId) {
    const userId = targetUserId?.trim();
    if (!userId) {
      showStatus("Enter a user ID to inspect boost.", "info");
      return;
    }
    setBoostLoading(true);
    try {
      const data = await api(`/v1/admin/users/${userId}/boost`, token, panelPassword);
      setBoostState(data);
      setBoostUserId(userId);
      showStatus("Boost state loaded.", "success");
    } catch (e) {
      setBoostState(null);
      showStatus(e.message || "Failed to load boost state.", "error");
    } finally {
      setBoostLoading(false);
    }
  }

  function applyBoostTrialState(data) {
    setBoostTrialState(data || null);
    setBoostTrialStartsAt(formatDateTimeInputValue(data?.startsAt || ""));
    setBoostTrialEndsAt(formatDateTimeInputValue(data?.endsAt || ""));
  }

  async function loadBoostTrialWindow() {
    setBoostTrialLoading(true);
    try {
      const data = await api("/v1/admin/boost/trial", token, panelPassword);
      applyBoostTrialState(data);
    } catch (e) {
      setBoostTrialState(null);
      showStatus(e.message || "Failed to load boost trial window.", "error");
    } finally {
      setBoostTrialLoading(false);
    }
  }

  async function saveBoostTrialWindow() {
    const startsAt = parseDateTimeInputValue(boostTrialStartsAt);
    const endsAt = parseDateTimeInputValue(boostTrialEndsAt);
    if (Boolean(startsAt) !== Boolean(endsAt)) {
      showStatus("Set both trial dates or clear both of them.", "info");
      return;
    }
    if (startsAt && endsAt && new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
      showStatus("Trial end must be after the start date.", "info");
      return;
    }

    setBoostTrialSaving(true);
    try {
      const data = await api("/v1/admin/boost/trial", token, panelPassword, {
        method: "PUT",
        body: JSON.stringify({ startsAt, endsAt })
      });
      applyBoostTrialState(data);
      showStatus(data.configured ? "Boost trial window saved." : "Boost trial window cleared.", "success");
    } catch (e) {
      showStatus(e.message || "Failed to save boost trial window.", "error");
    } finally {
      setBoostTrialSaving(false);
    }
  }

  async function clearBoostTrialWindow() {
    setBoostTrialSaving(true);
    try {
      const data = await api("/v1/admin/boost/trial", token, panelPassword, {
        method: "PUT",
        body: JSON.stringify({ startsAt: null, endsAt: null })
      });
      applyBoostTrialState(data);
      showStatus("Boost trial window cleared.", "success");
    } catch (e) {
      showStatus(e.message || "Failed to clear boost trial window.", "error");
    } finally {
      setBoostTrialSaving(false);
    }
  }

  async function grantBoost() {
    const userId = boostUserId.trim();
    if (!userId) {
      showStatus("Enter a user ID first.", "info");
      return;
    }
    if (boostGrantType === "temporary" && (!boostDurationDays || Number(boostDurationDays) < 1)) {
      showStatus("Temporary grants require a valid duration in days.", "info");
      return;
    }
    try {
      await api(`/v1/admin/users/${userId}/boost/grant`, token, panelPassword, {
        method: "POST",
        body: JSON.stringify({
          grantType: boostGrantType,
          durationDays: boostGrantType === "temporary" ? Number(boostDurationDays) : undefined,
          reason: boostReason.trim() || undefined
        })
      });
      await Promise.all([loadBoostState(userId), loadOverview()]);
      showStatus("Boost grant updated.", "success");
    } catch (e) {
      showStatus(e.message || "Failed to grant boost.", "error");
    }
  }

  async function revokeBoost() {
    const userId = boostUserId.trim();
    if (!userId) {
      showStatus("Enter a user ID first.", "info");
      return;
    }
    try {
      await api(`/v1/admin/users/${userId}/boost/revoke`, token, panelPassword, { method: "POST" });
      await Promise.all([loadBoostState(userId), loadOverview()]);
      showStatus("Manual boost grant revoked.", "success");
    } catch (e) {
      showStatus(e.message || "Failed to revoke boost.", "error");
    }
  }

  function queueOfficialRecipient(user) {
    if (!user?.id) return;
    setOfficialQueuedUsers((current) => {
      if (current.some((item) => item.id === user.id)) return current;
      return [
        ...current,
        {
          id: user.id,
          username: user.username || "Unknown",
          email: user.email || null
        }
      ];
    });
  }

  function removeOfficialRecipient(userId) {
    setOfficialQueuedUsers((current) => current.filter((item) => item.id !== userId));
  }

  async function sendOfficialMessage() {
    const trimmedMessage = officialMessage.trim();
    if (!trimmedMessage) {
      showStatus("Write a message first.", "info");
      return;
    }
    if (officialRecipientMode === "selected" && officialQueuedUsers.length === 0) {
      showStatus("Queue at least one user or switch to Everyone.", "info");
      return;
    }

    const confirmed = window.confirm(
      officialRecipientMode === "all"
        ? "Send this official message to every eligible user?"
        : `Send this official message to ${officialQueuedUsers.length} selected user(s)?`
    );
    if (!confirmed) return;

    setOfficialSending(true);
    try {
      const data = await api("/v1/admin/official-messages/send", token, panelPassword, {
        method: "POST",
        body: JSON.stringify({
          recipientMode: officialRecipientMode,
          userIds: officialRecipientMode === "selected" ? officialQueuedUsers.map((user) => user.id) : undefined,
          content: trimmedMessage
        })
      });
      setOfficialReport(data);
      setOfficialMessage("");
      if (officialRecipientMode === "selected") {
        setOfficialQueuedUsers((current) => current.filter((user) => (data.skippedUserIds || []).includes(user.id)));
      }
      await loadOfficialStatus();
      showStatus(`Official message sent to ${data.sentCount || 0} user(s).`, "success");
    } catch (e) {
      showStatus(e.message || "Failed to send official message.", "error");
    } finally {
      setOfficialSending(false);
    }
  }

  function resetOfficialWelcomeDraft() {
    setOfficialWelcomeEnabled(officialStatus?.newUserWelcomeMessage?.enabled === true);
    setOfficialWelcomeMessage(officialStatus?.newUserWelcomeMessage?.content || "");
  }

  async function saveOfficialWelcomeMessage() {
    if (officialWelcomeEnabled && !officialWelcomeMessage.trim()) {
      showStatus("Write the welcome message before enabling it.", "info");
      return;
    }

    setOfficialWelcomeSaving(true);
    try {
      const data = await api("/v1/admin/official-messages/welcome", token, panelPassword, {
        method: "PUT",
        body: JSON.stringify({
          enabled: officialWelcomeEnabled,
          content: officialWelcomeMessage,
        }),
      });
      setOfficialWelcomeEnabled(data?.newUserWelcomeMessage?.enabled === true);
      setOfficialWelcomeMessage(data?.newUserWelcomeMessage?.content || "");
      await loadOfficialStatus();
      showStatus(
        officialWelcomeEnabled
          ? "New user welcome message saved."
          : "New user welcome message disabled.",
        "success",
      );
    } catch (e) {
      showStatus(e.message || "Failed to save new user welcome message.", "error");
    } finally {
      setOfficialWelcomeSaving(false);
    }
  }

  const isOwner = adminStatus?.isPlatformOwner === true;
  const tabs = [
    {
      id: "overview",
      label: "Dashboard",
      group: "Mission control",
      description: "Live graphs for service health, capacity, support pressure, and platform growth.",
    },
    {
      id: "users",
      label: "Users & moderation",
      group: "Core ops",
      description: "Search accounts, inspect status, and jump into the actions your role allows.",
    },
    canManageStaff
      ? {
          id: "staff-accounts",
          label: "Panel accounts",
          group: "Staff ops",
          description: "Dedicated staff logins, titles, and account security posture.",
        }
      : null,
    canManageStaff
      ? {
          id: "staff-permissions",
          label: "Staff permissions",
          group: "Staff ops",
          description: "Templates, permission scopes, and assignment management.",
        }
      : null,
    canManageSupport
      ? {
          id: "staff-scheduling",
          label: "Scheduling",
          group: "Staff ops",
          description: "Plan queue coverage across support, moderation, and on-call work.",
        }
      : null,
    canManageSupport
      ? {
          id: "staff-support",
          label: "Support queue",
          group: "Staff ops",
          description: "Triage tickets, assign ownership, and reply in-thread.",
          count:
            adminOverview.supportTicketsOpen > 0
              ? formatCompactCount(adminOverview.supportTicketsOpen)
              : null,
        }
      : null,
    canSendOfficialMessages
      ? {
          id: "official",
          label: "Official messages",
          group: "Comms",
          description: "Broadcast messages and control welcome-message automation.",
        }
      : null,
    canManageBadges
      ? {
          id: "badges",
          label: "Badges",
          group: "Growth",
          description: "Create badge definitions and manage user badge assignments.",
          count:
            adminOverview.badgeDefinitionsCount > 0
              ? formatCompactCount(adminOverview.badgeDefinitionsCount)
              : null,
        }
      : null,
    canManageBoosts
      ? {
          id: "boost",
          label: "Boost grants",
          group: "Growth",
          description: "Handle manual grants and trial windows for Boost access.",
          count:
            adminOverview.activeBoostGrants > 0
              ? formatCompactCount(adminOverview.activeBoostGrants)
              : null,
        }
      : null,
    canManageBlogs
      ? {
          id: "blogs",
          label: "Blogs",
          group: "Content",
          description: "Draft, review, publish, and maintain platform updates.",
          count:
            adminOverview.publishedBlogsCount > 0
              ? formatCompactCount(adminOverview.publishedBlogsCount)
              : null,
        }
      : null,
    canManageOperations
      ? {
          id: "operations",
          label: "Operations",
          group: "System",
          description: "Restart and update the panel runtime with audit visibility.",
        }
      : null,
  ].filter(Boolean);
  const groupedTabs = tabs.reduce((acc, entry) => {
    const group = entry.group || "Other";
    const existing = acc.find((item) => item.group === group);
    if (existing) {
      existing.items.push(entry);
    } else {
      acc.push({ group, items: [entry] });
    }
    return acc;
  }, []);

  useEffect(() => {
    if (!tabs.some((item) => item.id === tab)) {
      setTab("overview");
    }
  }, [tab, tabs]);

  const operationsRuntime = operationsState?.runtime || null;
  const activeOperation = operationsState?.activeOperation || null;
  const operationHistory = Array.isArray(operationsState?.history)
    ? operationsState.history
    : [];

  const badgeLibrary = [
    ...BUILTIN_BADGE_DEFINITIONS,
    ...badgeDefinitions
      .filter((definition) => !RESERVED_BADGE_IDS.has(definition.badgeId))
      .map((definition) => ({ ...definition, reserved: false })),
  ];
  const selectedBadgeId = badgeDraft.badgeId.trim();
  const selectedBadgeReserved = RESERVED_BADGE_IDS.has(selectedBadgeId);
  const selectedBadgeDefinition = badgeDefinitions.find((definition) => definition.badgeId === selectedBadgeId) || null;
  const badgePreview = getBadgePreview(badgeDraft);
  const loadedUserHasSelectedBadge =
    !!selectedBadgeId && inspectedBadges.some((badge) => badge.badge === selectedBadgeId);
  const selectedPanelAccount =
    panelAccounts.find((account) => account.id === panelAccountDraft.id) || null;

  const roleLabel =
    adminStatus?.platformRole === "owner"
      ? "Owner"
      : adminStatus?.platformRole === "admin"
        ? "Admin"
        : adminStatus?.platformRole === "staff"
          ? "Staff"
          : "Viewer";
  const activeTabConfig =
    tabs.find((item) => item.id === tab) ||
    tabs[0] || {
      group: "Mission control",
      label: "Dashboard",
      description: "Live platform controls.",
    };
  const shellSearchPlaceholder = isStaffSupportTab
    ? "Search support tickets by reference, subject, user, or email..."
    : tab === "users"
      ? "Search users by username or email..."
      : "Quick search";
  const loginStage = setupState ? "setup" : loginChallenge ? "verify" : "credentials";
  const loginChallengeAdminEmail =
    loginChallenge?.admin?.email || loginEmail.trim() || "admin@example.com";

  if (!isPanelUnlocked) {
    return (
      <div className="admin-unlock">
        <div className="admin-auth-shell">
          <section className="admin-auth-hero">
            <p className="admin-eyebrow">OpenCom staff panel</p>
            <h1>Cleaner admin flow. Better signal. Safer access.</h1>
            <p className="admin-unlock-desc">
              Dedicated staff accounts now move through a more logical login
              flow, and the dashboard leads with graphs and operational signals
              instead of a wall of generic cards.
            </p>

            <div className="admin-auth-feature-grid">
              <article className="admin-auth-feature">
                <span>Step-based login</span>
                <strong>Credentials and 2FA are separate.</strong>
                <small>Less clutter during sign-in and a clearer recovery path.</small>
              </article>
              <article className="admin-auth-feature">
                <span>Operational graphs</span>
                <strong>Health, capacity, and support pressure are visual first.</strong>
                <small>Faster scanning for runtime issues, storage growth, and queue load.</small>
              </article>
              <article className="admin-auth-feature">
                <span>Dedicated staff control</span>
                <strong>Security, support, content, and growth stay in one place.</strong>
                <small>Navigation is grouped around how the panel is actually used.</small>
              </article>
            </div>
          </section>

          <section className="admin-unlock-card admin-auth-card">
            <div className="admin-auth-stage">
              <span className={loginStage === "credentials" ? "active" : ""}>Credentials</span>
              <span className={loginStage === "verify" ? "active" : ""}>2FA check</span>
              <span className={loginStage === "setup" ? "active" : ""}>Authenticator setup</span>
            </div>

            {loginStage === "credentials" && (
              <form
                className="admin-auth-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  submitPanelLogin();
                }}
              >
                <div className="admin-auth-form-head">
                  <h2>Sign in to the control panel</h2>
                  <p className="admin-unlock-desc">
                    Start with the email and password for your dedicated panel-admin account.
                  </p>
                </div>

                <label>
                  Admin email
                  <input
                    type="email"
                    placeholder="admin@example.com"
                    value={loginEmail}
                    onChange={(event) => setLoginEmail(event.target.value)}
                    autoComplete="username"
                  />
                </label>
                <label>
                  Password
                  <input
                    type="password"
                    placeholder="Your admin password"
                    value={loginPassword}
                    onChange={(event) => setLoginPassword(event.target.value)}
                    autoComplete="current-password"
                  />
                </label>

                <button type="submit" disabled={loginBusy}>
                  {loginBusy ? "Checking credentials..." : "Continue to verification"}
                </button>
              </form>
            )}

            {loginStage === "verify" && (
              <form
                className="admin-auth-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  submitPanelLoginVerification();
                }}
              >
                <div className="admin-auth-form-head">
                  <h2>Verify your second factor</h2>
                  <p className="admin-unlock-desc">
                    Credentials accepted for <strong>{maskEmail(loginChallengeAdminEmail)}</strong>.
                    Finish the sign-in with your authenticator app or a saved recovery code.
                  </p>
                </div>

                <div className="admin-auth-meta">
                  <span>Account: {loginChallenge?.admin?.username || "Staff admin"}</span>
                  <span>
                    Expires: {loginChallenge?.loginExpiresAt ? formatAdminDateTime(loginChallenge.loginExpiresAt) : "Soon"}
                  </span>
                </div>

                <div className="admin-auth-method-toggle">
                  <button
                    type="button"
                    className={loginVerificationMethod === "totp" ? "active" : ""}
                    onClick={() => setLoginVerificationMethod("totp")}
                  >
                    Authenticator code
                  </button>
                  <button
                    type="button"
                    className={loginVerificationMethod === "recovery" ? "active" : ""}
                    onClick={() => setLoginVerificationMethod("recovery")}
                  >
                    Recovery code
                  </button>
                </div>

                {loginVerificationMethod === "totp" ? (
                  <label>
                    6-digit authenticator code
                    <input
                      type="text"
                      placeholder="123456"
                      value={loginTotpToken}
                      onChange={(event) =>
                        setLoginTotpToken(event.target.value.replace(/\D/g, "").slice(0, 6))
                      }
                      inputMode="numeric"
                    />
                  </label>
                ) : (
                  <label>
                    Recovery code
                    <input
                      type="text"
                      placeholder="ABCD-1234"
                      value={loginRecoveryCode}
                      onChange={(event) => setLoginRecoveryCode(event.target.value.toUpperCase())}
                    />
                  </label>
                )}

                <div className="admin-badge-actions">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setLoginChallenge(null);
                      setLoginVerificationMethod("totp");
                      setLoginTotpToken("");
                      setLoginRecoveryCode("");
                    }}
                  >
                    Back
                  </button>
                  <button type="submit" disabled={loginBusy}>
                    {loginBusy ? "Verifying..." : "Finish sign-in"}
                  </button>
                </div>
              </form>
            )}

            {loginStage === "setup" && (
              <form
                className="admin-auth-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  completePanel2faSetup();
                }}
              >
                <div className="admin-auth-form-head">
                  <h2>Set up your authenticator</h2>
                  <p className="admin-unlock-desc">
                    First login detected. Add this account to your authenticator app,
                    then confirm it with a 6-digit code.
                  </p>
                </div>

                <label>
                  Manual setup key
                  <input type="text" readOnly value={setupState?.totpSecret || ""} />
                </label>
                <label>
                  Authenticator URI
                  <textarea
                    readOnly
                    value={setupState?.otpauthUri || ""}
                    rows={3}
                    className="admin-official-textarea"
                  />
                </label>
                <label>
                  6-digit authenticator code
                  <input
                    type="text"
                    placeholder="123456"
                    value={setupTotpToken}
                    onChange={(event) =>
                      setSetupTotpToken(event.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    inputMode="numeric"
                  />
                </label>

                <div className="admin-badge-actions">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setSetupState(null);
                      setSetupTotpToken("");
                    }}
                  >
                    Cancel
                  </button>
                  <button type="submit" disabled={setupBusy}>
                    {setupBusy ? "Verifying..." : "Verify and continue"}
                  </button>
                </div>
              </form>
            )}

            {status ? (
              <p className={`admin-status-msg admin-status-msg-${statusType}`}>{status}</p>
            ) : null}
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-panel admin-redesign">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-brand">
          <span className="admin-sidebar-logo">OC</span>
          <div>
            <strong>OpenCom</strong>
            <span>Staff Panel</span>
          </div>
        </div>

        <div className="admin-sidebar-user">
          <strong>{adminStatus?.username || "Panel User"}</strong>
          <span>{adminStatus?.email || "No email loaded"}</span>
          <small>{roleLabel} access</small>
        </div>

        <nav className="admin-sidebar-nav">
          {groupedTabs.map((group) => (
            <div key={group.group} className="admin-sidebar-group">
              <p className="admin-sidebar-group-label">{group.group}</p>
              {group.items.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className={tab === entry.id ? "active" : ""}
                  onClick={() => setTab(entry.id)}
                >
                  <span className="admin-nav-button-copy">
                    <strong>{entry.label}</strong>
                    <small>{entry.description}</small>
                  </span>
                  {entry.count ? <span className="admin-nav-button-badge">{entry.count}</span> : null}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="admin-sidebar-footer">
          <a href={SERVER_ADMIN_URL} target="_blank" rel="noopener noreferrer" className="admin-link-out">
            Open Server Admin
          </a>
          <button type="button" className="admin-lock-btn" onClick={logoutPanel}>
            Sign out
          </button>
        </div>
      </aside>

      <div className="admin-workspace">
        <header className="admin-workspace-topbar">
          <div className="admin-workspace-topbar-copy">
            <span className="admin-workspace-kicker">{activeTabConfig.group}</span>
            <h1>{activeTabConfig.label}</h1>
            <p>{activeTabConfig.description}</p>
          </div>
          <div className="admin-workspace-topbar-tools">
            <div className="admin-workspace-search">
              <input
                placeholder={shellSearchPlaceholder}
                value={shellSearch}
                onChange={(e) => setShellSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runGlobalSearch()}
              />
              <button type="button" onClick={runGlobalSearch}>
                Search
              </button>
            </div>
            <div className="admin-workspace-metrics">
              <span>{roleLabel}</span>
              <span>{adminOverview.supportTicketsOpen || 0} open tickets</span>
              <span>{adminOverview.staffAssignmentsCount || 0} staff assignments</span>
              <span>{adminOverview.activeBoostGrants || 0} active boosts</span>
            </div>
          </div>
        </header>

        <div className="admin-content">
        {freshRecoveryCodes.length > 0 && (
          <section className="admin-section">
            <div className="admin-card admin-card-accent admin-recovery-callout">
              <h3>Save your recovery codes</h3>
              <p className="admin-hint">
                These are shown once after authenticator setup. Store them before closing this panel.
              </p>
              <div className="admin-recovery-code-list">
                {freshRecoveryCodes.map((code) => (
                  <code key={code}>{code}</code>
                ))}
              </div>
              <button type="button" onClick={() => setFreshRecoveryCodes([])}>
                I saved these codes
              </button>
            </div>
          </section>
        )}

        {tab === "overview" && (
          <AdminOverviewDashboard
            adminOverview={adminOverview}
            stats={dashboardStats}
            loading={dashboardLoading}
            onRefresh={refreshDashboard}
          />
        )}

        {tab === "users" && (
          <section className="admin-section">
            <div className="admin-section-topline">
              <div>
                <h2>User search & platform actions</h2>
                <p className="admin-hint">Search by username or email, then apply the actions your panel permissions allow.</p>
              </div>
            </div>
            <div className="admin-search-row">
              <input placeholder="Username or email" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && searchUsers()} />
              <button type="button" onClick={searchUsers} disabled={searching}>{searching ? "Searching…" : "Search"}</button>
            </div>
            <div className="admin-users-table-wrap">
              {users.length > 0 ? (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Username</th>
                      <th>Email</th>
                      <th>User ID</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td>
                          <strong>{u.username || "—"}</strong>
                          {String(u.username || "").trim().toLowerCase() === "opencom" && (
                            <span className="admin-inline-badge">OFFICIAL</span>
                          )}
                        </td>
                        <td>{u.email || "—"}</td>
                        <td><code>{u.id}</code></td>
                        <td>{u.isBanned ? <span className="text-dim">Banned</span> : <span className="text-dim">Active</span>}</td>
                        <td>
                          {canSendOfficialMessages && (
                            <button
                              type="button"
                              className="btn-sm"
                              onClick={() => {
                                queueOfficialRecipient(u);
                                setTab("official");
                              }}
                              disabled={userActionBusyId === u.id || officialQueuedUsers.some((user) => user.id === u.id)}
                            >
                              {officialQueuedUsers.some((user) => user.id === u.id) ? "Queued" : "Queue"}
                            </button>
                          )}
                          {isOwner && <button type="button" className="btn-sm" onClick={() => setFounder(u.id)} disabled={userActionBusyId === u.id}>Set founder</button>}
                          {isOwner && <button type="button" className="btn-sm" onClick={() => setAdmin(u.id, true)} disabled={userActionBusyId === u.id}>Make admin</button>}
                          {isOwner && <button type="button" className="btn-sm danger" onClick={() => setAdmin(u.id, false)} disabled={userActionBusyId === u.id}>Remove admin</button>}
                          {canManageBadges && <button type="button" className="btn-sm" onClick={() => { inspectUser(u.id); setTab("badges"); }} disabled={userActionBusyId === u.id}>Badges</button>}
                          {canManageBoosts && <button type="button" className="btn-sm" onClick={() => { setBoostUserId(u.id); loadBoostState(u.id); setTab("boost"); }} disabled={userActionBusyId === u.id}>Boost</button>}
                          {canModerateUsers && (u.isBanned ? (
                            <button type="button" className="btn-sm" onClick={() => setAccountBan(u.id, false)} disabled={userActionBusyId === u.id}>Unban</button>
                          ) : (
                            <button type="button" className="btn-sm danger" onClick={() => setAccountBan(u.id, true)} disabled={userActionBusyId === u.id}>Ban</button>
                          ))}
                          {isOwner && (
                            <button type="button" className="btn-sm danger" onClick={() => deleteUserAccount(u.id)} disabled={userActionBusyId === u.id}>
                              Delete account
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-dim">Run a search to see users.</p>
              )}
            </div>
          </section>
        )}

        {isAnyStaffTab && (
          <section className="admin-section">
            <div className="admin-section-topline">
              <div>
                <h2>
                  {isStaffAccountsTab
                    ? "Panel accounts"
                    : isStaffPermissionsTab
                      ? "Staff permissions"
                      : isStaffSchedulingTab
                        ? "Scheduling"
                        : "Support queue"}
                </h2>
                <p className="admin-hint">
                  {isStaffAccountsTab
                    ? "Create and manage dedicated panel accounts. These are separate from normal platform user accounts."
                    : isStaffPermissionsTab
                      ? "Define what each panel staff account can do with role templates and explicit permission sets."
                      : isStaffSchedulingTab
                        ? "Plan shift coverage across support, moderation, operations, and on-call windows."
                        : "Work support tickets with focused filters, assignment controls, and threaded replies."}
                </p>
              </div>
              <div className="admin-badge-actions">
                <button
                  type="button"
                  className="btn-sm"
                  onClick={() => {
                    if (isStaffAccountsTab || isStaffPermissionsTab) {
                      loadPanelAccounts();
                      loadStaffAssignments();
                      return;
                    }
                    if (isStaffSchedulingTab) {
                      loadPanelAccounts();
                      loadStaffSchedules({ showSuccess: true });
                      return;
                    }
                    if (isStaffSupportTab) {
                      loadPanelAccounts();
                      loadSupportOverview();
                      loadSupportTickets({ showSuccess: true });
                    }
                  }}
                  disabled={
                    (isStaffAccountsTab || isStaffPermissionsTab)
                      ? panelAccountsLoading || staffLoading
                      : isStaffSchedulingTab
                        ? panelAccountsLoading || schedulesLoading
                        : panelAccountsLoading || supportLoading
                  }
                >
                  {(isStaffAccountsTab || isStaffPermissionsTab)
                    ? panelAccountsLoading || staffLoading
                      ? "Refreshing…"
                      : "Refresh staff data"
                    : isStaffSchedulingTab
                      ? schedulesLoading
                        ? "Refreshing…"
                        : "Refresh schedules"
                      : supportLoading
                        ? "Refreshing…"
                        : "Refresh support queue"}
                </button>
              </div>
            </div>

            {(isStaffAccountsTab || isStaffPermissionsTab) && canManageStaff && (
              <>
                <div className="admin-cards">
                  <div className="admin-card">
                    <h3>Panel accounts</h3>
                    <p><strong>{panelAccounts.length}</strong> account(s)</p>
                    <p className="text-dim">Assignments here apply only to dedicated panel-admin accounts.</p>
                  </div>
                  {isStaffPermissionsTab && (
                    <div className="admin-card">
                      <h3>Active staff assignments</h3>
                      <p><strong>{staffAssignments.length}</strong> staff account(s)</p>
                      <p className="text-dim">Owners/admins always keep full access and are not edited here.</p>
                    </div>
                  )}
                  {isStaffPermissionsTab ? (
                    <div className="admin-card">
                      <h3>Quick templates</h3>
                      <div className="admin-template-grid">
                        {STAFF_TEMPLATES.map((template) => (
                          <button
                            key={template.id}
                            type="button"
                            className="admin-template-btn"
                            onClick={() => applyStaffTemplate(template)}
                          >
                            <strong>{template.title}</strong>
                            <span>{template.permissions.join(", ")}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="admin-card">
                      <h3>Account security</h3>
                      <p>
                        <strong>
                          {panelAccounts.filter((account) => !account.twoFactorEnabled && !account.disabledAt).length}
                        </strong>{" "}
                        account(s) need 2FA setup
                      </p>
                      <p className="text-dim">
                        Accounts without active 2FA cannot safely handle support or moderation workflows.
                      </p>
                    </div>
                  )}
                </div>

                <div className="admin-official-grid">
                  {isStaffAccountsTab && (
                    <div className="admin-card">
                      <h3>{panelAccountDraft.id ? "Edit panel account" : "Create panel account"}</h3>
                      <div className="admin-badge-form">
                        <input
                          type="email"
                          placeholder="Admin email"
                          value={panelAccountDraft.email}
                          onChange={(e) => setPanelAccountDraft((current) => ({ ...current, email: e.target.value }))}
                        />
                        <input
                          placeholder="Username"
                          value={panelAccountDraft.username}
                          onChange={(e) => setPanelAccountDraft((current) => ({ ...current, username: e.target.value }))}
                        />
                      </div>

                      {!panelAccountDraft.id && (
                        <input
                          type="password"
                          placeholder="Initial password"
                          value={panelAccountDraft.password}
                          onChange={(e) => setPanelAccountDraft((current) => ({ ...current, password: e.target.value }))}
                        />
                      )}

                      <div className="admin-badge-form">
                        <select
                          value={panelAccountDraft.role}
                          disabled={!isOwner && panelAccountDraft.role !== "staff"}
                          onChange={(e) => updatePanelAccountRole(e.target.value)}
                        >
                          <option value="staff">Staff</option>
                          <option value="admin" disabled={!isOwner}>Admin</option>
                          <option value="owner" disabled={!isOwner}>Owner</option>
                        </select>
                        <input
                          placeholder="Display title"
                          value={panelAccountDraft.title}
                          onChange={(e) => setPanelAccountDraft((current) => ({ ...current, title: e.target.value }))}
                        />
                      </div>

                      <textarea
                        className="admin-official-textarea"
                        placeholder="Internal notes"
                        value={panelAccountDraft.notes}
                        onChange={(e) => setPanelAccountDraft((current) => ({ ...current, notes: e.target.value }))}
                      />

                      <label className="admin-setting-check">
                        <input
                          type="checkbox"
                          checked={panelAccountDraft.disabled}
                          onChange={(e) => setPanelAccountDraft((current) => ({ ...current, disabled: e.target.checked }))}
                          disabled={!panelAccountDraft.id}
                        />
                        <span>Disable this panel account</span>
                      </label>

                      <div className="admin-permission-grid">
                        {PANEL_PERMISSION_OPTIONS.map((permission) => (
                          <label key={`account-${permission.id}`} className="admin-permission-card">
                            <input
                              type="checkbox"
                              checked={
                                panelAccountDraft.role === "staff"
                                  ? panelAccountDraft.permissions.includes(permission.id)
                                  : true
                              }
                              onChange={() => togglePanelAccountPermission(permission.id)}
                              disabled={panelAccountDraft.role !== "staff"}
                            />
                            <strong>{permission.label}</strong>
                            <span>{permission.description}</span>
                          </label>
                        ))}
                      </div>

                      {selectedPanelAccount ? (
                        <p className="text-dim">
                          Last login: {selectedPanelAccount.lastLoginAt ? formatAdminDateTime(selectedPanelAccount.lastLoginAt) : "Never"} ·
                          {" "}2FA: {selectedPanelAccount.twoFactorEnabled ? "enabled" : "pending setup"}
                        </p>
                      ) : null}

                      <div className="admin-badge-actions">
                        <button
                          type="button"
                          onClick={savePanelAccount}
                          disabled={panelAccountBusy || (!isOwner && panelAccountDraft.role !== "staff")}
                        >
                          {panelAccountBusy ? "Saving…" : panelAccountDraft.id ? "Update account" : "Create account"}
                        </button>
                        <button type="button" className="btn-sm" onClick={resetPanelAccountDraft} disabled={panelAccountBusy}>
                          New draft
                        </button>
                      </div>

                      {panelAccountDraft.id && (
                        <div className="admin-badge-form">
                          <input
                            type="password"
                            placeholder="New password"
                            value={panelAccountPasswordDraft}
                            onChange={(e) => setPanelAccountPasswordDraft(e.target.value)}
                          />
                          <button
                            type="button"
                            className="btn-sm danger"
                            onClick={resetPanelAccountPassword}
                            disabled={panelAccountBusy}
                          >
                            Reset password
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {isStaffPermissionsTab && (
                    <div className="admin-card">
                    <h3>Edit panel-account assignment</h3>
                    <div className="admin-user-pick-row">
                      <select value={staffUserId} onChange={(e) => setStaffUserId(e.target.value)}>
                        <option value="">Select panel account…</option>
                        {panelAccounts
                          .filter((account) => account.role === "staff" && !account.disabledAt)
                          .map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.username} ({account.email})
                            </option>
                          ))}
                      </select>
                      <button type="button" className="btn-sm" onClick={loadStaffAssignments} disabled={staffLoading}>
                        {staffLoading ? "Refreshing…" : "Refresh assignments"}
                      </button>
                    </div>

                    <div className="admin-badge-form">
                      <input placeholder="Level key" value={staffLevelKey} onChange={(e) => setStaffLevelKey(e.target.value)} />
                      <input placeholder="Display title" value={staffTitle} onChange={(e) => setStaffTitle(e.target.value)} />
                    </div>

                    <textarea
                      className="admin-official-textarea"
                      placeholder="Internal notes for this staff assignment"
                      value={staffNotes}
                      onChange={(e) => setStaffNotes(e.target.value)}
                    />

                    <div className="admin-permission-grid">
                      {PANEL_PERMISSION_OPTIONS.map((permission) => (
                        <label key={permission.id} className="admin-permission-card">
                          <input
                            type="checkbox"
                            checked={staffPermissions.includes(permission.id)}
                            onChange={() => toggleStaffPermission(permission.id)}
                          />
                          <strong>{permission.label}</strong>
                          <span>{permission.description}</span>
                        </label>
                      ))}
                    </div>

                    <div className="admin-badge-actions">
                      <button type="button" onClick={saveStaffAssignment} disabled={staffBusy}>
                        {staffBusy ? "Saving…" : "Save assignment"}
                      </button>
                      <button type="button" className="danger" onClick={() => removeStaffAssignment()} disabled={staffBusy}>
                        Remove assignment
                      </button>
                    </div>
                    </div>
                  )}

                  {isStaffPermissionsTab && (
                    <div className="admin-card">
                    <h3>Current panel staff</h3>
                    {staffLoading ? (
                      <p className="text-dim">Loading staff assignments…</p>
                    ) : staffAssignments.length === 0 ? (
                      <p className="text-dim">No panel staff assigned yet.</p>
                    ) : (
                      <div className="admin-staff-list">
                        {staffAssignments.map((assignment) => (
                          <button
                            key={assignment.adminId || assignment.userId}
                            type="button"
                            className="admin-staff-row"
                            onClick={() => editStaffAssignment(assignment)}
                          >
                            <strong>{assignment.username}</strong>
                            <span>{assignment.title}</span>
                            <small>{assignment.permissions.join(", ")}</small>
                          </button>
                        ))}
                      </div>
                    )}
                    </div>
                  )}

                  <div className="admin-card">
                    <h3>{isStaffAccountsTab ? "Panel account directory" : "Staff account directory"}</h3>
                    {panelAccountsLoading ? (
                      <p className="text-dim">Loading panel accounts…</p>
                    ) : panelAccounts.length === 0 ? (
                      <p className="text-dim">No panel accounts available.</p>
                    ) : (
                      <div className="admin-staff-list">
                        {panelAccounts
                          .filter((account) => (isStaffPermissionsTab ? account.role === "staff" : true))
                          .map((account) => (
                          <button
                            key={account.id}
                            type="button"
                            className={`admin-staff-row ${(isStaffAccountsTab ? panelAccountDraft.id : staffUserId) === account.id ? "active" : ""}`}
                            onClick={() => {
                              openPanelAccountDraft(account);
                              if (account.role === "staff") setStaffUserId(account.id);
                            }}
                          >
                            <strong>{account.username}</strong>
                            <span>{account.role} · {account.title || "Staff"}</span>
                            <small>{account.email}</small>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {isStaffSchedulingTab && canManageSupport && (
              <>
                <div className="admin-cards">
                  <div className="admin-card">
                    <h3>Scheduled shifts</h3>
                    <p><strong>{schedules.length}</strong> shift(s)</p>
                    <p className="text-dim">Range {scheduleStartDate || "…"} to {scheduleEndDate || "…"}</p>
                  </div>
                  <div className="admin-card">
                    <h3>Coverage focus</h3>
                    <p><strong>{scheduleFilterAdminId ? "Filtered" : "All staff"}</strong></p>
                    <p className="text-dim">Assign support, moderation, operations, and on-call windows.</p>
                  </div>
                </div>

                <div className="admin-search-row">
                  <input type="date" value={scheduleStartDate} onChange={(e) => setScheduleStartDate(e.target.value)} />
                  <input type="date" value={scheduleEndDate} onChange={(e) => setScheduleEndDate(e.target.value)} />
                  <select value={scheduleFilterAdminId} onChange={(e) => setScheduleFilterAdminId(e.target.value)}>
                    <option value="">All panel staff</option>
                    {panelAccounts
                      .filter((account) => !account.disabledAt)
                      .map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.username} ({account.role})
                        </option>
                      ))}
                  </select>
                  <button type="button" onClick={() => loadStaffSchedules({ showSuccess: true })} disabled={schedulesLoading}>
                    {schedulesLoading ? "Refreshing…" : "Refresh schedules"}
                  </button>
                </div>

                <div className="admin-official-grid">
                  <div className="admin-card">
                    <h3>{scheduleDraft.id ? "Edit shift" : "Create shift"}</h3>
                    <div className="admin-badge-form admin-staff-schedule-grid">
                      <select value={scheduleDraft.adminId} onChange={(e) => setScheduleDraft((current) => ({ ...current, adminId: e.target.value }))}>
                        <option value="">Select panel staff…</option>
                        {panelAccounts
                          .filter((account) => !account.disabledAt)
                          .map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.username} ({account.role})
                            </option>
                          ))}
                      </select>
                      <input type="date" value={scheduleDraft.shiftDate} onChange={(e) => setScheduleDraft((current) => ({ ...current, shiftDate: e.target.value }))} />
                      <input type="time" value={scheduleDraft.startTime} onChange={(e) => setScheduleDraft((current) => ({ ...current, startTime: e.target.value }))} />
                      <input type="time" value={scheduleDraft.endTime} onChange={(e) => setScheduleDraft((current) => ({ ...current, endTime: e.target.value }))} />
                      <select value={scheduleDraft.shiftType} onChange={(e) => setScheduleDraft((current) => ({ ...current, shiftType: e.target.value }))}>
                        {STAFF_SCHEDULE_TYPES.map((entry) => (
                          <option key={entry.id} value={entry.id}>{entry.label}</option>
                        ))}
                      </select>
                      <input
                        placeholder="Timezone (e.g. Europe/London)"
                        value={scheduleDraft.timezone}
                        onChange={(e) => setScheduleDraft((current) => ({ ...current, timezone: e.target.value }))}
                      />
                    </div>

                    <textarea
                      className="admin-official-textarea"
                      placeholder="Shift notes"
                      value={scheduleDraft.note}
                      onChange={(e) => setScheduleDraft((current) => ({ ...current, note: e.target.value }))}
                    />

                    <div className="admin-badge-actions">
                      <button type="button" onClick={saveSchedule} disabled={schedulesBusy}>
                        {schedulesBusy ? "Saving…" : scheduleDraft.id ? "Update shift" : "Create shift"}
                      </button>
                      <button type="button" className="btn-sm" onClick={resetScheduleDraft} disabled={schedulesBusy}>
                        Clear form
                      </button>
                      <button type="button" className="danger" onClick={() => deleteSchedule()} disabled={schedulesBusy || !scheduleDraft.id}>
                        Remove shift
                      </button>
                    </div>
                  </div>

                  <div className="admin-card">
                    <h3>Shift board</h3>
                    {schedulesLoading ? (
                      <p className="text-dim">Loading schedules…</p>
                    ) : schedules.length === 0 ? (
                      <p className="text-dim">No shifts in this range.</p>
                    ) : (
                      <div className="admin-users-table-wrap">
                        <table className="admin-table">
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th>Staff</th>
                              <th>Window</th>
                              <th>Type</th>
                              <th>Timezone</th>
                            </tr>
                          </thead>
                          <tbody>
                            {schedules.map((entry) => (
                              <tr
                                key={entry.id}
                                className={scheduleDraft.id === entry.id ? "admin-support-row-active" : ""}
                                onClick={() => editSchedule(entry)}
                              >
                                <td>{entry.shiftDate}</td>
                                <td>{entry?.staff?.username || entry.adminId}</td>
                                <td>{entry.startTime} - {entry.endTime}</td>
                                <td>{entry.shiftType}</td>
                                <td>{entry.timezone}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {isStaffSupportTab && canManageSupport && (
              <>
                <div className="admin-cards">
                  <div className="admin-card">
                    <h3>Unresolved tickets</h3>
                    <p><strong>{supportOverview?.unresolvedTickets ?? 0}</strong></p>
                    <p className="text-dim">Open + waiting queues.</p>
                  </div>
                  <div className="admin-card">
                    <h3>Unassigned tickets</h3>
                    <p><strong>{supportOverview?.unassignedTickets ?? 0}</strong></p>
                    <p className="text-dim">Needs triage assignment.</p>
                  </div>
                  <div className="admin-card">
                    <h3>Total tickets</h3>
                    <p><strong>{supportOverview?.totalTickets ?? 0}</strong></p>
                    <p className="text-dim">All historical support references.</p>
                  </div>
                </div>

                <div className="admin-search-row">
                  <select value={supportFilters.category} onChange={(e) => setSupportFilters((current) => ({ ...current, category: e.target.value }))}>
                    <option value="">All types</option>
                    {SUPPORT_CATEGORY_OPTIONS.map((entry) => (
                      <option key={entry.id} value={entry.id}>{entry.label}</option>
                    ))}
                  </select>
                  <select value={supportFilters.status} onChange={(e) => setSupportFilters((current) => ({ ...current, status: e.target.value }))}>
                    <option value="">All statuses</option>
                    {SUPPORT_STATUS_OPTIONS.map((entry) => (
                      <option key={entry.id} value={entry.id}>{entry.label}</option>
                    ))}
                  </select>
                  <select value={supportFilters.priority} onChange={(e) => setSupportFilters((current) => ({ ...current, priority: e.target.value }))}>
                    <option value="">All priorities</option>
                    {SUPPORT_PRIORITY_OPTIONS.map((entry) => (
                      <option key={entry.id} value={entry.id}>{entry.label}</option>
                    ))}
                  </select>
                  <select value={supportFilters.assignedToUserId} onChange={(e) => setSupportFilters((current) => ({ ...current, assignedToUserId: e.target.value }))}>
                    <option value="">Anyone</option>
                    <option value="__unassigned__">Unassigned</option>
                    <option value="__me__">Assigned to me</option>
                    {panelAccounts
                      .filter((account) => !account.disabledAt)
                      .map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.username}
                        </option>
                      ))}
                  </select>
                  <input
                    placeholder="Search reference, subject, username, or email"
                    value={supportFilters.query}
                    onChange={(e) => setSupportFilters((current) => ({ ...current, query: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && loadSupportTickets({ showSuccess: true })}
                  />
                  <button type="button" onClick={() => loadSupportTickets({ showSuccess: true })} disabled={supportLoading}>
                    {supportLoading ? "Refreshing…" : "Apply filters"}
                  </button>
                </div>

                <div className="admin-staff-support-grid">
                  <div className="admin-card">
                    <h3>Ticket queue</h3>
                    {supportLoading ? (
                      <p className="text-dim">Loading support tickets…</p>
                    ) : supportTickets.length === 0 ? (
                      <p className="text-dim">No tickets match the current filters.</p>
                    ) : (
                      <div className="admin-users-table-wrap">
                        <table className="admin-table">
                          <thead>
                            <tr>
                              <th>Reference</th>
                              <th>Type</th>
                              <th>Status</th>
                              <th>Priority</th>
                              <th>Assignee</th>
                            </tr>
                          </thead>
                          <tbody>
                            {supportTickets.map((ticket) => (
                              <tr
                                key={ticket.id}
                                className={selectedSupportTicketId === ticket.id ? "admin-support-row-active" : ""}
                                onClick={() => openSupportTicket(ticket.id)}
                              >
                                <td>
                                  <strong>{ticket.reference}</strong>
                                  <div className="text-dim">{ticket.subject}</div>
                                </td>
                                <td>{formatSupportCategory(ticket.category)}</td>
                                <td>{formatSupportStatus(ticket.status)}</td>
                                <td>{formatSupportPriority(ticket.priority)}</td>
                                <td>{ticket.assignedTo?.username || "Unassigned"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div className="admin-card">
                    <h3>Ticket workspace</h3>
                    {!selectedSupportTicketId ? (
                      <p className="text-dim">Pick a ticket from the queue to inspect and respond.</p>
                    ) : supportDetailLoading ? (
                      <p className="text-dim">Loading ticket details…</p>
                    ) : !supportDetail?.ticket ? (
                      <p className="text-dim">Ticket could not be loaded.</p>
                    ) : (
                      <>
                        <div className="admin-support-ticket-head">
                          <strong>{supportDetail.ticket.reference}</strong>
                          <span>{supportDetail.ticket.contactEmail}</span>
                        </div>

                        <div className="admin-badge-form admin-staff-schedule-grid">
                          <input
                            placeholder="Subject"
                            value={supportUpdateDraft.subject}
                            onChange={(e) => setSupportUpdateDraft((current) => ({ ...current, subject: e.target.value }))}
                          />
                          <select
                            value={supportUpdateDraft.category}
                            onChange={(e) => setSupportUpdateDraft((current) => ({ ...current, category: e.target.value }))}
                          >
                            {SUPPORT_CATEGORY_OPTIONS.map((entry) => (
                              <option key={entry.id} value={entry.id}>{entry.label}</option>
                            ))}
                          </select>
                          <select
                            value={supportUpdateDraft.priority}
                            onChange={(e) => setSupportUpdateDraft((current) => ({ ...current, priority: e.target.value }))}
                          >
                            {SUPPORT_PRIORITY_OPTIONS.map((entry) => (
                              <option key={entry.id} value={entry.id}>{entry.label}</option>
                            ))}
                          </select>
                          <select
                            value={supportUpdateDraft.status}
                            onChange={(e) => setSupportUpdateDraft((current) => ({ ...current, status: e.target.value }))}
                          >
                            {SUPPORT_STATUS_OPTIONS.map((entry) => (
                              <option key={entry.id} value={entry.id}>{entry.label}</option>
                            ))}
                          </select>
                          <select
                            value={supportUpdateDraft.assignedToUserId || "__unassigned__"}
                            onChange={(e) => setSupportUpdateDraft((current) => ({ ...current, assignedToUserId: e.target.value }))}
                          >
                            <option value="__unassigned__">Unassigned</option>
                            <option value="__me__">Assign to me</option>
                            {panelAccounts
                              .filter((account) => !account.disabledAt)
                              .map((account) => (
                                <option key={account.id} value={account.id}>{account.username}</option>
                              ))}
                          </select>
                        </div>

                        <div className="admin-badge-actions">
                          <button type="button" onClick={saveSupportTicketUpdates} disabled={supportBusy}>
                            {supportBusy ? "Saving…" : "Save ticket changes"}
                          </button>
                          <button type="button" className="btn-sm" onClick={() => openSupportTicket(selectedSupportTicketId)} disabled={supportBusy}>
                            Reload ticket
                          </button>
                        </div>

                        <div className="admin-support-thread">
                          {(supportDetail.messages || []).map((message) => (
                            <article
                              key={message.id}
                              className={`admin-support-message ${message.isInternalNote ? "is-internal" : ""}`}
                            >
                              <div className="admin-support-message-head">
                                <strong>{message.authorName || message.authorType}</strong>
                                <span>{formatAdminDateTime(message.createdAt)}</span>
                              </div>
                              <p>{message.body}</p>
                            </article>
                          ))}
                        </div>

                        <textarea
                          className="admin-official-textarea"
                          placeholder="Write a reply to the requester or an internal note..."
                          value={supportReplyMessage}
                          onChange={(e) => setSupportReplyMessage(e.target.value)}
                        />
                        <div className="admin-badge-form">
                          <label className="admin-setting-check">
                            <input
                              type="checkbox"
                              checked={supportReplyInternal}
                              onChange={(e) => setSupportReplyInternal(e.target.checked)}
                            />
                            <span>Send as internal note</span>
                          </label>
                          <select value={supportReplyNextStatus} onChange={(e) => setSupportReplyNextStatus(e.target.value)}>
                            <option value="">Auto status</option>
                            {SUPPORT_STATUS_OPTIONS.map((entry) => (
                              <option key={entry.id} value={entry.id}>{entry.label}</option>
                            ))}
                          </select>
                        </div>

                        <div className="admin-badge-actions">
                          <button type="button" onClick={sendSupportReply} disabled={supportBusy}>
                            {supportBusy ? "Sending…" : "Send reply"}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </>
            )}

            {!canManageStaff && !canManageSupport && (
              <div className="admin-card">
                <p className="text-dim">Your account can sign in, but it does not currently have staff-hub permissions.</p>
              </div>
            )}
          </section>
        )}

        {tab === "official" && (
          <section className="admin-section">
            <div className="admin-section-topline">
              <div>
                <h2>Official messages</h2>
                <p className="admin-hint">Send platform announcements from the `opencom` no-reply account to a selected audience or everyone at once.</p>
              </div>
            </div>

            <div className="admin-cards">
              <div className="admin-card admin-card-accent">
                <h3>Official sender</h3>
                {officialStatus?.officialAccount ? (
                  <div className="admin-official-account">
                    <p>
                      <strong>{officialStatus.officialAccount.displayName || officialStatus.officialAccount.username}</strong>
                      <span className="admin-inline-badge">OFFICIAL</span>
                    </p>
                    <code>{officialStatus.officialAccount.id}</code>
                    <p className="text-dim">No-reply enabled. Replies are blocked in the DM composer.</p>
                  </div>
                ) : (
                  <p className="text-dim">The `opencom` user was not found. Create that account first.</p>
                )}
              </div>

              <div className="admin-card">
                <h3>Reach</h3>
                <p><strong>{officialStatus?.reachableUserCount ?? 0}</strong> eligible users</p>
                <p className="text-dim">Banned accounts and the `opencom` account itself are excluded.</p>
              </div>

              <div className="admin-card">
                <h3>Queued recipients</h3>
                <p><strong>{officialQueuedUsers.length}</strong> selected user(s)</p>
                <p className="text-dim">Use the Users tab to queue specific people, or switch the audience to Everyone.</p>
              </div>

              <div className="admin-card">
                <h3>New user welcome</h3>
                <p><strong>{officialStatus?.newUserWelcomeMessage?.enabled ? "Enabled" : "Disabled"}</strong></p>
                <p className="text-dim">
                  {officialStatus?.newUserWelcomeMessage?.active
                    ? "Future signups will receive this DM from the official account."
                    : officialStatus?.newUserWelcomeMessage?.enabled
                      ? "Saved, but it will only send when the official account exists and the message is not blank."
                      : "No automatic DM is sent after signup."}
                </p>
              </div>
            </div>

            <div className="admin-official-grid">
              <div className="admin-card">
                <h3>Audience</h3>
                <div className="admin-boost-mode">
                  <label>
                    <input
                      type="radio"
                      name="official-recipient-mode"
                      checked={officialRecipientMode === "selected"}
                      onChange={() => setOfficialRecipientMode("selected")}
                    />
                    <span>Selected users</span>
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="official-recipient-mode"
                      checked={officialRecipientMode === "all"}
                      onChange={() => setOfficialRecipientMode("all")}
                    />
                    <span>Everyone</span>
                  </label>
                </div>

                <textarea
                  className="admin-official-textarea"
                  placeholder="Write the announcement as the OpenCom official account…"
                  value={officialMessage}
                  onChange={(e) => setOfficialMessage(e.target.value)}
                />

                <div className="admin-badge-actions">
                  <button
                    type="button"
                    onClick={sendOfficialMessage}
                    disabled={officialSending || !officialStatus?.officialAccount}
                  >
                    {officialSending ? "Sending…" : "Send official message"}
                  </button>
                  <button type="button" className="btn-sm" onClick={loadOfficialStatus}>
                    Refresh status
                  </button>
                </div>
              </div>

              <div className="admin-card">
                <h3>New user welcome DM</h3>
                <label className="admin-setting-check">
                  <input
                    type="checkbox"
                    checked={officialWelcomeEnabled}
                    onChange={(e) => setOfficialWelcomeEnabled(e.target.checked)}
                  />
                  <span>Automatically DM each newly created account from `opencom`.</span>
                </label>

                <textarea
                  className="admin-official-textarea"
                  placeholder="Write the DM every new user should receive after signup…"
                  value={officialWelcomeMessage}
                  onChange={(e) => setOfficialWelcomeMessage(e.target.value)}
                />

                <p className="text-dim">This affects future registrations only. Existing users are not backfilled.</p>

                <div className="admin-badge-actions">
                  <button
                    type="button"
                    onClick={saveOfficialWelcomeMessage}
                    disabled={officialWelcomeSaving}
                  >
                    {officialWelcomeSaving ? "Saving…" : "Save welcome message"}
                  </button>
                  <button
                    type="button"
                    className="btn-sm"
                    onClick={resetOfficialWelcomeDraft}
                  >
                    Reset
                  </button>
                </div>
              </div>

              <div className="admin-card">
                <h3>Selected users</h3>
                {officialQueuedUsers.length === 0 ? (
                  <p className="text-dim">No users queued yet.</p>
                ) : (
                  <div className="admin-official-recipient-list">
                    {officialQueuedUsers.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        className="admin-official-recipient"
                        onClick={() => removeOfficialRecipient(user.id)}
                        title="Remove from selected recipients"
                      >
                        <strong>{user.username}</strong>
                        <span>{user.email || user.id}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="admin-card">
              <h3>Last send result</h3>
              {!officialReport ? (
                <p className="text-dim">No official message has been sent in this session.</p>
              ) : (
                <div className="admin-official-report">
                  <p><strong>Mode:</strong> {officialReport.recipientMode}</p>
                  <p><strong>Sent:</strong> {officialReport.sentCount || 0}</p>
                  <p><strong>Skipped:</strong> {(officialReport.skippedUserIds || []).length}</p>
                  {(officialReport.recipients || []).length > 0 && (
                    <div className="admin-users-table-wrap">
                      <table className="admin-table">
                        <thead>
                          <tr>
                            <th>User</th>
                            <th>User ID</th>
                            <th>Thread ID</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(officialReport.recipients || []).map((recipient) => (
                            <tr key={`${recipient.id}-${recipient.threadId}`}>
                              <td>{recipient.displayName || recipient.username}</td>
                              <td><code>{recipient.id}</code></td>
                              <td><code>{recipient.threadId}</code></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        {tab === "badges" && (
          <section className="admin-section admin-badge-section">
            <div className="admin-section-topline">
              <div>
                <h2>Badge management</h2>
                <p className="admin-hint">
                  Create rich badge definitions with uploaded images, then grant or remove them from a loaded user without leaving the page.
                </p>
              </div>
              <div className="admin-badge-actions">
                <button type="button" className="btn-sm" onClick={loadBadgeDefinitions} disabled={badgeDefinitionsLoading}>
                  {badgeDefinitionsLoading ? "Refreshing…" : "Refresh library"}
                </button>
                <button
                  type="button"
                  className="btn-sm"
                  onClick={() => applyBadgeDraft(EMPTY_BADGE_DRAFT)}
                >
                  New badge draft
                </button>
              </div>
            </div>

            <div className="admin-badge-layout">
              <div className="admin-card admin-badge-server-card">
                <div className="admin-card-head">
                  <div>
                    <h3>Grant to user</h3>
                    <p className="text-dim">Load a user, inspect their current badges, then apply the selected badge definition.</p>
                  </div>
                </div>

                <div className="admin-user-pick-row">
                  <input
                    placeholder="User ID"
                    value={badgeUserId}
                    onChange={(e) => setBadgeUserId(e.target.value)}
                  />
                  <button type="button" onClick={() => inspectUser(badgeUserId)}>
                    Load user
                  </button>
                </div>

                {inspectedUser ? (
                  <div className="admin-user-card admin-user-card-featured">
                    <div className="admin-badge-user-head">
                      <div>
                        <strong>{inspectedUser.username || "—"}</strong>
                        <span>{inspectedUser.email || "No email"}</span>
                      </div>
                      <code>{inspectedUser.id}</code>
                    </div>

                    <div className="admin-badge-pill-grid">
                      {inspectedBadges.length === 0 ? (
                        <span className="text-dim">No badges assigned.</span>
                      ) : (
                        inspectedBadges.map((badge) => {
                          const preview = getBadgePreview({
                            badgeId: badge.badge,
                            displayName: badge.display_name || badge.badge,
                            description: badge.description || "",
                            icon: badge.icon || "",
                            imageUrl: badge.image_url || "",
                            bgColor: badge.bg_color || "",
                            fgColor: badge.fg_color || "",
                          });
                          return (
                            <div
                              key={`${badge.badge}-${badge.created_at || "assigned"}`}
                              className={`admin-badge-assigned-row ${selectedBadgeId === badge.badge ? "active" : ""}`}
                            >
                              <button
                                type="button"
                                className="admin-badge-assigned-main"
                                onClick={() => applyBadgeDraft(preview)}
                              >
                                <span
                                  className="admin-badge-token"
                                  style={{ background: preview.bgColor, color: preview.fgColor }}
                                >
                                  {preview.imageUrl ? (
                                    <img src={resolveBadgeImageUrl(preview.imageUrl)} alt={preview.displayName} className="admin-badge-token-image" />
                                  ) : (
                                    preview.icon
                                  )}
                                </span>
                                <span className="admin-badge-assigned-copy">
                                  <strong>{preview.displayName}</strong>
                                  <small>{badge.badge}</small>
                                </span>
                              </button>
                              <button
                                type="button"
                                className="btn-sm danger"
                                onClick={() => setBadgeForUser(inspectedUser.id, badge.badge, false)}
                              >
                                Remove
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="admin-user-card">
                    <p className="text-dim">Load a user to review assigned badges and grant the selected badge.</p>
                  </div>
                )}

                <div className="admin-badge-actions">
                  <button type="button" onClick={() => setBadge(true)} disabled={!inspectedUser || !selectedBadgeId}>
                    {loadedUserHasSelectedBadge ? "Grant again" : "Grant selected badge"}
                  </button>
                  <button type="button" className="danger" onClick={() => setBadge(false)} disabled={!inspectedUser || !selectedBadgeId}>
                    Remove selected badge
                  </button>
                </div>
              </div>

              <div className="admin-badge-editor-stack">
                <div className="admin-card admin-badge-editor-card">
                  <div className="admin-card-head">
                    <div>
                      <h3>Definition editor</h3>
                      <p className="text-dim">Save a reusable badge presentation with icon, colors, and an uploaded image.</p>
                    </div>
                    {selectedBadgeReserved && selectedBadgeId ? (
                      <span className="admin-inline-badge">Built-in</span>
                    ) : null}
                  </div>

                  <div className="admin-badge-form admin-badge-form-grid">
                    <input
                      placeholder="Badge ID (e.g. PARTNER)"
                      value={badgeDraft.badgeId}
                      onChange={(e) => setBadgeDraft((current) => ({ ...current, badgeId: e.target.value }))}
                      list="known-badges"
                    />
                    <input
                      placeholder="Display name"
                      value={badgeDraft.displayName}
                      onChange={(e) => setBadgeDraft((current) => ({ ...current, displayName: e.target.value }))}
                    />
                  </div>

                  <datalist id="known-badges">
                    {KNOWN_BADGES.map((badgeId) => <option key={badgeId} value={badgeId} />)}
                  </datalist>

                  <textarea
                    className="admin-official-textarea admin-badge-description"
                    placeholder="Short internal description for the badge"
                    value={badgeDraft.description}
                    onChange={(e) => setBadgeDraft((current) => ({ ...current, description: e.target.value }))}
                  />

                  <div className="admin-badge-form admin-badge-form-grid">
                    <input
                      placeholder="Fallback icon / emoji"
                      value={badgeDraft.icon}
                      onChange={(e) => setBadgeDraft((current) => ({ ...current, icon: e.target.value }))}
                    />
                    <input
                      placeholder="Uploaded image URL"
                      value={badgeDraft.imageUrl}
                      onChange={(e) => setBadgeDraft((current) => ({ ...current, imageUrl: e.target.value }))}
                    />
                    <input
                      placeholder="Background color"
                      value={badgeDraft.bgColor}
                      onChange={(e) => setBadgeDraft((current) => ({ ...current, bgColor: e.target.value }))}
                    />
                    <input
                      placeholder="Foreground color"
                      value={badgeDraft.fgColor}
                      onChange={(e) => setBadgeDraft((current) => ({ ...current, fgColor: e.target.value }))}
                    />
                  </div>

                  <div className="admin-badge-upload-row">
                    <label className="btn-sm admin-upload-btn">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={async (event) => {
                          const file = event.target.files?.[0];
                          if (!file) return;
                          await uploadBadgeImage(file);
                          event.target.value = "";
                        }}
                      />
                      {badgeUploadBusy ? "Uploading…" : "Upload badge image"}
                    </label>
                    <span className="text-dim">PNG, JPG, GIF, WEBP, SVG, and BMP are supported.</span>
                  </div>

                  <div className="admin-badge-preview-card">
                    <div className="admin-badge-preview-pill" style={{ background: badgePreview.bgColor, color: badgePreview.fgColor }}>
                      {badgePreview.imageUrl ? (
                        <img src={resolveBadgeImageUrl(badgePreview.imageUrl)} alt={badgePreview.displayName} className="admin-badge-preview-image" />
                      ) : (
                        <span className="admin-badge-preview-icon">{badgePreview.icon}</span>
                      )}
                      <span>{badgePreview.displayName}</span>
                    </div>
                    <div className="admin-badge-preview-meta">
                      <strong>{badgePreview.badgeId || "Badge ID"}</strong>
                      <span>{badgePreview.description || "No description yet."}</span>
                    </div>
                  </div>

                  <div className="admin-badge-actions">
                    <button type="button" onClick={() => saveBadgeDefinition()} disabled={badgeDefinitionBusy || selectedBadgeReserved || !badgeDraft.badgeId.trim()}>
                      {badgeDefinitionBusy ? "Saving…" : "Save definition"}
                    </button>
                    <button
                      type="button"
                      onClick={() => saveBadgeDefinition({ assignAfterSave: true })}
                      disabled={badgeDefinitionBusy || selectedBadgeReserved || !badgeDraft.badgeId.trim() || !inspectedUser}
                    >
                      Save & grant
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={deleteBadgeDefinition}
                      disabled={badgeDefinitionBusy || selectedBadgeReserved || !selectedBadgeDefinition}
                    >
                      Delete definition
                    </button>
                  </div>

                  {selectedBadgeReserved ? (
                    <p className="admin-note">This is a built-in badge. You can assign or remove it, but its visual definition is managed by the platform.</p>
                  ) : null}
                </div>

                <div className="admin-card">
                  <div className="admin-card-head">
                    <div>
                      <h3>Badge library</h3>
                      <p className="text-dim">Pick a built-in badge or reuse a saved custom definition.</p>
                    </div>
                  </div>

                  <div className="admin-badge-library-grid">
                    {badgeLibrary.map((definition) => {
                      const preview = getBadgePreview(definition);
                      return (
                        <button
                          key={definition.badgeId}
                          type="button"
                          className={`admin-badge-library-card ${selectedBadgeId === definition.badgeId ? "active" : ""}`}
                          onClick={() => applyBadgeDraft(definition)}
                        >
                          <span className="admin-badge-library-top">
                            <span className="admin-badge-token" style={{ background: preview.bgColor, color: preview.fgColor }}>
                              {preview.imageUrl ? (
                                <img src={resolveBadgeImageUrl(preview.imageUrl)} alt={preview.displayName} className="admin-badge-token-image" />
                              ) : (
                                preview.icon
                              )}
                            </span>
                            <span className="admin-badge-library-copy">
                              <strong>{preview.displayName}</strong>
                              <small>{definition.badgeId}</small>
                            </span>
                          </span>
                          <span className="text-dim">{definition.description || (definition.reserved ? "Built-in badge" : "Custom badge definition")}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {tab === "boost" && (
          <section className="admin-section">
            <div className="admin-section-topline">
              <div>
                <h2>Boost grants</h2>
                <p className="admin-hint">Grant permanent or temporary boost without fighting Stripe sync. Manual grants are audited and revocable.</p>
              </div>
            </div>
            <div className="admin-card">
              <h3>Global Boost trial</h3>
              <p className="text-dim">Anyone without active OpenCom Boost gets temporary access for this window, including new sign-ups that land inside it.</p>
              <div className="admin-badge-form">
                <input
                  type="datetime-local"
                  value={boostTrialStartsAt}
                  onChange={(e) => setBoostTrialStartsAt(e.target.value)}
                />
                <input
                  type="datetime-local"
                  value={boostTrialEndsAt}
                  onChange={(e) => setBoostTrialEndsAt(e.target.value)}
                />
              </div>
              <div className="admin-badge-actions">
                <button type="button" onClick={saveBoostTrialWindow} disabled={boostTrialSaving}>
                  {boostTrialSaving ? "Saving…" : "Save trial window"}
                </button>
                <button type="button" className="danger" onClick={clearBoostTrialWindow} disabled={boostTrialSaving}>
                  Clear trial window
                </button>
                <button type="button" onClick={loadBoostTrialWindow} disabled={boostTrialLoading}>
                  {boostTrialLoading ? "Refreshing…" : "Refresh"}
                </button>
              </div>
              {boostTrialLoading ? (
                <p className="text-dim">Loading trial window…</p>
              ) : boostTrialState ? (
                <div className="admin-boost-state">
                  <p><strong>Configured:</strong> {boostTrialState.configured ? "Yes" : "No"}</p>
                  <p><strong>Live now:</strong> {boostTrialState.active ? "Yes" : "No"}</p>
                  <p><strong>Starts:</strong> {formatAdminDateTime(boostTrialState.startsAt)}</p>
                  <p><strong>Ends:</strong> {formatAdminDateTime(boostTrialState.endsAt)}</p>
                </div>
              ) : (
                <p className="text-dim">No trial window loaded.</p>
              )}
            </div>
            <div className="admin-boost-grid">
              <div className="admin-card">
                <h3>Target user</h3>
                <div className="admin-user-pick-row">
                  <input placeholder="User ID" value={boostUserId} onChange={(e) => setBoostUserId(e.target.value)} />
                  <button type="button" onClick={() => loadBoostState()}>Inspect</button>
                </div>

                <div className="admin-boost-mode">
                  <label>
                    <input type="radio" name="boost-grant-type" checked={boostGrantType === "temporary"} onChange={() => setBoostGrantType("temporary")} />
                    <span>Temporary</span>
                  </label>
                  <label>
                    <input type="radio" name="boost-grant-type" checked={boostGrantType === "permanent"} onChange={() => setBoostGrantType("permanent")} />
                    <span>Permanent</span>
                  </label>
                </div>

                {boostGrantType === "temporary" && (
                  <input
                    type="number"
                    min="1"
                    max="3650"
                    placeholder="Duration (days)"
                    value={boostDurationDays}
                    onChange={(e) => setBoostDurationDays(e.target.value)}
                  />
                )}

                <input
                  placeholder="Reason (optional but recommended)"
                  value={boostReason}
                  onChange={(e) => setBoostReason(e.target.value)}
                />

                <div className="admin-badge-actions">
                  <button type="button" onClick={grantBoost}>Grant / Replace grant</button>
                  <button type="button" className="danger" onClick={revokeBoost}>Revoke manual grant</button>
                </div>
              </div>

              <div className="admin-card">
                <h3>Current entitlement</h3>
                {boostLoading ? (
                  <p className="text-dim">Loading boost state…</p>
                ) : boostState ? (
                  <div className="admin-boost-state">
                    <p><strong>Status:</strong> {boostState.boostActive ? "Active" : "Inactive"}</p>
                    <p><strong>Source:</strong> {boostState.boostSource || "none"}</p>
                    {boostState.globalTrialWindow?.configured && (
                      <>
                        <p><strong>Global trial live:</strong> {boostState.globalTrialWindow.active ? "Yes" : "No"}</p>
                        <p><strong>Trial starts:</strong> {formatAdminDateTime(boostState.globalTrialWindow.startsAt)}</p>
                        <p><strong>Trial ends:</strong> {formatAdminDateTime(boostState.globalTrialWindow.endsAt)}</p>
                      </>
                    )}
                    {boostState.activeGrant && (
                      <>
                        <p><strong>Grant type:</strong> {boostState.activeGrant.grant_type}</p>
                        <p><strong>Expires:</strong> {boostState.activeGrant.expires_at || "Never"}</p>
                        {boostState.activeGrant.reason && <p><strong>Reason:</strong> {boostState.activeGrant.reason}</p>}
                      </>
                    )}
                  </div>
                ) : (
                  <p className="text-dim">Inspect a user to see boost details.</p>
                )}
              </div>
            </div>

            <div className="admin-card">
              <h3>Recent grant history</h3>
              {!boostState?.recentGrants?.length ? (
                <p className="text-dim">No grant records for this user.</p>
              ) : (
                <div className="admin-users-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Created</th>
                        <th>Expires</th>
                        <th>Revoked</th>
                        <th>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {boostState.recentGrants.map((grant) => (
                        <tr key={grant.id}>
                          <td>{grant.grant_type}</td>
                          <td>{grant.created_at || "—"}</td>
                          <td>{grant.expires_at || "Never"}</td>
                          <td>{grant.revoked_at || "Active"}</td>
                          <td>{grant.reason || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}

        {tab === "operations" && (
          <section className="admin-section">
            <div className="admin-section-topline">
              <div>
                <h2>Runtime operations</h2>
                <p className="admin-hint">
                  Control the OpenCom tmux runtime from here. Restart sends Ctrl+C to
                  the `OpenCom` session, then runs <code>./start.sh all</code>. Update
                  runs backend migrations first, then restarts.
                </p>
              </div>
              <div className="admin-badge-actions">
                <button
                  type="button"
                  className="btn-sm"
                  onClick={refreshOperationsWorkspace}
                  disabled={operationsLoading || clientBuildsLoading}
                >
                  {operationsLoading || clientBuildsLoading ? "Refreshing…" : "Refresh status"}
                </button>
              </div>
            </div>

            <div className="admin-cards admin-cards-compact">
              <div className="admin-card">
                <h3>tmux runtime</h3>
                <p>
                  Session <strong>{operationsRuntime?.sessionName || "OpenCom"}</strong>
                  {operationsRuntime?.windowName ? (
                    <> (active window <strong>{operationsRuntime.windowName}</strong>)</>
                  ) : null}
                </p>
                <div className="admin-op-chip-row">
                  <span className={`admin-op-chip ${operationsRuntime?.tmuxInstalled ? "success" : "danger"}`}>
                    tmux {operationsRuntime?.tmuxInstalled ? "installed" : "missing"}
                  </span>
                  <span className={`admin-op-chip ${operationsRuntime?.sessionExists ? "success" : "danger"}`}>
                    session {operationsRuntime?.sessionExists ? "found" : "missing"}
                  </span>
                  <span className={`admin-op-chip ${operationsRuntime?.windowExists ? "success" : "danger"}`}>
                    window {operationsRuntime?.windowExists ? "found" : "missing"}
                  </span>
                </div>
                {operationsRuntime?.statusError && (
                  <p className="text-dim">Status error: {operationsRuntime.statusError}</p>
                )}
              </div>

              <div className="admin-card">
                <h3>Current operation</h3>
                {activeOperation ? (
                  <>
                    <p>
                      <strong>{activeOperation.action === "update" ? "Update + restart" : "Restart"}</strong>
                    </p>
                    <p className="text-dim">Started {formatAdminDateTime(activeOperation.startedAt)}</p>
                    <p className="text-dim">Triggered by {activeOperation.actorUsername}</p>
                  </>
                ) : (
                  <p className="text-dim">No active operation.</p>
                )}
              </div>

              <div className="admin-card">
                <h3>Boost snapshot</h3>
                <p>
                  <strong>{dashboardStats?.database?.boostBadgeMembers ?? adminOverview?.boostBadgeMembers ?? 0}</strong>{" "}
                  users with boost badge
                </p>
                <p className="text-dim">
                  Stripe active: {dashboardStats?.database?.boostStripeMembers ?? adminOverview?.boostStripeMembers ?? 0}
                  {" "}· Manual grants: {dashboardStats?.database?.boostGrantsActive ?? adminOverview?.activeBoostGrants ?? 0}
                </p>
              </div>
            </div>

            <div className="admin-operations-grid">
              <div className="admin-card">
                <div className="admin-card-head">
                  <div>
                    <h3>Client releases</h3>
                    <p>Upload a new desktop or mobile build and make it the active download for its platform and channel.</p>
                  </div>
                </div>
                <div className="admin-client-form">
                  <label>
                    Version
                    <input
                      type="text"
                      placeholder="1.0.0"
                      value={clientUploadDraft.version}
                      onChange={(event) =>
                        setClientUploadDraft((current) => ({
                          ...current,
                          version: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    Channel
                    <select
                      value={clientUploadDraft.channel}
                      onChange={(event) =>
                        setClientUploadDraft((current) => ({
                          ...current,
                          channel: event.target.value,
                        }))
                      }
                    >
                      {CLIENT_RELEASE_CHANNEL_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="admin-client-file-field">
                    Build file
                    <input
                      key={clientUploadInputKey}
                      type="file"
                      accept=".exe,.apk,.deb,.rpm,.snap,.tar.gz,application/vnd.android.package-archive,application/x-msdownload,application/vnd.debian.binary-package,application/x-debian-package,application/x-rpm,application/x-snap,application/gzip,application/x-gzip"
                      onChange={(event) =>
                        setClientUploadDraft((current) => ({
                          ...current,
                          file: event.target.files?.[0] || null,
                        }))
                      }
                    />
                  </label>
                  <label className="admin-client-release-notes">
                    Release notes
                    <textarea
                      rows={5}
                      placeholder="Optional summary shown to update clients."
                      value={clientUploadDraft.releaseNotes}
                      onChange={(event) =>
                        setClientUploadDraft((current) => ({
                          ...current,
                          releaseNotes: event.target.value,
                        }))
                      }
                    />
                  </label>
                </div>
                <p className="admin-note">
                  Supported uploads: <code>.exe</code>, <code>.apk</code>, <code>.deb</code>, <code>.rpm</code>, <code>.snap</code>, and <code>.tar.gz</code>.
                </p>
                {clientUploadDraft.file ? (
                  <p className="text-dim">
                    Ready to upload <strong>{clientUploadDraft.file.name}</strong> ({formatFileSize(clientUploadDraft.file.size)}).
                  </p>
                ) : null}
                <div className="admin-badge-actions admin-operations-actions">
                  <button
                    type="button"
                    onClick={uploadClientRelease}
                    disabled={clientUploadBusy}
                  >
                    {clientUploadBusy ? "Uploading…" : "Upload client build"}
                  </button>
                </div>
              </div>

              <div className="admin-card">
                <h3>Actions</h3>
                <p className="text-dim">
                  Use these controls for safe operational flows from the panel.
                </p>
                <div className="admin-badge-actions admin-operations-actions">
                  <button
                    type="button"
                    onClick={() => triggerPanelOperation("restart")}
                    disabled={!!operationBusy || !!activeOperation}
                  >
                    {operationBusy === "restart" ? "Restarting…" : "Restart OpenCom stack"}
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => triggerPanelOperation("update")}
                    disabled={!!operationBusy || !!activeOperation}
                  >
                    {operationBusy === "update" ? "Updating…" : "Run migrations + restart"}
                  </button>
                </div>
                <p className="admin-note">
                  Restart action: <code>tmux send-keys C-c</code> (3x) then <code>./start.sh all</code>.
                </p>
                <p className="admin-note">
                  Update action: <code>npm run migrate:core</code>, <code>npm run migrate:node</code>, then restart.
                </p>
              </div>

              <div className="admin-card">
                <h3>Latest operation log</h3>
                {operationHistory.length === 0 ? (
                  <p className="text-dim">No operations have run in this panel session yet.</p>
                ) : (
                  <>
                    <p className="text-dim">
                      {operationHistory[0].action === "update" ? "Update + restart" : "Restart"} ·{" "}
                      {operationHistory[0].status} · {formatAdminDurationMs(operationHistory[0].durationMs)}
                    </p>
                    <pre className="admin-op-log">
                      {(operationHistory[0].output || []).join("\n")}
                    </pre>
                  </>
                )}
              </div>
            </div>

            <div className="admin-card">
              <div className="admin-card-head">
                <div>
                  <h3>Active download targets</h3>
                  <p>These are the builds the site and client download flow will serve for the selected release channel.</p>
                </div>
                <label className="admin-client-channel-filter">
                  <span>Channel</span>
                  <select
                    value={clientReleaseChannel}
                    onChange={(event) => {
                      const nextChannel = event.target.value;
                      setClientReleaseChannel(nextChannel);
                      loadClientBuilds(nextChannel, { silent: true });
                    }}
                  >
                    {CLIENT_RELEASE_CHANNEL_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {clientBuildsLoading ? (
                <p className="text-dim">Loading client builds…</p>
              ) : clientBuilds.length === 0 ? (
                <p className="text-dim">No active client builds found for this channel yet.</p>
              ) : (
                <div className="admin-users-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Platform</th>
                        <th>Version</th>
                        <th>File</th>
                        <th>Size</th>
                        <th>Published</th>
                        <th>Download</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clientBuilds.map((build) => (
                        <tr key={build.id}>
                          <td>{build.type}</td>
                          <td>{build.version || "Unknown"}</td>
                          <td>{build.fileName || "Unknown"}</td>
                          <td>{formatFileSize(build.fileSize)}</td>
                          <td>{formatAdminDateTime(build.publishedAt)}</td>
                          <td>
                            {build.downloadUrl ? (
                              <a
                                href={build.downloadUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="admin-link-out"
                              >
                                Open
                              </a>
                            ) : (
                              <span className="text-dim">Unavailable</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="admin-card">
              <h3>Recent operations</h3>
              {operationHistory.length === 0 ? (
                <p className="text-dim">No operation history yet.</p>
              ) : (
                <div className="admin-users-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Action</th>
                        <th>Status</th>
                        <th>Duration</th>
                        <th>Started</th>
                        <th>Finished</th>
                        <th>Actor</th>
                        <th>Exit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {operationHistory.map((operation) => (
                        <tr key={operation.id}>
                          <td>{operation.action === "update" ? "Update + restart" : "Restart"}</td>
                          <td>{operation.status}</td>
                          <td>{formatAdminDurationMs(operation.durationMs)}</td>
                          <td>{formatAdminDateTime(operation.startedAt)}</td>
                          <td>{formatAdminDateTime(operation.finishedAt)}</td>
                          <td>{operation.actorUsername || operation.actorId}</td>
                          <td>{operation.exitCode}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}

        {tab === "blogs" && (
          <section className="admin-section">
            <div className="admin-section-topline">
              <div>
                <h2>Blog creator portal</h2>
                <p className="admin-hint">
                  Draft posts here, then publish them straight to{" "}
                  <code>opencom.online/blogs/your-post-slug</code>. Post bodies use
                  Markdown.
                </p>
              </div>
            </div>

            <div className="admin-blog-layout">
              <div className="admin-card">
                <div className="admin-role-toolbar">
                  <div>
                    <h3>Posts</h3>
                    <p className="text-dim">Published posts are public immediately. Drafts stay private inside the panel.</p>
                  </div>
                  <div className="admin-badge-actions">
                    <button type="button" onClick={startNewBlogDraft}>New draft</button>
                    <button type="button" className="btn-sm" onClick={loadBlogs} disabled={blogLoading}>
                      {blogLoading ? "Refreshing…" : "Refresh"}
                    </button>
                  </div>
                </div>

                {blogPosts.length === 0 ? (
                  <p className="text-dim">No blog posts yet.</p>
                ) : (
                  <div className="admin-blog-list">
                    {blogPosts.map((post) => (
                      <button
                        key={post.id}
                        type="button"
                        className={`admin-blog-row ${blogForm.id === post.id ? "active" : ""}`}
                        onClick={() => openBlogEditor(post)}
                      >
                        <strong>{post.title}</strong>
                        <span>{post.status === "published" ? "Published" : "Draft"}</span>
                        <small>{post.slug}</small>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="admin-card">
                <h3>{blogForm.id ? "Edit post" : "Create post"}</h3>
                <div className="admin-badge-form admin-blog-form-grid">
                  <input
                    placeholder="Title"
                    value={blogForm.title}
                    onChange={(e) =>
                      setBlogForm((current) => ({ ...current, title: e.target.value }))
                    }
                  />
                  <div className="admin-inline-field">
                    <input
                      placeholder="Slug"
                      value={blogForm.slug}
                      onChange={(e) =>
                        setBlogForm((current) => ({ ...current, slug: e.target.value }))
                      }
                    />
                    <button
                      type="button"
                      className="btn-sm"
                      onClick={() =>
                        setBlogForm((current) => ({
                          ...current,
                          slug: slugifyBlogTitle(current.title),
                        }))
                      }
                    >
                      Use title
                    </button>
                  </div>
                  <input
                    placeholder="Cover image URL (optional)"
                    value={blogForm.coverImageUrl}
                    onChange={(e) =>
                      setBlogForm((current) => ({
                        ...current,
                        coverImageUrl: e.target.value,
                      }))
                    }
                  />
                  <select
                    value={blogForm.status}
                    onChange={(e) =>
                      setBlogForm((current) => ({ ...current, status: e.target.value }))
                    }
                  >
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                  </select>
                </div>

                <textarea
                  className="admin-official-textarea admin-blog-summary"
                  placeholder="Summary"
                  value={blogForm.summary}
                  onChange={(e) =>
                    setBlogForm((current) => ({ ...current, summary: e.target.value }))
                  }
                />

                <textarea
                  className="admin-blog-editor"
                  placeholder="Write the post body here in Markdown. Headings, links, lists, quotes, images, and code fences are supported."
                  value={blogForm.content}
                  onChange={(e) =>
                    setBlogForm((current) => ({ ...current, content: e.target.value }))
                  }
                />

                <div className="admin-blog-preview">
                  <div className="admin-blog-preview-header">
                    <strong>Markdown preview</strong>
                    <span>Rendered the same way as the public blog post body.</span>
                  </div>
                  <BlogMarkdown
                    content={blogForm.content}
                    className="blog-post-content admin-blog-preview-content"
                    emptyMessage="Nothing to preview yet."
                  />
                </div>

                <div className="admin-badge-actions">
                  <button type="button" onClick={saveBlogPost} disabled={blogBusy}>
                    {blogBusy ? "Saving…" : blogForm.id ? "Save changes" : "Create post"}
                  </button>
                  {blogForm.slug && blogForm.status === "published" && (
                    <button
                      type="button"
                      className="btn-sm"
                      onClick={() => window.open(`/blogs/${blogForm.slug}`, "_blank", "noopener,noreferrer")}
                    >
                      Open public post
                    </button>
                  )}
                  <button type="button" className="danger" onClick={deleteBlogPost} disabled={blogBusy || !blogForm.id}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
      </div>

      {status && (
        <div className={`admin-status admin-status-${statusType}`} role="status">
          {status}
        </div>
      )}
    </div>
  );
}
