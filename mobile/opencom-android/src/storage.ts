import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AuthTokens } from "./types";

const ACCESS_TOKEN_KEY = "opencom_mobile_access_token";
const REFRESH_TOKEN_KEY = "opencom_mobile_refresh_token";
const PUSH_TOKEN_KEY = "opencom_mobile_push_token";

export async function loadTokens(): Promise<AuthTokens | null> {
  const [accessToken, refreshToken] = await Promise.all([
    AsyncStorage.getItem(ACCESS_TOKEN_KEY),
    AsyncStorage.getItem(REFRESH_TOKEN_KEY)
  ]);
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

export async function saveTokens(tokens: AuthTokens): Promise<void> {
  await AsyncStorage.multiSet([
    [ACCESS_TOKEN_KEY, tokens.accessToken],
    [REFRESH_TOKEN_KEY, tokens.refreshToken]
  ]);
}

export async function clearTokens(): Promise<void> {
  await AsyncStorage.multiRemove([ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY]);
}

export async function loadPushToken(): Promise<string> {
  return (await AsyncStorage.getItem(PUSH_TOKEN_KEY)) || "";
}

export async function savePushToken(token: string): Promise<void> {
  await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
}
