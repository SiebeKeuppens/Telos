import { StyleSheet, Text, View } from "react-native";
import { colors, fonts, radius, space } from "../../lib/theme";
import type { WorkoutStatus } from "../../lib/types";

type Tone = "neutral" | "primary" | "success" | "warning";

export function Badge({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
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
      return "primary";
    case "completed":
      return "success";
    case "aborted":
      return "warning";
    default:
      return "neutral";
  }
}

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: space(2),
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  text: { fontFamily: fonts.bodyMedium, fontSize: 11, letterSpacing: 0.3 },
});

const tones: Record<Tone, { bg: string; border: string; text: string }> = {
  neutral: {
    bg: colors.surfaceContainerHigh,
    border: colors.outlineVariant,
    text: colors.onSurfaceVariant,
  },
  primary: {
    bg: colors.primaryContainer,
    border: colors.primary,
    text: colors.onPrimaryContainer,
  },
  success: {
    bg: "transparent",
    border: colors.success,
    text: colors.success,
  },
  warning: {
    bg: "transparent",
    border: colors.warning,
    text: colors.warning,
  },
};
