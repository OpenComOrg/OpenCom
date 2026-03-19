const SETTINGS_ADMIN_LINK_STYLE = {
  display: "block",
  padding: "var(--space-sm) var(--space-md)",
  background: "rgba(149, 168, 205, 0.12)",
  border: "1px solid rgba(125, 164, 255, 0.25)",
  borderRadius: "calc(var(--radius) * 0.9)",
  color: "var(--text-main)",
  textDecoration: "none",
  textAlign: "center",
  fontWeight: "500",
  cursor: "pointer",
  fontSize: "0.95em",
};

export function SettingsOverlay({
  settingsOpen,
  closeSettings,
  settingsTab,
  setSettingsTab,
  onOpenSecurity,
  onOpenBilling,
  canModerateMembers,
  canAccessServerAdminPanel,
  onOpenServerAdmin,
  logout,
  children,
}) {
  if (!settingsOpen) return null;

  return (
    <div className="settings-overlay" onClick={closeSettings}>
      <div className="settings-panel" onClick={(event) => event.stopPropagation()}>
        <aside className="settings-nav">
          <h3>Settings</h3>
          <button
            className={settingsTab === "profile" ? "active" : "ghost"}
            onClick={() => setSettingsTab("profile")}
          >
            Profile
          </button>
          <button
            className={settingsTab === "security" ? "active" : "ghost"}
            onClick={() =>
              onOpenSecurity ? onOpenSecurity() : setSettingsTab("security")
            }
          >
            🔒 Security
          </button>
          <button
            className={settingsTab === "billing" ? "active" : "ghost"}
            onClick={() => (onOpenBilling ? onOpenBilling() : setSettingsTab("billing"))}
          >
            💳 Billing
          </button>
          <button
            className={settingsTab === "server" ? "active" : "ghost"}
            onClick={() => setSettingsTab("server")}
          >
            Server
          </button>
          <button
            className={settingsTab === "roles" ? "active" : "ghost"}
            onClick={() => setSettingsTab("roles")}
          >
            Roles
          </button>
          {canModerateMembers && (
            <button
              className={settingsTab === "moderation" ? "active" : "ghost"}
              onClick={() => setSettingsTab("moderation")}
            >
              Moderation
            </button>
          )}
          <button
            className={settingsTab === "invites" ? "active" : "ghost"}
            onClick={() => setSettingsTab("invites")}
          >
            Invites
          </button>
          <button
            className={settingsTab === "appearance" ? "active" : "ghost"}
            onClick={() => setSettingsTab("appearance")}
          >
            Appearance
          </button>
          <button
            className={settingsTab === "extensions" ? "active" : "ghost"}
            onClick={() => setSettingsTab("extensions")}
          >
            Extensions
          </button>
          <button
            className={settingsTab === "voice" ? "active" : "ghost"}
            onClick={() => setSettingsTab("voice")}
          >
            Voice
          </button>
          {canAccessServerAdminPanel && (
            <button
              type="button"
              style={SETTINGS_ADMIN_LINK_STYLE}
              onClick={() => onOpenServerAdmin && onOpenServerAdmin()}
            >
              🔧 Server Admin Panel
            </button>
          )}
          <button className="danger" onClick={closeSettings}>
            Close
          </button>
          <button className="danger" onClick={logout}>
            Log out
          </button>
        </aside>

        <section className="settings-content">{children}</section>
      </div>
    </div>
  );
}
