import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Vibration,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/Button";
import { Stepper } from "../../components/ui/Stepper";
import { Sheet } from "../../components/ui/Sheet";
import { RestBar, useRestTimer } from "../../components/fitness/RestBar";
import { api } from "../../lib/api";
import { enqueue, flush, newId } from "../../lib/sync";
import { initHealthConnect, writeWorkoutSession } from "../../lib/health";
import { formatLoad, fromDisplay, toDisplay } from "../../lib/units";
import { fonts, radius, space, type Palette } from "../../lib/theme";
import { useTheme } from "../../lib/theme-context";
import { workoutName } from "../../lib/i18n";
import type {
  Exercise,
  SetEntry,
  Unit,
  User,
  WarmupMove,
  Workout,
  WorkoutExercise,
} from "../../lib/types";

// Per-exercise engine guidance (mirrors web/src/i18n/locales/en/common.json
// "exNotes" section). Falls back to the raw `notes` string when only that is set.
function exerciseNote(we: WorkoutExercise, t: (key: string) => string): string | null {
  if (we.noteCode) return t(`common.exNotes.${we.noteCode}`) || we.notes || null;
  return we.notes ?? null;
}

const RPE_VALUES: (number | undefined)[] = [
  undefined, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10,
];
function nextRpe(cur: number | undefined): number | undefined {
  const i = RPE_VALUES.indexOf(cur);
  return RPE_VALUES[(i + 1) % RPE_VALUES.length];
}

// ---- warm-up checklist ------------------------------------------------------

