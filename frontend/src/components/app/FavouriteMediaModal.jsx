import { useEffect } from "react";

function favouriteMediaTitle(item) {
  return item?.fileName || item?.title || "Saved media";
}

function favouriteMediaSubtitle(item) {
  if (item?.pageUrl && item.pageUrl !== item.sourceUrl) return item.pageUrl;
  if (item?.contentType) return item.contentType;
  if (item?.sourceUrl) return item.sourceUrl;
  return "";
}

function favouriteMediaPreviewUrl(item, previewUrlById) {
  if (item?.sourceKind === "external_url") return item?.sourceUrl || "";
  return previewUrlById?.[item?.id] || "";
}

export function FavouriteMediaModal({
  open,
  onClose,
  favourites,
  loading,
  query,
  setQuery,
  previewUrlById,
  onSelect,
  onRemove,
  removeBusyById,
  insertBusyId,
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

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div
        className="add-server-modal favourite-media-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Favourite media"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="favourite-media-header">
          <div>
            <h3>Favourite media</h3>
            <p className="hint">
              Search saved GIFs and images, then add one to the composer.
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
          placeholder="Search favourites"
        />

        <div className="favourite-media-grid">
          {loading && favourites.length === 0 && (
            <p className="hint favourite-media-empty">Loading favourites...</p>
          )}

          {!loading && favourites.length === 0 && (
            <p className="hint favourite-media-empty">
              {query.trim()
                ? "No saved media matches that search."
                : "No saved media yet. Star an image or GIF in chat to keep it here."}
            </p>
          )}

          {favourites.map((item) => {
            const previewUrl = favouriteMediaPreviewUrl(item, previewUrlById);
            const title = favouriteMediaTitle(item);
            const subtitle = favouriteMediaSubtitle(item);
            const removeBusy = !!removeBusyById?.[item.id];
            const insertBusy = insertBusyId === item.id;

            return (
              <div key={item.id} className="favourite-media-tile">
                <button
                  type="button"
                  className="favourite-media-remove"
                  title="Remove from favourites"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemove(item);
                  }}
                  disabled={removeBusy || insertBusy}
                >
                  ★
                </button>
                <button
                  type="button"
                  className="favourite-media-select"
                  onClick={() => onSelect(item)}
                  disabled={removeBusy || insertBusy}
                >
                  <div className="favourite-media-preview">
                    {previewUrl ? (
                      <img src={previewUrl} alt={title} loading="lazy" />
                    ) : (
                      <div className="favourite-media-placeholder">
                        {String(title || "M")
                          .trim()
                          .charAt(0)
                          .toUpperCase() || "M"}
                      </div>
                    )}
                  </div>
                  <div className="favourite-media-copy">
                    <strong>{insertBusy ? "Adding..." : title}</strong>
                    {subtitle && <span>{subtitle}</span>}
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
