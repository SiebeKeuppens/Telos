import type { HTMLAttributes } from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Pressable cards step one tonal level up with an accent-tinted border. */
  pressable?: boolean;
}

/** Tonal card: surface-container, hairline outline, 8px radius, no shadow. */
export function Card({ pressable, className = "", ...props }: CardProps) {
  return (
    <div
      className={`bg-surface-container border border-outline-variant rounded-lg ${
        pressable
          ? "active:bg-surface-container-high active:border-[color-mix(in_srgb,var(--primary)_40%,var(--outline-variant))] transition-colors cursor-pointer"
          : ""
      } ${className}`}
      {...props}
    />
  );
}
