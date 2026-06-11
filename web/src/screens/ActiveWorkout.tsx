// ActiveWorkout — in-session screen (/workout/:id).
// Active mode: per-exercise SetLoggerRow grid + RestTimer + sticky action bar.
// Read-only mode (completed/aborted/skipped): summary view.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Trans, useTranslation } from "react-i18next";
import {
  ArrowLeftRight,
  Check,
  ChevronDown,
  ChevronUp,
  EllipsisVertical,
  Trash2,
} from "lucide-react";
import { AppShell } from "../components/shell/AppShell";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { BottomSheet } from "../components/ui/BottomSheet";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { SetLoggerRow } from "../components/fitness/SetLoggerRow";
import { RestTimer } from "../components/fitness/RestTimer";
import { useToast } from "../components/ui/Toast";
import { api, queryKeys } from "../lib/api";
import { outboxAll } from "../lib/db";
import { enqueue, newId } from "../lib/sync";
import { formatLoad } from "../lib/units";
import { dateLocale, workoutName } from "../i18n";
import type {
  Exercise,
  SetEntry,
  WarmupMove,
  Workout,
  WorkoutExercise,
} from "../lib/types";

// ---- types ------------------------------------------------------------------

// Local optimistic set store: (workoutExerciseId → setNumber) → SetEntry
type SetKey = string; // `${workoutExerciseId}:${setNumber}`
type LocalSets = Map<SetKey, SetEntry>;

function setKey(weId: string, setNumber: number): SetKey {
  return `${weId}:${setNumber}`;
}

// ---- helpers ----------------------------------------------------------------

function totalVolume(sets: SetEntry[]): number {
  return sets.reduce((s, e) => s + e.loadKg * e.reps, 0);
}

