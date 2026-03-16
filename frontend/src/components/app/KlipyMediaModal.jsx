import { useEffect } from "react";

function klipyTitle(item) {
  return String(item?.title || "").trim() || "Klipy media";
}

function klipySubtitle(item) {
  const kind = String(item?.contentType || "").startsWith("video/")
    ? "Clip"
    : "GIF";
  const width = Number(item?.width);
  const height = Number(item?.height);
  const dimensions =
    Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0
      ? `${width}x${height}`
      : "";
  return [kind, dimensions].filter(Boolean).join(" · ");
}

function KlipyPreview({ item, title }) {
  const previewUrl = String(item?.previewUrl || item?.sourceUrl || "").trim();
  const previewContentType = String(
    item?.previewContentType || item?.contentType || "",
  ).toLowerCase();

  if (previewUrl && previewContentType.startsWith("video/")) {
    return (
      <video
        src={previewUrl}
        muted
        loop
        autoPlay
        playsInline
        preload="metadata"
        aria-label={title}
      />
    );
  }

  if (previewUrl) {
    return <img src={previewUrl} alt={title} loading="lazy" />;
  }

  return (
    <div className="favourite-media-placeholder">
      {String(title || "K")
        .trim()
        .charAt(0)
        .toUpperCase() || "K"}
    </div>
  );
}

export function KlipyMediaModal({
  open,
  onClose,
  query,
  setQuery,
  items,
  loading,
  hasMore,
  insertBusyId,
  saveStateByItemId,
  onSelect,
  onSave,
  onLoadMore,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const trimmedQuery = String(query || "").trim();

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div
        className="add-server-modal favourite-media-modal klipy-media-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Klipy media"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="favourite-media-header">
          <div>
            <h3>Klipy</h3>
            <p className="hint">
              Search GIFs and clips from Klipy, then drop one into the
              composer.
            </p>
          </div>
          <button type="button" className="ghost" onClick={onClose}>
            Close
          </button>
        </header>

        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search Klipy"
        />

        <div className="favourite-media-grid">
          {loading && items.length === 0 && (
            <p className="hint favourite-media-empty">Loading Klipy media...</p>
          )}

          {!loading && items.length === 0 && (
            <p className="hint favourite-media-empty">
              {trimmedQuery
                ? "No Klipy results matched that search."
                : "No featured Klipy media is available right now."}
            </p>
          )}

          {items.map((item) => {
            const title = klipyTitle(item);
            const subtitle = klipySubtitle(item);
            const itemKey = String(item?.id || item?.sourceUrl || "");
            const saveState = saveStateByItemId?.[itemKey] || {
              saved: false,
              busy: false,
            };
            const insertBusy = insertBusyId === itemKey;

            return (
              <div key={itemKey} className="favourite-media-tile">
                <button
                  type="button"
                  className={`favourite-media-remove klipy-media-save ${saveState.saved ? "active" : ""}`}
                  title={
                    saveState.saved
                      ? "Remove from favourites"
                      : "Save to favourites"
                  }
                  onClick={(event) => {
                    event.stopPropagation();
                    onSave(item);
                  }}
                  disabled={saveState.busy || insertBusy}
                >
                  {saveState.busy ? "…" : saveState.saved ? "★" : "☆"}
                </button>
                <button
                  type="button"
                  className="favourite-media-select"
                  onClick={() => onSelect(item)}
                  disabled={saveState.busy || insertBusy}
                >
                  <div className="favourite-media-preview">
                    <KlipyPreview item={item} title={title} />
                  </div>
                  <div className="favourite-media-copy">
                    <strong>{insertBusy ? "Adding..." : title}</strong>
                    {subtitle ? <span>{subtitle}</span> : null}
                  </div>
                </button>
              </div>
            );
          })}
        </div>

        <footer className="klipy-media-footer">
          <p className="hint">
            Powered by{" "}
            <a href="https://klipy.com/" target="_blank" rel="noreferrer">
              Klipy
            </a>
          </p>
          {hasMore ? (
            <button
              type="button"
              className="ghost"
              onClick={onLoadMore}
              disabled={loading}
            >
              {loading && items.length > 0 ? "Loading..." : "Load more"}
            </button>
          ) : null}
        </footer>
      </div>
    </div>
  );
}
