const DOWNLOAD_BASE_URL = (import.meta.env.VITE_DOWNLOADS_BASE_URL || import.meta.env.VITE_CORE_API_URL || "").replace(/\/$/, "");

export const DOWNLOAD_TARGETS = [
  { href: `${DOWNLOAD_BASE_URL}/downloads/OpenCom.exe`, label: "Windows (.exe)" },
  { href: `${DOWNLOAD_BASE_URL}/downloads/OpenCom.deb`, label: "Linux (.deb)" },
  { href: `${DOWNLOAD_BASE_URL}/downloads/OpenCom.tar.gz`, label: "Linux (.tar.gz)" }
];

export function getPreferredDownloadTarget(targets = DOWNLOAD_TARGETS) {
  if (typeof navigator === "undefined") return targets[0] || null;
  const platform = `${navigator.platform || ""} ${navigator.userAgent || ""}`.toLowerCase();
  if (platform.includes("win")) {
    return targets.find((target) => target.label.toLowerCase().includes("windows")) || targets[0] || null;
  }
  return targets.find((target) => target.label.toLowerCase().includes(".deb")) || targets[0] || null;
}
