import { OPEN_SOURCE_REPO_URL } from "../../lib/projectLinks";

export function ExtensionsSettingsSection({
  activeServer,
  canManageServer,
  refreshServerExtensions,
  serverExtensionsLoading,
  serverExtensionsForDisplay,
  serverExtensionBusyById,
  toggleServerExtension,
  serverExtensionCommands,
  clientExtensionCatalog,
  enabledClientExtensions,
  toggleClientExtension,
  clientExtensionLoadState,
  clientExtensionDevMode,
  setClientExtensionDevMode,
  newClientExtensionDevUrl,
  setNewClientExtensionDevUrl,
  addClientDevExtensionUrl,
  clientExtensionDevUrls,
  setClientExtensionDevUrls,
}) {
  return (
    <>
      <section className="card">
        <h4>Server Extensions</h4>
        {!activeServer ? (
          <p className="hint">Select a server first.</p>
        ) : !canManageServer ? (
          <p className="hint">
            You need owner/admin permissions in this server to manage
            server-side extensions.
          </p>
        ) : (
          <>
            <p className="hint">
              Enable server-side extensions for this server. Commands can be run
              as <code>/extension.command</code> (and short names when unique).
            </p>
            <div className="row-actions" style={{ marginBottom: "8px" }}>
              <button
                className="ghost"
                onClick={() => refreshServerExtensions()}
                disabled={serverExtensionsLoading}
              >
                Refresh
              </button>
            </div>
            {serverExtensionsLoading && (
              <p className="hint">Loading server extensions…</p>
            )}
            {!serverExtensionsForDisplay.length ? (
              <p className="hint">No server extensions found in catalog.</p>
            ) : (
              <ul className="channel-perms-role-list">
                {serverExtensionsForDisplay.map((extension) => {
                  const busy = !!serverExtensionBusyById[extension.id];
                  const checked = !!extension.enabled;
                  return (
                    <li key={extension.id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={busy || serverExtensionsLoading}
                          onChange={(event) =>
                            toggleServerExtension(
                              extension.id,
                              event.target.checked,
                            )
                          }
                        />
                        <strong>{extension.name}</strong>
                        <span className="hint">
                          {" "}
                          · {extension.id} · {extension.version || "0.1.0"}
                        </span>
                        <span
                          className="hint"
                          style={{
                            marginLeft: "6px",
                            color: checked ? "#4ec97e" : "#f0a4a4",
                          }}
                        >
                          {busy ? "Syncing…" : checked ? "Enabled" : "Disabled"}
                        </span>
                      </label>
                      {extension.description && (
                        <p className="hint" style={{ margin: "4px 0 0 24px" }}>
                          {extension.description}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {serverExtensionCommands.length > 0 ? (
              <p className="hint">
                Active commands:{" "}
                {serverExtensionCommands
                  .slice(0, 8)
                  .map((command) => `/${command.name}`)
                  .join(", ")}
                {serverExtensionCommands.length > 8
                  ? ` +${serverExtensionCommands.length - 8} more`
                  : ""}
              </p>
            ) : (
              <p className="hint">No active server commands detected yet.</p>
            )}
          </>
        )}
      </section>

      <section className="card">
        <h4>Client Extensions</h4>
        <p className="hint">
          Enable reviewed client-only extensions from the catalog. Extensions run
          in your client session.
        </p>
        {!clientExtensionCatalog.length ? (
          <p className="hint">No client extensions found in the catalog.</p>
        ) : (
          <ul className="channel-perms-role-list">
            {clientExtensionCatalog.map((extension) => {
              const checked = enabledClientExtensions.includes(extension.id);
              return (
                <li key={extension.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) =>
                        toggleClientExtension(extension.id, event.target.checked)
                      }
                    />
                    <strong>{extension.name}</strong>
                    <span className="hint">
                      {" "}
                      · {extension.id} · {extension.version || "0.1.0"}
                    </span>
                    <span
                      className="hint"
                      style={{
                        marginLeft: "6px",
                        color: checked ? "#4ec97e" : "#f0a4a4",
                      }}
                    >
                      {checked ? "Enabled" : "Disabled"}
                    </span>
                  </label>
                  {extension.description && (
                    <p className="hint" style={{ margin: "4px 0 0 24px" }}>
                      {extension.description}
                    </p>
                  )}
                  {clientExtensionLoadState[extension.id] && (
                    <p className="hint" style={{ margin: "2px 0 0 24px" }}>
                      Status: {clientExtensionLoadState[extension.id]}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card">
        <h4>Developer Mode</h4>
        <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <input
            type="checkbox"
            checked={clientExtensionDevMode}
            onChange={(event) => setClientExtensionDevMode(event.target.checked)}
          />
          Enable local/testing extension URLs
        </label>
        <p className="hint">
          Use this while developing extensions. Add one URL per extension entry
          script.
        </p>

        {clientExtensionDevMode && (
          <>
            <div className="row-actions" style={{ marginTop: "8px" }}>
              <input
                placeholder="http://localhost:5174/my-extension.js"
                value={newClientExtensionDevUrl}
                onChange={(event) =>
                  setNewClientExtensionDevUrl(event.target.value)
                }
                style={{ flex: 1 }}
              />
              <button onClick={addClientDevExtensionUrl}>Add URL</button>
            </div>

            <ul className="channel-perms-role-list" style={{ marginTop: "10px" }}>
              {clientExtensionDevUrls.map((url) => (
                <li key={url}>
                  <span style={{ wordBreak: "break-all" }}>{url}</span>
                  <button
                    className="ghost"
                    style={{ marginLeft: "8px" }}
                    onClick={() =>
                      setClientExtensionDevUrls((current) =>
                        current.filter((item) => item !== url),
                      )
                    }
                  >
                    Remove
                  </button>
                  {clientExtensionLoadState[`dev:${url}`] && (
                    <p className="hint" style={{ margin: "4px 0 0 0" }}>
                      Status: {clientExtensionLoadState[`dev:${url}`]}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="card settings-open-source-card">
        <h4>Open Source</h4>
        <p className="hint">
          OpenCom is open source. If you are interested in contributing, check
          out the GitHub repo and have a look around.
        </p>
        <div className="settings-open-source-actions">
          <a
            href={OPEN_SOURCE_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="settings-open-source-link"
          >
            View OpenCom on GitHub
          </a>
        </div>
      </section>
    </>
  );
}
