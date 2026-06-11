export interface SegmentedControlProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
}

/** Small mutually-exclusive choices (units, theme, RPE/RIR). */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex w-full rounded-lg bg-surface-container-low border border-outline-variant p-1 gap-1"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={`flex-1 h-9 rounded font-head text-[14px] font-medium transition-colors ${
              active
                ? "bg-primary text-on-primary"
                : "text-on-surface-variant active:bg-surface-container-high"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
