// Minimal charts on react-native-svg. Each measures its own width via onLayout
// so it fills whatever card it's dropped into. Mirrors web's recharts usage:
// a single horizontal baseline gridline, no vertical gridlines/axes/tooltips
// (numbers-as-cards substitute for those on mobile).
import { useState } from "react";
import { View } from "react-native";
import Svg, { Circle, Line, Polygon, Polyline, Rect } from "react-native-svg";
import { useTheme } from "../../lib/theme-context";
import { withAlpha } from "../../lib/theme";

const PAD = 6;

export function LineChart({
  values,
  height = 160,
  color,
}: {
  values: number[];
  height?: number;
  color?: string;
}) {
  const { colors } = useTheme();
  const strokeColor = color ?? colors.primary;
  const [w, setW] = useState(0);

  let polyline = "";
  let areaPoints = "";
  let dots: { x: number; y: number }[] = [];
  if (w > 0 && values.length === 1) {
    // One entry can't make a line — show a single point mid-card (web's
    // recharts likewise renders just the raw dot) instead of a blank box.
    dots = [{ x: w / 2, y: height / 2 }];
  } else if (w > 0 && values.length > 1) {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const innerH = height - PAD * 2;
    const innerW = w - PAD * 2;
    dots = values.map((v, i) => ({
      x: PAD + (i / (values.length - 1)) * innerW,
      y: PAD + innerH - ((v - min) / span) * innerH,
    }));
    polyline = dots.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    // Web's Area under the trend line, tint-primary-14.
    areaPoints = `${PAD.toFixed(1)},${(height - PAD).toFixed(1)} ${polyline} ${(
      w - PAD
    ).toFixed(1)},${(height - PAD).toFixed(1)}`;
  }

  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height }}>
      {dots.length > 0 ? (
        <Svg width={w} height={height}>
          <Line
            x1={PAD}
            y1={height - PAD}
            x2={w - PAD}
            y2={height - PAD}
            stroke={colors.outlineVariant}
            strokeWidth={1}
          />
          {areaPoints ? (
            <Polygon points={areaPoints} fill={withAlpha(strokeColor, 0.14)} />
          ) : null}
          {polyline ? (
            <Polyline
              points={polyline}
              fill="none"
              stroke={strokeColor}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null}
          {dots.map((p, i) => (
            <Circle
              key={i}
              cx={p.x}
              cy={p.y}
              // A lone point IS the chart — full primary at r=3 so it reads;
              // alongside a line the dots stay faint like web's RawDot.
              r={values.length === 1 ? 3 : 2}
              fill={
                values.length === 1
                  ? strokeColor
                  : withAlpha(colors.onSurfaceVariant, 0.4)
              }
            />
          ))}
        </Svg>
      ) : null}
    </View>
  );
}

export function BarChart({
  values,
  height = 160,
  color,
}: {
  values: number[];
  height?: number;
  /** Explicit override — when omitted, mirrors web's weekly-volume highlight:
   * the last (current) bar renders `primary`, all others `surfaceContainerHighest`. */
  color?: string;
}) {
  const { colors } = useTheme();
  const [w, setW] = useState(0);
  const max = Math.max(1, ...values);
  const n = values.length;

  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height }}>
      {w > 0 && n > 0 ? (
        <Svg width={w} height={height}>
          <Line
            x1={PAD}
            y1={height - PAD}
            x2={w - PAD}
            y2={height - PAD}
            stroke={colors.outlineVariant}
            strokeWidth={1}
          />
          {values.map((v, i) => {
            const slot = w / n;
            const barW = Math.max(3, slot * 0.6);
            const x = i * slot + (slot - barW) / 2;
            const h = (v / max) * (height - PAD * 2);
            const fillColor = color ?? (i === n - 1 ? colors.primary : colors.surfaceContainerHighest);
            return (
              <Rect
                key={i}
                x={x}
                y={height - PAD - h}
                width={barW}
                height={Math.max(1, h)}
                rx={2}
                fill={fillColor}
              />
            );
          })}
        </Svg>
      ) : null}
    </View>
  );
}
