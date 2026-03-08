import { useEffect, useState } from "react";
import { resolveStaticPageHref } from "../lib/routing";

const CORE_API = import.meta.env.VITE_CORE_API_URL || "https://api.opencom.online";

const KNOWN_BADGES = ["OFFICIAL", "PLATFORM_ADMIN", "PLATFORM_FOUNDER"];
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
];

const EMPTY_BLOG_DRAFT = {
  id: "",
  title: "",
  slug: "",
  summary: "",
  coverImageUrl: "",
  content: "## Intro\n\nWrite the update here.\n",
  status: "draft",
};

function slugifyBlogTitle(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

async function api(path, token, panelPassword, options = {}) {
  const hasBody = options.body !== undefined && options.body !== null;
  const trimmedPanelPassword = typeof panelPassword === "string" ? panelPassword.trim() : "";
  const response = await fetch(`${CORE_API}${path}`, {
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${token}`,
      ...(trimmedPanelPassword ? { "x-admin-panel-password": trimmedPanelPassword } : {}),
      ...(options.headers || {})
    },
    ...options
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `HTTP_${response.status}`);
  }

  return response.json();
}

export function AdminApp() {
  const [token, setToken] = useState(localStorage.getItem("opencom_access_token") || "");
  const [panelPassword, setPanelPassword] = useState(sessionStorage.getItem("opencom_admin_panel_password") || "");
  const [autoPlatformUnlock, setAutoPlatformUnlock] = useState(false);
  const [autoUnlockDisabled, setAutoUnlockDisabled] = useState(false);
  const [autoUnlockChecking, setAutoUnlockChecking] = useState(false);
  const [status, setStatus] = useState("");
  const [statusType, setStatusType] = useState("info"); // info | success | error
  const [adminOverview, setAdminOverview] = useState({
    founder: null,
    admins: [],
    activeBoostGrants: 0,
    staffAssignmentsCount: 0,
    publishedBlogsCount: 0,
  });
  const [tab, setTab] = useState("overview");
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState([]);
  const [searching, setSearching] = useState(false);
  const [userActionBusyId, setUserActionBusyId] = useState("");
  const [badgeUserId, setBadgeUserId] = useState("");
  const [badgeName, setBadgeName] = useState("");
  const [inspectedUser, setInspectedUser] = useState(null);
  const [inspectedBadges, setInspectedBadges] = useState([]);
  const [boostUserId, setBoostUserId] = useState("");
  const [boostGrantType, setBoostGrantType] = useState("temporary");
  const [boostDurationDays, setBoostDurationDays] = useState("30");
  const [boostReason, setBoostReason] = useState("");
  const [boostState, setBoostState] = useState(null);
  const [boostLoading, setBoostLoading] = useState(false);
  const [adminStatus, setAdminStatus] = useState(null); // { platformRole, isPlatformAdmin, isPlatformOwner }
  const [unlockInput, setUnlockInput] = useState("");
  const [officialStatus, setOfficialStatus] = useState(null);
  const [officialMessage, setOfficialMessage] = useState("");
  const [officialRecipientMode, setOfficialRecipientMode] = useState("selected");
  const [officialQueuedUsers, setOfficialQueuedUsers] = useState([]);
  const [officialSending, setOfficialSending] = useState(false);
  const [officialReport, setOfficialReport] = useState(null);
  const [staffAssignments, setStaffAssignments] = useState([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffBusy, setStaffBusy] = useState(false);
  const [staffUserId, setStaffUserId] = useState("");
  const [staffLevelKey, setStaffLevelKey] = useState("moderator");
  const [staffTitle, setStaffTitle] = useState("Moderator");
  const [staffNotes, setStaffNotes] = useState("");
  const [staffPermissions, setStaffPermissions] = useState(["moderate_users"]);
  const [blogPosts, setBlogPosts] = useState([]);
  const [blogLoading, setBlogLoading] = useState(false);
  const [blogBusy, setBlogBusy] = useState(false);
  const [blogForm, setBlogForm] = useState(EMPTY_BLOG_DRAFT);

  function showStatus(message, type = "info") {
    setStatus(message);
    setStatusType(type);
  }

  useEffect(() => {
    if (panelPassword) sessionStorage.setItem("opencom_admin_panel_password", panelPassword);
    else sessionStorage.removeItem("opencom_admin_panel_password");
  }, [panelPassword]);

  useEffect(() => {
    if (!token) return;
    loadAdminStatus();
  }, [token, panelPassword]);

  useEffect(() => {
    if (!token || panelPassword || autoUnlockDisabled) return;
    let cancelled = false;
    setAutoUnlockChecking(true);
    (async () => {
      try {
        const data = await api("/v1/me/admin-status", token, "");
        if (cancelled) return;
        setAdminStatus(data);
        const canAutoUnlock = data?.canAccessPanel === true;
        setAutoPlatformUnlock(canAutoUnlock);
        if (canAutoUnlock) showStatus("Auto-unlocked from your panel permissions.", "success");
      } catch {
        if (cancelled) return;
        setAutoPlatformUnlock(false);
      } finally {
        if (!cancelled) setAutoUnlockChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, panelPassword, autoUnlockDisabled]);

  const isPanelUnlocked = !!panelPassword || autoPlatformUnlock;
  const panelPermissions = adminStatus?.permissions || [];
  const hasPasswordAccess = !!panelPassword.trim();
  const canManageStaff =
    hasPasswordAccess ||
    adminStatus?.isPlatformAdmin === true ||
    adminStatus?.isPlatformOwner === true;
  const canModerateUsers =
    hasPasswordAccess ||
    adminStatus?.isPlatformAdmin === true ||
    adminStatus?.isPlatformOwner === true ||
    panelPermissions.includes("moderate_users");
  const canManageBadges =
    hasPasswordAccess ||
    adminStatus?.isPlatformAdmin === true ||
    adminStatus?.isPlatformOwner === true ||
    panelPermissions.includes("manage_badges");
  const canManageBoosts =
    hasPasswordAccess ||
    adminStatus?.isPlatformAdmin === true ||
    adminStatus?.isPlatformOwner === true ||
    panelPermissions.includes("manage_boosts");
  const canSendOfficialMessages =
    hasPasswordAccess ||
    adminStatus?.isPlatformAdmin === true ||
    adminStatus?.isPlatformOwner === true ||
    panelPermissions.includes("send_official_messages");
  const canManageBlogs =
    hasPasswordAccess ||
    adminStatus?.isPlatformAdmin === true ||
    adminStatus?.isPlatformOwner === true ||
    panelPermissions.includes("manage_blogs");

  useEffect(() => {
    if (!isPanelUnlocked || !token) return;
    loadOverview();
  }, [isPanelUnlocked, token, panelPassword]);

  useEffect(() => {
    if (!isPanelUnlocked || !token) return;
    if (tab === "official" && canSendOfficialMessages) {
      loadOfficialStatus();
    }
    if (tab === "staff" && canManageStaff) {
      loadStaffAssignments();
    }
    if (tab === "blogs" && canManageBlogs) {
      loadBlogs();
    }
  }, [
    tab,
    token,
    panelPassword,
    isPanelUnlocked,
    canManageStaff,
    canSendOfficialMessages,
    canManageBlogs,
  ]);

  async function loadAdminStatus() {
    try {
      const data = await api("/v1/me/admin-status", token, panelPassword);
      setAdminStatus(data);
      if (!panelPassword) {
        setAutoPlatformUnlock(data?.canAccessPanel === true);
      }
    } catch {
      setAdminStatus(null);
      if (!panelPassword) setAutoPlatformUnlock(false);
    }
  }

  async function loadOverview() {
    try {
      const data = await api("/v1/admin/overview", token, panelPassword);
      setAdminOverview(data);
      showStatus("Overview loaded.", "success");
    } catch (e) {
      showStatus(`Overview failed: ${e.message}`, "error");
    }
  }

  async function loadOfficialStatus() {
    try {
      const data = await api("/v1/admin/official-messages/status", token, panelPassword);
      setOfficialStatus(data);
    } catch (e) {
      setOfficialStatus(null);
      showStatus(`Official messaging status failed: ${e.message}`, "error");
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

  function applyStaffTemplate(template) {
    setStaffLevelKey(template.id);
    setStaffTitle(template.title);
    setStaffPermissions(template.permissions);
  }

  function editStaffAssignment(assignment) {
    setStaffUserId(assignment.userId || "");
    setStaffLevelKey(assignment.levelKey || "custom");
    setStaffTitle(assignment.title || "Staff");
    setStaffNotes(assignment.notes || "");
    setStaffPermissions(Array.isArray(assignment.permissions) ? assignment.permissions : []);
    setTab("staff");
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
      showStatus("Enter a user ID to assign panel permissions.", "info");
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
      showStatus("Enter a user ID to remove.", "info");
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

  async function searchUsers() {
    if (!query.trim()) {
      showStatus("Enter a search term (username or email).", "info");
      return;
    }
    setSearching(true);
    try {
      const data = await api(`/v1/admin/users?query=${encodeURIComponent(query.trim())}`, token, panelPassword);
      setUsers((data.users || []).map((user) => ({ ...user, isBanned: user.isBanned === true || user.isBanned === 1 })));
      showStatus(`Found ${(data.users || []).length} users.`, "success");
    } catch (e) {
      showStatus(`Search failed: ${e.message}`, "error");
      setUsers([]);
    } finally {
      setSearching(false);
    }
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

  async function setBadge(enabled) {
    if (!badgeUserId.trim() || !badgeName.trim()) {
      showStatus("Enter user ID and badge name.", "info");
      return;
    }
    try {
      await api(`/v1/admin/users/${badgeUserId.trim()}/badges`, token, panelPassword, {
        method: "POST",
        body: JSON.stringify({ badge: badgeName.trim(), enabled })
      });
      await inspectUser(badgeUserId.trim());
      showStatus(`Badge ${enabled ? "added" : "removed"}.`, "success");
    } catch (e) {
      showStatus(e.message || "Badge action failed.", "error");
    }
  }

  async function setBadgeForUser(userId, badge, enabled) {
    if (!userId || !badge) return;
    try {
      await api(`/v1/admin/users/${userId}/badges`, token, panelPassword, {
        method: "POST",
        body: JSON.stringify({ badge, enabled })
      });
      await inspectUser(userId);
      showStatus(`Badge ${enabled ? "added" : "removed"}.`, "success");
    } catch (e) {
      showStatus(e.message || "Badge action failed.", "error");
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

  const isOwner = adminStatus?.isPlatformOwner === true;
  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "users", label: "Users & moderation" },
    canManageStaff ? { id: "staff", label: "Staff & permissions" } : null,
    canSendOfficialMessages ? { id: "official", label: "Official Messages" } : null,
    canManageBadges ? { id: "badges", label: "Badges" } : null,
    canManageBoosts ? { id: "boost", label: "Boost Grants" } : null,
    canManageBlogs ? { id: "blogs", label: "Blogs" } : null,
  ].filter(Boolean);

  useEffect(() => {
    if (!tabs.some((item) => item.id === tab)) {
      setTab("overview");
    }
  }, [tab, tabs]);

  const roleLabel =
    adminStatus?.platformRole === "owner"
      ? "Owner"
      : adminStatus?.platformRole === "admin"
        ? "Admin"
        : adminStatus?.platformRole === "staff"
          ? "Staff"
          : "Viewer";

  if (!isPanelUnlocked) {
    return (
      <div className="admin-unlock">
        <div className="admin-unlock-card">
          <h1>OpenCom Control Panel</h1>
          <p className="admin-unlock-desc">
            {autoUnlockChecking
              ? "Checking your account for panel access..."
              : "Enter the server-configured panel password or use an account with panel permissions."}
          </p>
          <input
            type="password"
            placeholder="Admin panel password"
            value={unlockInput}
            onChange={(e) => setUnlockInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || !unlockInput.trim()) return;
              setAutoUnlockDisabled(false);
              setPanelPassword(unlockInput.trim());
            }}
          />
          <button
            onClick={() => {
              if (!unlockInput.trim()) return;
              setAutoUnlockDisabled(false);
              setPanelPassword(unlockInput.trim());
            }}
          >
            Unlock
          </button>
          <p className="admin-status-msg">{status}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-panel">
      <header className="admin-header">
        <h1>OpenCom Control Panel</h1>
        <div className="admin-header-meta">
          {adminStatus && (
            <span className="admin-role-badge" title="Your platform role">
              {roleLabel}
            </span>
          )}
          <a href={resolveStaticPageHref("server-admin.html")} target="_blank" rel="noopener noreferrer" className="admin-link-out">Server Admin →</a>
          <button
            type="button"
            className="admin-lock-btn"
            onClick={() => {
              setPanelPassword("");
              setAutoPlatformUnlock(false);
              setAutoUnlockDisabled(true);
              sessionStorage.removeItem("opencom_admin_panel_password");
              showStatus("");
            }}
          >
            Lock panel
          </button>
        </div>
      </header>

      <div className="admin-token-row">
        <label>Access token (used for API calls)</label>
        <input type="password" placeholder="Core access token" value={token} onChange={(e) => setToken(e.target.value)} />
      </div>

      <nav className="admin-tabs">
        {tabs.map((t) => (
          <button key={t.id} type="button" className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </nav>

      <div className="admin-content">
        {tab === "overview" && (
          <section className="admin-section">
            <h2>Platform overview</h2>
            <div className="admin-cards">
              <div className="admin-card">
                <h3>Founder</h3>
                {adminOverview.founder?.id ? (
                  <p><strong>{adminOverview.founder.username || "—"}</strong><br /><code>{adminOverview.founder.id}</code></p>
                ) : (
                  <p className="text-dim">Not set. Use Users & moderation to set founder.</p>
                )}
              </div>
              <div className="admin-card">
                <h3>Platform admins</h3>
                <p>{adminOverview.admins?.length ?? 0} admin(s)</p>
                {adminOverview.admins?.length > 0 && (
                  <ul className="admin-list">
                    {(adminOverview.admins || []).map((a) => (
                      <li key={a.id}><strong>{a.username}</strong> <code>{a.id}</code></li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="admin-card">
                <h3>Active manual boost grants</h3>
                <p><strong>{adminOverview.activeBoostGrants ?? 0}</strong> active grant(s)</p>
                <p className="text-dim">Use Boost Grants tab for temporary/permanent access controls.</p>
              </div>
              <div className="admin-card">
                <h3>Panel staff</h3>
                <p><strong>{adminOverview.staffAssignmentsCount ?? 0}</strong> assignment(s)</p>
                <p className="text-dim">Granular panel access for moderation, blogs, boosts, and badges.</p>
              </div>
              <div className="admin-card">
                <h3>Published blogs</h3>
                <p><strong>{adminOverview.publishedBlogsCount ?? 0}</strong> live post(s)</p>
                <p className="text-dim">Create drafts and publish them from the Blogs tab.</p>
              </div>
            </div>
            <button type="button" onClick={loadOverview}>Refresh overview</button>
          </section>
        )}

        {tab === "users" && (
          <section className="admin-section">
            <h2>User search & platform actions</h2>
            <p className="admin-hint">Search by username or email, then apply the actions your panel permissions allow.</p>
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
                          {canManageStaff && (
                            <button
                              type="button"
                              className="btn-sm"
                              onClick={() => {
                                const assignment = staffAssignments.find((item) => item.userId === u.id);
                                if (assignment) {
                                  editStaffAssignment(assignment);
                                } else {
                                  setStaffUserId(u.id);
                                  setStaffNotes("");
                                  applyStaffTemplate(STAFF_TEMPLATES[0]);
                                  setTab("staff");
                                }
                              }}
                              disabled={userActionBusyId === u.id}
                            >
                              Staff
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

        {tab === "staff" && (
          <section className="admin-section">
            <h2>Staff roles & panel permissions</h2>
            <p className="admin-hint">Assign focused panel access without making someone a full platform admin.</p>

            <div className="admin-cards">
              <div className="admin-card">
                <h3>Active assignments</h3>
                <p><strong>{staffAssignments.length}</strong> staff member(s)</p>
                <p className="text-dim">Owners and platform admins already have full access and do not need a staff assignment.</p>
              </div>
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
            </div>

            <div className="admin-official-grid">
              <div className="admin-card">
                <h3>Edit assignment</h3>
                <div className="admin-user-pick-row">
                  <input placeholder="User ID" value={staffUserId} onChange={(e) => setStaffUserId(e.target.value)} />
                  <button type="button" className="btn-sm" onClick={loadStaffAssignments} disabled={staffLoading}>
                    {staffLoading ? "Refreshing…" : "Refresh list"}
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

              <div className="admin-card">
                <h3>Current team</h3>
                {staffLoading ? (
                  <p className="text-dim">Loading staff assignments…</p>
                ) : staffAssignments.length === 0 ? (
                  <p className="text-dim">No panel staff assigned yet.</p>
                ) : (
                  <div className="admin-staff-list">
                    {staffAssignments.map((assignment) => (
                      <button
                        key={assignment.userId}
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
            </div>
          </section>
        )}

        {tab === "official" && (
          <section className="admin-section">
            <h2>Official messages</h2>
            <p className="admin-hint">Send platform announcements from the `opencom` no-reply account to a selected audience or everyone at once.</p>

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
          <section className="admin-section">
            <h2>Badge management</h2>
            <p className="admin-hint">Search or enter a user ID, review current badges, then add/remove cleanly.</p>
            <div className="admin-user-pick-row">
              <input placeholder="User ID" value={badgeUserId} onChange={(e) => setBadgeUserId(e.target.value)} />
              <button type="button" onClick={() => inspectUser(badgeUserId)}>Load user</button>
            </div>

            {inspectedUser && (
              <div className="admin-user-card">
                <p><strong>{inspectedUser.username || "—"}</strong> <span className="text-dim">{inspectedUser.email || "No email"}</span></p>
                <code>{inspectedUser.id}</code>
                <div className="admin-badge-pills">
                  {inspectedBadges.length === 0 ? (
                    <span className="text-dim">No badges assigned.</span>
                  ) : (
                    inspectedBadges.map((badge) => (
                      <button
                        key={`${badge.badge}-${badge.created_at}`}
                        type="button"
                        className="admin-badge-pill"
                        onClick={() => {
                          setBadgeForUser(inspectedUser.id, badge.badge, false);
                        }}
                        title="Click to remove this badge"
                      >
                        {badge.badge} ×
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            <div className="admin-badge-form">
              <input placeholder="Badge name (e.g. PLATFORM_ADMIN)" value={badgeName} onChange={(e) => setBadgeName(e.target.value)} list="known-badges" />
              <datalist id="known-badges">
                {KNOWN_BADGES.map((b) => <option key={b} value={b} />)}
              </datalist>
              <div className="admin-badge-actions">
                <button type="button" onClick={() => setBadge(true)}>Add badge</button>
                <button type="button" className="danger" onClick={() => setBadge(false)}>Remove badge</button>
              </div>
            </div>
            <div className="admin-quick-badges">
              {KNOWN_BADGES.map((b) => (
                <button key={b} type="button" className="btn-sm" onClick={() => setBadgeName(b)}>
                  Use {b}
                </button>
              ))}
              <button type="button" className="btn-sm" onClick={() => setBadgeName("boost")}>Use boost</button>
            </div>
          </section>
        )}

        {tab === "boost" && (
          <section className="admin-section">
            <h2>Boost grants</h2>
            <p className="admin-hint">Grant permanent or temporary boost without fighting Stripe sync. Manual grants are audited and revocable.</p>
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

        {tab === "blogs" && (
          <section className="admin-section">
            <h2>Blog creator portal</h2>
            <p className="admin-hint">Draft posts here, then publish them straight to `opencom.online/blogs/{blog-name}`.</p>

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
                  placeholder="Write the post body here. Basic headings, bullet lists, quotes, and code fences are supported."
                  value={blogForm.content}
                  onChange={(e) =>
                    setBlogForm((current) => ({ ...current, content: e.target.value }))
                  }
                />

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

      {status && (
        <div className={`admin-status admin-status-${statusType}`} role="status">
          {status}
        </div>
      )}
    </div>
  );
}
