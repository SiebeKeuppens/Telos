// Exercise card (design.md): name, target sets×reps, equipment chip;
// tap → exercise detail. Used on Today, Program, and the active session.
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import { Card } from "../ui/Card";
import { Badge } from "../ui/Badge";
import type { Unit, WorkoutExercise } from "../../lib/types";
import { formatLoad } from "../../lib/units";

export function ExerciseCard({
  we,
  exerciseName,
  equipment,
  unit,
  onClick,
}: {
  we: WorkoutExercise;
  exerciseName: string;
  equipment?: string;
  unit: Unit;
  onClick?: () => void;
}) {
  const { t } = useTranslation("components");
  const navigate = useNavigate();
  const reps =
    we.targetRepsMin === we.targetRepsMax
      ? `${we.targetRepsMin}`
      : `${we.targetRepsMin}–${we.targetRepsMax}`;
  // Engine guidance is a stable code; free-text user notes pass through raw.
  const note = we.noteCode ? t(`common:exNotes.${we.noteCode}`) : we.notes;

  return (
    <Card
      pressable
      className="p-3.5 flex items-center gap-3"
      onClick={onClick ?? (() => navigate(`/exercise/${we.exerciseId}`))}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          (onClick ?? (() => navigate(`/exercise/${we.exerciseId}`)))();
        }
      }}
    >
      <div className="flex-1 min-w-0">
        <div className="type-body-md font-medium text-on-surface truncate">
          {exerciseName}
        </div>
        <div className="type-data text-on-surface-variant mt-0.5">
          {we.targetSets} × {reps}
          {we.targetLoadKg != null && ` · ${formatLoad(we.targetLoadKg, unit)}`}
          {we.targetRpe != null && ` · RPE ${we.targetRpe}`}
        </div>
        {note && (
          <div className="type-body-sm text-on-surface-variant mt-1">{note}</div>
        )}
      </div>
      {equipment && (
        <Badge>
          {t(`common:equipment.${equipment}`, {
            defaultValue: equipment.replace("_", " "),
          })}
        </Badge>
      )}
      <ChevronRight size={18} strokeWidth={1.5} className="text-on-surface-variant shrink-0" />
    </Card>
  );
}
