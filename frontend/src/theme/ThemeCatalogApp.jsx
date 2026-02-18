import { useEffect, useMemo, useState } from "react";
import { coreApi, installThemeLocally } from "./themeApi";
import "../theme-tools.css";

export function ThemeCatalogApp() {
  const [themes, setThemes] = useState([]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("new");
  const [status, setStatus] = useState("Loading themes...");
  const [busyThemeId, setBusyThemeId] = useState("");

  async function loadThemes() {
    try {
      setStatus("Loading themes...");
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      params.set("sort", sort);
      params.set("limit", "80");
      const data = await coreApi(`/v1/themes?${params.toString()}`);
      setThemes(Array.isArray(data?.themes) ? data.themes : []);
      setStatus(`Loaded ${Array.isArray(data?.themes) ? data.themes.length : 0} theme(s).`);
    } catch (error) {
      setStatus(`Could not load themes: ${error.message}`);
    }
  }

  useEffect(() => {
    loadThemes().catch(() => {});
  }, [sort]);

  const filteredThemes = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return themes;
    return themes.filter((theme) => {
      const hay = `${theme.name || ""} ${theme.description || ""} ${(theme.tags || []).join(" ")}`.toLowerCase();
      return hay.includes(term);
    });
  }, [themes, query]);

  async function installTheme(themeId) {
    if (!themeId) return;
    try {
      setBusyThemeId(themeId);
      const data = await coreApi(`/v1/themes/${encodeURIComponent(themeId)}`);
      const css = data?.theme?.css || "";
      if (!css.trim()) throw new Error("EMPTY_THEME_CSS");
      installThemeLocally(css);
      await coreApi(`/v1/themes/${encodeURIComponent(themeId)}/install`, { method: "POST" }).catch(() => {});
      setStatus(`Installed "${data.theme.name}".`);
    } catch (error) {
      setStatus(`Install failed: ${error.message}`);
    } finally {
      setBusyThemeId("");
    }
  }

  return (
    <div className="theme-tool-shell">
      <header className="theme-tool-header">
        <div>
          <h1>Theme Catalogue</h1>
          <p>Browse community themes and install instantly.</p>
        </div>
        <div className="theme-tool-actions">
          <button type="button" className="ghost" onClick={() => window.open("/theme-creator.html", "_blank", "noopener,noreferrer")}>
            Open Creator
          </button>
          <button type="button" onClick={() => loadThemes().catch(() => {})}>Refresh</button>
        </div>
      </header>

      <section className="theme-tool-filters card">
        <label>
          Search
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, description, tags..." />
        </label>
        <label>
          Sort
          <select value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="new">Newest</option>
            <option value="popular">Most Installed</option>
          </select>
        </label>
      </section>

      <p className="theme-tool-status">{status}</p>

      <section className="theme-grid">
        {filteredThemes.map((theme) => (
          <article key={theme.id} className="theme-card">
            <div className="theme-card-top">
              <h3>{theme.name}</h3>
              <span>#{theme.id.slice(0, 8)}</span>
            </div>
            <p>{theme.description || "No description provided."}</p>
            <div className="theme-chip-row">
              {(theme.tags || []).map((tag) => (
                <span key={`${theme.id}-${tag}`} className="theme-chip">{tag}</span>
              ))}
            </div>
            <div className="theme-meta">
              <span>By {theme.authorUsername || "unknown"}</span>
              <span>{theme.installCount || 0} installs</span>
            </div>
            <div className="theme-row-actions">
              <button type="button" disabled={busyThemeId === theme.id} onClick={() => installTheme(theme.id)}>
                {busyThemeId === theme.id ? "Installing..." : "Install"}
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => navigator.clipboard.writeText(theme.id).then(() => setStatus(`Copied theme id ${theme.id}`)).catch(() => setStatus("Could not copy theme id."))}
              >
                Copy ID
              </button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
