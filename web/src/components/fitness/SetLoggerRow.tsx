// Set-logger row. Two shapes:
//   • logged  — compact one-liner: set# · load · reps · RPE · check
//   • working — two lines so the ± steppers and the check button always fit a
//     phone: [set# · load · reps] on top, [RPE … check] below. A single line
//     can't hold two full steppers plus RPE and check on a ~360px screen
//     without pushing the check off-screen.
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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

function prevRpe(current: number | undefined): number | undefined {
  const idx = RPE_VALUES.indexOf(current);
  const prev = (idx - 1 + RPE_VALUES.length) % RPE_VALUES.length;
  return RPE_VALUES[prev];
}

// ---- compact +/- control ----------------------------------------------------
// Fills its flex parent: the ± buttons are fixed-width touch targets and the
// number field flexes to fill what's left, so two of these sit side-by-side on
// a phone without overflowing. A small caption labels the metric.

function PlusMinus({
  value,
  onChange,
  step,
  min,
  precision,
  label,
  caption,
}: {
  value: number;
  onChange: (v: number) => void;
  step: number;
  min: number;
  precision: number;
  label: string;
  caption: string;
}) {
  const { t } = useTranslation("workout");
  const clamp = (v: number) => Math.max(min, v);
  const fmt = (v: number) =>
    precision > 0 ? v.toFixed(precision) : String(Math.round(v));

  return (
    <div className="flex-1 min-w-0">
      <span className="block type-label text-on-surface-variant text-center mb-1">
        {caption}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={t("aria.decrease", { what: label })}
          className="w-9 h-11 shrink-0 flex items-center justify-center rounded bg-surface-container-high border border-outline-variant text-on-surface active:bg-surface-container-highest"
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
          className="flex-1 min-w-0 h-11 rounded bg-surface-container-low border border-outline-variant text-center type-data text-on-surface focus:border-primary focus:outline-none text-[15px]"
        />
        <button
          type="button"
          aria-label={t("aria.increase", { what: label })}
          className="w-9 h-11 shrink-0 flex items-center justify-center rounded bg-surface-container-high border border-outline-variant text-on-surface active:bg-surface-container-highest"
          onClick={() => onChange(Number((value + step).toFixed(precision + 1)))}
        >
          <Plus size={16} strokeWidth={1.5} />
        </button>
      </div>
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
  const { t } = useTranslation("workout");
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
  // Once the user touches the row, plan suggestions stop overwriting it.
  const touched = useRef(false);

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

  // Plan-generated targets often arrive (or update) after this row mounted —
  // e.g. a fresh load of the workout, or the previous set's logged weight
  // becoming the new suggestion. Keep prefilling until the user intervenes.
  useEffect(() => {
    if (logged || touched.current) return;
    setLoad(Math.round(toDisplay(suggestedLoadKg, unit) / displayStep) * displayStep);
    setReps(suggestedReps);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestedLoadKg, suggestedReps]);

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

  // Shared pieces ------------------------------------------------------------

  const setChip = (
    <span
      className={`type-label w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
        isLogged
          ? "bg-primary text-on-primary"
          : "bg-surface-container-highest text-on-surface-variant"
      }`}
    >
      {setNumber}
    </span>
  );

  const checkButton = (
    <button
      type="button"
      aria-label={isLogged ? t("aria.setLogged") : t("aria.logSet")}
      disabled={isLogged}
      onClick={handleCheck}
      className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-colors ${
        isLogged
          ? "bg-primary text-on-primary"
          : "bg-surface-container-highest border border-outline-variant text-on-surface-variant active:bg-primary active:text-on-primary"
      }`}
    >
      <Check size={18} strokeWidth={1.5} />
    </button>
  );

  const rpeButton = (interactive: boolean) => (
    <button
      type="button"
      aria-label={t("aria.rpe", { value: rpeLabel(rpe) })}
      className={`h-11 min-w-[44px] px-3 rounded type-data shrink-0 transition-colors ${
        rpe !== undefined
          ? "tint-primary-14 text-primary border border-[color-mix(in_srgb,var(--primary)_30%,transparent)]"
          : "bg-surface-container-highest text-on-surface-variant border border-outline-variant"
      } ${interactive ? "" : "pointer-events-none"}`}
      onClick={interactive ? () => setRpe(nextRpe(rpe)) : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "ArrowUp" || e.key === "ArrowRight") {
                e.preventDefault();
                setRpe(nextRpe(rpe));
              } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
                e.preventDefault();
                setRpe(prevRpe(rpe));
              }
            }
          : undefined
      }
    >
      {rpe !== undefined ? `RPE ${rpeLabel(rpe)}` : "RPE –"}
    </button>
  );

  // ---- logged set: compact one-liner --------------------------------------
  if (isLogged) {
    return (
      <div
        ref={rowRef}
        className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${rowBg} ${pulsing ? "pulse-accent" : ""}`}
      >
        {setChip}
        <span className="type-data text-on-surface w-[4.5rem] text-center shrink-0">
          {load.toFixed(displayPrecision)} {unit}
        </span>
        <span className="type-data text-on-surface w-10 text-center shrink-0">
          ×{reps}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {rpe !== undefined && rpeButton(false)}
          {checkButton}
        </div>
      </div>
    );
  }

  // ---- working set: two-line layout ---------------------------------------
  return (
    <div
      ref={rowRef}
      className={`relative flex flex-col gap-2 px-3 py-2.5 rounded-lg transition-colors ${rowBg} ${pulsing ? "pulse-accent" : ""}`}
    >
      {/* line 1 — set number + load/reps steppers (flex to fit any width) */}
      <div className="flex items-end gap-2">
        <div className="h-11 flex items-center shrink-0">{setChip}</div>
        <PlusMinus
          value={load}
          onChange={(v) => {
            touched.current = true;
            setLoad(v);
          }}
          step={displayStep}
          min={0}
          precision={displayPrecision}
          label={t("logger.load")}
          caption={`${t("logger.load")} (${unit})`}
        />
        <PlusMinus
          value={reps}
          onChange={(v) => {
            touched.current = true;
            setReps(v);
          }}
          step={1}
          min={1}
          precision={0}
          label={t("logger.reps")}
          caption={t("logger.reps")}
        />
      </div>

      {/* line 2 — RPE on the left, the check target on the right */}
      <div className="flex items-center gap-2 pl-8">
        {rpeButton(true)}
        <div className="ml-auto">{checkButton}</div>
      </div>
    </div>
  );
}
