import { useEffect, useState } from "react";

const KLIPY_FILTERS = [
  { id: "all", label: "All" },
  { id: "gif", label: "GIFs" },
  { id: "clip", label: "Clips" },
  { id: "sponsored", label: "Sponsored" },
];

function isKlipyAd(item) {
  return String(item?.type || "").trim().toLowerCase() === "ad";
}

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

function isKlipyClip(item) {
  return String(item?.contentType || "").toLowerCase().startsWith("video/");
}

function buildDisplayEntries(items = [], filter = "all") {
  return items.flatMap((item, index) => {
    if (isKlipyAd(item)) {
      if (filter === "sponsored" || filter === "all" || filter === "gif" || filter === "clip") {
        return [{
          kind: "ad",
          key: `ad:${String(item?.id || index)}`,
          item,
        }];
      }
      return [];
    }

    if (filter === "sponsored") return [];
    if (filter === "clip" && !isKlipyClip(item)) return [];
    if (filter === "gif" && isKlipyClip(item)) return [];

    return [{
      kind: "media",
      key: `media:${String(item?.id || item?.sourceUrl || index)}`,
      item,
    }];
  });
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

function KlipyAdEmbed({ item }) {
  const width = Number(item?.width);
  const height = Number(item?.height);
  const safeWidth = Number.isFinite(width) && width > 0 ? width : null;
  const safeHeight = Number.isFinite(height) && height > 0 ? height : null;
  const iframeUrl = String(item?.iframeUrl || "").trim();
  const htmlContent = String(item?.content || "").trim();
  const frameStyle = {
    width: "100%",
    maxWidth: safeWidth ? `${safeWidth}px` : "100%",
    minHeight: `${safeHeight || 160}px`,
    ...(safeWidth && safeHeight
      ? { aspectRatio: `${safeWidth} / ${safeHeight}` }
      : {}),
  };

  if (!iframeUrl && !htmlContent) {
    return (
      <div className="klipy-ad-frame-shell" style={frameStyle}>
        <p className="hint favourite-media-empty">
          Klipy returned an ad slot without renderable content.
        </p>
      </div>
    );
  }

  return (
    <div className="klipy-ad-frame-shell" style={frameStyle}>
      <iframe
        title="Klipy advertisement"
        className="klipy-ad-frame"
        loading="lazy"
        referrerPolicy="origin"
        sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
        src={iframeUrl || undefined}
        srcDoc={iframeUrl ? undefined : htmlContent}
      />
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
  const [contentFilter, setContentFilter] = useState("all");

  useEffect(() => {
    if (!open) {
      setContentFilter("all");
      return undefined;
    }
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const trimmedQuery = String(query || "").trim();
  const displayEntries = buildDisplayEntries(items, contentFilter);
  const visibleMediaCount = displayEntries.filter((entry) => entry.kind === "media").length;
  const visibleAdCount = displayEntries.filter((entry) => entry.kind === "ad").length;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div
        className="add-server-modal favourite-media-modal klipy-media-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Klipy media"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="favourite-media-header klipy-media-header">
          <div>
            <h3>Klipy</h3>
            <p className="hint">
              Search GIFs and clips, save favourites, and drop media into the
              composer without leaving chat.
            </p>
          </div>
          <button type="button" className="ghost" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="klipy-media-toolbar">
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search Klipy"
          />
          <div className="klipy-media-filters" role="tablist" aria-label="Filter Klipy content">
            {KLIPY_FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                className={contentFilter === filter.id ? "active" : "ghost"}
                onClick={() => setContentFilter(filter.id)}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        <div className="klipy-media-summary">
          <span>
            {trimmedQuery
              ? `Results for "${trimmedQuery}"`
              : "Featured Klipy feed"}
          </span>
          <strong>
            {contentFilter === "sponsored"
              ? `${visibleAdCount} ad slot${visibleAdCount === 1 ? "" : "s"}`
              : visibleAdCount > 0
                ? `${visibleMediaCount} media item${visibleMediaCount === 1 ? "" : "s"} · ${visibleAdCount} ad${visibleAdCount === 1 ? "" : "s"}`
                : `${visibleMediaCount} media item${visibleMediaCount === 1 ? "" : "s"}`}
          </strong>
        </div>

        <div className="favourite-media-grid klipy-media-grid">
          {loading && items.length === 0 && (
            <p className="hint favourite-media-empty">Loading Klipy media...</p>
          )}

          {!loading && visibleMediaCount === 0 && visibleAdCount === 0 && (
            <p className="hint favourite-media-empty">
              {contentFilter === "sponsored"
                ? "Klipy did not return an advertisement for this request. Ad fill depends on demand, targeting, and supported sizes."
                : trimmedQuery
                  ? "No Klipy results matched that search."
                  : "No featured Klipy media is available right now."}
            </p>
          )}

          {displayEntries.map((entry) => {
            if (entry.kind === "ad") {
              const item = entry.item;
              const width = Number(item?.width);
              const height = Number(item?.height);
              return (
                <div key={entry.key} className="favourite-media-tile klipy-ad-tile">
                  <span className="klipy-sponsored-badge">Ad by Klipy</span>
                  <KlipyAdEmbed item={item} />
                  <div className="klipy-ad-meta">
                    <span>Live ad slot</span>
                    <span>
                      {Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
                        ? `${width}x${height}`
                        : "Responsive"}
                    </span>
                  </div>
                </div>
              );
            }

            const item = entry.item;
            const title = klipyTitle(item);
            const subtitle = klipySubtitle(item);
            const itemKey = String(item?.id || item?.sourceUrl || "");
            const saveState = saveStateByItemId?.[itemKey] || {
              saved: false,
              busy: false,
            };
            const insertBusy = insertBusyId === itemKey;

            return (
              <div key={entry.key} className="favourite-media-tile">
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
