// Compact 48px rest-progress ring, permanently docked in ActiveWorkout's
// sticky action bar (distinct from the RestBar banner above it). Ported from
// web's second RestTimer instance — a pure SVG ring, no countdown banner.
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { fonts, type Palette } from "../../lib/theme";
import { useTheme } from "../../lib/theme-context";
import type { RestTimer } from "./RestBar";

const SIZE = 48;
const STROKE = 3;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function clock(total: number): string {
  const s = Math.max(0, Math.floor(total));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function RestRing({ timer }: { timer: RestTimer }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const progress = timer.active && timer.total > 0 ? timer.remaining / timer.total : 0;
  const dashOffset = CIRCUMFERENCE * (1 - progress);

  const label = timer.active
    ? t("workout.rest.ringAria", { time: clock(timer.remaining) })
    : t("workout.rest.inactive");

  return (
    <Pressable
      onPress={timer.active ? timer.skip : undefined}
      disabled={!timer.active}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.wrap}
    >
      <Svg width={SIZE} height={SIZE} style={{ transform: [{ rotate: "-90deg" }] }}>
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={colors.outlineVariant}
          strokeWidth={STROKE}
          fill="none"
        />
        {timer.active && (
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke={colors.primary}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
            strokeDashoffset={dashOffset}
            fill="none"
          />
        )}
      </Svg>
      <View style={styles.center} pointerEvents="none">
        <Text style={[styles.centerText, timer.active ? styles.centerActive : styles.centerInactive]}>
          {timer.active ? clock(timer.remaining) : "–:––"}
        </Text>
      </View>
    </Pressable>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    wrap: {
      width: SIZE,
      height: SIZE,
      alignItems: "center",
      justifyContent: "center",
    },
    center: {
      position: "absolute",
      alignItems: "center",
      justifyContent: "center",
    },
    // type.data forced to 11px, tabular-nums
    centerText: {
      fontFamily: fonts.headMedium,
      fontSize: 11,
      lineHeight: 14,
      fontVariant: ["tabular-nums"],
    },
    centerActive: { color: colors.onSurface },
    centerInactive: { color: colors.onSurfaceVariant },
  });
