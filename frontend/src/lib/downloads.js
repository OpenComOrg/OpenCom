const DOWNLOAD_REPOSITORY = import.meta.env.VITE_BUILD_REPOSITORY || "donskyblock/OpenCom";
const DOWNLOAD_BRANCH = import.meta.env.VITE_BUILD_BRANCH || "main";
const DOWNLOAD_BASE_URL = (import.meta.env.VITE_BUILD_BASE_URL
  || `https://raw.githubusercontent.com/${DOWNLOAD_REPOSITORY}/${DOWNLOAD_BRANCH}`).replace(/\/$/, "");

export const DOWNLOAD_TARGETS = [
  { href: `${DOWNLOAD_BASE_URL}/frontend/OpenCom.exe`, label: "Windows (.exe)" },
  { href: `${DOWNLOAD_BASE_URL}/frontend/OpenCom.deb`, label: "Linux (.deb)" },
  { href: `${DOWNLOAD_BASE_URL}/frontend/OpenCom.tar.gz`, label: "Linux (.tar.gz)" }
];

export function getPreferredDownloadTarget(targets = DOWNLOAD_TARGETS) {
  if (typeof navigator === "undefined") return targets[0] || null;
  const platform = `${navigator.platform || ""} ${navigator.userAgent || ""}`.toLowerCase();
  if (platform.includes("win")) {
    return targets.find((target) => target.label.toLowerCase().includes("windows")) || targets[0] || null;
  }
  return targets.find((target) => target.label.toLowerCase().includes(".deb")) || targets[0] || null;
}
