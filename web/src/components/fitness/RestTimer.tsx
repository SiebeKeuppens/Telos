// RestTimer — compact SVG ring counting down in the sticky action bar.
// Auto-starts when secondsTotal > 0 (parent sets this on each logged set).
// Controls: −15s / +15s / tap ring to skip. Vibrates at zero.
import { useCallback, useEffect, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";

const SIZE = 48;
const STROKE = 3;
const R = (SIZE - STROKE) / 2;
const CX = SIZE / 2;
const CY = SIZE / 2;
// Full circumference of the ring
const CIRCUM = 2 * Math.PI * R;

function pad(n: number): string {
  return String(Math.floor(n)).padStart(2, "0");
}

export interface RestTimerProps {
  /** Set to restSeconds whenever a new set is logged; 0 = inactive. */
  secondsTotal: number;
  onComplete?: () => void;
}

export function RestTimer({ secondsTotal, onComplete }: RestTimerProps) {
  const [remaining, setRemaining] = useState(0);
  const [total, setTotal] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const completedRef = useRef(false);

  const stop = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const start = useCallback(
    (secs: number, tot: number) => {
      stop();
      completedRef.current = false;
      setRemaining(secs);
      setTotal(tot);
      if (secs <= 0) return;
      intervalRef.current = setInterval(() => {
        setRemaining((prev) => {
          const next = prev - 1;
          if (next <= 0) {
            stop();
            navigator.vibrate?.(30);
            if (!completedRef.current) {
              completedRef.current = true;
              onComplete?.();
            }
            return 0;
          }
          return next;
        });
      }, 1000);
    },
    [stop, onComplete],
  );

  // When secondsTotal changes (a set was logged), restart the timer
  useEffect(() => {
    if (secondsTotal > 0) {
      start(secondsTotal, secondsTotal);
    }
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsTotal]);

  // cleanup on unmount
  useEffect(() => () => stop(), [stop]);

  const isActive = remaining > 0;
  const progress = total > 0 ? remaining / total : 0;
  // dashoffset: full circle minus the arc we want to show
  const dashoffset = CIRCUM * (1 - progress);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;

  const handleSkip = () => {
    stop();
    setRemaining(0);
  };

  const handleAdjust = (delta: number) => {
    setRemaining((prev) => {
      const next = Math.max(0, prev + delta);
      if (next <= 0) {
        stop();
        return 0;
      }
      // If timer is running, re-sync total so ring is accurate
      setTotal((t) => Math.max(next, t));
      return next;
    });
  };

  return (
    <div className="flex items-center gap-2" aria-label="Rest timer">
      {/* −15s */}
      <button
        type="button"
        aria-label="Subtract 15 seconds"
        disabled={!isActive}
        onClick={() => handleAdjust(-15)}
        className="w-11 h-11 flex items-center justify-center rounded bg-surface-container-high border border-outline-variant text-on-surface-variant active:bg-surface-container-highest disabled:opacity-30"
      >
        <Minus size={16} strokeWidth={1.5} />
      </button>

      {/* Ring + countdown */}
      <button
        type="button"
        aria-label={isActive ? `Rest: ${mins}:${pad(secs)} — tap to skip` : "Rest timer inactive"}
        onClick={isActive ? handleSkip : undefined}
        className="relative flex items-center justify-center"
        style={{ width: SIZE, height: SIZE }}
      >
        <svg
          width={SIZE}
          height={SIZE}
          style={{ transform: "rotate(-90deg)" }}
          aria-hidden="true"
        >
          {/* Track */}
          <circle
            cx={CX}
            cy={CY}
            r={R}
            fill="none"
            stroke="var(--outline-variant)"
            strokeWidth={STROKE}
          />
          {/* Progress arc */}
          {isActive && (
            <circle
              cx={CX}
              cy={CY}
              r={R}
              fill="none"
              stroke="var(--primary)"
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={CIRCUM}
              strokeDashoffset={dashoffset}
              style={{ transition: "stroke-dashoffset 0.9s linear" }}
            />
          )}
        </svg>
        <span
          className={`absolute type-data !text-[11px] tabular-nums ${isActive ? "text-on-surface" : "text-on-surface-variant"}`}
        >
          {isActive ? `${mins}:${pad(secs)}` : "–:––"}
        </span>
      </button>

      {/* +15s */}
      <button
        type="button"
        aria-label="Add 15 seconds"
        disabled={!isActive}
        onClick={() => handleAdjust(15)}
        className="w-11 h-11 flex items-center justify-center rounded bg-surface-container-high border border-outline-variant text-on-surface-variant active:bg-surface-container-highest disabled:opacity-30"
      >
        <Plus size={16} strokeWidth={1.5} />
      </button>
    </div>
  );
}
