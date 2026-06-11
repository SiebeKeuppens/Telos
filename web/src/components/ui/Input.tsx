import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

const base =
  "w-full h-12 px-3 rounded-lg bg-surface-container-low text-on-surface border border-outline-variant " +
  "placeholder:text-on-surface-variant focus:border-primary focus:outline-none " +
  "focus:ring-2 focus:ring-[color-mix(in_srgb,var(--primary)_22%,transparent)] text-[16px]";

export function Input({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${base} ${className}`} {...props} />;
}

export function Textarea({
  className = "",
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`${base} h-auto min-h-24 py-3 ${className}`}
      {...props}
    />
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="type-label text-on-surface-variant">{label}</span>
      {children}
    </label>
  );
}
