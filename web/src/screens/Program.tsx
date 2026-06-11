// Program screen — weekly training plan view.
// Data: ProgramView (program, workouts, notes) + profiles (for goal display name) + exercises.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
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

const SPLIT_LABELS: Record<string, string> = {
  full_body: "Full body",
  upper_lower: "Upper/Lower",
  push_pull_legs: "Push/Pull/Legs",
};

type PhaseKey = "deload" | "accumulation" | "intensification" | "linear" | "undulating";

const PHASE_CONFIG: Record<
  PhaseKey,
  { variant: "warning" | "neutral"; label: string }
> = {
  deload: { variant: "warning", label: "Deload week" },
  accumulation: { variant: "neutral", label: "Building volume" },
  intensification: { variant: "neutral", label: "Intensity block" },
  linear: { variant: "neutral", label: "Linear progression" },
  undulating: { variant: "neutral", label: "Undulating" },
};

function formatScheduledDay(dateStr: string): string {
  // dateStr is YYYY-MM-DD; parse as local date to avoid UTC-shift issues
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function exerciseSummaryLine(
  we: WorkoutExercise,
  exerciseMap: Map<string, string>,
): string {
  const name = exerciseMap.get(we.exerciseId) ?? "Exercise";
  const reps =
    we.targetRepsMin === we.targetRepsMax
      ? `${we.targetRepsMin}`
      : `${we.targetRepsMin}–${we.targetRepsMax}`;
  return `${name} ${we.targetSets}×${reps}`;
}

function isRecoveryNote(note: string): boolean {
  const lower = note.toLowerCase();
  return (
    lower.includes("deload") ||
    lower.includes("recovery") ||
    lower.includes("fatigue") ||
    lower.includes("rest")
  );
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
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const exercises: WorkoutExercise[] = workout.exercises ?? [];
  const preview = exercises.slice(0, 4);
  const overflow = exercises.length > 4 ? exercises.length - 4 : 0;
  const hasMore = overflow > 0;

  const statusBadge = () => {
    switch (workout.status) {
      case "completed":
        return <Badge variant="success">Done</Badge>;
      case "in_progress":
        return <Badge variant="accent">In progress</Badge>;
      case "skipped":
        return <Badge variant="neutral">Skipped</Badge>;
      case "aborted":
        return <Badge variant="neutral">Ended early</Badge>;
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
            <span className="type-title text-on-surface">{workout.name}</span>
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
              {exerciseSummaryLine(we, exerciseMap)}
            </div>
          ))}
          {hasMore && (
            <div className="type-body-sm text-on-surface-variant">+{overflow} more</div>
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
              exerciseName={exerciseMap.get(we.exerciseId) ?? "Exercise"}
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
              Start this workout
            </Button>
          )}
          {workout.status === "in_progress" && (
            <Button
              variant="primary"
              size="compact"
              onClick={(e) => { e.stopPropagation(); handleResume(); }}
            >
              Resume
            </Button>
          )}
          {(workout.status === "completed" || workout.status === "aborted") && (
            <Button
              variant="ghost"
              size="compact"
              onClick={(e) => { e.stopPropagation(); handleView(); }}
            >
              View
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

// ---- main screen ------------------------------------------------------------

export default function Program() {
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
    ? (profileMap.get(program.goal)?.displayName ?? program.goal)
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
      toast("Plan rebuilt");
    } catch {
      toast("Couldn't regenerate — try again", "error");
    } finally {
      setRegenerate(false);
      setConfirmOpen(false);
    }
  };

  // Loading state
  if (programQ.isPending) {
    return (
      <AppShell title="Program">
        <div className="flex items-center justify-center py-16">
          <span className="type-label text-on-surface-variant">Loading…</span>
        </div>
      </AppShell>
    );
  }

  // Empty / not onboarded
  if (!program) {
    return (
      <AppShell title="Program">
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
          <p className="type-body-md text-on-surface-variant">
            Your plan appears once onboarding is complete.
          </p>
          <Button
            variant="ghost"
            fullWidth={false}
            onClick={() => void queryClient.invalidateQueries({ queryKey: queryKeys.program })}
          >
            Refresh
          </Button>
        </div>
      </AppShell>
    );
  }

  const phaseKey = program.phase as PhaseKey;
  const phaseConfig = PHASE_CONFIG[phaseKey] ?? { variant: "neutral" as const, label: program.phase };
  const splitLabel = SPLIT_LABELS[program.split] ?? program.split;

  return (
    <AppShell title="Program">
      <div className="space-y-4">
        {/* ---- header card ---- */}
        <Card className="p-4">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h2 className="type-headline-md text-on-surface">{goalDisplayName}</h2>
                <Badge variant={phaseConfig.variant}>{phaseConfig.label}</Badge>
              </div>
              <p className="type-body-sm text-on-surface-variant">
                Week {program.mesocycleWeek} · {program.daysPerWeek} days/week · {splitLabel}
              </p>
            </div>
            <div className="shrink-0">
              <Arc
                size={88}
                value={weekProgress}
                metric={`${completedWorkouts}/${totalWorkouts}`}
                label="WEEK"
              />
            </div>
          </div>
        </Card>

        {/* ---- engine notes ---- */}
        {notes.length > 0 && (
          <div className="space-y-2">
            {notes.map((note, i) => {
              const isRecovery = isRecoveryNote(note);
              return (
                <Card
                  key={i}
                  className={`px-4 py-3 ${
                    isRecovery
                      ? "border-[color-mix(in_srgb,var(--warning)_30%,transparent)] bg-[color-mix(in_srgb,var(--warning)_8%,var(--surface-container))]"
                      : ""
                  }`}
                >
                  <p className={`type-body-sm ${isRecovery ? "text-warning" : "text-on-surface-variant"}`}>
                    {note}
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
            <p className="type-body-sm text-on-surface-variant">No workouts scheduled this week.</p>
          </Card>
        )}

        {/* ---- footer: regenerate ---- */}
        <Button
          variant="secondary"
          onClick={() => setConfirmOpen(true)}
          disabled={regenerating}
        >
          <RefreshCw size={16} strokeWidth={1.5} />
          Regenerate plan
        </Button>
      </div>

      {/* ---- regenerate confirm sheet ---- */}
      <BottomSheet
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Regenerate this week?"
      >
        <div className="space-y-4">
          <p className="type-body-md text-on-surface-variant">
            Replaces your remaining planned sessions. Completed, started, and edited workouts stay.
          </p>
          <Button
            onClick={() => void handleRegenerate()}
            disabled={regenerating}
          >
            {regenerating ? "Rebuilding…" : "Regenerate"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => setConfirmOpen(false)}
            disabled={regenerating}
          >
            Cancel
          </Button>
        </div>
      </BottomSheet>

    </AppShell>
  );
}
