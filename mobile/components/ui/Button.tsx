import { useMemo } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { fonts, radius, space, type Palette } from "../../lib/theme";
import { useTheme } from "../../lib/theme-context";

type Variant = "primary" | "secondary" | "ghost" | "destructive";

export function Button({
  label,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const variants = useMemo(() => makeVariants(colors), [colors]);
  const v = variants[variant];
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        v.container,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.label.color} />
      ) : (
        <Text style={[styles.label, v.label]}>{label}</Text>
      )}
    </Pressable>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    base: {
      height: 48,
      borderRadius: radius.base,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: space(5),
      flexDirection: "row",
    },
    label: { fontFamily: fonts.bodyMedium, fontSize: 15 },
    pressed: { opacity: 0.85 },
    disabled: { opacity: 0.45 },
  });

const makeVariants = (
  colors: Palette,
): Record<Variant, { container: ViewStyle; label: { color: string } }> => ({
  primary: {
    container: { backgroundColor: colors.primary },
    label: { color: colors.onPrimary },
  },
  secondary: {
    container: {
      backgroundColor: colors.surfaceContainerHigh,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
    },
    label: { color: colors.onSurface },
  },
  ghost: {
    container: { backgroundColor: "transparent" },
    label: { color: colors.onSurfaceVariant },
  },
  destructive: {
    container: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.error },
    label: { color: colors.error },
  },
});
