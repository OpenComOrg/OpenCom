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

const visualPresets = [
  {
    id: "midnight",
    name: "Midnight",
    values: {
      bgFrom: "#081329",
      bgTo: "#151f3a",
      surface: "#13213a",
      text: "#eef4ff",
      muted: "#9eb2d9",
      brand: "#5a9fff",
      radius: 14,
      blur: 12,
      shadow: 0.45
    }
  },
  {
    id: "aurora",
    name: "Aurora",
    values: {
      bgFrom: "#07211f",
      bgTo: "#1d1f40",
      surface: "#132a34",
      text: "#ecfffb",
      muted: "#9dc9d6",
      brand: "#48d5ac",
      radius: 16,
      blur: 14,
      shadow: 0.42
    }
  },
  {
    id: "ember",
    name: "Ember",
    values: {
      bgFrom: "#28120f",
      bgTo: "#311d2f",
      surface: "#342025",
      text: "#fff1e5",
      muted: "#d1ab9c",
      brand: "#ff8656",
      radius: 13,
      blur: 9,
      shadow: 0.5
    }
  }
];

const VISUAL_START = "/* OpenCom Visual Builder Start */";
const VISUAL_END = "/* OpenCom Visual Builder End */";

function buildVisualCss(values) {
  const radius = Math.max(4, Math.min(32, Number(values.radius) || 14));
  const blur = Math.max(0, Math.min(24, Number(values.blur) || 0));
  const shadow = Math.max(0, Math.min(0.8, Number(values.shadow) || 0.45));
  return [
    VISUAL_START,
    ":root {",
    `  --brand: ${values.brand};`,
    `  --text-main: ${values.text};`,
    `  --text-soft: ${values.muted};`,
    `  --bg-main: linear-gradient(155deg, ${values.bgFrom}, ${values.bgTo});`,
    `  --bg-elev: color-mix(in srgb, ${values.surface} 82%, #02050d 18%);`,
    `  --radius: ${radius}px;`,
    "}",
    "body {",
    `  background: radial-gradient(1000px 520px at 12% -8%, color-mix(in srgb, ${values.brand} 30%, transparent), transparent 52%), var(--bg-main);`,
    "}",
    ".card, .settings-panel, .theme-card, .server-context-menu {",
    "  border-radius: var(--radius);",
    `  backdrop-filter: blur(${blur}px);`,
    `  box-shadow: 0 16px 36px rgba(4, 8, 18, ${shadow});`,
    "}",
    VISUAL_END
  ].join("\n");
}

