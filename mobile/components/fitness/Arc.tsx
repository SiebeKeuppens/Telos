// The Telos arc — signature element ported 1:1 from web/src/components/ui/Arc.tsx.
// A 270° partial ring (opening at the bottom) on an outline-variant track,
// with a primary progress arc and a centered metric/label. Animates from 0 on
// mount via Animated (600ms ease-out cubic), snapping instantly when the OS
// "reduce motion" setting is on.
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { fonts, space, type Palette } from "../../lib/theme";
import { useTheme } from "../../lib/theme-context";


export interface ArcProps {
  /** 0..1 progress toward the target. */
  value: number;
  size?: number;
  strokeWidth?: number;
  /** Center content — keep it to one metric + optional label. */
  label?: string;
  metric?: string;
}

const SWEEP = 270;
const START_ANGLE = 135;

function polar(cx: number, cy: number, r: number, angle: number) {
  const rad = ((angle - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, from: number, to: number): string {
  const s = polar(cx, cy, r, from);
  const e = polar(cx, cy, r, to);
  const large = to - from > 180 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
}

export function Arc({ value, size = 120, strokeWidth = 3.5, label, metric }: ArcProps) {
  const { colors } = useTheme();
  const styles = useStyles(colors);
  const clamped = Math.min(1, Math.max(0, value));
  const anim = useRef(new Animated.Value(0)).current;
  const [animatedValue, setAnimatedValue] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled) return;
      if (reduced) {
        anim.setValue(clamped);
        setAnimatedValue(clamped);
        return;
      }
      Animated.timing(anim, {
        toValue: clamped,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    });
    const id = anim.addListener(({ value: v }) => setAnimatedValue(v));
    return () => {
      cancelled = true;
      anim.removeListener(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clamped]);

  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const trackPath = arcPath(cx, cy, r, START_ANGLE, START_ANGLE + SWEEP);

  // Path is rebuilt from the mirrored state value each frame. NEVER string-
  // interpolate SVG paths with Animated: it lerps every number in the string,
  // including the 0/1 large-arc-flag, and a fractional flag crashes the
  // native parser outright.
  const sweep = Math.max(0.001, animatedValue * SWEEP);
  const progressPath = arcPath(cx, cy, r, START_ANGLE, START_ANGLE + sweep);

  const accessibilityProps = label
    ? { accessible: true, accessibilityRole: "image" as const, accessibilityLabel: `${label}: ${Math.round(clamped * 100)}%` }
    : { importantForAccessibility: "no-hide-descendants" as const, accessibilityElementsHidden: true };

  return (
    <View style={{ width: size, height: size }} {...accessibilityProps}>
      <Svg width={size} height={size}>
        <Path d={trackPath} fill="none" stroke={colors.outlineVariant} strokeWidth={strokeWidth} strokeLinecap="round" />
        {animatedValue > 0.005 && (
          <Path d={progressPath} fill="none" stroke={colors.primary} strokeWidth={strokeWidth} strokeLinecap="round" />
        )}
      </Svg>
      <View style={styles.center} pointerEvents="none">
        {metric ? <Text style={styles.metric}>{metric}</Text> : null}
        {label ? <Text style={styles.label}>{label}</Text> : null}
      </View>
    </View>
  );
}

const useStyles = (colors: Palette) =>
  StyleSheet.create({
    center: {
      ...StyleSheet.absoluteFillObject,
      alignItems: "center",
      justifyContent: "center",
    },
    // type-data forced to 22px/28-ish lineHeight, per web's !text-[22px] !leading-7 override.
    metric: {
      fontFamily: fonts.headMedium,
      fontSize: 22,
      lineHeight: 28,
      color: colors.onSurface,
      fontVariant: ["tabular-nums"],
    },
    label: {
      fontFamily: fonts.headMedium,
      fontSize: 12,
      lineHeight: 16,
      letterSpacing: 0.96,
      textTransform: "uppercase",
      color: colors.onSurfaceVariant,
      marginTop: space(0.5),
    },
  });
