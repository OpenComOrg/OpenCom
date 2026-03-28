import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Platform } from "react-native";
import { loadThemeId, saveThemeId } from "./storage";

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 18,
  xl: 24,
  xxl: 32,
};

export const radii = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 24,
  full: 9999,
};

export const typography = {
  hero: { fontSize: 28, fontWeight: "800" as const, letterSpacing: -0.6 },
  title: { fontSize: 18, fontWeight: "700" as const, letterSpacing: -0.2 },
  heading: { fontSize: 16, fontWeight: "700" as const },
  body: { fontSize: 15 },
  caption: { fontSize: 13 },
  label: { fontSize: 12, fontWeight: "600" as const },
  eyebrow: {
    fontSize: 11,
    fontWeight: "700" as const,
    letterSpacing: 0.9,
  },
};

export const shadows = {
  card: Platform.select({
    ios: {
      shadowColor: "#020919",
      shadowOpacity: 0.32,
      shadowOffset: { width: 0, height: 14 },
      shadowRadius: 24,
    },
    android: {
      elevation: 8,
    },
    default: {},
  }),
  floating: Platform.select({
    ios: {
      shadowColor: "#020919",
      shadowOpacity: 0.4,
      shadowOffset: { width: 0, height: 18 },
      shadowRadius: 28,
    },
    android: {
      elevation: 12,
    },
    default: {},
  }),
};

export type ThemeColors = {
  background: string;
  backgroundDeep: string;
  rail: string;
  sidebar: string;
  sidebarStrong: string;
  chat: string;
  chatAlt: string;
  elev: string;
  elevStrong: string;
  panel: string;
  panelAlt: string;
  input: string;
  hover: string;
  active: string;
  brandMuted: string;
  brandGlow: string;
  overlay: string;
  border: string;
  borderStrong: string;
  text: string;
  textSoft: string;
  textDim: string;
  brand: string;
  brandStrong: string;
  danger: string;
  success: string;
  warning: string;
};

export type ThemeDefinition = {
  id: string;
  name: string;
  description: string;
  gradient: [string, string];
  colors: ThemeColors;
};

const THEME_PRESETS: ThemeDefinition[] = [
  {
    id: "midnight",
    name: "Midnight",
    description: "Deep navy glass with the classic OpenCom glow.",
    gradient: ["#081329", "#151f3a"],
    colors: {
      background: "#0a1120",
      backgroundDeep: "#070d19",
      rail: "#0c162a",
      sidebar: "#111e35",
      sidebarStrong: "#101a31",
      chat: "#111c33",
      chatAlt: "#1a2a45",
      elev: "#1a2741",
      elevStrong: "#16233d",
      panel: "rgba(17, 30, 53, 0.88)",
      panelAlt: "rgba(20, 32, 57, 0.86)",
      input: "#0d172d",
      hover: "rgba(132, 165, 255, 0.16)",
      active: "rgba(125, 164, 255, 0.28)",
      brandMuted: "rgba(115, 134, 255, 0.16)",
      brandGlow: "rgba(115, 134, 255, 0.28)",
      overlay: "rgba(5, 10, 19, 0.82)",
      border: "rgba(152, 174, 219, 0.2)",
      borderStrong: "rgba(181, 196, 255, 0.36)",
      text: "#edf2ff",
      textSoft: "#c6d4f5",
      textDim: "#90a5cf",
      brand: "#7386ff",
      brandStrong: "#8f8cff",
      danger: "#ef5f76",
      success: "#37cd93",
      warning: "#f0b429",
    },
  },
  {
    id: "aurora",
    name: "Aurora",
    description: "Cool green-blue surfaces with a brighter accent edge.",
    gradient: ["#07211f", "#1d1f40"],
    colors: {
      background: "#081714",
      backgroundDeep: "#05100f",
      rail: "#0a1e1a",
      sidebar: "#102824",
      sidebarStrong: "#0d221f",
      chat: "#122b2a",
      chatAlt: "#173839",
      elev: "#183434",
      elevStrong: "#12302f",
      panel: "rgba(16, 40, 36, 0.9)",
      panelAlt: "rgba(18, 52, 52, 0.86)",
      input: "#0b1918",
      hover: "rgba(72, 213, 172, 0.16)",
      active: "rgba(72, 213, 172, 0.24)",
      brandMuted: "rgba(72, 213, 172, 0.18)",
      brandGlow: "rgba(72, 213, 172, 0.3)",
      overlay: "rgba(4, 11, 14, 0.82)",
      border: "rgba(133, 207, 195, 0.22)",
      borderStrong: "rgba(154, 228, 212, 0.34)",
      text: "#ecfffb",
      textSoft: "#c7ece4",
      textDim: "#8fbab2",
      brand: "#48d5ac",
      brandStrong: "#76e7c7",
      danger: "#ef6e80",
      success: "#43d59e",
      warning: "#f4c35b",
    },
  },
  {
    id: "ember",
    name: "Ember",
    description: "Warm copper and plum tones for a softer mobile look.",
    gradient: ["#28120f", "#311d2f"],
    colors: {
      background: "#180d12",
      backgroundDeep: "#11080c",
      rail: "#221118",
      sidebar: "#2a1722",
      sidebarStrong: "#24131d",
      chat: "#301b28",
      chatAlt: "#3a2430",
      elev: "#3b2530",
      elevStrong: "#34202a",
      panel: "rgba(42, 23, 34, 0.9)",
      panelAlt: "rgba(59, 37, 48, 0.86)",
      input: "#1d1018",
      hover: "rgba(255, 134, 86, 0.16)",
      active: "rgba(255, 134, 86, 0.24)",
      brandMuted: "rgba(255, 134, 86, 0.18)",
      brandGlow: "rgba(255, 134, 86, 0.28)",
      overlay: "rgba(9, 4, 7, 0.82)",
      border: "rgba(233, 174, 153, 0.22)",
      borderStrong: "rgba(255, 203, 185, 0.34)",
      text: "#fff1e5",
      textSoft: "#ebcfc2",
      textDim: "#c89f93",
      brand: "#ff8656",
      brandStrong: "#ffab83",
      danger: "#ef7187",
      success: "#48d08e",
      warning: "#f3c363",
    },
  },
];

export const colors = THEME_PRESETS[0].colors;
export const themePresets = THEME_PRESETS;

type ThemeContextValue = {
  theme: ThemeDefinition;
  themeId: string;
  setThemeId: (themeId: string) => Promise<void>;
  ready: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveTheme(themeId: string | null | undefined): ThemeDefinition {
  return (
    THEME_PRESETS.find((theme) => theme.id === String(themeId || "").trim()) ||
    THEME_PRESETS[0]
  );
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeIdState] = useState(THEME_PRESETS[0].id);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    loadThemeId()
      .then((storedThemeId) => {
        if (!alive) return;
        const nextTheme = resolveTheme(storedThemeId);
        setThemeIdState(nextTheme.id);
        setReady(true);
      })
      .catch(() => {
        if (!alive) return;
        setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const setThemeId = useCallback(async (nextThemeId: string) => {
    const nextTheme = resolveTheme(nextThemeId);
    setThemeIdState(nextTheme.id);
    await saveThemeId(nextTheme.id);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: resolveTheme(themeId),
      themeId,
      setThemeId,
      ready,
    }),
    [ready, setThemeId, themeId],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return value;
}
