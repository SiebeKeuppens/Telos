// Daily check-in sheet: energy / stress / sleep / motivation / soreness on
// 1–5 scales. Supportive and informational, never diagnostic. The engine uses
// these to ease the program when recovery is low.
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation("components");
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
    toast(t("checkin.toast"));
    onClose();
    void queryClient.invalidateQueries();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={t("checkin.title")}>
      <div className="space-y-5">
        <SegmentedScale label={t("checkin.energy.label")} value={values.energy} onChange={set("energy")} lowLabel={t("checkin.energy.low")} highLabel={t("checkin.energy.high")} />
        <SegmentedScale label={t("checkin.stress.label")} value={values.stress} onChange={set("stress")} lowLabel={t("checkin.stress.low")} highLabel={t("checkin.stress.high")} />
        <SegmentedScale label={t("checkin.sleep.label")} value={values.sleep} onChange={set("sleep")} lowLabel={t("checkin.sleep.low")} highLabel={t("checkin.sleep.high")} />
        <SegmentedScale label={t("checkin.motivation.label")} value={values.motivation} onChange={set("motivation")} lowLabel={t("checkin.motivation.low")} highLabel={t("checkin.motivation.high")} />
        <SegmentedScale label={t("checkin.soreness.label")} value={values.soreness} onChange={set("soreness")} lowLabel={t("checkin.soreness.low")} highLabel={t("checkin.soreness.high")} />
        <Button onClick={() => void save()}>{t("checkin.save")}</Button>
      </div>
    </BottomSheet>
  );
}
