import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  Vibration,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../../components/ui/Button";
import { Stepper } from "../../components/ui/Stepper";
import { RestBar, useRestTimer } from "../../components/fitness/RestBar";
import { api } from "../../lib/api";
import { enqueue, flush, newId } from "../../lib/sync";
import { formatLoad, fromDisplay, toDisplay } from "../../lib/units";
import { colors, fonts, radius, space, type } from "../../lib/theme";
import type {
  Exercise,
  SetEntry,
  Unit,
  User,
  WarmupMove,
  Workout,
  WorkoutExercise,
} from "../../lib/types";

const WARMUP_LABELS: Record<string, string> = {
  jumping_jacks: "Jumping jacks",
  arm_circles: "Arm circles",
  leg_swings: "Leg swings",
  bodyweight_squats: "Bodyweight squats",
  hip_openers: "Hip openers",
  wall_slides: "Wall slides",
  scap_pushups: "Scapular push-ups",
  prone_yt_raises: "Prone Y-T raises",
};

const RPE_VALUES: (number | undefined)[] = [
  undefined, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10,
];
function nextRpe(cur: number | undefined): number | undefined {
  const i = RPE_VALUES.indexOf(cur);
  return RPE_VALUES[(i + 1) % RPE_VALUES.length];
}

// ---- warm-up checklist ------------------------------------------------------

