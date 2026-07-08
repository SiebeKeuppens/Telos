// Compact ± numeric stepper. The number field flexes; the buttons are fixed
// touch targets — the same shape as the web set-logger, so two fit a phone row.
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { fonts, radius, space, type Palette } from "../../lib/theme";
import { useTheme } from "../../lib/theme-context";

export function Stepper({
  value,
  onChange,
  step,
  min = 0,
  max,
  precision = 0,
  caption,
}: {
  value: number;
  onChange: (v: number) => void;
  step: number;
  min?: number;
  max?: number;
  precision?: number;
  caption: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // Raw text while the user types — reformatting each keystroke would eat
  // "82," before the decimals arrive. Parsed live so the parent always holds
  // the latest valid number; the display snaps to canonical format on blur.
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (v: number) =>
    Math.min(max ?? Number.MAX_SAFE_INTEGER, Math.max(min, v));
  const round = (v: number) => Number(v.toFixed(precision + 1));
  const fmt = (v: number) =>
    precision > 0 ? v.toFixed(precision) : String(Math.round(v));
  const nudge = (dir: 1 | -1) => {
    setDraft(null);
    onChange(clamp(round(value + dir * step)));
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.caption}>{caption}</Text>
      <View style={styles.row}>
        <Pressable
          accessibilityLabel={`decrease ${caption}`}
          onPress={() => nudge(-1)}
          style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
        >
          <Text style={styles.btnText}>–</Text>
        </Pressable>
        <TextInput
          value={draft ?? fmt(value)}
          onChangeText={(t) => {
            setDraft(t);
            // Comma decimals — Android's decimal-pad follows the device locale.
            const parsed = parseFloat(t.replace(",", "."));
            if (!isNaN(parsed)) onChange(clamp(Number(parsed.toFixed(precision))));
          }}
          onBlur={() => setDraft(null)}
          keyboardType="decimal-pad"
          selectTextOnFocus
          style={styles.input}
        />
        <Pressable
          accessibilityLabel={`increase ${caption}`}
          onPress={() => nudge(1)}
          style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
        >
          <Text style={styles.btnText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    wrap: { flex: 1, minWidth: 0 },
    caption: {
      fontFamily: fonts.headMedium,
      fontSize: 12,
      lineHeight: 16,
      color: colors.onSurfaceVariant,
      textAlign: "center",
      marginBottom: space(1),
      letterSpacing: 0.96,
      textTransform: "uppercase",
    },
    row: { flexDirection: "row", alignItems: "center", gap: space(1) },
    btn: {
      width: 36,
      height: 44,
      borderRadius: radius.base,
      backgroundColor: colors.surfaceContainerHigh,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      alignItems: "center",
      justifyContent: "center",
    },
    btnPressed: { backgroundColor: colors.surfaceContainerHighest },
    btnText: { fontFamily: fonts.headMedium, fontSize: 20, color: colors.onSurface },
    input: {
      flex: 1,
      minWidth: 0,
      height: 44,
      borderRadius: radius.base,
      backgroundColor: colors.surfaceContainerLow,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      textAlign: "center",
      fontFamily: fonts.headMedium,
      fontSize: 15,
      color: colors.onSurface,
      paddingVertical: 0,
    },
  });
