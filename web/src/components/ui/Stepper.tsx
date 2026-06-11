import { Minus, Plus } from "lucide-react";

export interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  /** Decimal places shown in the field. */
  precision?: number;
  label?: string;
  suffix?: string;
}

/** Stepper + numeric field for fast load/rep entry — ≥44px +/- targets,
 * tabular numerals, tap the field to type with the numeric keypad. */
export function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max = 9999,
  precision = 0,
  label,
  suffix,
}: StepperProps) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const set = (v: number) =>
    onChange(clamp(Number.isFinite(v) ? Number(v.toFixed(precision)) : min));

  return (
    <div className="space-y-1.5">
      {label && (
        <span className="type-label text-on-surface-variant">{label}</span>
      )}
      <div className="flex items-stretch gap-1.5">
        <button
          type="button"
          aria-label={`decrease ${label ?? "value"}`}
          onClick={() => set(value - step)}
          className="w-11 h-12 shrink-0 rounded bg-surface-container-high border border-outline-variant text-on-surface active:bg-surface-container-highest flex items-center justify-center"
        >
          <Minus size={18} strokeWidth={1.5} />
        </button>
        <div className="relative flex-1">
          <input
            type="text"
            inputMode="decimal"
            value={precision > 0 ? value.toFixed(precision) : String(value)}
            onChange={(e) => {
              const parsed = parseFloat(e.target.value.replace(",", "."));
              if (!Number.isNaN(parsed)) set(parsed);
              else if (e.target.value === "") set(min);
            }}
            className="w-full h-12 rounded bg-surface-container-low border border-outline-variant text-center type-data !text-[17px] text-on-surface focus:border-primary focus:outline-none"
          />
          {suffix && (
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 type-label text-on-surface-variant pointer-events-none">
              {suffix}
            </span>
          )}
        </div>
        <button
          type="button"
          aria-label={`increase ${label ?? "value"}`}
          onClick={() => set(value + step)}
          className="w-11 h-12 shrink-0 rounded bg-surface-container-high border border-outline-variant text-on-surface active:bg-surface-container-highest flex items-center justify-center"
        >
          <Plus size={18} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
