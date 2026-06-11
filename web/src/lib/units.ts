// Loads are kilograms everywhere on the wire and in storage; conversion is a
// display concern only.
import type { Unit } from "./types";

const KG_PER_LB = 0.45359237;

export function toDisplay(loadKg: number, unit: Unit): number {
  return unit === "lb" ? loadKg / KG_PER_LB : loadKg;
}

export function fromDisplay(value: number, unit: Unit): number {
  return unit === "lb" ? value * KG_PER_LB : value;
}

/** Format a load for the user's unit with sensible precision. */
export function formatLoad(loadKg: number, unit: Unit): string {
  const v = toDisplay(loadKg, unit);
  const rounded = Math.round(v * 10) / 10;
  return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)} ${unit}`;
}

/** Today's local date as YYYY-MM-DD (the API's civil-date format). */
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
