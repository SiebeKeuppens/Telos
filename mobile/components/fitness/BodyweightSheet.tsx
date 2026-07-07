// Bodyweight entry: one number, neutral framing (a trend, not a target —
// design.md wellbeing rules). Payload mirrors the web client exactly.
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Sheet } from "../ui/Sheet";
import { Button } from "../ui/Button";
import { Stepper } from "../ui/Stepper";
import { enqueue, newId } from "../../lib/sync";
import { fromDisplay, toDisplay } from "../../lib/units";
import { localDate } from "../../lib/dates";
import { initHealthConnect, readLatestWeightKg, writeWeightKg } from "../../lib/health";
import { space, type } from "../../lib/theme";
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
  const [value, setValue] = useState(75);
  const [fromHealthConnect, setFromHealthConnect] = useState(false);

  // Prefill from the latest known weight at open time.
  useEffect(() => {
    if (open) {
      setValue(Math.round(toDisplay(lastWeightKg ?? 75, unit) * 10) / 10);
      setFromHealthConnect(false);

      // Best-effort: if the caller has no last-known weight, see if Health
      // Connect has a more recent one. Never blocks the UI, never surfaces
      // errors — this is a nice-to-have prefill only.
      if (lastWeightKg == null) {
        void (async () => {
          const ok = await initHealthConnect();
          if (!ok) return;
          const kg = await readLatestWeightKg();
          if (kg != null) {
            setValue(Math.round(toDisplay(kg, unit) * 10) / 10);
            setFromHealthConnect(true);
          }
        })();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function save() {
    const weightKg = Math.round(fromDisplay(value, unit) * 100) / 100;
    const date = localDate();
    await enqueue("bodyweight", "upsert", {
      id: newId(),
      date,
      weightKg,
    });
    onClose();
    onSaved();
    // Best-effort mirror to Health Connect — never blocks, never surfaces errors.
    void writeWeightKg(weightKg, date);
  }

  return (
    <Sheet open={open} onClose={onClose} title="Log bodyweight">
      <View style={{ gap: space(4) }}>
        <Stepper
          value={value}
          onChange={(v) => setValue(Math.min(500, Math.max(20, v)))}
          step={0.1}
          min={20}
          precision={1}
          caption={`weight (${unit})`}
        />
        {fromHealthConnect && <Text style={type.label}>from Health Connect</Text>}
        <Button label="Save" onPress={() => void save()} />
      </View>
    </Sheet>
  );
}
