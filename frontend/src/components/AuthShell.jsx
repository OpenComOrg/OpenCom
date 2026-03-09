export function AuthShell({
  authMode,
  setAuthMode,
  email,
  setEmail,
  username,
  setUsername,
  password,
  setPassword,
  authResetPasswordConfirm,
  setAuthResetPasswordConfirm,
  pendingVerificationEmail,
  resetPasswordToken,
  status,
  onSubmit,
  onResendVerification,
  onBackHome,
  onOpenTerms
}) {
  const isLogin = authMode === "login";
  const isRegister = authMode === "register";
  const isForgotPassword = authMode === "forgot-password";
  const isResetPassword = authMode === "reset-password";

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <button type="button" className="link-btn auth-back" onClick={onBackHome}>Back to home</button>
        <h1>{isRegister ? "Create account" : isForgotPassword ? "Forgot password" : isResetPassword ? "Reset password" : "Welcome back"}</h1>
        <p className="sub">
          {isForgotPassword
            ? "Enter your email and we will send you a password reset link."
            : isResetPassword
              ? "Choose a new password for the reset link you opened."
              : "OpenCom keeps your teams, communities, and updates in one place."}
        </p>
        <form onSubmit={onSubmit}>
          {!isResetPassword && (
            <label>
              Email
              <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
            </label>
          )}
          {isRegister && (
            <label>
              Username
              <input value={username} onChange={(event) => setUsername(event.target.value)} required />
            </label>
          )}
          {!isForgotPassword && (
            <label>
              {isResetPassword ? "New Password" : "Password"}
              <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required />
            </label>
          )}
          {isResetPassword && (
            <label>
              Confirm New Password
              <input
                value={authResetPasswordConfirm}
                onChange={(event) => setAuthResetPasswordConfirm(event.target.value)}
                type="password"
                required
              />
            </label>
          )}
          <button type="submit" disabled={isResetPassword && !resetPasswordToken}>
            {isLogin ? "Log in" : isRegister ? "Create account" : isForgotPassword ? "Send reset link" : "Reset password"}
          </button>
        </form>
        {isLogin && (
          <>
            <button className="link-btn" onClick={() => setAuthMode("register")}>
              Need an account? Register
            </button>
            <button type="button" className="link-btn" onClick={() => setAuthMode("forgot-password")}>
              Forgot password?
            </button>
          </>
        )}
        {isRegister && (
          <button className="link-btn" onClick={() => setAuthMode("login")}>
            Have an account? Login
          </button>
        )}
        {(isForgotPassword || isResetPassword) && (
          <button className="link-btn" onClick={() => setAuthMode("login")}>
            Back to login
          </button>
        )}
        {isLogin && (
          <button type="button" className="link-btn" onClick={onResendVerification}>
            Resend verification email
          </button>
        )}
        {pendingVerificationEmail && isLogin && (
          <p className="sub">Pending verification: {pendingVerificationEmail}</p>
        )}
        <button type="button" className="link-btn" onClick={onOpenTerms}>
          Terms of Service
        </button>
        <p className="status">{status}</p>
      </div>
    </div>
  );
}
