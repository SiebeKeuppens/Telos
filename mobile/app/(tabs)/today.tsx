import { useCallback, useEffect, useMemo, useSyncExternalStore, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Redirect, useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/Button";
import { Arc } from "../../components/fitness/Arc";
import { SyncChip } from "../../components/shell/SyncChip";
import { BodyweightSheet } from "../../components/fitness/BodyweightSheet";
import { CheckInSheet } from "../../components/fitness/CheckInSheet";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { flush, getSyncState, subscribeSync } from "../../lib/sync";
import { localDate } from "../../lib/dates";
import { workoutName } from "../../lib/i18n";
import { fonts, radius, space, withAlpha, type Palette } from "../../lib/theme";
import { useTheme } from "../../lib/theme-context";
import type {
  BodyweightEntry,
  CheckIn,
  Exercise,
  ProgramView,
  User,
  Workout,
} from "../../lib/types";

// Engine note codes → i18n keys (common.notes.*). Unknown/future codes are
// skipped rather than shown raw.
const NOTE_KEYS: Record<string, string> = {
  deload_scheduled: "notes.deload_scheduled",
  deload_stalls: "notes.deload_stalls",
  deload_recovery: "notes.deload_recovery",
  eased_today: "notes.eased_today",
};

/** Deload/eased notes get the warning tint; everything else the accent tint —
 * mirrors web Today.tsx's isWarningNote(). */
function isWarningNote(code: string): boolean {
  return code.startsWith("deload_") || code === "eased_today";
}

/** Sum of targetSets*(restSeconds+45) per exercise, rounded to the nearest 5
 * minutes (min 5) — mirrors web Today.tsx's estimateMinutes(). */
function estimateMinutes(workout: Workout): number {
  if (!workout.exercises?.length) return 0;
  const totalSeconds = workout.exercises.reduce(
    (sum, we) => sum + we.targetSets * (we.restSeconds + 45),
    0,
  );
  const mins = totalSeconds / 60;
  return Math.max(5, Math.round(mins / 5) * 5);
}

function useSync() {
  return useSyncExternalStore(subscribeSync, getSyncState, getSyncState);
}

/** Today's session (if still actionable), else the next planned one. A
 * completed/skipped today falls through so the card never says "Start" on a
 * finished session. */
function pickWorkout(workouts: Workout[]): Workout | null {
  const today = localDate();
  const actionable = (w: Workout) =>
    w.status === "planned" || w.status === "in_progress";
  const todays = workouts.find((w) => w.scheduledFor === today && actionable(w));
  if (todays) return todays;
  const upcoming = workouts
    .filter(actionable)
    .sort((a, b) => (a.scheduledFor ?? "").localeCompare(b.scheduledFor ?? ""));
  return upcoming[0] ?? null;
}

export default function Today() {
  const router = useRouter();
  const auth = useAuth();
  const sync = useSync();
  const { colors, type } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const [state, setState] = useState<{
    loading: boolean;
    error: string | null;
    notOnboarded: boolean;
    me: User | null;
    program: ProgramView | null;
  }>({ loading: true, error: null, notOnboarded: false, me: null, program: null });
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [lastWeight, setLastWeight] = useState<BodyweightEntry | undefined>();
  const [todayCheckin, setTodayCheckin] = useState<CheckIn | undefined>();
  const [bwOpen, setBwOpen] = useState(false);
  const [ciOpen, setCiOpen] = useState(false);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const me = await api.getMe();
      // The server auto-creates a user row on first request, so a fresh
      // account arrives here as 200 + onboardedAt null (web checks the same).
      if (!me.onboardedAt) {
        setState((s) => ({ ...s, loading: false, notOnboarded: true, me }));
        return;
      }
      const program = await api.getProgram();
      setState({ loading: false, error: null, notOnboarded: false, me, program });
      // Quick-log context — non-blocking, best-effort.
      void api
        .listBodyweight(90)
        .then((entries) => setLastWeight(entries.at(-1)))
        .catch(() => {});
      void api
        .listCheckins(7)
        .then((cs) => setTodayCheckin(cs.find((c) => c.date === localDate())))
        .catch(() => {});
      void api
        .getExercises()
        .then(setExercises)
        .catch(() => {});
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setState((s) => ({ ...s, loading: false, notOnboarded: true }));
        return;
      }
      setState((s) => ({
        ...s,
        loading: false,
        error: e instanceof Error ? e.message : t("today.loadError"),
      }));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  // Coming back from a workout: flush any queued sets, then refresh.
  useFocusEffect(
    useCallback(() => {
      void flush().then(load);
    }, [load]),
  );

  const exMap = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);
  const workout = state.program ? pickWorkout(state.program.workouts) : null;
  const greetingName = state.me?.displayName || auth.email?.split("@")[0] || t("today.athleteFallback", { defaultValue: "athlete" });

  const week = state.program?.workouts ?? [];
  const weekDone = week.filter((w) => w.status === "completed").length;
  const weekTotal = Math.max(week.length, state.program?.program?.daysPerWeek ?? 0);
  const noProgram = !state.loading && !state.error && (!state.program?.program || week.length === 0);

  // A signed-in account that hasn't onboarded yet does it right here on mobile.
  if (!state.loading && state.notOnboarded) {
    return <Redirect href="/onboarding" />;
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.topbar}>
        <Text style={type.title}>{t("today.title")}</Text>
        <View style={styles.topbarRight}>
          {weekTotal > 0 && (
            <Text style={styles.weekChip}>
              {t("today.weekChip", { done: weekDone, total: weekTotal })}
            </Text>
          )}
          <SyncChip />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {state.loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : state.error ? (
          <View style={styles.card}>
            <Text style={type.title}>{t("today.couldntLoadPlan")}</Text>
            <Text style={[type.bodyVariant, styles.mt2]}>{state.error}</Text>
            <Button label={t("common.retry")} variant="secondary" onPress={load} style={styles.mt4} />
          </View>
        ) : (
          <>
            <Text style={[type.bodyVariant, styles.mb4]}>
              {t("today.greeting", { name: greetingName })}
            </Text>

            {(state.program?.notes ?? [])
              .filter((code) => NOTE_KEYS[code])
              .map((code) => {
                const warn = isWarningNote(code);
                return (
                  <View key={code} style={[styles.noteBanner, warn ? styles.noteWarning : styles.noteAccent]}>
                    <Text style={[type.body, { color: warn ? colors.warning : colors.primary }]}>
                      {t(`common.${NOTE_KEYS[code]}`)}
                    </Text>
                  </View>
                );
              })}

            {/* Hero + weekly arc row */}
            <View style={styles.heroRow}>
              <View style={styles.heroFlex}>
                {noProgram ? (
                  <View style={styles.card}>
                    <Text style={type.bodyMd}>{t("today.planPreparing")}</Text>
                    <Button
                      label={t("today.viewProgram")}
                      variant="ghost"
                      fullWidth={false}
                      onPress={() => router.push("/program")}
                      style={styles.mt3}
                    />
                  </View>
                ) : workout ? (
                  <View style={styles.card}>
                    <Text style={type.headlineMd} numberOfLines={1}>
                      {workoutName(workout.name, t)}
                    </Text>
                    <Text style={[type.bodyVariant, styles.mt1]}>
                      {(workout.exercises?.length ?? 0) > 0
                        ? t("today.hero.summary", {
                            count: workout.exercises?.length ?? 0,
                            minutes: estimateMinutes(workout),
                          })
                        : t("today.hero.exerciseCount", { count: 0 })}
                    </Text>

                    {workout.exercises && workout.exercises.length > 0 && (
                      <View style={styles.mt3}>
                        {workout.exercises.slice(0, 3).map((we) => {
                          const ex = exMap.get(we.exerciseId);
                          const reps =
                            we.targetRepsMin === we.targetRepsMax
                              ? `${we.targetRepsMin}`
                              : `${we.targetRepsMin}–${we.targetRepsMax}`;
                          return (
                            <View key={we.id} style={styles.exRow}>
                              <Text style={[type.bodyVariant, styles.exName, styles.exNameEmphasis]} numberOfLines={1}>
                                {ex?.name ?? t("today.hero.exerciseFallback")}
                              </Text>
                              <Text style={type.bodyVariant}>
                                {we.targetSets}×{reps}
                              </Text>
                            </View>
                          );
                        })}
                        {workout.exercises.length > 3 && (
                          <Text style={type.bodyVariant}>
                            {t("today.hero.more", { count: workout.exercises.length - 3 })}
                          </Text>
                        )}
                      </View>
                    )}

                    <Button
                      label={workout.status === "in_progress" ? t("today.hero.resume") : t("today.hero.start")}
                      onPress={() => router.push(`/workout/${workout.id}`)}
                      style={styles.mt3}
                    />
                  </View>
                ) : (
                  <View style={styles.card}>
                    <Text style={type.bodyMd}>
                      {weekTotal > 0 && weekDone >= weekTotal ? t("today.weekComplete") : t("today.restDay")}
                    </Text>
                    <Button
                      label={t("today.viewProgram")}
                      variant="ghost"
                      fullWidth={false}
                      onPress={() => router.push("/program")}
                      style={styles.mt3}
                    />
                  </View>
                )}
              </View>

              <View style={styles.arcWrap}>
                <Arc
                  value={weekTotal > 0 ? weekDone / weekTotal : 0}
                  size={96}
                  strokeWidth={3.5}
                  metric={`${weekDone}/${weekTotal}`}
                  label={t("today.weekLabel")}
                />
              </View>
            </View>

            {/* Quick actions */}
            <View style={styles.quickRow}>
              <Pressable style={styles.quick} onPress={() => setBwOpen(true)}>
                <Text style={type.label}>{t("today.quick.bodyweightLabel")}</Text>
                <Text style={[type.bodyMd, styles.quickAction]}>{t("today.quick.bodyweightAction")}</Text>
              </Pressable>
              <Pressable style={styles.quick} onPress={() => setCiOpen(true)}>
                <Text style={type.label}>{t("today.quick.recoveryLabel")}</Text>
                <Text style={[type.bodyMd, styles.quickAction]}>
                  {todayCheckin ? t("today.quick.recoveryEdit") : t("today.quick.recoveryAction")}
                </Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>

      <BodyweightSheet
        open={bwOpen}
        onClose={() => setBwOpen(false)}
        unit={state.me?.unit ?? "kg"}
        lastWeightKg={lastWeight?.weightKg}
        onSaved={() => void flush().then(load)}
      />
      <CheckInSheet
        open={ciOpen}
        onClose={() => setCiOpen(false)}
        existing={todayCheckin}
        onSaved={() => void flush().then(load)}
      />
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
    topbarRight: { flexDirection: "row", alignItems: "center", gap: space(2) },
    weekChip: { fontFamily: fonts.headMedium, fontSize: 12, color: colors.onSurfaceVariant },
    scroll: { padding: space(4) },
    center: { paddingVertical: space(16), alignItems: "center" },
    card: {
      backgroundColor: colors.surfaceContainer,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      padding: space(4),
    },
    noteBanner: {
      borderRadius: radius.lg,
      borderWidth: 1,
      padding: space(3),
      marginBottom: space(3),
    },
    noteWarning: {
      borderColor: withAlpha(colors.warning, 0.4),
      backgroundColor: withAlpha(colors.warning, 0.08),
    },
    noteAccent: {
      borderColor: withAlpha(colors.primary, 0.3),
      backgroundColor: withAlpha(colors.primary, 0.08),
    },
    heroRow: { flexDirection: "row", alignItems: "flex-start", gap: space(4) },
    heroFlex: { flex: 1, minWidth: 0 },
    arcWrap: { flexShrink: 0, alignItems: "center", paddingTop: space(2) },
    exRow: { flexDirection: "row", gap: space(2), marginBottom: 2 },
    exName: { flex: 1 },
    // web: exercise name is `text-on-surface font-medium` inside an
    // otherwise on-surface-variant row — override color+weight here.
    exNameEmphasis: { color: colors.onSurface, fontFamily: fonts.bodyMedium },
    quickRow: { flexDirection: "row", gap: space(3), marginTop: space(4) },
    quick: {
      flex: 1,
      backgroundColor: colors.surfaceContainer,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      padding: space(4),
      gap: space(1),
    },
    quickAction: { fontFamily: fonts.bodyMedium },
    mt1: { marginTop: space(1) },
    mt2: { marginTop: space(2) },
    mt3: { marginTop: space(3) },
    mt4: { marginTop: space(4) },
    mb4: { marginBottom: space(4) },
  });
