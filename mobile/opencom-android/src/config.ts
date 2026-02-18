import Constants from "expo-constants";

const DEFAULT_CORE_API_URL = "https://api.opencom.online";

export function resolveCoreApiUrl(): string {
  const value =
    process.env.EXPO_PUBLIC_OPENCOM_CORE_API_URL ||
    Constants.expoConfig?.extra?.opencomCoreApiUrl ||
    DEFAULT_CORE_API_URL;
  return normalizeHttpUrl(value, DEFAULT_CORE_API_URL);
}

function normalizeHttpUrl(value: string, fallback: string): string {
  const trimmed = String(value || "").trim();
  if (!trimmed) return fallback;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return fallback;
    }
    return parsed.toString();
  } catch {
    return fallback;
  }
}
