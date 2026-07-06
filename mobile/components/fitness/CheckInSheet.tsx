// Daily check-in: energy / stress / sleep / motivation / soreness on 1–5
// scales. Supportive and informational, never diagnostic — the engine uses
// these to ease the program when recovery is low. Payload mirrors the web.
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Sheet } from "../ui/Sheet";
import { Button } from "../ui/Button";
import { enqueue, newId } from "../../lib/sync";
import { localDate } from "../../lib/dates";
import { colors, fonts, radius, space } from "../../lib/theme";
import type { CheckIn } from "../../lib/types";

const defaults = { energy: 3, stress: 3, sleep: 3, motivation: 3, soreness: 3 };
type Values = typeof defaults;

const SCALES: { key: keyof Values; label: string; low: string; high: string }[] = [
  { key: "energy", label: "Energy", low: "Drained", high: "Charged" },
  { key: "stress", label: "Stress", low: "Calm", high: "Maxed out" },
  { key: "sleep", label: "Sleep", low: "Poor", high: "Great" },
  { key: "motivation", label: "Motivation", low: "Meh", high: "Fired up" },
  { key: "soreness", label: "Soreness", low: "Fresh", high: "Very sore" },
];

function Scale({
  label,
  low,
  high,
  value,
  onChange,
}: {
  label: string;
  low: string;
  high: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <View style={{ gap: space(1.5) }}>
      <Text style={styles.label}>{label.toUpperCase()}</Text>
      <View style={styles.row}>
        {[1, 2, 3, 4, 5].map((n) => {
          const active = n === value;
          return (
            <Pressable
              key={n}
              onPress={() => onChange(n)}
              style={[styles.seg, active && styles.segActive]}
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.segText, active && styles.segTextActive]}>{n}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.hints}>
        <Text style={styles.hint}>{low}</Text>
        <Text style={styles.hint}>{high}</Text>
      </View>
    </View>
  );
}

export function CheckInSheet({
  open,
  onClose,
  existing,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  /** Today's check-in, when one exists — editing updates it. */
  existing?: CheckIn;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Values>(defaults);

  // Reset only when the sheet opens.
  useEffect(() => {
    if (open) {
      setValues(
        existing
          ? {
              energy: existing.energy,
              stress: existing.stress,
              sleep: existing.sleep,
              motivation: existing.motivation,
              soreness: existing.soreness,
            }
          : defaults,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function save() {
    await enqueue("checkin", "upsert", {
      id: existing?.id ?? newId(),
      date: localDate(),
      ...values,
    });
    onClose();
    onSaved();
  }

  return (
    <Sheet open={open} onClose={onClose} title="How are you feeling?">
      <View style={{ gap: space(5) }}>
        {SCALES.map((s) => (
          <Scale
            key={s.key}
            label={s.label}
            low={s.low}
            high={s.high}
            value={values[s.key]}
            onChange={(v) => setValues((prev) => ({ ...prev, [s.key]: v }))}
          />
        ))}
        <Button label="Save check-in" onPress={() => void save()} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  label: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    letterSpacing: 1,
    color: colors.onSurfaceVariant,
  },
  row: { flexDirection: "row", gap: space(1.5) },
  seg: {
    flex: 1,
    height: 44,
    borderRadius: radius.base,
    backgroundColor: colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    alignItems: "center",
    justifyContent: "center",
  },
  segActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  segText: { fontFamily: fonts.headMedium, fontSize: 15, color: colors.onSurfaceVariant },
  segTextActive: { color: colors.onPrimary },
  hints: { flexDirection: "row", justifyContent: "space-between" },
  hint: { fontFamily: fonts.body, fontSize: 11, color: colors.onSurfaceVariant },
});
