import { useEffect } from "react";

export function MediaViewerModal({ media, onClose }) {
  useEffect(() => {
    if (!media) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [media, onClose]);

  if (!media?.src) return null;

  const detailLine = media.subtitle || "";
  const openHref = media.openHref || "";

  return (
    <div className="settings-overlay media-viewer-overlay" onClick={onClose}>
      <div
        className="media-viewer-modal"
        role="dialog"
        aria-modal="true"
        aria-label={media.title || "Expanded image"}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="media-viewer-header">
          <div>
            <h3>{media.title || "Image"}</h3>
            {detailLine && <p className="hint">{detailLine}</p>}
          </div>
          <div className="media-viewer-actions">
            {openHref && (
              <a
                className="ghost media-viewer-link"
                href={openHref}
                target="_blank"
                rel="noreferrer"
              >
                Open source
              </a>
            )}
            <button type="button" className="ghost" onClick={onClose}>
              Close
            </button>
          </div>
        </header>

        <div className="media-viewer-stage">
          <img src={media.src} alt={media.title || "Expanded image"} />
        </div>
      </div>
    </div>
  );
}
