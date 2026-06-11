import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "destructive";
type Size = "default" | "compact";

const variants: Record<Variant, string> = {
  primary:
    "bg-primary text-on-primary active:brightness-95 disabled:opacity-40",
  secondary:
    "bg-surface-container-high text-on-surface border border-outline-variant active:bg-surface-container-highest disabled:opacity-40",
  ghost:
    "bg-transparent text-on-surface active:bg-surface-container-high disabled:opacity-40",
  destructive:
    "bg-error text-on-error active:brightness-95 disabled:opacity-40",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
}

/** 48px touch-first button, Space Grotesk label, 4px radius (design.md). */
export function Button({
  variant = "primary",
  size = "default",
  fullWidth = true,
  className = "",
  ...props
}: ButtonProps) {
  const height = size === "compact" ? "h-10" : "h-12";
  return (
    <button
      className={`${height} ${fullWidth ? "w-full" : "px-5"} rounded inline-flex items-center justify-center gap-2 font-head font-medium text-[15px] transition-colors select-none ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
