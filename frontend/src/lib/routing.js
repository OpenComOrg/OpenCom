export const APP_ROUTE_HOME = "/";
export const APP_ROUTE_LOGIN = "/login";
export const APP_ROUTE_CLIENT = "/app";

const INVITE_CODE_RE = /^[a-zA-Z0-9_-]{3,32}$/;

export function isInviteJoinPath(pathname = "") {
  return /^\/join\/[a-zA-Z0-9_-]{3,32}\/?$/.test(pathname || "");
}

export function shouldSkipLandingPage() {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search || "");
  return params.get("desktop") === "1";
}

export function normalizeAppPath(pathname = "") {
  const normalized = pathname.replace(/\/+$/, "") || APP_ROUTE_HOME;
  if (normalized === APP_ROUTE_LOGIN) return APP_ROUTE_LOGIN;
  if (normalized === APP_ROUTE_CLIENT) return APP_ROUTE_CLIENT;
  return APP_ROUTE_HOME;
}

export function getRequestedPath() {
  if (typeof window === "undefined") return APP_ROUTE_HOME;
  const params = new URLSearchParams(window.location.search || "");
  const routeParam = (params.get("route") || "").trim();
  if (routeParam.startsWith("/")) return routeParam;
  return window.location.pathname || APP_ROUTE_HOME;
}

export function getAppRouteFromLocation() {
  const route = normalizeAppPath(getRequestedPath());
  return shouldSkipLandingPage() && route === APP_ROUTE_HOME ? APP_ROUTE_CLIENT : route;
}

export function writeAppRoute(path, { replace = false } = {}) {
  if (typeof window === "undefined") return;
  const nextRoute = normalizeAppPath(path);
  const hash = window.location.hash || "";

  if (window.location.protocol === "file:") {
    const params = new URLSearchParams(window.location.search || "");
    if (nextRoute === APP_ROUTE_HOME) params.delete("route");
    else params.set("route", nextRoute);
    const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${hash}`;
    window.history[replace ? "replaceState" : "pushState"]({}, "", next);
    return;
  }

  const next = `${nextRoute}${hash}`;
  window.history[replace ? "replaceState" : "pushState"]({}, "", next);
}

export function parseInviteCodeFromInput(value = "") {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";
  if (INVITE_CODE_RE.test(trimmed)) return trimmed;
  const directPathMatch = trimmed.match(/^\/join\/([a-zA-Z0-9_-]{3,32})\/?$/);
  if (directPathMatch?.[1]) return directPathMatch[1];

  try {
    const parsed = new URL(trimmed);
    const pathMatch = (parsed.pathname || "").match(/^\/join\/([a-zA-Z0-9_-]{3,32})\/?$/);
    if (pathMatch?.[1]) return pathMatch[1];

    const queryCode = parsed.searchParams.get("join");
    if (queryCode && INVITE_CODE_RE.test(queryCode)) return queryCode;

    for (const key of parsed.searchParams.keys()) {
      if (/^join[a-zA-Z0-9_-]{3,32}$/.test(key)) return key;
    }

    const hash = (parsed.hash || "").replace(/^#/, "");
    if (hash.startsWith("join=")) {
      const hashCode = decodeURIComponent(hash.slice(5));
      if (INVITE_CODE_RE.test(hashCode)) return hashCode;
    }
  } catch {
    return "";
  }

  return "";
}

export function getInviteCodeFromCurrentLocation() {
  if (typeof window === "undefined") return "";
  const pathMatch = (window.location.pathname || "").match(/^\/join\/([a-zA-Z0-9_-]{3,32})\/?$/);
  if (pathMatch?.[1]) return pathMatch[1];
  return parseInviteCodeFromInput(window.location.href || "");
}

export function buildInviteJoinUrl(code) {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/join/${encodeURIComponent(code)}`;
}
