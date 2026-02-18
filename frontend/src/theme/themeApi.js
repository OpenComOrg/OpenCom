const ACCESS_TOKEN_KEY = "opencom_access_token";
const THEME_STORAGE_KEY = "opencom_custom_theme_css";
const THEME_ENABLED_STORAGE_KEY = "opencom_custom_theme_enabled";

export function resolveCoreApiBase() {
  const fromEnv = String(import.meta.env.VITE_CORE_API_URL || "").trim();
  const fromQuery = typeof window !== "undefined"
    ? String(new URLSearchParams(window.location.search || "").get("coreApi") || "").trim()
    : "";
  const candidate = fromQuery || fromEnv || "https://api.opencom.online";
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "https://api.opencom.online";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return "https://api.opencom.online";
  }
}

export const CORE_API = resolveCoreApiBase();

export function getAccessToken() {
  try {
    return localStorage.getItem(ACCESS_TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export async function coreApi(path, options = {}) {
  const token = getAccessToken();
  const headers = {
    ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };
  const response = await fetch(`${CORE_API}${path}`, { ...options, headers });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP_${response.status}`);
  }
  return response.json();
}

export function installThemeLocally(cssText) {
  const css = String(cssText || "");
  localStorage.setItem(THEME_STORAGE_KEY, css);
  localStorage.setItem(THEME_ENABLED_STORAGE_KEY, "1");
  window.dispatchEvent(new CustomEvent("opencom-theme-updated", {
    detail: { css, enabled: true }
  }));
}
