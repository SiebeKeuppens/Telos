// Bodyweight entry: one number, neutral framing (a trend, not a target —
// design.md wellbeing rules). Payload mirrors the web client exactly.
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Sheet } from "../ui/Sheet";
import { Button } from "../ui/Button";
import { Stepper } from "../ui/Stepper";
import { enqueue, newId } from "../../lib/sync";
import { fromDisplay, toDisplay } from "../../lib/units";
import { localDate } from "../../lib/dates";
import { space } from "../../lib/theme";
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

  // Prefill from the latest known weight at open time.
  useEffect(() => {
    if (open) {
      setValue(Math.round(toDisplay(lastWeightKg ?? 75, unit) * 10) / 10);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function save() {
    await enqueue("bodyweight", "upsert", {
      id: newId(),
      date: localDate(),
      weightKg: Math.round(fromDisplay(value, unit) * 100) / 100,
    });
    onClose();
    onSaved();
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
        <Button label="Save" onPress={() => void save()} />
      </View>
    </Sheet>
  );
}
