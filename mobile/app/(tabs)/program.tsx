import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Button } from "../../components/ui/Button";
import { Badge, statusTone } from "../../components/ui/Badge";
import { Arc } from "../../components/fitness/Arc";
import { Sheet } from "../../components/ui/Sheet";
import { SyncChip } from "../../components/shell/SyncChip";
import { api, safeFetch } from "../../lib/api";
import { getToken } from "../../lib/auth";
import { config } from "../../lib/config";
import { fmtDay } from "../../lib/dates";
import { enqueue } from "../../lib/sync";
import { workoutName } from "../../lib/i18n";
import { fonts, radius, space, withAlpha, type Palette, type TypeScale } from "../../lib/theme";
import { useTheme } from "../../lib/theme-context";
import type { Exercise, ProgramView, Workout, WorkoutExercise, WorkoutStatus } from "../../lib/types";

/** Engine notes are codes; recovery-flavoured ones get the warning tint —
 * mirrors web Program.tsx's isWarningNote(). */
function isWarningNote(code: string): boolean {
  return code.startsWith("deload_") || code === "eased_today";
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

/** POST /program/regenerate — not yet in lib/api.ts, so this calls the same
 * endpoint directly (mirrors web api.regenerate()) rather than depending on
 * a change to a file outside this screen. */
async function regenerateProgram(): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error("not signed in");
  const res = await safeFetch(`${config.apiV1}/program/regenerate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

function WorkoutCard({
  workout,
  exerciseMap,
  styles,
  type,
  colors,
  t,
}: {
  workout: Workout;
  exerciseMap: Map<string, string>;
  styles: ReturnType<typeof makeStyles>;
  type: TypeScale;
  colors: Palette;
  t: TFunction;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const exercises: WorkoutExercise[] = workout.exercises ?? [];
  const preview = exercises.slice(0, 4);
  const overflow = exercises.length > 4 ? exercises.length - 4 : 0;

  const STATUS_LABEL: Partial<Record<WorkoutStatus, string>> = {
    completed: t("common.status.completed"),
    in_progress: t("common.status.in_progress"),
    skipped: t("common.status.skipped"),
    aborted: t("common.status.aborted"),
  };
  const statusLabel = STATUS_LABEL[workout.status];

  const handleStart = async () => {
    await enqueue("workout", "upsert", {
      ...workout,
      status: "in_progress",
      startedAt: new Date().toISOString(),
    });
    router.push(`/workout/${workout.id}`);
  };
  const goToWorkout = () => router.push(`/workout/${workout.id}`);

  return (
    <View style={styles.workoutCard}>
      <Pressable
        style={styles.workoutHeader}
        onPress={() => setExpanded((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.workoutTitleRow}>
            <Text style={type.title} numberOfLines={1}>
              {workoutName(workout.name, t)}
            </Text>
            {statusLabel && <Badge label={statusLabel} tone={statusTone(workout.status)} />}
          </View>
          {workout.scheduledFor && (
            <Text style={[type.bodyVariant, styles.mt1]}>{fmtDay(workout.scheduledFor)}</Text>
          )}
        </View>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={18}
          color={colors.onSurfaceVariant}
        />
      </Pressable>

      {!expanded && exercises.length > 0 && (
        <View style={styles.workoutBody}>
          {preview.map((we) => (
            <Text key={we.id} style={[type.data, { color: colors.onSurfaceVariant }]}>
              {exerciseSummaryLine(we, exerciseMap, t("program.exerciseFallback"))}
            </Text>
          ))}
          {overflow > 0 && (
            <Text style={type.bodyVariant}>{t("program.moreExercises", { count: overflow })}</Text>
          )}
        </View>
      )}

      {expanded && exercises.length > 0 && (
        <View style={[styles.workoutBody, { gap: space(2) }]}>
          {exercises.map((we) => {
            const reps =
              we.targetRepsMin === we.targetRepsMax
                ? `${we.targetRepsMin}`
                : `${we.targetRepsMin}–${we.targetRepsMax}`;
            return (
              <Pressable
                key={we.id}
                style={styles.exerciseRow}
                onPress={() => router.push(`/exercise/${we.exerciseId}`)}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[type.bodyMd, { fontFamily: fonts.bodyMedium }]} numberOfLines={1}>
                    {exerciseMap.get(we.exerciseId) ?? t("program.exerciseFallback")}
                  </Text>
                  <Text style={[type.data, { color: colors.onSurfaceVariant, marginTop: 2 }]}>
                    {we.targetSets} × {reps}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceVariant} />
              </Pressable>
            );
          })}
        </View>
      )}

      {(workout.status === "planned" ||
        workout.status === "in_progress" ||
        workout.status === "completed" ||
        workout.status === "aborted") && (
        <View style={styles.workoutFooter}>
          {workout.status === "planned" && (
            <Button label={t("program.startWorkout")} variant="secondary" size="compact" fullWidth={false} onPress={() => void handleStart()} />
          )}
          {workout.status === "in_progress" && (
            <Button label={t("program.resume")} variant="primary" size="compact" fullWidth={false} onPress={goToWorkout} />
          )}
          {(workout.status === "completed" || workout.status === "aborted") && (
            <Button label={t("common.view")} variant="ghost" size="compact" fullWidth={false} onPress={goToWorkout} />
          )}
        </View>
      )}
    </View>
  );
}

export default function Program() {
  const { colors, type } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const [data, setData] = useState<ProgramView | null>(null);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    return Promise.all([api.getProgram(), api.getExercises().catch(() => [])])
      .then(([d, ex]) => {
        setData(d);
        setExercises(ex);
      })
      .catch((e) => setError(e instanceof Error ? e.message : t("program.couldntLoad")))
      .finally(() => setLoading(false));
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const exerciseMap = useMemo(() => new Map(exercises.map((e) => [e.id, e.name])), [exercises]);

  const workouts: Workout[] = (data?.workouts ?? [])
    .slice()
    .sort((a, b) => a.dayIndex - b.dayIndex);

  const totalWorkouts = workouts.length;
  const completedWorkouts = workouts.filter((w) => w.status === "completed").length;
  const weekProgress = totalWorkouts > 0 ? completedWorkouts / totalWorkouts : 0;

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      await regenerateProgram();
      await load();
    } catch {
      // toast-less fallback: leave the sheet open on failure so the user can retry
    } finally {
      setRegenerating(false);
      setConfirmOpen(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.topbar}>
        <Text style={type.title}>{t("program.title")}</Text>
        <SyncChip />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {loading && !data ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : error ? (
          <View style={styles.card}>
            <Text style={type.title}>{t("program.couldntLoad")}</Text>
            <Text style={[type.bodyVariant, styles.mt2]}>{error}</Text>
            <Button label={t("common.retry")} variant="secondary" onPress={load} style={styles.mt4} />
          </View>
        ) : !data?.program ? (
          <View style={styles.card}>
            <Text style={type.title}>{t("program.noActiveProgram")}</Text>
            <Text style={[type.bodyVariant, styles.mt2]}>{t("program.empty.noProgram")}</Text>
          </View>
        ) : (
          <>
            {/* header card: goal + phase badge + week/split line + Arc */}
            <View style={[styles.card, styles.headerRow]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.headerTitleRow}>
                  <Text style={type.headlineMd} numberOfLines={1}>
                    {t(`common.goals.${data.program.goal}.name`, { defaultValue: data.program.goal })}
                  </Text>
                  <Badge
                    label={t(`common.phases.${data.program.phase}`, { defaultValue: data.program.phase })}
                    tone={data.program.phase === "deload" ? "warning" : "neutral"}
                  />
                </View>
                <Text style={[type.bodyVariant, styles.mt1]}>
                  {t("program.weekLine", {
                    week: data.program.mesocycleWeek,
                    days: data.program.daysPerWeek,
                    split: t(`common.splits.${data.program.split}`, { defaultValue: data.program.split }),
                  })}
                </Text>
              </View>
              <View style={{ flexShrink: 0 }}>
                <Arc
                  size={88}
                  value={weekProgress}
                  metric={`${completedWorkouts}/${totalWorkouts}`}
                  label={t("program.arcWeek")}
                />
              </View>
            </View>

            {/* engine notes */}
            {(data.notes ?? []).length > 0 && (
              <View style={styles.mt3}>
                {(data.notes ?? []).map((note, i) => {
                  const warn = isWarningNote(note);
                  return (
                    <View
                      key={i}
                      style={[
                        styles.noteCard,
                        warn && { borderColor: withAlpha(colors.warning, 0.3), backgroundColor: withAlpha(colors.warning, 0.08) },
                      ]}
                    >
                      <Text style={[type.bodyVariant, warn && { color: colors.warning }]}>
                        {t(`common.notes.${note}`, { defaultValue: note })}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}

            {/* workout list */}
            <View style={[styles.mt3, { gap: space(3) }]}>
              {workouts.length === 0 ? (
                <View style={styles.card}>
                  <Text style={type.bodyVariant}>{t("program.empty.noWorkouts")}</Text>
                </View>
              ) : (
                workouts.map((w) => (
                  <WorkoutCard
                    key={w.id}
                    workout={w}
                    exerciseMap={exerciseMap}
                    styles={styles}
                    type={type}
                    colors={colors}
                    t={t}
                  />
                ))
              )}
            </View>

            <Button
              label={t("program.regenerate.button")}
              variant="secondary"
              onPress={() => setConfirmOpen(true)}
              style={styles.mt4}
            />
          </>
        )}
      </ScrollView>

      <Sheet open={confirmOpen} onClose={() => setConfirmOpen(false)} title={t("program.regenerate.title")}>
        <Text style={type.bodyVariant}>{t("program.regenerate.body")}</Text>
        <Button
          label={regenerating ? t("program.regenerate.working") : t("program.regenerate.confirm")}
          disabled={regenerating}
          onPress={() => void handleRegenerate()}
          style={styles.mt4}
        />
        <Button
          label={t("common.cancel")}
          variant="ghost"
          disabled={regenerating}
          onPress={() => setConfirmOpen(false)}
          style={styles.mt2}
        />
      </Sheet>
    </SafeAreaView>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.surface },
    topbar: {
      height: 56,
      paddingHorizontal: space(4),
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.outlineVariant,
    },
    scroll: { padding: space(4) },
    center: { paddingVertical: space(16), alignItems: "center" },
    card: {
      backgroundColor: colors.surfaceContainer,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      padding: space(4),
    },
    headerRow: { flexDirection: "row", alignItems: "flex-start", gap: space(3) },
    headerTitleRow: { flexDirection: "row", alignItems: "center", gap: space(2), flexWrap: "wrap", marginBottom: 2 },
    noteCard: {
      backgroundColor: colors.surfaceContainer,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      paddingHorizontal: space(4),
      paddingVertical: space(3),
      marginBottom: space(2),
    },
    workoutCard: {
      backgroundColor: colors.surfaceContainer,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      overflow: "hidden",
    },
    workoutHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: space(3),
      padding: space(4),
      minHeight: 44,
    },
    workoutTitleRow: { flexDirection: "row", alignItems: "center", gap: space(2), flexWrap: "wrap" },
    workoutBody: { paddingHorizontal: space(4), paddingBottom: space(3), gap: 2 },
    workoutFooter: { paddingHorizontal: space(4), paddingBottom: space(4), paddingTop: space(1) },
    exerciseRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: space(3),
      backgroundColor: colors.surfaceContainerHigh,
      borderRadius: radius.base,
      padding: space(3),
    },
    mt1: { marginTop: space(1) },
    mt2: { marginTop: space(2) },
    mt3: { marginTop: space(3) },
    mt4: { marginTop: space(4) },
  });
