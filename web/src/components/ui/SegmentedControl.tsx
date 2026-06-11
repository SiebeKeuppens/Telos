import { useRef } from "react";

export interface SegmentedControlProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
}

/** Small mutually-exclusive choices (units, theme, RPE/RIR).
 * WAI-ARIA radiogroup: roving tabindex, arrow keys move the selection. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: SegmentedControlProps<T>) {
  const groupRef = useRef<HTMLDivElement>(null);

  const selectIndex = (idx: number) => {
    const opt = options[(idx + options.length) % options.length];
    onChange(opt.value);
    // Keep focus on the newly selected radio (roving tabindex).
    const buttons = groupRef.current?.querySelectorAll<HTMLButtonElement>(
      'button[role="radio"]',
    );
    buttons?.[(idx + options.length) % options.length]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const current = options.findIndex((o) => o.value === value);
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault();
        selectIndex(current + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        selectIndex(current - 1);
        break;
      case "Home":
        e.preventDefault();
        selectIndex(0);
        break;
      case "End":
        e.preventDefault();
        selectIndex(options.length - 1);
        break;
    }
  };

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
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
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(opt.value)}
            className={`flex-1 h-11 rounded font-head text-[14px] font-medium transition-colors ${
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
