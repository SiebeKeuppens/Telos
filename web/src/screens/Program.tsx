// Program screen — weekly training plan view.
// Data: ProgramView (program, workouts, notes) + profiles (for goal display name) + exercises.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { dateLocale, workoutName } from "../i18n";
import { AppShell } from "../components/shell/AppShell";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Arc } from "../components/ui/Arc";
import { BottomSheet } from "../components/ui/BottomSheet";
import { useToast } from "../components/ui/Toast";
import { ExerciseCard } from "../components/fitness/ExerciseCard";
import { api, queryKeys } from "../lib/api";
import { enqueue } from "../lib/sync";
import type { Exercise, TrainingProfile, Workout, WorkoutExercise } from "../lib/types";

// ---- helpers ----------------------------------------------------------------

type PhaseKey = "deload" | "accumulation" | "intensification" | "linear" | "undulating";

const PHASE_VARIANTS: Record<PhaseKey, "warning" | "neutral"> = {
  deload: "warning",
  accumulation: "neutral",
  intensification: "neutral",
  linear: "neutral",
  undulating: "neutral",
};

function formatScheduledDay(dateStr: string): string {
  // dateStr is YYYY-MM-DD; parse as local date to avoid UTC-shift issues
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(dateLocale(), { weekday: "short", month: "short", day: "numeric" });
}

function exerciseSummaryLine(
  we: WorkoutExercise,
  exerciseMap: Map<string, string>,
  fallbackName: string,
): string {
  const name = exerciseMap.get(we.exerciseId) ?? fallbackName;
  const reps =
    we.targetRepsMin === we.targetRepsMax
      ? `${we.targetRepsMin}`
      : `${we.targetRepsMin}–${we.targetRepsMax}`;
  return `${name} ${we.targetSets}×${reps}`;
}

/** Engine notes are codes; recovery-flavoured ones get the warning tint. */
function isWarningNote(code: string): boolean {
  return code.startsWith("deload_") || code === "eased_today";
}

// ---- WorkoutCard ------------------------------------------------------------