function formatScheduledDay(dateStr: string): string {
  // dateStr is YYYY-MM-DD; parse as local date to avoid UTC-shift issues
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(dateLocale(), {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// ---- sub-components ---------------------------------------------------------

/** One line of a summary view for a logged set. */
function SummarySetRow({
  entry,
  unit,
}: {
  entry: SetEntry;
  unit: "kg" | "lb";
}) {
  const { t } = useTranslation("workout");
  return (
    <div className="flex gap-3 items-center py-1.5 type-data text-on-surface-variant">
      <span className="w-5 text-on-surface-variant text-center">
        {entry.setNumber}
      </span>
      <span className="text-on-surface">{formatLoad(entry.loadKg, unit)}</span>
      <span>×{entry.reps}</span>
      {entry.rpe !== undefined && (
        <span className="type-label text-on-surface-variant">
          {t("rpe", { value: entry.rpe })}
        </span>
      )}
    </div>
  );
}

// ---- Warm-up card -------------------------------------------------------------

/** Engine-generated dynamic warmup: collapsible checklist, local-only state. */
function WarmupCard({
  moves,
  defaultExpanded,
}: {
  moves: WarmupMove[];
  defaultExpanded: boolean;
}) {
  const { t } = useTranslation("workout");
  // Initial state only — the user's toggle wins afterwards.
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [checked, setChecked] = useState<Set<number>>(new Set());

  const toggleMove = (i: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) {
        next.delete(i);
      } else {
        next.add(i);
      }
      return next;
    });
  };

  return (
    <Card>
      <button
        type="button"
        className="w-full min-h-[44px] flex items-center justify-between gap-3 px-4 py-3 text-left active:bg-surface-container-high transition-colors"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className="type-label text-on-surface-variant">
          {t("warmup.title")}
        </span>
        {expanded ? (
          <ChevronUp
            size={18}
            strokeWidth={1.5}
            className="text-on-surface-variant shrink-0"
          />
        ) : (
          <ChevronDown
            size={18}
            strokeWidth={1.5}
            className="text-on-surface-variant shrink-0"
          />
        )}
      </button>

      {expanded && (
        <div className="px-2 pb-2">
          <p className="type-body-sm text-on-surface-variant px-2 pb-2">
            {t("warmup.caption")}
          </p>
          {moves.map((m, i) => {
            const isChecked = checked.has(i);
            return (
              <button
                key={`${m.name}-${i}`}
                type="button"
                aria-pressed={isChecked}
                onClick={() => toggleMove(i)}
                className="w-full min-h-[44px] flex items-center gap-3 px-2 py-1.5 rounded-lg active:bg-surface-container-high transition-colors"
              >
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                    isChecked
                      ? "bg-primary text-on-primary"
                      : "bg-surface-container-highest border border-outline-variant text-on-surface-variant"
                  }`}
                >
                  <Check size={14} strokeWidth={1.5} />
                </span>
                <span
                  className={`flex-1 text-left type-body-md ${
                    isChecked ? "text-on-surface-variant" : "text-on-surface"
                  }`}
                >
                  {t(`common:warmupMoves.${m.name}`, { defaultValue: m.name })}
                </span>
                <span className="type-data text-on-surface-variant shrink-0">
                  {m.prescription}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ---- Swap sheet -------------------------------------------------------------

function SwapSheet({
  open,
  onClose,
  exerciseId,
  we,
  workout,
  onSwapped,
}: {
  open: boolean;
  onClose: () => void;
  exerciseId: string;
  we: WorkoutExercise;
  workout: Workout;
  onSwapped: (newExerciseId: string, name: string) => void;
}) {
  const { t } = useTranslation("workout");
  const { toast } = useToast();
  const [sub, setSub] = useState<Exercise | null>(null);
  const [loading, setLoading] = useState(false);
  const [noSub, setNoSub] = useState(false);

  // Fetch substitute on open
  const prevOpen = useMemo(() => open, [open]); // track changes
  void prevOpen; // suppress unused warning

  const fetchSub = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    setNoSub(false);
    setSub(null);
    try {
      const result = await api.getSubstitute(exerciseId);
      setSub(result);
    } catch {
      setNoSub(true);
    } finally {
      setLoading(false);
    }
  }, [open, exerciseId]);

  // Run on open
  useState(() => {
    if (open) void fetchSub();
  });

  // Re-fetch whenever open transitions to true
  const lastOpen = useMemo(() => {
    if (open) void fetchSub();
    return open;
  }, [open, fetchSub]);
  void lastOpen;

  const doSwap = async () => {
    if (!sub) return;
    await enqueue("workout_exercise", "upsert", { ...we, exerciseId: sub.id });
    await enqueue("workout", "upsert", { ...workout, edited: true });
    toast(t("toasts.swapped", { name: sub.name }));
    onSwapped(sub.id, sub.name);
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={t("swap.title")}>
      <div className="space-y-4">
        {loading && (
          <p className="type-body-sm text-on-surface-variant">{t("swap.finding")}</p>
        )}
        {noSub && (
          <p className="type-body-sm text-on-surface-variant">
            {t("swap.none")}
          </p>
        )}
        {sub && (
          <div className="space-y-3">
            <div>
              <p className="type-title text-on-surface">{sub.name}</p>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {sub.equipment.slice(0, 2).map((eq) => (
                  <Badge key={eq} variant="neutral">
                    {t(`common:equipment.${eq}`)}
                  </Badge>
                ))}
              </div>
            </div>
            {sub.formCues.slice(0, 2).length > 0 && (
              <ul className="space-y-1">
                {sub.formCues.slice(0, 2).map((cue, i) => (
                  <li key={i} className="type-body-sm text-on-surface-variant flex gap-2">
                    <span className="text-primary font-medium shrink-0">{i + 1}.</span>
                    <span>{cue}</span>
                  </li>
                ))}
              </ul>
            )}
            <Button onClick={() => void doSwap()}>
              {t("swap.swapTo", { name: sub.name })}
            </Button>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

// ---- Add exercise sheet -----------------------------------------------------

function AddExerciseSheet({
  open,
  onClose,
  workoutId,
  nextPosition,
  workout,
  allExercises,
}: {
  open: boolean;
  onClose: () => void;
  workoutId: string;
  nextPosition: number;
  workout: Workout;
  allExercises: Exercise[];
}) {
  const { t } = useTranslation("workout");
  const { toast } = useToast();
  const [search, setSearch] = useState("");

  const filtered = allExercises.filter((e) =>
    e.name.toLowerCase().includes(search.toLowerCase()),
  );

  const add = async (ex: Exercise) => {
    await enqueue("workout_exercise", "upsert", {
      id: newId(),
      workoutId,
      exerciseId: ex.id,
      position: nextPosition,
      targetSets: 3,
      targetRepsMin: 8,
      targetRepsMax: 12,
      restSeconds: 90,
    });
    await enqueue("workout", "upsert", { ...workout, edited: true });
    toast(t("toasts.added", { name: ex.name }));
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={t("add.title")}>
      <div className="space-y-3">
        <Input
          placeholder={t("add.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
        <ul className="space-y-2">
          {filtered.slice(0, 30).map((ex) => (
            <li key={ex.id}>
              <button
                type="button"
                className="w-full flex items-center gap-3 p-3 rounded-lg bg-surface-container-high text-left active:bg-surface-container-highest"
                onClick={() => void add(ex)}
              >
                <span className="flex-1 type-body-md text-on-surface">{ex.name}</span>
                <Badge variant="neutral">
                  {ex.equipment[0] ? t(`common:equipment.${ex.equipment[0]}`) : ""}
                </Badge>
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="type-body-sm text-on-surface-variant py-2">
              {t("add.noResults")}
            </li>
          )}
        </ul>
      </div>
    </BottomSheet>
  );
}

// ---- Remove exercise sheet --------------------------------------------------

function RemoveExerciseSheet({
  open,
  onClose,
  exerciseName,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  exerciseName: string;
  onConfirm: () => void;
}) {
  const { t } = useTranslation("workout");
  return (
    <BottomSheet open={open} onClose={onClose} title={t("remove.title")}>
      <div className="space-y-4">
        <p className="type-body-md text-on-surface-variant">
          <Trans
            ns="workout"
            i18nKey="remove.body"
            values={{ name: exerciseName }}
            components={{
              strong: <span className="text-on-surface font-medium" />,
            }}
          />
        </p>
        <Button variant="destructive" onClick={onConfirm}>
          {t("remove.confirm")}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          {t("remove.keep")}
        </Button>
      </div>
    </BottomSheet>
  );
}

// ---- Finish confirm sheet ---------------------------------------------------

function FinishConfirmSheet({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation("workout");
  return (
    <BottomSheet open={open} onClose={onClose} title={t("finishConfirm.title")}>
      <div className="space-y-4">
        <p className="type-body-md text-on-surface-variant">
          {t("finishConfirm.body")}
        </p>
        <Button onClick={onConfirm}>{t("finishConfirm.confirm")}</Button>
        <Button variant="ghost" onClick={onClose}>
          {t("finishConfirm.keepGoing")}
        </Button>
      </div>
    </BottomSheet>
  );
}

// ---- main component ---------------------------------------------------------

export default function ActiveWorkout() {
  const { t } = useTranslation("workout");
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const workout = useQuery({
    queryKey: queryKeys.workout(id ?? ""),
    queryFn: () => api.getWorkout(id ?? ""),
    enabled: Boolean(id),
  });
  const me = useQuery({ queryKey: queryKeys.me, queryFn: api.getMe });
  const exercises = useQuery({
    queryKey: queryKeys.exercises,
    queryFn: api.getExercises,
  });

  const unit = me.data?.unit ?? "kg";
  const exMap = new Map(exercises.data?.map((e) => [e.id, e]) ?? []);

  // Optimistic local set store
  const [localSets, setLocalSets] = useState<LocalSets>(new Map());

  // UI sheets
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [addExOpen, setAddExOpen] = useState(false);
  const [swapWeId, setSwapWeId] = useState<string | null>(null);
  const [removeWeId, setRemoveWeId] = useState<string | null>(null);
  const [finishOpen, setFinishOpen] = useState(false);
  const [restSeconds, setRestSeconds] = useState(0);
  // Bumps on every logged set so the timer restarts even when the rest
  // duration is identical to the previous set's.
  const [restTrigger, setRestTrigger] = useState(0);
  // Local "+ Add set" targets (absolute), so extra rows appear before sync.
  const [localTargets, setLocalTargets] = useState<Map<string, number>>(
    new Map(),
  );

  // Per-exercise swap state (exerciseId overrides)
  const [exerciseIdOverrides, setExerciseIdOverrides] = useState<
    Map<string, string>
  >(new Map());

  // Offline fallback: a workout created or started offline may not exist on
  // the server yet — rebuild a minimal view from the outbox so the session
  // screen still works (offline-first promise).
  const [outboxWorkout, setOutboxWorkout] = useState<Workout | null>(null);
  const [outboxChecked, setOutboxChecked] = useState(false);
  useEffect(() => {
    if (!workout.isError || !id) return;
    let cancelled = false;
    void outboxAll().then((ops) => {
      if (cancelled) return;
      const wop = ops
        .filter(
          (o) =>
            o.entity === "workout" && (o.data as Workout | undefined)?.id === id,
        )
        .at(-1);
      if (wop) {
        setOutboxWorkout({ exercises: [], ...(wop.data as Workout) });
      }
      setOutboxChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, [workout.isError, id]);

  // Rehydrate optimistic sets from queued (unsynced) ops — without this, an
  // offline reload would show target rows as unlogged and invite duplicates.
  useEffect(() => {
    const weIds = new Set(
      (workout.data?.exercises ?? []).map((we) => we.id),
    );
    if (weIds.size === 0) return;
    void outboxAll().then((ops) => {
      const pending = ops.filter(
        (o) =>
          o.entity === "set" &&
          o.action === "upsert" &&
          weIds.has((o.data as SetEntry | undefined)?.workoutExerciseId ?? ""),
      );
      if (pending.length === 0) return;
      setLocalSets((prev) => {
        const next = new Map(prev);
        for (const op of pending) {
          const entry = op.data as SetEntry;
          next.set(setKey(entry.workoutExerciseId, entry.setNumber), entry);
        }
        return next;
      });
    });
  }, [workout.data]);

  const w = workout.data ?? outboxWorkout ?? undefined;
  const isReadOnly =
    w?.status === "completed" ||
    w?.status === "aborted" ||
    w?.status === "skipped";

  // Merge server sets with local optimistic ones
  const getMergedSets = useCallback(
    (we: WorkoutExercise): SetEntry[] => {
      const serverSets = we.sets ?? [];
      const merged = new Map<number, SetEntry>();
      serverSets.forEach((s) => merged.set(s.setNumber, s));
      localSets.forEach((s, k) => {
        if (k.startsWith(we.id + ":")) {
          merged.set(s.setNumber, s);
        }
      });
      return Array.from(merged.values()).sort(
        (a, b) => a.setNumber - b.setNumber,
      );
    },
    [localSets],
  );

  // Suggested load: last logged load for exercise, else targetLoadKg, else 60kg
  const getSuggestedLoad = useCallback(
    (we: WorkoutExercise, mergedSets: SetEntry[]): number => {
      if (mergedSets.length > 0) {
        return mergedSets[mergedSets.length - 1].loadKg;
      }
      // No history, no prescription → start at 0 so the user consciously
      // picks a weight (the exercise note says how).
      return we.targetLoadKg ?? 0;
    },
    [],
  );

  // Log a set
  const logSet = useCallback(
    async (
      we: WorkoutExercise,
      setNumber: number,
      loadKg: number,
      reps: number,
      rpe: number | undefined,
    ) => {
      const entry: SetEntry = {
        id: newId(),
        workoutExerciseId: we.id,
        setNumber,
        loadKg,
        reps,
        rpe,
        completed: true,
        loggedAt: new Date().toISOString(),
      };
      // Optimistic
      setLocalSets((prev) => {
        const next = new Map(prev);
        next.set(setKey(we.id, setNumber), entry);
        return next;
      });
      // Enqueue
      await enqueue("set", "upsert", entry);
      // Start rest timer (trigger bump restarts it even at equal duration)
      setRestSeconds(we.restSeconds);
      setRestTrigger((t) => t + 1);
    },
    [],
  );

  // Finish workout
  const finishWorkout = useCallback(async () => {
    if (!w) return;
    await enqueue("workout", "upsert", {
      ...w,
      status: "completed",
      completedAt: new Date().toISOString(),
    });
    toast(t("toasts.logged"));
    navigate("/");
  }, [w, toast, navigate, t]);

  // Check if any target sets are unlogged
  const hasUnloggedSets = useMemo(() => {
    if (!w?.exercises) return false;
    return w.exercises.some((we) => {
      const merged = getMergedSets(we);
      const loggedCount = merged.filter((s) => s.completed).length;
      return loggedCount < we.targetSets;
    });
  }, [w, getMergedSets]);

  const handleFinishPress = () => {
    if (hasUnloggedSets) {
      setFinishOpen(true);
    } else {
      void finishWorkout();
    }
  };

  // End early (aborted)
  const endEarly = async () => {
    if (!w) return;
    await enqueue("workout", "upsert", {
      ...w,
      status: "aborted",
      completedAt: new Date().toISOString(),
    });
    setOverflowOpen(false);
    toast(t("toasts.ended"));
    navigate("/");
  };

  // Skip workout
  const skipWorkout = async () => {
    if (!w) return;
    await enqueue("workout", "upsert", { ...w, status: "skipped" });
    setOverflowOpen(false);
    toast(t("toasts.skipped"));
    navigate("/");
  };

  const anyLogged = useMemo(() => {
    return Array.from(localSets.values()).length > 0 ||
      w?.exercises?.some((we) => (we.sets?.length ?? 0) > 0);
  }, [localSets, w]);

  // Overflow context action
  const contextAction = (
    <button
      type="button"
      aria-label={t("options.title")}
      onClick={() => setOverflowOpen(true)}
      className="w-11 h-11 flex items-center justify-center rounded text-on-surface-variant active:bg-surface-container-high"
    >
      <EllipsisVertical size={22} strokeWidth={1.5} />
    </button>
  );

  if (workout.isPending || (workout.isError && !outboxChecked)) {
    return (
      <AppShell hideNav title={t("common:loading")}>
        <div className="flex items-center justify-center py-16">
          <span className="type-label text-on-surface-variant">{t("loadingWorkout")}</span>
        </div>
      </AppShell>
    );
  }

  if (!w) {
    return (
      <AppShell hideNav title={t("fallbackTitle")}>
        <div className="py-8 text-center">
          <p className="type-body-md text-on-surface-variant">{t("notFound")}</p>
          <Button variant="ghost" fullWidth={false} className="mt-4 px-4" onClick={() => navigate("/")}>
            {t("goHome")}
          </Button>
        </div>
      </AppShell>
    );
  }

  // ---- READ-ONLY SUMMARY VIEW ----
  if (isReadOnly) {
    const allExercises = w.exercises ?? [];
    const statusLabel = t(`common:status.${w.status}`);

    let durationMins: number | null = null;
    if (w.startedAt && w.completedAt) {
      const ms =
        new Date(w.completedAt).getTime() - new Date(w.startedAt).getTime();
      durationMins = Math.round(ms / 60000);
    }

    return (
      <AppShell hideNav title={workoutName(w.name)} contextAction={contextAction}>
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center gap-3">
            <Badge
              variant={w.status === "completed" ? "success" : w.status === "aborted" ? "warning" : "neutral"}
            >
              {statusLabel}
            </Badge>
            {durationMins !== null && (
              <span className="type-body-sm text-on-surface-variant">
                {t("summary.duration", { min: durationMins })}
              </span>
            )}
            {w.scheduledFor && (
              <span className="type-body-sm text-on-surface-variant">
                {formatScheduledDay(w.scheduledFor)}
              </span>
            )}
          </div>

          {allExercises.map((we) => {
            const ex = exMap.get(exerciseIdOverrides.get(we.id) ?? we.exerciseId);
            const sets = we.sets ?? [];
            const vol = totalVolume(sets);
            return (
              <Card key={we.id} className="p-4 space-y-2">
                <div className="type-title text-on-surface">{ex?.name ?? t("exerciseFallback")}</div>
                {sets.length === 0 ? (
                  <p className="type-body-sm text-on-surface-variant">{t("summary.noSets")}</p>
                ) : (
                  <div className="divide-y divide-outline-variant">
                    {sets.map((s) => (
                      <SummarySetRow key={s.id} entry={s} unit={unit} />
                    ))}
                  </div>
                )}
                {sets.length > 0 && (
                  <div className="type-body-sm text-on-surface-variant pt-1">
                    {t("summary.volume", { volume: formatLoad(vol, unit) })}
                  </div>
                )}
              </Card>
            );
          })}

          <Button variant="secondary" onClick={() => navigate("/")}>
            {t("summary.backToToday")}
          </Button>
        </div>
      </AppShell>
    );
  }

  // ---- ACTIVE MODE ----
  const exerciseRows = w.exercises ?? [];
  const nextPosition =
    exerciseRows.length > 0
      ? Math.max(...exerciseRows.map((e) => e.position)) + 1
      : 1;

  const swapWe = swapWeId ? exerciseRows.find((we) => we.id === swapWeId) ?? null : null;
  const removeWe = removeWeId ? exerciseRows.find((we) => we.id === removeWeId) ?? null : null;

  return (
    <AppShell hideNav title={workoutName(w.name)} contextAction={contextAction}>
      <div className="space-y-5 pb-4">
        {/* ---- Warm-up checklist (engine-generated, local-only ticks) ---- */}
        {(w.warmup?.length ?? 0) > 0 && (
          <WarmupCard moves={w.warmup ?? []} defaultExpanded={!anyLogged} />
        )}

        {exerciseRows.map((we) => {
          const effectiveExId =
            exerciseIdOverrides.get(we.id) ?? we.exerciseId;
          const ex = exMap.get(effectiveExId);
          const mergedSets = getMergedSets(we);
          const loggedCount = mergedSets.filter((s) => s.completed).length;
          const visibleRows = Math.max(
            we.targetSets,
            loggedCount,
            localTargets.get(we.id) ?? 0,
          );
          const suggestedLoad = getSuggestedLoad(we, mergedSets);
          const reps =
            we.targetRepsMin === we.targetRepsMax
              ? `${we.targetRepsMin}`
              : `${we.targetRepsMin}–${we.targetRepsMax}`;

          return (
            <div key={we.id} className="space-y-2">
              {/* Exercise header */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="flex-1 text-left type-title text-on-surface active:text-primary truncate"
                  onClick={() => navigate(`/exercise/${effectiveExId}`)}
                >
                  {ex?.name ?? t("exerciseFallback")}
                </button>

                {/* Target chip */}
                <span className="type-label text-on-surface-variant shrink-0 px-2 py-1 rounded bg-surface-container-high border border-outline-variant">
                  {we.targetSets}×{reps}
                </span>

                {/* Swap button */}
                <button
                  type="button"
                  aria-label={t("swap.title")}
                  onClick={() => setSwapWeId(we.id)}
                  className="w-11 h-11 flex items-center justify-center rounded text-on-surface-variant active:bg-surface-container-high"
                >
                  <ArrowLeftRight size={18} strokeWidth={1.5} />
                </button>

                {/* Remove button */}
                <button
                  type="button"
                  aria-label={t("remove.title")}
                  onClick={() => setRemoveWeId(we.id)}
                  className="w-11 h-11 flex items-center justify-center rounded text-on-surface-variant active:bg-surface-container-high"
                >
                  <Trash2 size={18} strokeWidth={1.5} />
                </button>
              </div>

              {/* Engine guidance (code-based) — raw notes only as fallback */}
              {(we.noteCode || we.notes) && (
                <p className="type-body-sm text-on-surface-variant">
                  {we.noteCode
                    ? t(`common:exNotes.${we.noteCode}`)
                    : we.notes}
                </p>
              )}

              {/* Set rows */}
              <div className="space-y-1">
                {Array.from({ length: visibleRows }, (_, i) => {
                  const setNum = i + 1;
                  const logged = mergedSets.find((s) => s.setNumber === setNum);
                  // Prefill: last logged → else suggested
                  const prevLogged = mergedSets.filter((s) => s.setNumber < setNum && s.completed);
                  const prefillLoad =
                    prevLogged.length > 0
                      ? prevLogged[prevLogged.length - 1].loadKg
                      : suggestedLoad;
                  const firstUnlogged = mergedSets.findIndex((s) => !s.completed);
                  const highlighted =
                    !logged &&
                    (firstUnlogged === -1 ? setNum === 1 : setNum === firstUnlogged + 1);

                  return (
                    <SetLoggerRow
                      key={setNum}
                      setNumber={setNum}
                      suggestedLoadKg={prefillLoad}
                      suggestedReps={we.targetRepsMin}
                      unit={unit}
                      logged={logged}
                      highlighted={highlighted}
                      onLog={(loadKg, reps2, rpe) =>
                        void logSet(we, setNum, loadKg, reps2, rpe)
                      }
                    />
                  );
                })}
              </div>

              {/* + Add set ghost button */}
              <Button
                variant="ghost"
                size="compact"
                fullWidth={false}
                className="px-3 text-on-surface-variant"
                onClick={() => {
                  const newTarget = visibleRows + 1;
                  // Show the row immediately; the enqueue persists it.
                  setLocalTargets((prev) =>
                    new Map(prev).set(we.id, newTarget),
                  );
                  const { sets: _sets, ...weData } = we;
                  void enqueue("workout_exercise", "upsert", {
                    ...weData,
                    targetSets: newTarget,
                  });
                }}
              >
                {t("addSet")}
              </Button>
            </div>
          );
        })}
      </div>

      {/* ---- Sticky action bar (replaces tab bar) ---- */}
      <div
        className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[560px] z-40 bg-surface-container border-t border-outline-variant"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-center justify-between gap-4 px-4 h-16">
          <RestTimer secondsTotal={restSeconds} trigger={restTrigger} />
          <Button
            variant="primary"
            fullWidth={false}
            className="px-6 shrink-0"
            onClick={handleFinishPress}
          >
            {t("finish")}
          </Button>
        </div>
      </div>

      {/* ---- Overflow sheet ---- */}
      <BottomSheet
        open={overflowOpen}
        onClose={() => setOverflowOpen(false)}
        title={t("options.title")}
      >
        <div className="space-y-2 pb-2">
          <button
            type="button"
            className="w-full text-left p-4 rounded-lg type-body-md text-on-surface active:bg-surface-container-high"
            onClick={() => {
              setOverflowOpen(false);
              setAddExOpen(true);
            }}
          >
            {t("add.title")}
          </button>
          <button
            type="button"
            className="w-full text-left p-4 rounded-lg type-body-md text-error active:bg-surface-container-high"
            onClick={() => void endEarly()}
          >
            {t("options.endEarly")}
          </button>
          {!anyLogged && (
            <button
              type="button"
              className="w-full text-left p-4 rounded-lg type-body-md text-on-surface-variant active:bg-surface-container-high"
              onClick={() => void skipWorkout()}
            >
              {t("options.skip")}
            </button>
          )}
        </div>
      </BottomSheet>

      {/* ---- Swap sheet ---- */}
      {swapWe && (
        <SwapSheet
          open={Boolean(swapWeId)}
          onClose={() => setSwapWeId(null)}
          exerciseId={exerciseIdOverrides.get(swapWe.id) ?? swapWe.exerciseId}
          we={swapWe}
          workout={w}
          onSwapped={(newId, _name) => {
            setExerciseIdOverrides((prev) => {
              const next = new Map(prev);
              next.set(swapWe.id, newId);
              return next;
            });
          }}
        />
      )}

      {/* ---- Remove exercise confirm sheet ---- */}
      {removeWe && (
        <RemoveExerciseSheet
          open={Boolean(removeWeId)}
          onClose={() => setRemoveWeId(null)}
          exerciseName={
            exMap.get(exerciseIdOverrides.get(removeWe.id) ?? removeWe.exerciseId)?.name ??
            t("exerciseFallback")
          }
          onConfirm={() => {
            void enqueue("workout_exercise", "delete", { id: removeWe.id });
            setRemoveWeId(null);
            toast(t("toasts.removed"));
          }}
        />
      )}

      {/* ---- Add exercise sheet ---- */}
      <AddExerciseSheet
        open={addExOpen}
        onClose={() => setAddExOpen(false)}
        workoutId={w.id}
        nextPosition={nextPosition}
        workout={w}
        allExercises={exercises.data ?? []}
      />

      {/* ---- Finish confirm (unlogged sets) ---- */}
      <FinishConfirmSheet
        open={finishOpen}
        onClose={() => setFinishOpen(false)}
        onConfirm={() => {
          setFinishOpen(false);
          void finishWorkout();
        }}
      />
    </AppShell>
  );
}
