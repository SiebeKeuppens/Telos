import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { fonts, radius, space, withAlpha, type Palette } from "../../lib/theme";
import { useTheme } from "../../lib/theme-context";
import type { WorkoutStatus } from "../../lib/types";

// Mirrors web Badge.tsx's 5 tones 1:1 — "accent" replaces mobile's old opaque
// "primary" tone (which had no web equivalent); "danger" is new.
type Tone = "neutral" | "accent" | "success" | "warning" | "danger";

export function Badge({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const tones = useMemo(() => makeTones(colors), [colors]);
  const v = tones[tone];
  return (
    <View style={[styles.base, { backgroundColor: v.bg, borderColor: v.border }]}>
      <Text style={[styles.text, { color: v.text }]}>{label}</Text>
    </View>
  );
}

export function statusTone(status: WorkoutStatus): Tone {
  switch (status) {
    case "in_progress":
      return "accent";
    case "completed":
      return "success";
    case "aborted":
      return "warning";
    default:
      return "neutral";
  }
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    base: {
      paddingHorizontal: space(2),
      paddingVertical: 2,
      borderRadius: radius.base,
      borderWidth: 1,
      alignSelf: "flex-start",
    },
    // type.label (Space Grotesk 500, uppercase, 0.08em @ 12px) inlined here
    // since Badge doesn't consume useTheme().type directly.
    text: {
      fontFamily: fonts.headMedium,
      fontSize: 12,
      lineHeight: 16,
      letterSpacing: 0.96,
      textTransform: "uppercase",
    },
  });

const makeTones = (colors: Palette): Record<Tone, { bg: string; border: string; text: string }> => ({
  neutral: {
    bg: colors.surfaceContainerHigh,
    border: colors.outlineVariant,
    text: colors.onSurfaceVariant,
  },
  accent: {
    bg: withAlpha(colors.primary, 0.14),
    border: withAlpha(colors.primary, 0.3),
    text: colors.primary,
  },
  success: {
    bg: withAlpha(colors.success, 0.14),
    border: withAlpha(colors.success, 0.3),
    text: colors.success,
  },
  warning: {
    bg: withAlpha(colors.warning, 0.14),
    border: withAlpha(colors.warning, 0.3),
    text: colors.warning,
  },
  danger: {
    bg: withAlpha(colors.error, 0.14),
    border: withAlpha(colors.error, 0.3),
    text: colors.error,
  },
});