function WorkoutCard({
  workout,
  exerciseMap,
  unit,
}: {
  workout: Workout;
  exerciseMap: Map<string, string>;
  unit: "kg" | "lb";
}) {
  const { t } = useTranslation("program");
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const exercises: WorkoutExercise[] = workout.exercises ?? [];
  const preview = exercises.slice(0, 4);
  const overflow = exercises.length > 4 ? exercises.length - 4 : 0;
  const hasMore = overflow > 0;

  const statusBadge = () => {
    switch (workout.status) {
      case "completed":
        return <Badge variant="success">{t("common:status.completed")}</Badge>;
      case "in_progress":
        return <Badge variant="accent">{t("common:status.in_progress")}</Badge>;
      case "skipped":
        return <Badge variant="neutral">{t("common:status.skipped")}</Badge>;
      case "aborted":
        return <Badge variant="neutral">{t("common:status.aborted")}</Badge>;
      default:
        return null;
    }
  };

  const handleStart = async () => {
    await enqueue("workout", "upsert", {
      ...workout,
      status: "in_progress",
      startedAt: new Date().toISOString(),
    });
    navigate(`/workout/${workout.id}`);
  };

  const handleResume = () => navigate(`/workout/${workout.id}`);
  const handleView = () => navigate(`/workout/${workout.id}`);

  return (
    <Card className="overflow-hidden">
      {/* header row */}
      <button
        className="w-full text-left p-4 flex items-start gap-3 min-h-[44px] active:bg-surface-container-high transition-colors"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="type-title text-on-surface">{workoutName(workout.name)}</span>
            {statusBadge()}
          </div>
          {workout.scheduledFor && (
            <div className="type-body-sm text-on-surface-variant mt-0.5">
              {formatScheduledDay(workout.scheduledFor)}
            </div>
          )}
        </div>
        {expanded ? (
          <ChevronUp size={18} strokeWidth={1.5} className="text-on-surface-variant shrink-0 mt-1" />
        ) : (
          <ChevronDown size={18} strokeWidth={1.5} className="text-on-surface-variant shrink-0 mt-1" />
        )}
      </button>

      {/* compact preview (collapsed) */}
      {!expanded && exercises.length > 0 && (
        <div className="px-4 pb-3 space-y-0.5">
          {preview.map((we) => (
            <div key={we.id} className="type-data text-on-surface-variant">
              {exerciseSummaryLine(we, exerciseMap, t("exerciseFallback"))}
            </div>
          ))}
          {hasMore && (
            <div className="type-body-sm text-on-surface-variant">
              {t("moreExercises", { count: overflow })}
            </div>
          )}
        </div>
      )}

      {/* expanded: full ExerciseCards */}
      {expanded && (
        <div className="px-4 pb-3 space-y-2">
          {exercises.map((we) => (
            <ExerciseCard
              key={we.id}
              we={we}
              exerciseName={exerciseMap.get(we.exerciseId) ?? t("exerciseFallback")}
              unit={unit}
            />
          ))}
        </div>
      )}

      {/* action buttons */}
      {(workout.status === "planned" ||
        workout.status === "in_progress" ||
        workout.status === "completed" ||
        workout.status === "aborted") && (
        <div className="px-4 pb-4 pt-1">
          {workout.status === "planned" && (
            <Button
              variant="secondary"
              size="compact"
              onClick={(e) => { e.stopPropagation(); void handleStart(); }}
            >
              {t("startWorkout")}
            </Button>
          )}
          {workout.status === "in_progress" && (
            <Button
              variant="primary"
              size="compact"
              onClick={(e) => { e.stopPropagation(); handleResume(); }}
            >
              {t("resume")}
            </Button>
          )}
          {(workout.status === "completed" || workout.status === "aborted") && (
            <Button
              variant="ghost"
              size="compact"
              onClick={(e) => { e.stopPropagation(); handleView(); }}
            >
              {t("common:view")}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

// ---- main screen ------------------------------------------------------------

export default function Program() {
  const { t } = useTranslation("program");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [regenerating, setRegenerate] = useState(false);

  const programQ = useQuery({
    queryKey: queryKeys.program,
    queryFn: api.getProgram,
  });

  const meQ = useQuery({
    queryKey: queryKeys.me,
    queryFn: api.getMe,
  });

  const profilesQ = useQuery({
    queryKey: queryKeys.profiles,
    queryFn: api.getProfiles,
  });

  const exercisesQ = useQuery({
    queryKey: queryKeys.exercises,
    queryFn: api.getExercises,
  });

  const view = programQ.data;
  const program = view?.program ?? null;
  const workouts = view?.workouts ?? [];
  const notes = view?.notes ?? [];
  const unit = meQ.data?.unit ?? "kg";

  // Goal display name from profiles
  const profileMap = new Map<string, TrainingProfile>(
    (profilesQ.data ?? []).map((p) => [p.goal, p]),
  );
  const goalDisplayName = program
    ? t(`common:goals.${program.goal}.name`, {
        defaultValue: profileMap.get(program.goal)?.displayName ?? program.goal,
      })
    : "";

  // Exercise name lookup
  const exerciseMap = new Map<string, string>(
    (exercisesQ.data ?? []).map((e: Exercise) => [e.id, e.name]),
  );

  // Week completion
  const totalWorkouts = workouts.length;
  const completedWorkouts = workouts.filter(
    (w) => w.status === "completed",
  ).length;
  const weekProgress =
    totalWorkouts > 0 ? completedWorkouts / totalWorkouts : 0;

  // Sort workouts by dayIndex
  const sortedWorkouts = [...workouts].sort((a, b) => a.dayIndex - b.dayIndex);

  const handleRegenerate = async () => {
    setRegenerate(true);
    try {
      await api.regenerate();
      await queryClient.invalidateQueries();
      toast(t("toast.rebuilt"));
    } catch {
      toast(t("toast.rebuildFailed"), "error");
    } finally {
      setRegenerate(false);
      setConfirmOpen(false);
    }
  };

  // Loading state
  if (programQ.isPending) {
    return (
      <AppShell title={t("common:nav.program")}>
        <div className="flex items-center justify-center py-16">
          <span className="type-label text-on-surface-variant">{t("common:loading")}</span>
        </div>
      </AppShell>
    );
  }

  // Empty / not onboarded
  if (!program) {
    return (
      <AppShell title={t("common:nav.program")}>
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
          <p className="type-body-md text-on-surface-variant">
            {t("empty.noProgram")}
          </p>
          <Button
            variant="ghost"
            fullWidth={false}
            onClick={() => void queryClient.invalidateQueries({ queryKey: queryKeys.program })}
          >
            {t("common:refresh")}
          </Button>
        </div>
      </AppShell>
    );
  }

  const phaseKey = program.phase as PhaseKey;
  const phaseVariant = PHASE_VARIANTS[phaseKey] ?? "neutral";
  const phaseLabel = t(`common:phases.${phaseKey}`, { defaultValue: program.phase });
  const splitLabel = t(`common:splits.${program.split}`, { defaultValue: program.split });

  return (
    <AppShell title={t("common:nav.program")}>
      <div className="space-y-4">
        {/* ---- header card ---- */}
        <Card className="p-4">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h2 className="type-headline-md text-on-surface">{goalDisplayName}</h2>
                <Badge variant={phaseVariant}>{phaseLabel}</Badge>
              </div>
              <p className="type-body-sm text-on-surface-variant">
                {t("weekLine", {
                  week: program.mesocycleWeek,
                  days: program.daysPerWeek,
                  split: splitLabel,
                })}
              </p>
            </div>
            <div className="shrink-0">
              <Arc
                size={88}
                value={weekProgress}
                metric={`${completedWorkouts}/${totalWorkouts}`}
                label={t("arcWeek")}
              />
            </div>
          </div>
        </Card>

        {/* ---- engine notes ---- */}
        {notes.length > 0 && (
          <div className="space-y-2">
            {notes.map((note, i) => {
              const isWarning = isWarningNote(note);
              return (
                <Card
                  key={i}
                  className={`px-4 py-3 ${
                    isWarning
                      ? "border-[color-mix(in_srgb,var(--warning)_30%,transparent)] bg-[color-mix(in_srgb,var(--warning)_8%,var(--surface-container))]"
                      : ""
                  }`}
                >
                  <p className={`type-body-sm ${isWarning ? "text-warning" : "text-on-surface-variant"}`}>
                    {t(`common:notes.${note}`, { defaultValue: note })}
                  </p>
                </Card>
              );
            })}
          </div>
        )}

        {/* ---- workout list ---- */}
        {sortedWorkouts.length > 0 ? (
          <div className="space-y-3">
            {sortedWorkouts.map((workout) => (
              <WorkoutCard
                key={workout.id}
                workout={workout}
                exerciseMap={exerciseMap}
                unit={unit}
              />
            ))}
          </div>
        ) : (
          <Card className="px-4 py-8 text-center">
            <p className="type-body-sm text-on-surface-variant">{t("empty.noWorkouts")}</p>
          </Card>
        )}

        {/* ---- footer: regenerate ---- */}
        <Button
          variant="secondary"
          onClick={() => setConfirmOpen(true)}
          disabled={regenerating}
        >
          <RefreshCw size={16} strokeWidth={1.5} />
          {t("regenerate.button")}
        </Button>
      </div>

      {/* ---- regenerate confirm sheet ---- */}
      <BottomSheet
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={t("regenerate.title")}
      >
        <div className="space-y-4">
          <p className="type-body-md text-on-surface-variant">
            {t("regenerate.body")}
          </p>
          <Button
            onClick={() => void handleRegenerate()}
            disabled={regenerating}
          >
            {regenerating ? t("regenerate.working") : t("regenerate.confirm")}
          </Button>
          <Button
            variant="ghost"
            onClick={() => setConfirmOpen(false)}
            disabled={regenerating}
          >
            {t("common:cancel")}
          </Button>
        </div>
      </BottomSheet>

    </AppShell>
  );
}
