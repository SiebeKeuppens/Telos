// Minimal charts on react-native-svg. Each measures its own width via onLayout
// so it fills whatever card it's dropped into. Values only — labels/axes are
// kept out to stay legible on a phone.
import { useState } from "react";
import { View } from "react-native";
import Svg, { Polyline, Rect } from "react-native-svg";
import { colors } from "../../lib/theme";

const PAD = 6;

export function LineChart({
  values,
  height = 120,
  color = colors.primary,
}: {
  values: number[];
  height?: number;
  color?: string;
}) {
  const [w, setW] = useState(0);

  let polyline = "";
  if (w > 0 && values.length > 1) {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const innerH = height - PAD * 2;
    const innerW = w - PAD * 2;
    polyline = values
      .map((v, i) => {
        const x = PAD + (i / (values.length - 1)) * innerW;
        const y = PAD + innerH - ((v - min) / span) * innerH;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }

  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height }}>
      {polyline ? (
        <Svg width={w} height={height}>
          <Polyline
            points={polyline}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </Svg>
      ) : null}
    </View>
  );
}

export function BarChart({
  values,
  height = 140,
  color = colors.primary,
}: {
  values: number[];
  height?: number;
  color?: string;
}) {
  const [w, setW] = useState(0);
  const max = Math.max(1, ...values);
  const n = values.length;

  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height }}>
      {w > 0 && n > 0 ? (
        <Svg width={w} height={height}>
          {values.map((v, i) => {
            const slot = w / n;
            const barW = Math.max(3, slot * 0.6);
            const x = i * slot + (slot - barW) / 2;
            const h = (v / max) * (height - PAD * 2);
            return (
              <Rect
                key={i}
                x={x}
                y={height - PAD - h}
                width={barW}
                height={Math.max(1, h)}
                rx={2}
                fill={color}
              />
            );
          })}
        </Svg>
      ) : null}
    </View>
  );
}
