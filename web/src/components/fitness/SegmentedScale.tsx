// 1–5 labeled scale for daily check-ins — calm, quick, never clinical.
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
  return (
    <div className="space-y-1.5">
      <span className="type-label text-on-surface-variant">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
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
