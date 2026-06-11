// Set-logger row — compact data row: set# · load · reps · RPE · check.
// Logged rows get an accent left border; working row is surface-container-high.
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Minus, Plus } from "lucide-react";
import { fromDisplay, toDisplay } from "../../lib/units";
import type { SetEntry, Unit } from "../../lib/types";

// RPE cycle: undefined (–), 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10
const RPE_VALUES: Array<number | undefined> = [
  undefined, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10,
];

function rpeLabel(rpe: number | undefined): string {
  return rpe === undefined ? "–" : String(rpe);
}

function nextRpe(current: number | undefined): number | undefined {
  const idx = RPE_VALUES.indexOf(current);
  const next = (idx + 1) % RPE_VALUES.length;
  return RPE_VALUES[next];
}

// ---- compact +/- control (≥44px targets) ------------------------------------

function PlusMinus({
  value,
  onChange,
  step,
  min,
  precision,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  step: number;
  min: number;
  precision: number;
  label: string;
}) {
  const clamp = (v: number) => Math.max(min, v);
  const fmt = (v: number) =>
    precision > 0 ? v.toFixed(precision) : String(Math.round(v));

  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        aria-label={`decrease ${label}`}
        className="w-11 h-11 flex items-center justify-center rounded bg-surface-container-high border border-outline-variant text-on-surface active:bg-surface-container-highest"
        onClick={() => onChange(clamp(Number((value - step).toFixed(precision + 1))
        ))}
      >
        <Minus size={16} strokeWidth={1.5} />
      </button>
      <input
        type="text"
        inputMode="decimal"
        aria-label={label}
        value={fmt(value)}
        onChange={(e) => {
          const parsed = parseFloat(e.target.value.replace(",", "."));
          if (!isNaN(parsed)) onChange(clamp(Number(parsed.toFixed(precision))));
        }}
        className="w-14 h-11 rounded bg-surface-container-low border border-outline-variant text-center type-data text-on-surface focus:border-primary focus:outline-none text-[15px]"
      />
      <button
        type="button"
        aria-label={`increase ${label}`}
        className="w-11 h-11 flex items-center justify-center rounded bg-surface-container-high border border-outline-variant text-on-surface active:bg-surface-container-highest"
        onClick={() => onChange(Number((value + step).toFixed(precision + 1)))}
      >
        <Plus size={16} strokeWidth={1.5} />
      </button>
    </div>
  );
}

// ---- props ------------------------------------------------------------------

export interface SetLoggerRowProps {
  setNumber: number;
  suggestedLoadKg: number;
  suggestedReps: number;
  unit: Unit;
  logged?: SetEntry;
  onLog: (loadKg: number, reps: number, rpe: number | undefined) => void;
  highlighted: boolean;
}

// ---- component --------------------------------------------------------------

export function SetLoggerRow({
  setNumber,
  suggestedLoadKg,
  suggestedReps,
  unit,
  logged,
  onLog,
  highlighted,
}: SetLoggerRowProps) {
  const isLogged = Boolean(logged);

  // display-unit step: 2.5 kg → display conversion
  const displayStep = unit === "lb" ? 5 : 2.5;
  const displayPrecision = unit === "lb" ? 0 : 1;

  const initLoad = () =>
    logged
      ? Math.round(toDisplay(logged.loadKg, unit) / displayStep) * displayStep
      : Math.round(toDisplay(suggestedLoadKg, unit) / displayStep) * displayStep;

  const initReps = () => (logged ? logged.reps : suggestedReps);
  const initRpe = (): number | undefined => logged?.rpe;

  const [load, setLoad] = useState<number>(initLoad);
  const [reps, setReps] = useState<number>(initReps);
  const [rpe, setRpe] = useState<number | undefined>(initRpe);
  const [pulsing, setPulsing] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);

  // When logged entry changes from outside (server sync), sync local state
  useEffect(() => {
    if (logged) {
      setLoad(
        Math.round(toDisplay(logged.loadKg, unit) / displayStep) * displayStep,
      );
      setReps(logged.reps);
      setRpe(logged.rpe);
    }
  }, [logged, unit, displayStep]);

  const handleCheck = useCallback(() => {
    if (isLogged) return; // already logged, no re-logging
    const loadKg = fromDisplay(load, unit);
    onLog(loadKg, reps, rpe);
    // pulse animation
    setPulsing(true);
    setTimeout(() => setPulsing(false), 650);
    // haptic
    navigator.vibrate?.(10);
  }, [isLogged, load, unit, reps, rpe, onLog]);

  const rowBg = isLogged
    ? "border-l-2 border-l-primary bg-surface-container"
    : highlighted
      ? "bg-surface-container-high"
      : "bg-surface-container";

  return (
    <div
      ref={rowRef}
      className={`relative flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${rowBg} ${pulsing ? "pulse-accent" : ""}`}
    >
      {/* Set number chip */}
      <div className="w-7 shrink-0 flex justify-center">
        <span
          className={`type-label w-6 h-6 rounded-full flex items-center justify-center ${
            isLogged
              ? "bg-primary text-on-primary"
              : "bg-surface-container-highest text-on-surface-variant"
          }`}
        >
          {setNumber}
        </span>
      </div>

      {/* Load */}
      {isLogged ? (
        <span className="type-data text-on-surface w-[4.5rem] text-center shrink-0">
          {load.toFixed(displayPrecision)} {unit}
        </span>
      ) : (
        <div className="shrink-0">
          <PlusMinus
            value={load}
            onChange={setLoad}
            step={displayStep}
            min={0}
            precision={displayPrecision}
            label="load"
          />
        </div>
      )}

      {/* Reps */}
      {isLogged ? (
        <span className="type-data text-on-surface w-12 text-center shrink-0">
          ×{reps}
        </span>
      ) : (
        <div className="shrink-0">
          <PlusMinus
            value={reps}
            onChange={setReps}
            step={1}
            min={1}
            precision={0}
            label="reps"
          />
        </div>
      )}

      {/* RPE cycle button */}
      <button
        type="button"
        aria-label={`RPE: ${rpeLabel(rpe)}`}
        className={`h-11 min-w-[44px] px-2 rounded type-data shrink-0 transition-colors ${
          rpe !== undefined
            ? "tint-primary-14 text-primary border border-[color-mix(in_srgb,var(--primary)_30%,transparent)]"
            : "bg-surface-container-highest text-on-surface-variant border border-outline-variant"
        } ${isLogged ? "pointer-events-none" : ""}`}
        onClick={isLogged ? undefined : () => setRpe(nextRpe(rpe))}
      >
        {rpe !== undefined ? `RPE ${rpeLabel(rpe)}` : "RPE –"}
      </button>

      {/* Check / done button */}
      <button
        type="button"
        aria-label={isLogged ? "Set logged" : "Log set"}
        disabled={isLogged}
        onClick={handleCheck}
        className={`ml-auto w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-colors ${
          isLogged
            ? "bg-primary text-on-primary"
            : "bg-surface-container-highest border border-outline-variant text-on-surface-variant active:bg-primary active:text-on-primary"
        }`}
      >
        <Check size={18} strokeWidth={1.5} />
      </button>
    </div>
  );
}