function WarmupCard({ moves }: { moves: WarmupMove[] }) {
  const [open, setOpen] = useState(true);
  const [done, setDone] = useState<Set<number>>(new Set());

  return (
    <View style={styles.warmup}>
      <Pressable style={styles.warmupHead} onPress={() => setOpen((v) => !v)}>
        <Text style={styles.warmupTitle}>WARM-UP</Text>
        <Text style={styles.warmupChevron}>{open ? "▾" : "▸"}</Text>
      </Pressable>
      {open && (
        <View style={{ gap: space(1) }}>
          <Text style={[type.bodyVariant, { marginBottom: space(1) }]}>
            2–3 minutes of movement prep — tap as you go.
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
                  {WARMUP_LABELS[m.name] ?? m.name}
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
}: {
  setNumber: number;
  suggestedLoadKg: number;
  suggestedReps: number;
  unit: Unit;
  logged?: SetEntry;
  onLog: (loadKg: number, reps: number, rpe: number | undefined) => void;
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
          <Text style={styles.rpeTag}>RPE {logged.rpe}</Text>
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
          caption={`load (${unit})`}
        />
        <Stepper value={reps} onChange={setReps} step={1} min={1} precision={0} caption="reps" />
      </View>
      <View style={styles.line2}>
        <Pressable
          accessibilityLabel={`RPE ${rpe ?? "none"}`}
          onPress={() => setRpe((r) => nextRpe(r))}
          style={[styles.rpeBtn, rpe !== undefined && styles.rpeBtnOn]}
        >
          <Text style={[styles.rpeBtnText, rpe !== undefined && styles.rpeBtnTextOn]}>
            {rpe !== undefined ? `RPE ${rpe}` : "RPE –"}
          </Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Log set"
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

  const [workout, setWorkout] = useState<Workout | null>(null);
  const [exMap, setExMap] = useState<Map<string, Exercise>>(new Map());
  const [unit, setUnit] = useState<Unit>("kg");
  const [localSets, setLocalSets] = useState<Map<SetKey, SetEntry>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);

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
        setExMap(new Map(exercises.map((e) => [e.id, e])));
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
          setError(e instanceof Error ? e.message : "Couldn't load the workout.");
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

  const onFinish = useCallback(async () => {
    if (!workout) return;
    setFinishing(true);
    void enqueue("workout", "upsert", {
      ...workout,
      status: "completed",
      completedAt: new Date().toISOString(),
    });
    await flush();
    router.replace("/today");
  }, [workout, router]);

  const exercises = useMemo(() => workout?.exercises ?? [], [workout]);
  const isReadOnly =
    workout?.status === "completed" ||
    workout?.status === "aborted" ||
    workout?.status === "skipped";

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
        <TopBar title="Workout" onBack={() => router.back()} />
        <View style={styles.center}>
          <Text style={type.bodyVariant}>{error ?? "Workout not found."}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ---- read-only summary (completed / aborted / skipped) ----
  if (isReadOnly) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <TopBar title={workout.name} onBack={() => router.back()} />
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={[type.label, { marginBottom: space(3) }]}>
            {workout.status.toUpperCase()}
          </Text>
          {exercises.map((we) => {
            const ex = exMap.get(we.exerciseId);
            const sets = we.sets ?? [];
            const volume = sets.reduce((s, e) => s + e.loadKg * e.reps, 0);
            return (
              <View key={we.id} style={styles.summaryCard}>
                <Text style={type.title}>{ex?.name ?? "Exercise"}</Text>
                {sets.length === 0 ? (
                  <Text style={[type.bodyVariant, { marginTop: space(1) }]}>No sets logged</Text>
                ) : (
                  sets.map((s) => (
                    <Text key={s.id} style={[type.bodyVariant, { marginTop: space(1) }]}>
                      {s.setNumber}.  {formatLoad(s.loadKg, unit)} × {s.reps}
                      {s.rpe !== undefined ? `  · RPE ${s.rpe}` : ""}
                    </Text>
                  ))
                )}
                {sets.length > 0 && (
                  <Text style={[type.label, { marginTop: space(2) }]}>
                    VOLUME {formatLoad(volume, unit)}
                  </Text>
                )}
              </View>
            );
          })}
          <Button label="Back to Today" variant="secondary" onPress={() => router.replace("/today")} style={{ marginTop: space(4) }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ---- active logging ----
  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <TopBar title={workout.name} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll}>
        {workout.warmup && workout.warmup.length > 0 && (
          <WarmupCard moves={workout.warmup} />
        )}

        {exercises.map((we) => {
          const ex = exMap.get(we.exerciseId);
          const merged = mergedSetsFor(we);
          const loggedCount = merged.filter((s) => s.completed).length;
          const rows = Math.max(we.targetSets, loggedCount);
          const lastLoad =
            merged.filter((s) => s.completed).at(-1)?.loadKg ?? we.targetLoadKg ?? 0;
          const repsLabel =
            we.targetRepsMin === we.targetRepsMax
              ? `${we.targetRepsMin}`
              : `${we.targetRepsMin}–${we.targetRepsMax}`;

          return (
            <View key={we.id} style={styles.exercise}>
              <View style={styles.exerciseHead}>
                <Text style={[type.title, { flex: 1 }]} numberOfLines={2}>
                  {ex?.name ?? "Exercise"}
                </Text>
                <View style={styles.targetChip}>
                  <Text style={styles.targetChipText}>
                    {we.targetSets}×{repsLabel}
                  </Text>
                </View>
              </View>

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
                    />
                  );
                })}
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* sticky bottom: rest banner + finish */}
      <View>
        <RestBar timer={rest} />
        <View style={styles.finishRow}>
          <Button label="Finish workout" onPress={onFinish} loading={finishing} />
        </View>
      </View>
    </SafeAreaView>
  );
}

function TopBar({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.topbar}>
      <Pressable onPress={onBack} hitSlop={8} style={{ width: 56 }}>
        <Text style={styles.back}>‹ Back</Text>
      </Pressable>
      <Text style={[type.title, { flex: 1, textAlign: "center" }]} numberOfLines={1}>
        {title}
      </Text>
      <View style={{ width: 56 }} />
    </View>
  );
}

const styles = StyleSheet.create({
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
  scroll: { padding: space(4), gap: space(5), paddingBottom: space(8) },

  exercise: { gap: space(2) },
  exerciseHead: { flexDirection: "row", alignItems: "center", gap: space(2) },
  targetChip: {
    paddingHorizontal: space(2),
    paddingVertical: space(1),
    borderRadius: radius.base,
    backgroundColor: colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  targetChipText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.onSurfaceVariant },

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
});
