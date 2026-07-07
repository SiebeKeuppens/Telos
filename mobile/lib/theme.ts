// Design tokens ported 1:1 from the web's globals.css (the canonical source in
// design.md). `colors` (dark) is kept as the existing default export so
// nothing breaks before screens migrate to useTheme() in a later wave;
// darkColors/lightColors/Palette back theme-context.tsx's theme switch.
import { StyleSheet } from "react-native";

export type Palette = {
  surface: string;
  surfaceBright: string;
  surfaceContainerLowest: string;
  surfaceContainerLow: string;
  surfaceContainer: string;
  surfaceContainerHigh: string;
  surfaceContainerHighest: string;
  onSurface: string;
  onSurfaceVariant: string;
  outline: string;
  outlineVariant: string;

  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  secondary: string;
  tertiary: string;

  error: string;
  onError: string;
  success: string;
  warning: string;
};

export const darkColors: Palette = {
  surface: "#0a0f10",
  surfaceBright: "#232e30",
  surfaceContainerLowest: "#000000",
  surfaceContainerLow: "#0e1416",
  surfaceContainer: "#131b1c",
  surfaceContainerHigh: "#182123",
  surfaceContainerHighest: "#1d2729",
  onSurface: "#dce7ea",
  onSurfaceVariant: "#a2adaf",
  outline: "#6c777a",
  outlineVariant: "#3f4a4c",

  primary: "#8fd6a8",
  onPrimary: "#06351f",
  primaryContainer: "#21543a",
  onPrimaryContainer: "#abf2c4",
  secondary: "#b2cbd0",
  tertiary: "#accdf0",

  error: "#fa746f",
  onError: "#490006",
  success: "#7fd1a8",
  warning: "#e8c97a",
};

// Ported from web/src/globals.css [data-theme="light"]. Semantic colors
// (success/warning) darken in light mode to keep AA contrast on white
// surfaces — the dark-mode values are pastel by design.
export const lightColors: Palette = {
  surface: "#f4f8f9",
  surfaceBright: "#ffffff",
  surfaceContainerLowest: "#ffffff",
  surfaceContainerLow: "#eef3f4",
  surfaceContainer: "#ffffff",
  surfaceContainerHigh: "#e7eef0",
  surfaceContainerHighest: "#dfe8ea",
  onSurface: "#161d1f",
  onSurfaceVariant: "#41494b",
  outline: "#717a7c",
  outlineVariant: "#c4ced0",

  primary: "#2e6a47",
  onPrimary: "#ffffff",
  primaryContainer: "#b6f0c9",
  onPrimaryContainer: "#06301c",
  secondary: "#b2cbd0",
  tertiary: "#accdf0",

  error: "#b3261e",
  onError: "#ffffff",
  success: "#1f6b46",
  warning: "#815c11",
};

/** @deprecated dark palette only — kept so pre-wave-2 screens (which import
 * `colors` directly) keep compiling. New code should use useTheme().colors. */
export const colors = darkColors;

export const radius = { sm: 3, base: 4, lg: 8, xl: 12, pill: 999 } as const;

/** 4px spacing grid — space(4) === 16px, matching the web --gutter. */
export const space = (n: number) => n * 4;

// Font family keys must match the names loaded in app/_layout.tsx.
export const fonts = {
  head: "SpaceGrotesk_600SemiBold",
  headMedium: "SpaceGrotesk_500Medium",
  body: "Inter_400Regular",
  bodyMedium: "Inter_500Medium",
} as const;

// Type scale (subset of the web's type-* utilities).
/** Type scale factory — themed text styles. Screens get this via
 * useTheme().type; the static export below stays for pre-conversion code. */
export const makeType = (c: Palette) =>
  StyleSheet.create({
    display: { fontFamily: fonts.head, fontSize: 28, lineHeight: 34, color: c.onSurface },
    title: { fontFamily: fonts.head, fontSize: 18, lineHeight: 24, color: c.onSurface },
    bodyLg: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24, color: c.onSurface },
    body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: c.onSurface },
    bodyVariant: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: c.onSurfaceVariant },
    label: { fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 16, color: c.onSurfaceVariant, letterSpacing: 0.3 },
    data: { fontFamily: fonts.headMedium, fontSize: 15, lineHeight: 20, color: c.onSurface },
  });

export type TypeScale = ReturnType<typeof makeType>;

/** @deprecated dark-palette type scale — use useTheme().type in new code. */
export const type = makeType(darkColors);
