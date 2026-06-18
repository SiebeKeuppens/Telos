// Load display helpers. Storage is always kg; the user's unit is display-only.
import type { Unit } from "./types";

const LB_PER_KG = 2.2046226218;

export function toDisplay(kg: number, unit: Unit): number {
  return unit === "lb" ? kg * LB_PER_KG : kg;
}

export function fromDisplay(value: number, unit: Unit): number {
  return unit === "lb" ? value / LB_PER_KG : value;
}

/** Round to a clean increment for the unit (0.5 kg / 1 lb). */
export function formatLoad(kg: number, unit: Unit): string {
  const v = toDisplay(kg, unit);
  const rounded = unit === "lb" ? Math.round(v) : Math.round(v * 2) / 2;
  return `${rounded} ${unit}`;
}
