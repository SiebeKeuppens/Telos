import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../../components/ui/Button";
import { Stepper } from "../../components/ui/Stepper";
import { api } from "../../lib/api";
import { enqueue, flush, newId } from "../../lib/sync";
import { formatLoad, fromDisplay, toDisplay } from "../../lib/units";
import { colors, fonts, radius, space, type } from "../../lib/theme";
import type {
  Exercise,
  SetEntry,
  Unit,
  User,
  Workout,
  WorkoutExercise,
} from "../../lib/types";

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
  onLog: (loadKg: number, reps: number) => void;
}) {
  const step = unit === "lb" ? 5 : 2.5;
  const precision = unit === "lb" ? 0 : 1;
  const initLoad =
    Math.round(toDisplay(logged?.loadKg ?? suggestedLoadKg, unit) / step) * step;

  const [load, setLoad] = useState<number>(initLoad);
  const [reps, setReps] = useState<number>(logged?.reps ?? suggestedReps);

  if (logged) {
    return (
      <View style={[styles.row, styles.rowLogged]}>
        <View style={styles.setChipDone}>
          <Text style={styles.setChipDoneText}>{setNumber}</Text>
        </View>
        <Text style={[type.data, { flex: 1 }]}>
          {formatLoad(logged.loadKg, unit)} {"  ×"}
          {logged.reps}
        </Text>
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
        <Stepper
          value={reps}
          onChange={setReps}
          step={1}
          min={1}
          precision={0}
          caption="reps"
        />
      </View>
      <View style={styles.line2}>
        <Pressable
          accessibilityLabel="Log set"
          onPress={() => onLog(fromDisplay(load, unit), reps)}
          style={({ pressed }) => [styles.check, pressed && styles.checkPressed]}
        >
          <Text style={styles.checkGlyph}>✓</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---- screen -----------------------------------------------------------------

type SetKey = string; // `${weId}:${setNumber}`

export default function ActiveWorkout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

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

        // Mark the session in progress the first time it's opened.
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
    (we: WorkoutExercise, setNumber: number, loadKg: number, reps: number) => {
      const entry: SetEntry = {
        id: newId(),
        workoutExerciseId: we.id,
        setNumber,
        loadKg,
        reps,
        completed: true,
        loggedAt: new Date().toISOString(),
      };
      setLocalSets((prev) => new Map(prev).set(`${we.id}:${setNumber}`, entry));
      void enqueue("set", "upsert", entry);
    },
    [],
  );

  const suggestedLoadKg = useCallback(
    (we: WorkoutExercise, mergedSets: SetEntry[]): number => {
      if (mergedSets.length > 0) return mergedSets[mergedSets.length - 1].loadKg;
      return we.targetLoadKg ?? 0;
    },
    [],
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
        <View style={styles.topbar}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Text style={styles.back}>‹ Back</Text>
          </Pressable>
        </View>
        <View style={styles.center}>
          <Text style={type.bodyVariant}>{error ?? "Workout not found."}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={[type.title, { flex: 1, textAlign: "center" }]} numberOfLines={1}>
          {workout.name}
        </Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {exercises.map((we) => {
          const ex = exMap.get(we.exerciseId);
          const merged = mergedSetsFor(we);
          const loggedCount = merged.filter((s) => s.completed).length;
          const rows = Math.max(we.targetSets, loggedCount);
          const suggest = suggestedLoadKg(we, merged);
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
                      suggestedLoadKg={prev?.loadKg ?? suggest}
                      suggestedReps={we.targetRepsMin}
                      unit={unit}
                      logged={logged}
                      onLog={(loadKg, reps) => logSet(we, setNumber, loadKg, reps)}
                    />
                  );
                })}
              </View>
            </View>
          );
        })}

        <Button label="Finish workout" onPress={onFinish} loading={finishing} style={styles.finish} />
      </ScrollView>
    </SafeAreaView>
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
  back: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.onSurfaceVariant, width: 48 },
  scroll: { padding: space(4), gap: space(5), paddingBottom: space(12) },
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
  line2: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end" },

  setChip: {
    width: 24,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
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

  check: {
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

  finish: { marginTop: space(4) },
});
