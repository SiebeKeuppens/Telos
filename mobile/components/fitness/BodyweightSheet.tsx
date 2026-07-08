// Bodyweight entry: one number, neutral framing (a trend, not a target —
// design.md wellbeing rules). Payload mirrors the web client exactly.
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { Sheet } from "../ui/Sheet";
import { Button } from "../ui/Button";
import { Stepper } from "../ui/Stepper";
import { enqueue, flush, newId } from "../../lib/sync";
import { fromDisplay, toDisplay } from "../../lib/units";
import { localDate } from "../../lib/dates";
import { initHealthConnect, readLatestWeightKg, writeWeightKg } from "../../lib/health";
import { space } from "../../lib/theme";
import { useTheme } from "../../lib/theme-context";
import type { Unit } from "../../lib/types";

export function BodyweightSheet({
  open,
  onClose,
  unit,
  lastWeightKg,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  unit: Unit;
  lastWeightKg?: number;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const { type } = useTheme();
  const [value, setValue] = useState(75);
  const [fromHealthConnect, setFromHealthConnect] = useState(false);
  // True once the user has touched the field this open — the async Health
  // Connect prefill must never overwrite a value the user typed.
  const editedRef = useRef(false);
  // Bumped on every open so a slow prefill from a previous open can't land in
  // a later one.
  const openTokenRef = useRef(0);

  // Prefill from the latest known weight at open time.
  useEffect(() => {
    if (!open) return;
    const token = ++openTokenRef.current;
    editedRef.current = false;
    setValue(Math.round(toDisplay(lastWeightKg ?? 75, unit) * 10) / 10);
    setFromHealthConnect(false);

    // Best-effort: if the caller has no last-known weight, see if Health
    // Connect has a more recent one. Never blocks the UI, never surfaces
    // errors — this is a nice-to-have prefill only, and it must yield to the
    // user: if they've already typed (or reopened the sheet), leave it alone.
    // Reading HC takes long enough that without this guard the late setValue
    // clobbers whatever the user entered in the meantime.
    if (lastWeightKg == null) {
      void (async () => {
        const ok = await initHealthConnect();
        if (!ok) return;
        const kg = await readLatestWeightKg();
        if (kg != null && token === openTokenRef.current && !editedRef.current) {
          setValue(Math.round(toDisplay(kg, unit) * 10) / 10);
          setFromHealthConnect(true);
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleChange(v: number) {
    editedRef.current = true;
    setFromHealthConnect(false);
    setValue(v);
  }

  async function save() {
    const weightKg = Math.round(fromDisplay(value, unit) * 100) / 100;
    const date = localDate();
    await enqueue("bodyweight", "upsert", {
      id: newId(),
      date,
      weightKg,
    });
    // Best-effort mirror to Health Connect — never blocks, never surfaces
    // errors. Kicked off before flush() (which can't throw, but shouldn't gate
    // this either) and stamped at the real instant so the freshest weigh-in is
    // always the latest record rather than colliding at a fixed noon time.
    void writeWeightKg(weightKg, new Date().toISOString());
    // Wait out the outbox POST (enqueue's own flush is fire-and-forget) so
    // the onSaved refetch sees the new entry instead of racing the server.
    await flush();
    onClose();
    onSaved();
  }

  return (
    <Sheet open={open} onClose={onClose} title={t("components.bodyweight.title")}>
      <View style={{ gap: space(4) }}>
        <Stepper
          value={value}
          onChange={handleChange}
          step={0.1}
          min={20}
          max={500}
          precision={1}
          caption={t("components.bodyweight.fieldLabel") + ` (${unit})`}
        />
        {fromHealthConnect && (
          <Text style={type.label}>{t("components.bodyweight.fromHealthConnect")}</Text>
        )}
        <Button label={t("components.bodyweight.save")} onPress={() => void save()} />
      </View>
    </Sheet>
  );
}