function WarmupCard({
  moves,
  styles,
  type,
  t,
}: {
  moves: WarmupMove[];
  styles: ReturnType<typeof makeStyles>;
  type: ReturnType<typeof useTheme>["type"];
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const [open, setOpen] = useState(true);
  const [done, setDone] = useState<Set<number>>(new Set());

  return (
    <View style={styles.warmup}>
      <Pressable style={styles.warmupHead} onPress={() => setOpen((v) => !v)}>
        <Text style={styles.warmupTitle}>{t("workout.warmup.title")}</Text>
        <Text style={styles.warmupChevron}>{open ? "▾" : "▸"}</Text>
      </Pressable>
      {open && (
        <View style={{ gap: space(1) }}>
          <Text style={[type.bodyVariant, { marginBottom: space(1) }]}>
            {t("workout.warmup.caption")}
          </Text>
          {moves.map((m, i) => {
            const on = done.has(i);
            return (
              <Pressable
                key={`${m.name}-${i}`}
                onPress={() =>
                  setDone((prev) => {
                    const next = new Set(prev);
                    next.has(i) ? next.delete(i) : next.add(i);
                    return next;
                  })
                }
                style={styles.warmupRow}
              >
                <View style={[styles.tick, on && styles.tickOn]}>
                  {on && <Text style={styles.tickGlyph}>✓</Text>}
                </View>
                <Text style={[styles.warmupMove, on && styles.warmupMoveDone]}>
                  {t(`common.warmupMoves.${m.name}`, { defaultValue: m.name })}
                </Text>
                <Text style={styles.warmupRx}>{m.prescription}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ---- one set row ------------------------------------------------------------

function SetRow({
  setNumber,
  suggestedLoadKg,
  suggestedReps,
  unit,
  logged,
  onLog,
  styles,
  type,
  t,
}: {
  setNumber: number;
  suggestedLoadKg: number;
  suggestedReps: number;
  unit: Unit;
  logged?: SetEntry;
  onLog: (loadKg: number, reps: number, rpe: number | undefined) => void;
  styles: ReturnType<typeof makeStyles>;
  type: ReturnType<typeof useTheme>["type"];
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const step = unit === "lb" ? 5 : 2.5;
  const precision = unit === "lb" ? 0 : 1;
  const initLoad =
    Math.round(toDisplay(logged?.loadKg ?? suggestedLoadKg, unit) / step) * step;

  const [load, setLoad] = useState<number>(initLoad);
  const [reps, setReps] = useState<number>(logged?.reps ?? suggestedReps);
  const [rpe, setRpe] = useState<number | undefined>(logged?.rpe);

  if (logged) {
    return (
      <View style={[styles.row, styles.rowLogged]}>
        <View style={styles.setChipDone}>
          <Text style={styles.setChipDoneText}>{setNumber}</Text>
        </View>
        <Text style={[type.data, { flex: 1 }]}>
          {formatLoad(logged.loadKg, unit)}  ×{logged.reps}
        </Text>
        {logged.rpe !== undefined && (
          <Text style={styles.rpeTag}>{t("workout.rpe", { value: logged.rpe })}</Text>
        )}
        <View style={styles.checkDone}>
          <Text style={styles.checkGlyph}>✓</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.row, styles.rowWorking]}>
      <View style={styles.line1}>
        <View style={styles.setChip}>
          <Text style={styles.setChipText}>{setNumber}</Text>
        </View>
        <Stepper
          value={load}
          onChange={setLoad}
          step={step}
          min={0}
          precision={precision}
          caption={`${t("workout.logger.load")} (${unit})`}
        />
        <Stepper
          value={reps}
          onChange={setReps}
          step={1}
          min={1}
          precision={0}
          caption={t("workout.logger.reps")}
        />
      </View>
      <View style={styles.line2}>
        <Pressable
          accessibilityLabel={
            rpe !== undefined
              ? t("workout.aria.rpe", { value: rpe })
              : t("workout.aria.rpeNone")
          }
          onPress={() => setRpe((r) => nextRpe(r))}
          style={[styles.rpeBtn, rpe !== undefined && styles.rpeBtnOn]}
        >
          <Text style={[styles.rpeBtnText, rpe !== undefined && styles.rpeBtnTextOn]}>
            {rpe !== undefined ? t("workout.rpe", { value: rpe }) : t("workout.rpeShort")}
          </Text>
        </Pressable>
        <Pressable
          accessibilityLabel={t("workout.aria.logSet")}
          onPress={() => onLog(fromDisplay(load, unit), reps, rpe)}
          style={({ pressed }) => [styles.check, pressed && styles.checkPressed]}
        >
          <Text style={styles.checkGlyph}>✓</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---- screen -----------------------------------------------------------------

type SetKey = string;

export default function ActiveWorkout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const rest = useRestTimer();
  const { t } = useTranslation();
  const { colors, type } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [workout, setWorkout] = useState<Workout | null>(null);
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [unit, setUnit] = useState<Unit>("kg");
  const [localSets, setLocalSets] = useState<Map<SetKey, SetEntry>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);

  // Local edit state (optimistic; the outbox persists the real ops)
  const [exerciseIdOverrides, setExerciseIdOverrides] = useState<Map<string, string>>(new Map());
  const [removedWeIds, setRemovedWeIds] = useState<Set<string>>(new Set());
  const [localTargets, setLocalTargets] = useState<Map<string, number>>(new Map());
  const [addedWes, setAddedWes] = useState<WorkoutExercise[]>([]);

  // Sheets
  const [swapWe, setSwapWe] = useState<WorkoutExercise | null>(null);
  const [swapSub, setSwapSub] = useState<Exercise | null>(null);
  const [swapLoading, setSwapLoading] = useState(false);
  const [removeWe, setRemoveWe] = useState<WorkoutExercise | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [ending, setEnding] = useState(false);

  const exMap = useMemo(
    () => new Map(allExercises.map((e) => [e.id, e])),
    [allExercises],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [w, exercises, me] = await Promise.all([
          api.getWorkout(id),
          api.getExercises(),
          api.getMe().catch(() => null as User | null),
        ]);
        if (cancelled) return;
        setWorkout(w);
        setAllExercises(exercises);
        if (me) setUnit(me.unit);
        if (w.status === "planned") {
          void enqueue("workout", "upsert", {
            ...w,
            status: "in_progress",
            startedAt: new Date().toISOString(),
          });
        }
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : t("workout.couldntLoad"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const mergedSetsFor = useCallback(
    (we: WorkoutExercise): SetEntry[] => {
      const merged = new Map<number, SetEntry>();
      (we.sets ?? []).forEach((s) => merged.set(s.setNumber, s));
      localSets.forEach((s, k) => {
        if (k.startsWith(we.id + ":")) merged.set(s.setNumber, s);
      });
      return [...merged.values()].sort((a, b) => a.setNumber - b.setNumber);
    },
    [localSets],
  );

  const logSet = useCallback(
    (we: WorkoutExercise, setNumber: number, loadKg: number, reps: number, rpe: number | undefined) => {
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
      setLocalSets((prev) => new Map(prev).set(`${we.id}:${setNumber}`, entry));
      void enqueue("set", "upsert", entry);
      Vibration.vibrate(10);
      rest.start(we.restSeconds);
    },
    [rest],
  );

  const markEdited = useCallback(() => {
    if (!workout) return;
    const { exercises: _ex, ...w } = workout;
    void enqueue("workout", "upsert", { ...w, edited: true });
  }, [workout]);

  // ---- swap ----
  async function openSwap(we: WorkoutExercise) {
    setSwapWe(we);
    setSwapSub(null);
    setSwapLoading(true);
    try {
      const effectiveId = exerciseIdOverrides.get(we.id) ?? we.exerciseId;
      const sub = await api.getSubstitute(effectiveId);
      setSwapSub(sub);
    } catch {
      setSwapSub(null);
    } finally {
      setSwapLoading(false);
    }
  }

  function doSwap() {
    if (!swapWe || !swapSub) return;
    const { sets: _sets, ...weData } = swapWe;
    void enqueue("workout_exercise", "upsert", { ...weData, exerciseId: swapSub.id });
    markEdited();
    setExerciseIdOverrides((prev) => new Map(prev).set(swapWe.id, swapSub.id));
    setSwapWe(null);
  }

  // ---- remove ----
  function doRemove() {
    if (!removeWe) return;
    void enqueue("workout_exercise", "delete", { id: removeWe.id });
    markEdited();
    setRemovedWeIds((prev) => new Set(prev).add(removeWe.id));
    setRemoveWe(null);
  }

  // ---- add set ----
  function addSet(we: WorkoutExercise, visibleRows: number) {
    const newTarget = visibleRows + 1;
    setLocalTargets((prev) => new Map(prev).set(we.id, newTarget));
    const { sets: _sets, ...weData } = we;
    void enqueue("workout_exercise", "upsert", { ...weData, targetSets: newTarget });
  }

  // ---- add exercise ----
  function addExercise(ex: Exercise) {
    if (!workout) return;
    const rows = [...(workout.exercises ?? []), ...addedWes];
    const nextPosition =
      rows.length > 0 ? Math.max(...rows.map((r) => r.position)) + 1 : 1;
    const we: WorkoutExercise = {
      id: newId(),
      workoutId: workout.id,
      exerciseId: ex.id,
      position: nextPosition,
      targetSets: 3,
      targetRepsMin: 8,
      targetRepsMax: 12,
      restSeconds: 90,
    };
    void enqueue("workout_exercise", "upsert", we);
    markEdited();
    setAddedWes((prev) => [...prev, we]);
    setAddOpen(false);
    setSearch("");
  }

  const onFinish = useCallback(async () => {
    if (!workout) return;
    setFinishing(true);
    const { exercises: _ex, ...w } = workout;
    const completedAt = new Date().toISOString();
    void enqueue("workout", "upsert", {
      ...w,
      status: "completed",
      completedAt,
    });
    await flush();
    // Best-effort Health Connect write — must never block navigation.
    void (async () => {
      try {
        if (await initHealthConnect()) {
          await writeWorkoutSession({
            name: workout.name,
            startedAt: workout.startedAt ?? completedAt,
            completedAt,
          });
        }
      } catch {
        // ignore — health sync is best-effort
      }
    })();
    router.replace("/today");
  }, [workout, router]);

  const exercises = useMemo(
    () =>
      [...(workout?.exercises ?? []), ...addedWes].filter(
        (we) => !removedWeIds.has(we.id),
      ),
    [workout, addedWes, removedWeIds],
  );

  const anyLogged = useMemo(() => {
    if (localSets.size > 0) return true;
    return exercises.some((we) => (we.sets?.length ?? 0) > 0);
  }, [exercises, localSets]);

  const endWorkoutEarly = useCallback(async () => {
    if (!workout) return;
    setEnding(true);
    const { exercises: _ex, ...w } = workout;
    void enqueue("workout", "upsert", {
      ...w,
      status: "aborted",
      completedAt: new Date().toISOString(),
    });
    await flush();
    setOptionsOpen(false);
    router.replace("/today");
  }, [workout, router]);

  const skipWorkoutNow = useCallback(async () => {
    if (!workout) return;
    setEnding(true);
    const { exercises: _ex, ...w } = workout;
    void enqueue("workout", "upsert", { ...w, status: "skipped" });
    await flush();
    setOptionsOpen(false);
    router.replace("/today");
  }, [workout, router]);
  const isReadOnly =
    workout?.status === "completed" ||
    workout?.status === "aborted" ||
    workout?.status === "skipped";

  const filteredLibrary = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? allExercises.filter((e) => e.name.toLowerCase().includes(q))
      : allExercises;
    return list.slice(0, 30);
  }, [allExercises, search]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !workout) {
    return (
      <SafeAreaView style={styles.safe}>
        <TopBar title={t("workout.fallbackTitle")} onBack={() => router.back()} styles={styles} type={type} t={t} />
        <View style={styles.center}>
          <Text style={type.bodyVariant}>{error ?? t("workout.notFound")}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ---- read-only summary (completed / aborted / skipped) ----
  if (isReadOnly) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <TopBar title={workoutName(workout.name, t)} onBack={() => router.back()} styles={styles} type={type} t={t} />
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={[type.label, { marginBottom: space(3) }]}>
            {t(`common.status.${workout.status}`)}
          </Text>
          {(workout.exercises ?? []).map((we) => {
            const ex = exMap.get(we.exerciseId);
            const sets = we.sets ?? [];
            const volume = sets.reduce((s, e) => s + e.loadKg * e.reps, 0);
            return (
              <View key={we.id} style={styles.summaryCard}>
                <Text style={type.title}>{ex?.name ?? t("workout.exerciseFallback")}</Text>
                {sets.length === 0 ? (
                  <Text style={[type.bodyVariant, { marginTop: space(1) }]}>{t("workout.summary.noSets")}</Text>
                ) : (
                  sets.map((s) => (
                    <Text key={s.id} style={[type.bodyVariant, { marginTop: space(1) }]}>
                      {s.setNumber}.  {formatLoad(s.loadKg, unit)} × {s.reps}
                      {s.rpe !== undefined ? `  · ${t("workout.rpe", { value: s.rpe })}` : ""}
                    </Text>
                  ))
                )}
                {sets.length > 0 && (
                  <Text style={[type.label, { marginTop: space(2) }]}>
                    {t("workout.summary.volume", { volume: formatLoad(volume, unit) })}
                  </Text>
                )}
              </View>
            );
          })}
          <Button
            label={t("workout.summary.backToToday")}
            variant="secondary"
            onPress={() => router.replace("/today")}
            style={{ marginTop: space(4) }}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ---- active logging ----
  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <TopBar
        title={workoutName(workout.name, t)}
        onBack={() => router.back()}
        onAdd={() => setAddOpen(true)}
        onOptions={() => setOptionsOpen(true)}
        styles={styles}
        type={type}
        t={t}
      />
      <ScrollView contentContainerStyle={styles.scroll}>
        {workout.warmup && workout.warmup.length > 0 && (
          <WarmupCard moves={workout.warmup} styles={styles} type={type} t={t} />
        )}

        {exercises.map((we) => {
          const effectiveExId = exerciseIdOverrides.get(we.id) ?? we.exerciseId;
          const ex = exMap.get(effectiveExId);
          const merged = mergedSetsFor(we);
          const loggedCount = merged.filter((s) => s.completed).length;
          const rows = Math.max(we.targetSets, loggedCount, localTargets.get(we.id) ?? 0);
          const lastLoad =
            merged.filter((s) => s.completed).at(-1)?.loadKg ?? we.targetLoadKg ?? 0;
          const repsLabel =
            we.targetRepsMin === we.targetRepsMax
              ? `${we.targetRepsMin}`
              : `${we.targetRepsMin}–${we.targetRepsMax}`;

          return (
            <View key={we.id} style={styles.exercise}>
              <View style={styles.exerciseHead}>
                <Pressable
                  style={{ flex: 1 }}
                  onPress={() => router.push(`/exercise/${effectiveExId}`)}
                >
                  <Text style={[type.title]} numberOfLines={2}>
                    {ex?.name ?? t("workout.exerciseFallback")} <Text style={styles.infoGlyph}>ⓘ</Text>
                  </Text>
                </Pressable>
                <View style={styles.targetChip}>
                  <Text style={styles.targetChipText}>
                    {we.targetSets}×{repsLabel}
                  </Text>
                </View>
                <Pressable
                  accessibilityLabel={t("workout.swap.aria")}
                  onPress={() => void openSwap(we)}
                  style={styles.iconBtn}
                >
                  <Text style={styles.iconBtnText}>⇄</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel={t("workout.remove.aria")}
                  onPress={() => setRemoveWe(we)}
                  style={styles.iconBtn}
                >
                  <Text style={styles.iconBtnText}>✕</Text>
                </Pressable>
              </View>

              {exerciseNote(we, t) && (
                <Text style={type.bodyVariant}>{exerciseNote(we, t)}</Text>
              )}

              <View style={{ gap: space(2) }}>
                {Array.from({ length: rows }, (_, i) => {
                  const setNumber = i + 1;
                  const logged = merged.find((s) => s.setNumber === setNumber);
                  const prev = merged
                    .filter((s) => s.setNumber < setNumber && s.completed)
                    .at(-1);
                  return (
                    <SetRow
                      key={setNumber}
                      setNumber={setNumber}
                      suggestedLoadKg={prev?.loadKg ?? lastLoad}
                      suggestedReps={we.targetRepsMin}
                      unit={unit}
                      logged={logged}
                      onLog={(loadKg, reps, rpe) => logSet(we, setNumber, loadKg, reps, rpe)}
                      styles={styles}
                      type={type}
                      t={t}
                    />
                  );
                })}
              </View>

              <Pressable onPress={() => addSet(we, rows)} style={styles.addSet}>
                <Text style={styles.addSetText}>{t("workout.addSet")}</Text>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>

      {/* sticky bottom: rest banner + finish */}
      <View>
        <RestBar timer={rest} />
        <View style={styles.finishRow}>
          <Button label={t("workout.finish")} onPress={onFinish} loading={finishing} />
        </View>
      </View>

      {/* ---- options sheet ---- */}
      <Sheet
        open={optionsOpen}
        onClose={() => setOptionsOpen(false)}
        title={t("workout.options.title")}
      >
        <View style={{ gap: space(2) }}>
          <Button
            label={t("workout.options.endEarly")}
            variant="destructive"
            onPress={() => void endWorkoutEarly()}
            loading={ending}
          />
          {!anyLogged && (
            <Button
              label={t("workout.options.skip")}
              variant="ghost"
              onPress={() => void skipWorkoutNow()}
              loading={ending}
            />
          )}
        </View>
      </Sheet>

      {/* ---- swap sheet ---- */}
      <Sheet
        open={swapWe !== null}
        onClose={() => setSwapWe(null)}
        title={t("workout.swap.title")}
      >
        {swapLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : swapSub ? (
          <View style={{ gap: space(3) }}>
            <Text style={type.title}>{swapSub.name}</Text>
            {swapSub.formCues.slice(0, 2).map((cue, i) => (
              <Text key={i} style={type.bodyVariant}>
                {i + 1}. {cue}
              </Text>
            ))}
            <Button label={t("workout.swap.swapTo", { name: swapSub.name })} onPress={doSwap} />
          </View>
        ) : (
          <Text style={type.bodyVariant}>
            {t("workout.swap.none")}
          </Text>
        )}
      </Sheet>

      {/* ---- remove confirm ---- */}
      <Sheet
        open={removeWe !== null}
        onClose={() => setRemoveWe(null)}
        title={t("workout.remove.title")}
      >
        <View style={{ gap: space(3) }}>
          <Text style={type.bodyVariant}>
            {t("workout.remove.body", {
              name:
                exMap.get(
                  exerciseIdOverrides.get(removeWe?.id ?? "") ??
                    removeWe?.exerciseId ??
                    "",
                )?.name ?? t("workout.remove.fallbackName"),
            })}
          </Text>
          <Button label={t("workout.remove.confirm")} variant="destructive" onPress={doRemove} />
          <Button label={t("workout.remove.keep")} variant="ghost" onPress={() => setRemoveWe(null)} />
        </View>
      </Sheet>

      {/* ---- add exercise ---- */}
      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title={t("workout.add.title")}>
        <View style={{ gap: space(3) }}>
          <TextInput
            placeholder={t("workout.add.searchPlaceholder")}
            placeholderTextColor={colors.onSurfaceVariant}
            value={search}
            onChangeText={setSearch}
            style={styles.search}
          />
          <View style={{ gap: space(2) }}>
            {filteredLibrary.map((ex) => (
              <Pressable key={ex.id} onPress={() => addExercise(ex)} style={styles.addRow}>
                <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>
                  {ex.name}
                </Text>
                <Text style={styles.addRowMeta}>{ex.primaryMuscles[0] ?? ""}</Text>
              </Pressable>
            ))}
            {filteredLibrary.length === 0 && (
              <Text style={type.bodyVariant}>{t("workout.add.noResults")}</Text>
            )}
          </View>
        </View>
      </Sheet>
    </SafeAreaView>
  );
}

function TopBar({
  title,
  onBack,
  onAdd,
  onOptions,
  styles,
  type,
  t,
}: {
  title: string;
  onBack: () => void;
  onAdd?: () => void;
  onOptions?: () => void;
  styles: ReturnType<typeof makeStyles>;
  type: ReturnType<typeof useTheme>["type"];
  t: (key: string) => string;
}) {
  return (
    <View style={styles.topbar}>
      <Pressable onPress={onBack} hitSlop={8} style={{ width: 56 }}>
        <Text style={styles.back}>‹ {t("common.back")}</Text>
      </Pressable>
      <Text style={[type.title, { flex: 1, textAlign: "center" }]} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.topbarActions}>
        {onOptions ? (
          <Pressable accessibilityLabel={t("workout.options.title")} onPress={onOptions} hitSlop={8} style={styles.topbarIcon}>
            <Text style={styles.addGlyph}>⋯</Text>
          </Pressable>
        ) : null}
        {onAdd ? (
          <Pressable accessibilityLabel={t("workout.add.title")} onPress={onAdd} hitSlop={8} style={styles.topbarIcon}>
            <Text style={styles.addGlyph}>＋</Text>
          </Pressable>
        ) : null}
        {!onAdd && !onOptions ? <View style={{ width: 56 }} /> : null}
      </View>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.surface },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    topbar: {
      height: 56,
      paddingHorizontal: space(4),
      flexDirection: "row",
      alignItems: "center",
      gap: space(2),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.outlineVariant,
    },
    back: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.onSurfaceVariant },
    topbarActions: { flexDirection: "row", alignItems: "center" },
    topbarIcon: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
    addGlyph: { fontFamily: fonts.bodyMedium, fontSize: 22, color: colors.primary },
    scroll: { padding: space(4), gap: space(5), paddingBottom: space(8) },

    exercise: { gap: space(2) },
    exerciseHead: { flexDirection: "row", alignItems: "center", gap: space(2) },
    infoGlyph: { fontSize: 13, color: colors.onSurfaceVariant },
    targetChip: {
      paddingHorizontal: space(2),
      paddingVertical: space(1),
      borderRadius: radius.base,
      backgroundColor: colors.surfaceContainerHigh,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
    },
    targetChipText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.onSurfaceVariant },
    iconBtn: {
      width: 40,
      height: 40,
      borderRadius: radius.base,
      alignItems: "center",
      justifyContent: "center",
    },
    iconBtnText: { fontSize: 16, color: colors.onSurfaceVariant },

    // warm-up
    warmup: {
      backgroundColor: colors.surfaceContainer,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      padding: space(3),
      gap: space(1),
    },
    warmupHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 32 },
    warmupTitle: { fontFamily: fonts.bodyMedium, fontSize: 12, letterSpacing: 1, color: colors.onSurfaceVariant },
    warmupChevron: { fontSize: 14, color: colors.onSurfaceVariant },
    warmupRow: { flexDirection: "row", alignItems: "center", gap: space(2), minHeight: 40 },
    tick: {
      width: 22,
      height: 22,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      backgroundColor: colors.surfaceContainerHighest,
      alignItems: "center",
      justifyContent: "center",
    },
    tickOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    tickGlyph: { fontSize: 12, color: colors.onPrimary },
    warmupMove: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.onSurface },
    warmupMoveDone: { color: colors.onSurfaceVariant, textDecorationLine: "line-through" },
    warmupRx: { fontFamily: fonts.headMedium, fontSize: 13, color: colors.onSurfaceVariant },

    // set rows
    row: { borderRadius: radius.lg, paddingHorizontal: space(3), paddingVertical: space(2) },
    rowWorking: { backgroundColor: colors.surfaceContainerHigh, gap: space(2) },
    rowLogged: {
      backgroundColor: colors.surfaceContainer,
      borderLeftWidth: 2,
      borderLeftColor: colors.primary,
      flexDirection: "row",
      alignItems: "center",
      gap: space(3),
    },
    line1: { flexDirection: "row", alignItems: "flex-end", gap: space(2) },
    line2: { flexDirection: "row", alignItems: "center", gap: space(2) },

    setChip: { width: 24, height: 44, alignItems: "center", justifyContent: "center" },
    setChipText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.onSurfaceVariant },
    setChipDone: {
      width: 24,
      height: 24,
      borderRadius: radius.pill,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    setChipDoneText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.onPrimary },

    rpeBtn: {
      height: 40,
      minWidth: 64,
      paddingHorizontal: space(3),
      borderRadius: radius.base,
      backgroundColor: colors.surfaceContainerHighest,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      alignItems: "center",
      justifyContent: "center",
    },
    rpeBtnOn: { backgroundColor: colors.primaryContainer, borderColor: colors.primary },
    rpeBtnText: { fontFamily: fonts.headMedium, fontSize: 13, color: colors.onSurfaceVariant },
    rpeBtnTextOn: { color: colors.onPrimaryContainer },
    rpeTag: { fontFamily: fonts.headMedium, fontSize: 12, color: colors.onSurfaceVariant },

    check: {
      marginLeft: "auto",
      width: 44,
      height: 44,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceContainerHighest,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      alignItems: "center",
      justifyContent: "center",
    },
    checkPressed: { backgroundColor: colors.primary },
    checkDone: {
      width: 32,
      height: 32,
      borderRadius: radius.pill,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    checkGlyph: { fontSize: 18, color: colors.onSurface },

    addSet: { minHeight: 40, justifyContent: "center", paddingHorizontal: space(1) },
    addSetText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.onSurfaceVariant },

    // summary
    summaryCard: {
      backgroundColor: colors.surfaceContainer,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      padding: space(4),
      marginBottom: space(3),
    },

    finishRow: {
      paddingHorizontal: space(4),
      paddingTop: space(3),
      paddingBottom: space(2),
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.outlineVariant,
      backgroundColor: colors.surface,
    },

    search: {
      height: 48,
      borderRadius: radius.base,
      backgroundColor: colors.surfaceContainerLow,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      paddingHorizontal: space(4),
      fontFamily: fonts.body,
      fontSize: 15,
      color: colors.onSurface,
    },
    addRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: space(2),
      backgroundColor: colors.surfaceContainerHigh,
      borderRadius: radius.base,
      padding: space(3),
    },
    addRowMeta: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.onSurfaceVariant },
  });
