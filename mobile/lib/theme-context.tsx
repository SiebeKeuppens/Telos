// Theme preference: "system" follows the OS via RN's Appearance API, or the
// user can pin "light"/"dark". Persisted the same way as language (see
// lib/i18n/index.ts) — AsyncStorage, best-effort, defaults if unavailable.
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Appearance } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  darkColors,
  lightColors,
  makeType,
  type Palette,
  type TypeScale,
} from "./theme";

export const THEME_PREFERENCES = ["system", "light", "dark"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ColorScheme = "light" | "dark";

const STORAGE_KEY = "telos-theme";

function isThemePreference(v: unknown): v is ThemePreference {
  return v === "system" || v === "light" || v === "dark";
}

function resolveScheme(preference: ThemePreference): ColorScheme {
  if (preference === "system") {
    return Appearance.getColorScheme() === "light" ? "light" : "dark";
  }
  return preference;
}

type ThemeContextValue = {
  scheme: ColorScheme;
  colors: Palette;
  /** Themed text styles (display/title/body/bodyVariant/label/data…). */
  type: TypeScale;
  preference: ThemePreference;
  setPreference: (pref: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [systemScheme, setSystemScheme] = useState<ColorScheme>(() =>
    resolveScheme("system"),
  );

  // Load the persisted preference once on mount.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!cancelled && isThemePreference(stored)) setPreferenceState(stored);
      })
      .catch(() => {
        // non-fatal — keep default "system"
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Track OS scheme changes while preference === "system".
  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme === "light" ? "light" : "dark");
    });
    return () => sub.remove();
  }, []);

  function setPreference(pref: ThemePreference) {
    setPreferenceState(pref);
    void AsyncStorage.setItem(STORAGE_KEY, pref).catch(() => {
      // non-fatal
    });
  }

  const scheme: ColorScheme = preference === "system" ? systemScheme : preference;
  const colors = scheme === "light" ? lightColors : darkColors;

  const value = useMemo<ThemeContextValue>(
    () => ({ scheme, colors, type: makeType(colors), preference, setPreference }),
    [scheme, colors, preference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
