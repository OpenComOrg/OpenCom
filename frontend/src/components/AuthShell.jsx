export function AuthShell({
  authMode,
  setAuthMode,
  email,
  setEmail,
  username,
  setUsername,
  password,
  setPassword,
  pendingVerificationEmail,
  status,
  onSubmit,
  onResendVerification,
  onBackHome
}) {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <button type="button" className="link-btn auth-back" onClick={onBackHome}>Back to home</button>
        <h1>Welcome back</h1>
        <p className="sub">OpenCom keeps your teams, communities, and updates in one place.</p>
        <form onSubmit={onSubmit}>
          <label>Email<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required /></label>
          {authMode === "register" && <label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} required /></label>}
          <label>Password<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required /></label>
          <button type="submit">{authMode === "login" ? "Log in" : "Create account"}</button>
        </form>
        <button className="link-btn" onClick={() => setAuthMode(authMode === "login" ? "register" : "login")}>
          {authMode === "login" ? "Need an account? Register" : "Have an account? Login"}
        </button>
        {authMode === "login" && (
          <button type="button" className="link-btn" onClick={onResendVerification}>
            Resend verification email
          </button>
        )}
        {pendingVerificationEmail && authMode === "login" && (
          <p className="sub">Pending verification: {pendingVerificationEmail}</p>
        )}
        <p className="status">{status}</p>
      </div>
    </div>
  );
}