function upsertVisualCss(existingCss, visualCss) {
  const existing = String(existingCss || "");
  const start = existing.indexOf(VISUAL_START);
  const end = existing.indexOf(VISUAL_END);
  if (start >= 0 && end >= 0 && end > start) {
    const before = existing.slice(0, start).trimEnd();
    const after = existing.slice(end + VISUAL_END.length).trimStart();
    return `${before}\n\n${visualCss}\n\n${after}`.trim();
  }
  return `${visualCss}\n\n${existing}`.trim();
}

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
  const [visual, setVisual] = useState(visualPresets[0].values);

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
    setVisual(visualPresets[0].values);
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

  function applyVisualPreset(presetId) {
    const preset = visualPresets.find((item) => item.id === presetId);
    if (!preset) return;
    setVisual(preset.values);
    setStatus(`Preset applied: ${preset.name}.`);
  }

  function applyVisualBuilder() {
    const visualCss = buildVisualCss(visual);
    setCss((current) => upsertVisualCss(current, visualCss));
    if (!name.trim()) setName("My Visual Theme");
    setStatus("Visual design applied to CSS.");
  }

  return (
    <div className="theme-tool-shell creator-shell">
      <header className="theme-tool-header">
        <div>
          <h1>Theme Creator</h1>
          <p>No-code builder + advanced CSS in one page.</p>
        </div>
        <div className="theme-tool-actions">
          <button type="button" className="ghost" onClick={() => window.open("/theme-catalog.html", "_blank", "noopener,noreferrer")}>
            Open Catalogue
          </button>
          <button type="button" className="ghost" onClick={loadMine}>Reload My Themes</button>
        </div>
      </header>

      <section className="creator-layout creator-layout-wide">
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

          <h4>Starter Snippets</h4>
          <div className="creator-list">
            {starterTemplates.map((template) => (
              <button key={template.id} type="button" className="ghost" onClick={() => applyTemplate(template.id)}>
                {template.name}
              </button>
            ))}
          </div>
        </aside>

        <section className="card creator-main">
          <div className="creator-grid-2">
            <label>
              Theme Name
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="My clean midnight theme" />
            </label>
            <label>
              Visibility
              <select value={visibility} onChange={(event) => setVisibility(event.target.value)}>
                <option value="private">Private draft</option>
                <option value="public">Public in catalogue</option>
              </select>
            </label>
          </div>
          <label>
            Description
            <textarea rows={2} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Short summary for the catalogue..." />
          </label>
          <label>
            Tags (comma-separated)
            <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="dark, glass, minimal" />
          </label>

          <div className="card creator-visual-builder">
            <div className="creator-visual-head">
              <h3>Visual Builder</h3>
              <div className="theme-row-actions">
                {visualPresets.map((preset) => (
                  <button type="button" key={preset.id} className="ghost" onClick={() => applyVisualPreset(preset.id)}>{preset.name}</button>
                ))}
              </div>
            </div>

            <div className="creator-grid-2">
              <label>Gradient Start<input type="color" value={visual.bgFrom} onChange={(event) => setVisual((current) => ({ ...current, bgFrom: event.target.value }))} /></label>
              <label>Gradient End<input type="color" value={visual.bgTo} onChange={(event) => setVisual((current) => ({ ...current, bgTo: event.target.value }))} /></label>
              <label>Surface<input type="color" value={visual.surface} onChange={(event) => setVisual((current) => ({ ...current, surface: event.target.value }))} /></label>
              <label>Text<input type="color" value={visual.text} onChange={(event) => setVisual((current) => ({ ...current, text: event.target.value }))} /></label>
              <label>Muted Text<input type="color" value={visual.muted} onChange={(event) => setVisual((current) => ({ ...current, muted: event.target.value }))} /></label>
              <label>Brand<input type="color" value={visual.brand} onChange={(event) => setVisual((current) => ({ ...current, brand: event.target.value }))} /></label>
              <label>Radius ({visual.radius}px)
                <input type="range" min={4} max={32} value={visual.radius} onChange={(event) => setVisual((current) => ({ ...current, radius: Number(event.target.value) }))} />
              </label>
              <label>Blur ({visual.blur}px)
                <input type="range" min={0} max={24} value={visual.blur} onChange={(event) => setVisual((current) => ({ ...current, blur: Number(event.target.value) }))} />
              </label>
            </div>
            <label>Shadow Strength ({visual.shadow.toFixed(2)})
              <input type="range" min={0} max={0.8} step={0.01} value={visual.shadow} onChange={(event) => setVisual((current) => ({ ...current, shadow: Number(event.target.value) }))} />
            </label>

            <div className="creator-preview" style={{ background: `linear-gradient(155deg, ${visual.bgFrom}, ${visual.bgTo})` }}>
              <div className="creator-preview-card" style={{ borderRadius: `${visual.radius}px`, color: visual.text, background: visual.surface }}>
                <strong>Live Preview</strong>
                <p style={{ color: visual.muted }}>Primary text, soft text, and surface behavior before applying CSS.</p>
                <button type="button" style={{ background: visual.brand, borderColor: visual.brand }}>Action</button>
              </div>
            </div>

            <div className="theme-row-actions">
              <button type="button" onClick={applyVisualBuilder}>Apply Visual Design</button>
              <button type="button" className="ghost" onClick={() => setVisual(visualPresets[0].values)}>Reset Controls</button>
            </div>
          </div>

          <label>
            Advanced CSS
            <textarea rows={16} value={css} onChange={(event) => setCss(event.target.value)} placeholder="Fine-tune generated CSS or paste your own..." />
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
