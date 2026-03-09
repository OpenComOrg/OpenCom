export function SecuritySettingsSection({
  lastLoginInfo,
  showPasswordChange,
  setShowPasswordChange,
  currentPassword,
  setCurrentPassword,
  newPassword,
  setNewPassword,
  confirmPassword,
  setConfirmPassword,
  userEmail,
  onSendPasswordResetLink,
  api,
  accessToken,
  setStatus,
  securitySettings,
  show2FASetup,
  twoFactorVerified,
  initiate2FASetup,
  twoFactorQRCode,
  twoFactorToken,
  setTwoFactorToken,
  backupCodes,
  setTwoFactorSecret,
  setBackupCodes,
  confirm2FA,
  disable2FA,
  activeSessions,
  confirmDialog,
}) {
  return (
    <>
      <section className="card security-card">
        <h4>🔐 Account Security</h4>
        <div className="security-info">
          <p className="hint">
            Last login: {new Date(lastLoginInfo.date).toLocaleString()}
          </p>
          <p className="hint">Device: {lastLoginInfo.device}</p>
        </div>
      </section>

      <section className="card security-card">
        <h4>🔑 Change Password</h4>
        {!showPasswordChange ? (
          <button onClick={() => setShowPasswordChange(true)}>
            Change Password
          </button>
        ) : (
          <>
            <label>
              Current Password
              <input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </label>
            <label>
              New Password
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </label>
            <label>
              Confirm Password
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </label>
            <div className="row-actions">
              <button
                className="ghost"
                onClick={() => {
                  setShowPasswordChange(false);
                  setCurrentPassword("");
                  setNewPassword("");
                  setConfirmPassword("");
                }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (newPassword !== confirmPassword) {
                    setStatus("Passwords do not match.");
                    return;
                  }
                  if (newPassword.length < 8) {
                    setStatus("Password must be at least 8 characters.");
                    return;
                  }
                  try {
                    await api("/v1/auth/password", {
                      method: "PATCH",
                      headers: {
                        Authorization: `Bearer ${accessToken}`,
                      },
                      body: JSON.stringify({
                        currentPassword: currentPassword,
                        newPassword: newPassword,
                      }),
                    });
                    setStatus("Password changed successfully.");
                    setShowPasswordChange(false);
                    setCurrentPassword("");
                    setNewPassword("");
                    setConfirmPassword("");
                  } catch (error) {
                    setStatus(`Could not change password: ${error.message}`);
                  }
                }}
              >
                Update Password
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => onSendPasswordResetLink(userEmail)}
              >
                Email Reset Link
              </button>
            </div>
          </>
        )}
        {!showPasswordChange && (
          <button type="button" className="ghost" onClick={() => onSendPasswordResetLink(userEmail)}>
            Email me a reset link
          </button>
        )}
      </section>

      <section className="card security-card">
        <h4>🛡️ Two-Factor Authentication</h4>
        <p className="hint">
          Secure your account with an additional authentication layer
        </p>

        {!securitySettings.twoFactorEnabled && !show2FASetup && (
          <button onClick={initiate2FASetup}>Enable 2FA</button>
        )}

        {show2FASetup && !twoFactorVerified && (
          <>
            <p
              className="hint"
              style={{
                marginTop: "var(--space-sm)",
                fontWeight: 600,
              }}
            >
              📱 Step 1: Scan QR Code
            </p>
            <p className="hint">
              Scan this QR code with an authenticator app (Google
              Authenticator, Authy, Microsoft Authenticator, etc.):
            </p>
            {twoFactorQRCode && (
              <img
                src={twoFactorQRCode}
                alt="2FA QR Code"
                style={{
                  width: "200px",
                  height: "200px",
                  border: "2px solid rgba(125, 164, 255, 0.3)",
                  borderRadius: "var(--radius)",
                  margin: "var(--space-sm) 0",
                  background: "#fff",
                  padding: "0.5em",
                }}
              />
            )}

            <p
              className="hint"
              style={{
                marginTop: "var(--space-md)",
                fontWeight: 600,
              }}
            >
              🔐 Step 2: Verify Token
            </p>
            <p className="hint">
              Enter a 6-digit code from your authenticator app:
            </p>
            <input
              type="text"
              placeholder="000000"
              value={twoFactorToken}
              onChange={(event) =>
                setTwoFactorToken(event.target.value.replace(/\D/g, "").slice(0, 6))
              }
              maxLength="6"
              style={{
                textAlign: "center",
                fontSize: "1.2em",
                letterSpacing: "0.3em",
                fontFamily: "monospace",
              }}
            />

            <p
              className="hint"
              style={{
                marginTop: "var(--space-md)",
                fontWeight: 600,
              }}
            >
              💾 Step 3: Save Backup Codes
            </p>
            <p className="hint">
              Save these backup codes somewhere safe. You can use them to regain
              access if you lose your authenticator.
            </p>
            <code
              style={{
                display: "block",
                background: "var(--bg-input)",
                padding: "var(--space-sm)",
                borderRadius: "calc(var(--radius)*0.8)",
                fontSize: "0.85em",
                marginBottom: "var(--space-sm)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                fontFamily: "monospace",
                lineHeight: "1.8",
              }}
            >
              {backupCodes.map((code) => `${code}\n`).join("")}
            </code>

            <div className="row-actions">
              <button
                className="ghost"
                onClick={() => {
                  setShow2FASetup(false);
                  setTwoFactorSecret("");
                  setBackupCodes([]);
                  setTwoFactorToken("");
                }}
              >
                Cancel
              </button>
              <button onClick={confirm2FA}>Verify & Enable 2FA</button>
            </div>
          </>
        )}

        {securitySettings.twoFactorEnabled && (
          <>
            <p
              style={{
                color: "var(--green)",
                fontWeight: 600,
                marginTop: "var(--space-sm)",
              }}
            >
              ✓ 2FA is enabled
            </p>
            <p className="hint">
              Your account is protected with two-factor authentication. Your
              backup codes are stored securely.
            </p>
            <button
              className="danger"
              onClick={disable2FA}
              style={{ marginTop: "var(--space-sm)" }}
            >
              Disable 2FA
            </button>
          </>
        )}
      </section>

      <section className="card security-card">
        <h4>📱 Active Sessions</h4>
        <p className="hint">
          Devices where you're logged in. Sign out of any session you don't
          recognize.
        </p>
        {activeSessions.map((session) => (
          <div key={session.id} className="session-item">
            <div className="session-info">
              <strong>{session.device}</strong>
              <span className="hint">{session.location}</span>
              <span className="hint">Last active: {session.lastActive}</span>
            </div>
            <button
              className={session.status === "active" ? "ghost" : "danger"}
              onClick={() =>
                setStatus(`Session ${session.device} would be signed out.`)
              }
            >
              {session.status === "active" ? "Current" : "Sign Out"}
            </button>
          </div>
        ))}
      </section>

      <section className="card security-card danger-card">
        <h4>⚠️ Danger Zone</h4>
        <p className="hint">Irreversible actions. Proceed with caution.</p>
        <button
          className="danger"
          onClick={async () => {
            const approved = await confirmDialog(
              "Are you absolutely sure? This cannot be undone.",
              "Delete Account",
            );
            if (approved) {
              setStatus("Account deletion request submitted for review.");
            }
          }}
        >
          Delete Account Permanently
        </button>
      </section>

      <section className="card">
        <h4>Security Privacy</h4>
        <label>
          <input type="checkbox" /> Log out of all other sessions
        </label>
        <label>
          <input type="checkbox" /> Show security alerts
        </label>
        <button onClick={() => setStatus("Privacy settings saved.")}>
          Save Security Settings
        </button>
      </section>
    </>
  );
}
