// Bodyweight entry sheet. One number, neutral framing (a trend, not a target
// to minimize — design.md wellbeing rules).
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { BottomSheet } from "../ui/BottomSheet";
import { Button } from "../ui/Button";
import { Stepper } from "../ui/Stepper";
import { useToast } from "../ui/Toast";
import { enqueue, newId } from "../../lib/sync";
import { fromDisplay, toDisplay, todayISO } from "../../lib/units";
import type { Unit } from "../../lib/types";

export function BodyweightSheet({
  open,
  onClose,
  unit,
  lastWeightKg,
}: {
  open: boolean;
  onClose: () => void;
  unit: Unit;
  lastWeightKg?: number;
}) {
  const { t } = useTranslation("components");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [value, setValue] = useState(() =>
    Math.round(toDisplay(lastWeightKg ?? 75, unit) * 10) / 10,
  );

  // Prefill from the latest known weight at OPEN time — the prop usually
  // arrives async, after mount.
  useEffect(() => {
    if (open && lastWeightKg != null) {
      setValue(Math.round(toDisplay(lastWeightKg, unit) * 10) / 10);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const save = async () => {
    await enqueue("bodyweight", "upsert", {
      id: newId(),
      date: todayISO(),
      weightKg: Math.round(fromDisplay(value, unit) * 100) / 100,
    });
    toast(t("bodyweight.toast"));
    onClose();
    void queryClient.invalidateQueries();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={t("bodyweight.title")}>
      <div className="space-y-4">
        <Stepper
          value={value}
          onChange={setValue}
          step={0.1}
          min={20}
          max={500}
          precision={1}
          label={t("bodyweight.fieldLabel")}
          suffix={unit}
        />
        <Button onClick={() => void save()}>{t("bodyweight.save")}</Button>
      </div>
    </BottomSheet>
  );
}
