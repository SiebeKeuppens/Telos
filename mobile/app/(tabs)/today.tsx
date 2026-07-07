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
import { BodyweightSheet } from "../../components/fitness/BodyweightSheet";
import { CheckInSheet } from "../../components/fitness/CheckInSheet";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { flush, getSyncState, subscribeSync } from "../../lib/sync";
import { localDate } from "../../lib/dates";
import { workoutName } from "../../lib/i18n";
import { fonts, radius, space, type Palette } from "../../lib/theme";
import { useTheme } from "../../lib/theme-context";
import type {
  BodyweightEntry,
  CheckIn,
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

  const workout = state.program ? pickWorkout(state.program.workouts) : null;
  const greetingName = state.me?.displayName || auth.email?.split("@")[0] || t("today.athleteFallback", { defaultValue: "athlete" });

  const week = state.program?.workouts ?? [];
  const weekDone = week.filter((w) => w.status === "completed").length;
  const weekTotal = Math.max(week.length, state.program?.program?.daysPerWeek ?? 0);

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
          {sync.flushing ? (
            <Text style={styles.syncChip}>{t("common.sync.syncing")}</Text>
          ) : sync.pending > 0 ? (
            <Text style={styles.syncChip}>{t("common.sync.savedQueued", { count: sync.pending })}</Text>
          ) : null}
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
              .map((code) => (
                <View key={code} style={styles.noteBanner}>
                  <Text style={type.bodyVariant}>{t(`common.${NOTE_KEYS[code]}`)}</Text>
                </View>
              ))}

            {workout ? (
              <View style={styles.card}>
                <Text style={styles.kicker}>
                  {workout.scheduledFor === localDate() ? t("today.todayKicker") : t("today.nextSessionKicker")}
                </Text>
                <Text style={[type.title, styles.mt1]}>{workoutName(workout.name, t)}</Text>
                <Text style={[type.bodyVariant, styles.mt1]}>
                  {t("today.hero.exerciseCount", { count: workout.exercises?.length ?? 0 })}
                  {workout.warmup?.length ? ` · ${workout.warmup.length}-move warm-up` : ""}
                </Text>
                <Button
                  label={workout.status === "in_progress" ? t("today.hero.resume") : t("today.hero.start")}
                  onPress={() => router.push(`/workout/${workout.id}`)}
                  style={styles.mt4}
                />
              </View>
            ) : (
              <View style={styles.card}>
                <Text style={type.title}>
                  {weekTotal > 0 && weekDone >= weekTotal ? t("today.weekComplete") : t("today.restDay")}
                </Text>
                <Text style={[type.bodyVariant, styles.mt2]}>
                  {weekTotal > 0 && weekDone >= weekTotal
                    ? t("today.weekCompleteBody")
                    : t("today.restDayBody")}
                </Text>
              </View>
            )}

            {/* Quick actions */}
            <View style={styles.quickRow}>
              <Pressable style={styles.quick} onPress={() => setBwOpen(true)}>
                <Text style={styles.quickLabel}>{t("today.quick.bodyweightLabel")}</Text>
                <Text style={[type.body, styles.mt1]}>{t("today.quick.bodyweightAction")}</Text>
              </Pressable>
              <Pressable style={styles.quick} onPress={() => setCiOpen(true)}>
                <Text style={styles.quickLabel}>{t("today.quick.recoveryLabel")}</Text>
                <Text style={[type.body, styles.mt1]}>
                  {todayCheckin ? t("today.quick.recoveryEdit") : t("today.quick.recoveryAction")}
                </Text>
              </Pressable>
            </View>

            {state.program?.program && (
              <Text style={[type.label, styles.mt4]}>
                {t(`common.phases.${state.program.program.phase}`, { defaultValue: state.program.program.phase }).toString().toUpperCase()} · week{" "}
                {state.program.program.weekInPhase}
              </Text>
            )}
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
    topbarRight: { alignItems: "flex-end", gap: space(1) },
    weekChip: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.onSurfaceVariant },
    syncChip: { fontFamily: fonts.body, fontSize: 11, color: colors.onSurfaceVariant },
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
      backgroundColor: colors.surfaceContainerHigh,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      borderLeftWidth: 2,
      borderLeftColor: colors.primary,
      padding: space(3),
      marginBottom: space(3),
    },
    kicker: { fontFamily: fonts.bodyMedium, fontSize: 11, letterSpacing: 1, color: colors.primary },
    quickRow: { flexDirection: "row", gap: space(3), marginTop: space(3) },
    quick: {
      flex: 1,
      backgroundColor: colors.surfaceContainer,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      padding: space(4),
    },
    quickLabel: {
      fontFamily: fonts.bodyMedium,
      fontSize: 11,
      letterSpacing: 1,
      color: colors.onSurfaceVariant,
    },
    mt1: { marginTop: space(1) },
    mt2: { marginTop: space(2) },
    mt4: { marginTop: space(4) },
    mb4: { marginBottom: space(4) },
  });
