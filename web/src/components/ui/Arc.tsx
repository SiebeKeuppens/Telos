// The Telos arc — the signature element. A thin accent partial ring on an
// outline-variant track expressing progress toward a target, with the value
// as a tabular metric in the center. It animates from the previous value on
// mount (the design's one orchestrated moment).
import { useEffect, useRef, useState } from "react";

export interface ArcProps {
  /** 0..1 progress toward the target. */
  value: number;
  size?: number;
  strokeWidth?: number;
  /** Center content — keep it to one metric + optional label. */
  label?: string;
  metric?: string;
}

export function Arc({
  value,
  size = 120,
  strokeWidth = 3.5,
  label,
  metric,
}: ArcProps) {
  const clamped = Math.min(1, Math.max(0, value));
  const [animated, setAnimated] = useState(0);
  const raf = useRef(0);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setAnimated(clamped);
      return;
    }
    const start = performance.now();
    const from = animated;
    const duration = 600;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setAnimated(from + (clamped - from) * eased);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clamped]);

  // 270° arc, opening at the bottom.
  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const sweep = 270;
  const startAngle = 135;
  const polar = (angle: number) => {
    const rad = ((angle - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };
  const arcPath = (from: number, to: number) => {
    const s = polar(from);
    const e = polar(to);
    const large = to - from > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
  };

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
      role={label ? "img" : undefined}
      aria-hidden={label ? undefined : true}
      aria-label={label ? `${label}: ${Math.round(clamped * 100)}%` : undefined}
    >
      <svg width={size} height={size}>
        <path
          d={arcPath(startAngle, startAngle + sweep)}
          fill="none"
          stroke="var(--outline-variant)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {animated > 0.005 && (
          <path
            d={arcPath(startAngle, startAngle + sweep * animated)}
            fill="none"
            stroke="var(--primary)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {metric && (
          <span className="type-data !text-[22px] !leading-7 text-on-surface">
            {metric}
          </span>
        )}
        {label && (
          <span className="type-label text-on-surface-variant mt-0.5">
            {label}
          </span>
        )}
      </div>
    </div>
  );
}
