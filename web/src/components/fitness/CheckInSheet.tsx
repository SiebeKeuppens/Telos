// Daily check-in sheet: energy / stress / sleep / motivation / soreness on
// 1–5 scales. Supportive and informational, never diagnostic. The engine uses
// these to ease the program when recovery is low.
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BottomSheet } from "../ui/BottomSheet";
import { Button } from "../ui/Button";
import { useToast } from "../ui/Toast";
import { SegmentedScale } from "./SegmentedScale";
import { enqueue, newId } from "../../lib/sync";
import { todayISO } from "../../lib/units";
import type { CheckIn } from "../../lib/types";

const defaults = { energy: 3, stress: 3, sleep: 3, motivation: 3, soreness: 3 };

export function CheckInSheet({
  open,
  onClose,
  existing,
}: {
  open: boolean;
  onClose: () => void;
  /** Today's check-in, when one exists — editing updates it. */
  existing?: CheckIn;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [values, setValues] = useState(defaults);

  // Reset only when the sheet OPENS — a background refetch changing the
  // `existing` object identity must not wipe in-progress edits.
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

  const set = (key: keyof typeof defaults) => (v: number) =>
    setValues((prev) => ({ ...prev, [key]: v }));

  const save = async () => {
    await enqueue("checkin", "upsert", {
      id: existing?.id ?? newId(),
      date: todayISO(),
      ...values,
    });
    toast("Check-in saved");
    onClose();
    void queryClient.invalidateQueries();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="How are you today?">
      <div className="space-y-5">
        <SegmentedScale label="Energy" value={values.energy} onChange={set("energy")} lowLabel="Running low" highLabel="Full tank" />
        <SegmentedScale label="Stress" value={values.stress} onChange={set("stress")} lowLabel="Calm" highLabel="A lot going on" />
        <SegmentedScale label="Sleep" value={values.sleep} onChange={set("sleep")} lowLabel="Rough night" highLabel="Slept great" />
        <SegmentedScale label="Motivation" value={values.motivation} onChange={set("motivation")} lowLabel="Meh" highLabel="Ready to go" />
        <SegmentedScale label="Soreness" value={values.soreness} onChange={set("soreness")} lowLabel="Fresh" highLabel="Very sore" />
        <Button onClick={() => void save()}>Save check-in</Button>
      </div>
    </BottomSheet>
  );
}
