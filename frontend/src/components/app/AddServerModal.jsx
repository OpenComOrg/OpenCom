export function AddServerModal({
  addServerModalOpen,
  setAddServerModalOpen,
  addServerTab,
  setAddServerTab,
  canAccessServerAdminPanel,
  onOpenServerAdmin,
  joinInviteCode,
  setJoinInviteCode,
  previewInvite,
  joinInvite,
  invitePendingCode,
  invitePreview,
  newServerName,
  setNewServerName,
  newServerBaseUrl,
  setNewServerBaseUrl,
  newServerLogoUrl,
  setNewServerLogoUrl,
  onImageFieldUpload,
  newServerBannerUrl,
  setNewServerBannerUrl,
  createServer,
  newOfficialServerName,
  setNewOfficialServerName,
  newOfficialServerLogoUrl,
  setNewOfficialServerLogoUrl,
  newOfficialServerBannerUrl,
  setNewOfficialServerBannerUrl,
  createOfficialServer,
}) {
  if (!addServerModalOpen) return null;

  return (
        <div
          className="settings-overlay"
          onClick={() => setAddServerModalOpen(false)}
        >
          <div
            className="add-server-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="add-server-modal-header">
              <h3 style={{ margin: 0 }}>Create or join a server</h3>
              <div className="add-server-tabs">
                <button
                  type="button"
                  className={addServerTab === "join" ? "active" : "ghost"}
                  onClick={() => setAddServerTab("join")}
                >
                  Join
                </button>
                <button
                  type="button"
                  className={addServerTab === "custom" ? "active" : "ghost"}
                  onClick={() => setAddServerTab("custom")}
                >
                  Add host
                </button>
                <button
                  type="button"
                  className={addServerTab === "create" ? "active" : "ghost"}
                  onClick={() => setAddServerTab("create")}
                >
                  Create yours
                </button>
                {canAccessServerAdminPanel && (
                  <button
                    type="button"
                    className="add-server-admin-link"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenServerAdmin && onOpenServerAdmin();
                    }}
                  >
                    🔧 Admin
                  </button>
                )}
              </div>
            </header>

            <div className="add-server-content">
              {addServerTab === "join" && (
                <section className="card">
                  <p className="hint" style={{ marginBottom: "0.5rem" }}>
                    Paste an invite code or full join link. Invite links are
                    previewed and need explicit accept.
                  </p>
                  <input
                    placeholder="Invite code or join link"
                    value={joinInviteCode ?? ""}
                    onChange={(e) => setJoinInviteCode(e.target.value)}
                    style={{
                      width: "100%",
                      marginBottom: "0.5rem",
                      padding: "0.5rem",
                    }}
                  />
                  <div
                    className="row-actions"
                    style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}
                  >
                    <button className="ghost" onClick={previewInvite}>
                      Preview
                    </button>
                    <button
                      onClick={() =>
                        joinInvite(invitePendingCode || joinInviteCode)
                      }
                    >
                      Accept Invite
                    </button>
                  </div>
                  {invitePreview && (
                    <p className="hint" style={{ marginTop: "0.5rem" }}>
                      Invite: {invitePreview.code} · Server:{" "}
                      {invitePreview.serverName || invitePreview.server_id} ·
                      Uses: {invitePreview.uses}
                    </p>
                  )}
                </section>
              )}

              {addServerTab === "custom" && (
                <section className="card">
                  <p className="hint" style={{ marginBottom: "0.5rem" }}>
                    Connect to a server node by URL (self-hosted or provider).
                  </p>
                  <input
                    placeholder="Server name"
                    value={newServerName ?? ""}
                    onChange={(e) => setNewServerName(e.target.value)}
                    style={{
                      width: "100%",
                      marginBottom: "0.5rem",
                      padding: "0.5rem",
                    }}
                  />
                  <input
                    placeholder="https://node.example.com"
                    value={newServerBaseUrl ?? "https://"}
                    onChange={(e) => setNewServerBaseUrl(e.target.value)}
                    style={{
                      width: "100%",
                      marginBottom: "0.5rem",
                      padding: "0.5rem",
                    }}
                  />
                  <input
                    placeholder="Logo URL (.png/.jpg/.webp/.svg)"
                    value={newServerLogoUrl ?? ""}
                    onChange={(e) => setNewServerLogoUrl(e.target.value)}
                    style={{
                      width: "100%",
                      marginBottom: "0.5rem",
                      padding: "0.5rem",
                    }}
                  />
                  <label style={{ display: "block", marginBottom: "0.5rem" }}>
                    Upload Logo
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) =>
                        onImageFieldUpload(
                          event,
                          "server logo",
                          setNewServerLogoUrl,
                        )
                      }
                      style={{ width: "100%", marginTop: "0.35rem" }}
                    />
                  </label>
                  <input
                    placeholder="Banner URL (optional)"
                    value={newServerBannerUrl ?? ""}
                    onChange={(e) => setNewServerBannerUrl(e.target.value)}
                    style={{
                      width: "100%",
                      marginBottom: "0.5rem",
                      padding: "0.5rem",
                    }}
                  />
                  <label style={{ display: "block", marginBottom: "0.5rem" }}>
                    Upload Banner
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) =>
                        onImageFieldUpload(
                          event,
                          "server banner",
                          setNewServerBannerUrl,
                        )
                      }
                      style={{ width: "100%", marginTop: "0.35rem" }}
                    />
                  </label>
                  <button
                    onClick={createServer}
                    disabled={
                      !newServerName.trim() ||
                      !newServerBaseUrl.trim() ||
                      !newServerLogoUrl.trim()
                    }
                  >
                    Add Server
                  </button>
                </section>
              )}

              {addServerTab === "create" && (
                <section className="card">
                  <p className="hint" style={{ marginBottom: "0.5rem" }}>
                    One server hosted by us—name it and customize channels and
                    roles.
                  </p>
                  <input
                    placeholder="Server name"
                    value={newOfficialServerName ?? ""}
                    onChange={(e) => setNewOfficialServerName(e.target.value)}
                    style={{
                      width: "100%",
                      marginBottom: "0.5rem",
                      padding: "0.5rem",
                    }}
                  />
                  <input
                    placeholder="Logo URL (.png/.jpg/.webp/.svg)"
                    value={newOfficialServerLogoUrl ?? ""}
                    onChange={(e) =>
                      setNewOfficialServerLogoUrl(e.target.value)
                    }
                    style={{
                      width: "100%",
                      marginBottom: "0.5rem",
                      padding: "0.5rem",
                    }}
                  />
                  <label style={{ display: "block", marginBottom: "0.5rem" }}>
                    Upload Logo
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) =>
                        onImageFieldUpload(
                          event,
                          "server logo",
                          setNewOfficialServerLogoUrl,
                        )
                      }
                      style={{ width: "100%", marginTop: "0.35rem" }}
                    />
                  </label>
                  <input
                    placeholder="Banner URL (optional)"
                    value={newOfficialServerBannerUrl ?? ""}
                    onChange={(e) =>
                      setNewOfficialServerBannerUrl(e.target.value)
                    }
                    style={{
                      width: "100%",
                      marginBottom: "0.5rem",
                      padding: "0.5rem",
                    }}
                  />
                  <label style={{ display: "block", marginBottom: "0.5rem" }}>
                    Upload Banner
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) =>
                        onImageFieldUpload(
                          event,
                          "server banner",
                          setNewOfficialServerBannerUrl,
                        )
                      }
                      style={{ width: "100%", marginTop: "0.35rem" }}
                    />
                  </label>
                  <button
                    onClick={createOfficialServer}
                    disabled={
                      !newOfficialServerName?.trim() ||
                      !newOfficialServerLogoUrl?.trim()
                    }
                  >
                    Create your server
                  </button>
                </section>
              )}
            </div>

            <button
              type="button"
              className="danger"
              style={{ width: "100%", marginTop: "0.5rem" }}
              onClick={() => setAddServerModalOpen(false)}
            >
              Close
            </button>
          </div>
        </div>
  );
}
