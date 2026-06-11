import type { HTMLAttributes } from "react";

type Variant = "neutral" | "accent" | "success" | "warning" | "danger";

const variants: Record<Variant, string> = {
  neutral:
    "bg-surface-container-high text-on-surface-variant border border-outline-variant",
  accent:
    "tint-primary-14 text-primary border border-[color-mix(in_srgb,var(--primary)_30%,transparent)]",
  success:
    "bg-[color-mix(in_srgb,var(--success)_14%,transparent)] text-success border border-[color-mix(in_srgb,var(--success)_30%,transparent)]",
  warning:
    "bg-[color-mix(in_srgb,var(--warning)_14%,transparent)] text-warning border border-[color-mix(in_srgb,var(--warning)_30%,transparent)]",
  danger:
    "bg-[color-mix(in_srgb,var(--error)_14%,transparent)] text-error border border-[color-mix(in_srgb,var(--error)_30%,transparent)]",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
}

export function Badge({
  variant = "neutral",
  className = "",
  ...props
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded type-label ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
