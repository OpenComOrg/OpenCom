export function LandingPage({
  downloadMenuRef,
  downloadsMenuOpen,
  setDownloadsMenuOpen,
  downloadTargets,
  preferredDownloadTarget,
  onOpenClient
}) {
  return (
    <div className="landing-page">
      <header className="landing-header">
        <img src="logo.png" alt="OpenCom" className="landing-logo" />
        <span className="landing-brand">OpenCom</span>
      </header>
      <main className="landing-main">
        <section className="landing-hero">
          <h1 className="landing-headline">The best way to communicate.</h1>
          <p className="landing-sub">One place for your servers, friends, and communities. Chat, voice, and stay in sync without the noise.</p>
        </section>
        <section className="landing-features">
          <div className="landing-feature">
            <span className="landing-feature-icon">💬</span>
            <h3>Servers and channels</h3>
            <p>Organize conversations by topic. Create spaces that scale from a few friends to large communities.</p>
          </div>
          <div className="landing-feature">
            <span className="landing-feature-icon">👥</span>
            <h3>Friends and DMs</h3>
            <p>Add friends, send direct messages, and see who is online. Simple and private.</p>
          </div>
          <div className="landing-feature">
            <span className="landing-feature-icon">🔊</span>
            <h3>Voice and presence</h3>
            <p>Jump into voice channels when you need to talk. Status and presence keep everyone in the loop.</p>
          </div>
        </section>
        <section className="landing-cta">
          <div className="landing-cta-download" ref={downloadMenuRef}>
            <h3>Get the desktop app</h3>
            <p className="landing-hint">
              Windows and Linux builds are available.
            </p>

            <div className="download-wrapper">
              <a
                href={preferredDownloadTarget?.href || downloadTargets[0]?.href || "#"}
                className="landing-btn landing-btn-secondary"
                target="_blank"
                rel="noopener noreferrer"
              >
                {preferredDownloadTarget ? `Download ${preferredDownloadTarget.label}` : "Download"}
              </a>
              <button
                type="button"
                className="landing-btn landing-btn-secondary"
                onClick={() => setDownloadsMenuOpen((current) => !current)}
              >
                All downloads
              </button>

              {downloadsMenuOpen && (
                <div className="download-menu">
                  {downloadTargets.map((target) => (
                    <a
                      key={target.href}
                      href={target.href}
                      className="download-item"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {target.label}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="landing-cta-client">
            <h3>Use OpenCom now</h3>
            <p className="landing-hint">Open the client in your browser. No install required.</p>
            <button type="button" className="landing-btn landing-btn-primary" onClick={onOpenClient}>
              Open client
            </button>
          </div>
        </section>
      </main>
      <footer className="landing-footer">
        <p>OpenCom. One place for teams, communities, and friends.</p>
      </footer>
    </div>
  );
}
