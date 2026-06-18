// Design tokens ported 1:1 from the web's globals.css (the canonical source in
// design.md). Dark scheme only for the V1 slice — the light palette can be
// added later behind a theme switch the same way the web does it.
import { StyleSheet } from "react-native";

export const colors = {
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
} as const;

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
export const type = StyleSheet.create({
  display: { fontFamily: fonts.head, fontSize: 28, lineHeight: 34, color: colors.onSurface },
  title: { fontFamily: fonts.head, fontSize: 18, lineHeight: 24, color: colors.onSurface },
  bodyLg: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24, color: colors.onSurface },
  body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.onSurface },
  bodyVariant: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.onSurfaceVariant },
  label: { fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 16, color: colors.onSurfaceVariant, letterSpacing: 0.3 },
  data: { fontFamily: fonts.headMedium, fontSize: 15, lineHeight: 20, color: colors.onSurface },
});
