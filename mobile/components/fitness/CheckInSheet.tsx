// Daily check-in: energy / stress / sleep / motivation / soreness on 1–5
// scales. Supportive and informational, never diagnostic — the engine uses
// these to ease the program when recovery is low. Payload mirrors the web.
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Sheet } from "../ui/Sheet";
import { Button } from "../ui/Button";
import { enqueue, newId } from "../../lib/sync";
import { localDate } from "../../lib/dates";
import { fonts, radius, space, type Palette } from "../../lib/theme";
import { useTheme } from "../../lib/theme-context";
import type { CheckIn } from "../../lib/types";

const defaults = { energy: 3, stress: 3, sleep: 3, motivation: 3, soreness: 3 };
type Values = typeof defaults;

const SCALE_KEYS: (keyof Values)[] = ["energy", "stress", "sleep", "motivation", "soreness"];

function Scale({
  label,
  low,
  high,
  value,
  onChange,
  styles,
}: {
  label: string;
  low: string;
  high: string;
  value: number;
  onChange: (v: number) => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={{ gap: space(1.5) }}>
      <Text style={styles.label}>{label}</Text>
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
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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
    <Sheet open={open} onClose={onClose} title={t("components.checkin.title")}>
      <View style={{ gap: space(5) }}>
        {SCALE_KEYS.map((key) => (
          <Scale
            key={key}
            label={t(`components.checkin.${key}.label`)}
            low={t(`components.checkin.${key}.low`)}
            high={t(`components.checkin.${key}.high`)}
            value={values[key]}
            onChange={(v) => setValues((prev) => ({ ...prev, [key]: v }))}
            styles={styles}
          />
        ))}
        <Button label={t("components.checkin.save")} onPress={() => void save()} />
      </View>
    </Sheet>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    label: {
      fontFamily: fonts.headMedium,
      fontSize: 12,
      lineHeight: 16,
      letterSpacing: 0.96,
      textTransform: "uppercase",
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
