import { OPEN_SOURCE_REPO_URL } from "../lib/projectLinks";

export function LandingPage({
  downloadMenuRef,
  downloadsMenuOpen,
  setDownloadsMenuOpen,
  downloadTargets,
  preferredDownloadTarget,
  onOpenApp,
  onOpenClient,
  onOpenTerms,
  onOpenBlogs
}) {
  const featureCards = [
    {
      id: "01",
      title: "Organized workspaces",
      copy: "Keep servers structured with channels that scale from private teams to active communities."
    },
    {
      id: "02",
      title: "Direct messages",
      copy: "Chat one-to-one without clutter, with clear presence and fast switching between conversations."
    },
    {
      id: "03",
      title: "Reliable voice",
      copy: "Drop into voice when text is not enough, with low-friction controls and status visibility."
    }
  ];

  return (
    <div className="landing-page">
      <header className="landing-header">
        <div className="landing-brand-wrap">
          <img src="logo.png" alt="OpenCom" className="landing-logo" />
          <span className="landing-brand">OpenCom</span>
        </div>
        <div className="landing-header-actions">
          <button type="button" className="landing-header-link" onClick={onOpenBlogs}>Blogs</button>
          <button type="button" className="landing-header-link" onClick={onOpenTerms}>Terms</button>
        </div>
      </header>
      <main className="landing-main">
        <section className="landing-hero">
          <p className="landing-kicker">Smart chat for teams, friends, and communities</p>
          <h1 className="landing-headline">Stay in sync without the noise.</h1>
          <p className="landing-sub">
            OpenCom keeps conversations focused with a clean mix of channels, direct messages, and voice in one app.
          </p>
          <div className="landing-action-row">
            <button type="button" className="landing-btn landing-btn-primary" onClick={onOpenApp}>
              Open app
            </button>
            <button type="button" className="landing-btn landing-btn-secondary" onClick={onOpenClient}>
              Open client
            </button>
          </div>
          <div className="landing-pills" aria-hidden>
            <span className="landing-pill">Servers + channels</span>
            <span className="landing-pill">Friends + DMs</span>
            <span className="landing-pill">Voice + presence</span>
          </div>
        </section>
        <section className="landing-features">
          {featureCards.map((card) => (
            <article key={card.id} className="landing-feature">
              <span className="landing-feature-index">{card.id}</span>
              <h3>{card.title}</h3>
              <p>{card.copy}</p>
            </article>
          ))}
        </section>
        <section className="landing-open-source-panel">
          <div className="landing-open-source-copy">
            <p className="landing-kicker">Open source</p>
            <h3>Want to help shape OpenCom?</h3>
            <p className="landing-hint">
              OpenCom is open source. If you are interested in contributing,
              check out the project on GitHub and jump in.
            </p>
          </div>
          <a
            href={OPEN_SOURCE_REPO_URL}
            className="landing-btn landing-btn-secondary"
            target="_blank"
            rel="noopener noreferrer"
          >
            View on GitHub
          </a>
        </section>
        <section className="landing-cta-panel" ref={downloadMenuRef}>
          <div className="landing-cta-copy">
            <h3>Prefer desktop?</h3>
            <p className="landing-hint">Install OpenCom for the smoothest day-to-day workflow on Windows or Linux.</p>
          </div>
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
        </section>
      </main>
      <footer className="landing-footer">
        <p>OpenCom. One place for teams, communities, and friends.</p>
        <div className="landing-footer-actions">
          <button type="button" className="link-btn" onClick={onOpenBlogs}>Blogs</button>
          <button type="button" className="link-btn" onClick={onOpenTerms}>Terms of Service</button>
          <button
            type="button"
            className="link-btn"
            onClick={() =>
              window.open(OPEN_SOURCE_REPO_URL, "_blank", "noopener,noreferrer")
            }
          >
            GitHub
          </button>
          <button
            type="button"
            className="link-btn"
            onClick={() => window.open(preferredDownloadTarget?.href || downloadTargets[0]?.href || "#", "_blank", "noopener,noreferrer")}
          >
            Download
          </button>
        </div>
      </footer>
    </div>
  );
}
