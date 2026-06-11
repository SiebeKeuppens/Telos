// 1–5 labeled scale for daily check-ins — calm, quick, never clinical.
// WAI-ARIA radiogroup: roving tabindex, arrow keys move the selection.
import { useRef } from "react";

export function SegmentedScale({
  label,
  value,
  onChange,
  lowLabel,
  highLabel,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  lowLabel: string;
  highLabel: string;
}) {
  const groupRef = useRef<HTMLDivElement>(null);

  const select = (n: number) => {
    const clamped = Math.min(5, Math.max(1, n));
    onChange(clamped);
    const buttons = groupRef.current?.querySelectorAll<HTMLButtonElement>(
      'button[role="radio"]',
    );
    buttons?.[clamped - 1]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowRight":
      case "ArrowUp":
        e.preventDefault();
        select(value + 1);
        break;
      case "ArrowLeft":
      case "ArrowDown":
        e.preventDefault();
        select(value - 1);
        break;
      case "Home":
        e.preventDefault();
        select(1);
        break;
      case "End":
        e.preventDefault();
        select(5);
        break;
    }
  };

  return (
    <div className="space-y-1.5">
      <span className="type-label text-on-surface-variant">{label}</span>
      <div
        ref={groupRef}
        role="radiogroup"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="flex gap-1.5"
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            tabIndex={value === n ? 0 : -1}
            onClick={() => onChange(n)}
            className={`flex-1 h-11 rounded type-data transition-colors ${
              value === n
                ? "bg-primary text-on-primary"
                : "bg-surface-container-low border border-outline-variant text-on-surface-variant active:bg-surface-container-high"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="flex justify-between type-body-sm text-on-surface-variant">
        <span>{lowLabel}</span>
        <span>{highLabel}</span>
      </div>
    </div>
  );
}
