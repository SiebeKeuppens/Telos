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
type Size = "default" | "compact";

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "default",
  loading = false,
  disabled = false,
  fullWidth = true,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  /** Web defaults `fullWidth = true`; pass false for content-sized buttons
   * (e.g. ghost link-buttons, an action-bar Finish button beside a ring). */
  fullWidth?: boolean;
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
        size === "compact" ? styles.compact : styles.defaultHeight,
        v.container,
        !fullWidth && styles.notFullWidth,
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
      borderRadius: radius.base,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: space(5),
      flexDirection: "row",
    },
    defaultHeight: { height: 48 },
    compact: { height: 40 },
    notFullWidth: { alignSelf: "flex-start" },
    label: { fontFamily: fonts.headMedium, fontSize: 15 },
    pressed: { opacity: 0.85 },
    disabled: { opacity: 0.4 },
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
    container: { backgroundColor: colors.error },
    label: { color: colors.onError },
  },
});
