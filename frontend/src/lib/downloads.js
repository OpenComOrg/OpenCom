function normalizeBasePath(basePath = "/") {
  const value = String(basePath || "/").trim();
  if (!value) return "/";
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

const DOWNLOAD_BASE_PATH = `${normalizeBasePath(import.meta.env.BASE_URL)}/downloads`;

export const DOWNLOAD_TARGETS = [
  {
    href: `${DOWNLOAD_BASE_PATH}/OpenCom.apk`,
    label: "Android (.apk)",
    platform: "android",
    family: "mobile",
  },
  {
    href: `${DOWNLOAD_BASE_PATH}/OpenCom.exe`,
    label: "Windows (.exe)",
    platform: "windows",
    family: "desktop",
  },
  {
    href: `${DOWNLOAD_BASE_PATH}/OpenCom.deb`,
    label: "Linux (.deb)",
    platform: "linux",
    family: "desktop",
  },
  {
    href: `${DOWNLOAD_BASE_PATH}/OpenCom.rpm`,
    label: "Linux (.rpm)",
    platform: "linux",
    family: "desktop",
  },
  {
    href: `${DOWNLOAD_BASE_PATH}/OpenCom.snap`,
    label: "Linux (.snap)",
    platform: "linux",
    family: "desktop",
  },
  {
    href: `${DOWNLOAD_BASE_PATH}/OpenCom.tar.gz`,
    label: "Linux (.tar.gz)",
    platform: "linux",
    family: "desktop",
  }
];

export function getDeviceDownloadContext() {
  if (typeof navigator === "undefined") {
    return { isMobile: false, isAndroid: false, isIOS: false };
  }

  const platform = `${navigator.platform || ""}`.toLowerCase();
  const userAgent = `${navigator.userAgent || ""}`.toLowerCase();
  const maxTouchPoints = Number(navigator.maxTouchPoints || 0);
  const isAndroid = userAgent.includes("android");
  const isIOS =
    /iphone|ipad|ipod/.test(userAgent) ||
    (platform.includes("mac") && maxTouchPoints > 1);
  const isMobile =
    isAndroid ||
    isIOS ||
    userAgent.includes("mobile") ||
    userAgent.includes("tablet");

  return { isMobile, isAndroid, isIOS };
}

export function getMobileDownloadTarget(targets = DOWNLOAD_TARGETS) {
  return targets.find((target) => target.platform === "android") || null;
}

export function getPreferredDownloadTarget(targets = DOWNLOAD_TARGETS) {
  if (typeof navigator === "undefined") return targets[0] || null;
  const platform = `${navigator.platform || ""} ${navigator.userAgent || ""}`.toLowerCase();
  const { isAndroid } = getDeviceDownloadContext();
  if (isAndroid) {
    return getMobileDownloadTarget(targets) || targets[0] || null;
  }
  if (platform.includes("win")) {
    return targets.find((target) => target.platform === "windows") || targets[0] || null;
  }
  return (
    targets.find((target) => target.platform === "linux" && target.label.toLowerCase().includes(".deb")) ||
    targets.find((target) => target.platform === "linux" && target.label.toLowerCase().includes(".rpm")) ||
    targets.find((target) => target.platform === "linux") ||
    targets[0] ||
    null
  );
}
