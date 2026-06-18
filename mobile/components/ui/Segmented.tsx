import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts, radius, space } from "../../lib/theme";

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.wrap}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[styles.seg, active && styles.segActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.label, active && styles.labelActive]}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: radius.base,
    padding: space(0.5),
    gap: space(0.5),
  },
  seg: {
    flex: 1,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
  },
  segActive: { backgroundColor: colors.primary },
  label: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.onSurfaceVariant },
  labelActive: { color: colors.onPrimary },
});
