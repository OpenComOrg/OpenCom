import { useEffect, useMemo, useState } from "react";
import { coreApi } from "./themeApi";
import "../theme-tools.css";

const starterTemplates = [
  {
    id: "clean",
    name: "Clean Glass",
    css: ":root { --bg-main: #0b1220; --bg-elev: rgba(20, 28, 45, 0.88); --text-main: #f0f5ff; --brand: #69a2ff; }"
  },
  {
    id: "neon",
    name: "Neon Grid",
    css: "body { background: radial-gradient(circle at 12% 10%, rgba(47, 180, 255, 0.24), transparent 45%), linear-gradient(145deg, #050b16, #11152b 60%); }"
  },
  {
    id: "sunset",
    name: "Sunset Warm",
    css: "body { background: linear-gradient(160deg, #2f1b20, #5c2c2c 40%, #231a2e); } :root { --brand: #ff8f54; }"
  }
];

export function ThemeCreatorApp() {
  const [themes, setThemes] = useState([]);
  const [selectedThemeId, setSelectedThemeId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [visibility, setVisibility] = useState("private");
  const [css, setCss] = useState("");
  const [status, setStatus] = useState("Load or create a theme.");
  const [busy, setBusy] = useState(false);

  async function loadMine() {
    try {
      const data = await coreApi("/v1/me/themes");
      const list = Array.isArray(data?.themes) ? data.themes : [];
      setThemes(list);
      setStatus(`Loaded ${list.length} theme(s).`);
    } catch (error) {
      setStatus(`Could not load your themes: ${error.message}. Sign in first.`);
    }
  }

  useEffect(() => {
    loadMine().catch(() => {});
  }, []);

  const selectedTheme = useMemo(
    () => themes.find((item) => item.id === selectedThemeId) || null,
    [themes, selectedThemeId]
  );

  useEffect(() => {
    if (!selectedTheme) return;
    setName(selectedTheme.name || "");
    setDescription(selectedTheme.description || "");
    setTags((selectedTheme.tags || []).join(", "));
    setVisibility(selectedTheme.visibility || "private");
    setCss(selectedTheme.css || "");
  }, [selectedTheme?.id]);

  function resetForm() {
    setSelectedThemeId("");
    setName("");
    setDescription("");
    setTags("");
    setVisibility("private");
    setCss("");
  }

  async function saveTheme() {
    if (!name.trim() || !css.trim()) {
      setStatus("Theme name and CSS are required.");
      return;
    }
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      css,
      tags: tags.split(",").map((item) => item.trim()).filter(Boolean),
      visibility
    };
    try {
      setBusy(true);
      if (selectedThemeId) {
        await coreApi(`/v1/themes/${encodeURIComponent(selectedThemeId)}`, {
          method: "PATCH",
          body: JSON.stringify(payload)
        });
        setStatus(`Updated "${name.trim()}".`);
      } else {
        const data = await coreApi("/v1/themes", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        setSelectedThemeId(data?.themeId || "");
        setStatus(`Created "${name.trim()}".`);
      }
      await loadMine();
    } catch (error) {
      setStatus(`Save failed: ${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  function applyTemplate(id) {
    const template = starterTemplates.find((item) => item.id === id);
    if (!template) return;
    if (!name.trim()) setName(template.name);
    setCss((current) => (current.trim() ? `${current}\n\n${template.css}` : template.css));
    setStatus(`Inserted template: ${template.name}.`);
  }

  return (
    <div className="theme-tool-shell creator-shell">
      <header className="theme-tool-header">
        <div>
          <h1>Theme Creator</h1>
          <p>Create, edit, and publish themes with minimal friction.</p>
        </div>
        <div className="theme-tool-actions">
          <button type="button" className="ghost" onClick={() => window.open("/theme-catalog.html", "_blank", "noopener,noreferrer")}>
            Open Catalogue
          </button>
          <button type="button" className="ghost" onClick={loadMine}>Reload My Themes</button>
        </div>
      </header>

      <section className="creator-layout">
        <aside className="card creator-sidebar">
          <h3>Your Themes</h3>
          <button type="button" onClick={resetForm}>+ New Theme</button>
          <div className="creator-list">
            {themes.map((theme) => (
              <button
                type="button"
                key={theme.id}
                className={`creator-theme-item ${selectedThemeId === theme.id ? "active" : ""}`}
                onClick={() => setSelectedThemeId(theme.id)}
              >
                <strong>{theme.name}</strong>
                <span>{theme.visibility}</span>
              </button>
            ))}
          </div>
          <h4>Templates</h4>
          <div className="creator-list">
            {starterTemplates.map((template) => (
              <button key={template.id} type="button" className="ghost" onClick={() => applyTemplate(template.id)}>
                {template.name}
              </button>
            ))}
          </div>
        </aside>

        <section className="card creator-main">
          <label>
            Theme Name
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="My clean midnight theme" />
          </label>
          <label>
            Description
            <textarea rows={2} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Short summary for the catalogue..." />
          </label>
          <label>
            Tags (comma-separated)
            <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="dark, glass, minimal" />
          </label>
          <label>
            Visibility
            <select value={visibility} onChange={(event) => setVisibility(event.target.value)}>
              <option value="private">Private draft</option>
              <option value="public">Public in catalogue</option>
            </select>
          </label>
          <label>
            CSS
            <textarea rows={18} value={css} onChange={(event) => setCss(event.target.value)} placeholder="Paste or write CSS theme overrides..." />
          </label>
          <div className="theme-row-actions">
            <button type="button" onClick={saveTheme} disabled={busy}>{busy ? "Saving..." : "Save Theme"}</button>
            <button type="button" className="ghost" onClick={() => navigator.clipboard.writeText(css).then(() => setStatus("Copied CSS.")).catch(() => setStatus("Could not copy CSS."))}>
              Copy CSS
            </button>
          </div>
          <p className="theme-tool-status">{status}</p>
        </section>
      </section>
    </div>
  );
}
