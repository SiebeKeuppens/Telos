import { useCallback, useEffect, useState } from "react";
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
import { Button } from "../components/ui/Button";
import { api, ApiError } from "../lib/api";
import { signOutUser, useAuth } from "../lib/auth";
import { flush } from "../lib/sync";
import { colors, fonts, radius, space, type } from "../lib/theme";
import type { ProgramView, User, Workout } from "../lib/types";

function localDate(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Today's session, else the next planned one in the week. */
function pickWorkout(workouts: Workout[]): Workout | null {
  const today = localDate();
  const todays = workouts.find((w) => w.scheduledFor === today);
  if (todays) return todays;
  const upcoming = workouts
    .filter((w) => w.status === "planned" || w.status === "in_progress")
    .sort((a, b) => (a.scheduledFor ?? "").localeCompare(b.scheduledFor ?? ""));
  return upcoming[0] ?? null;
}

export default function Today() {
  const router = useRouter();
  const auth = useAuth();
  const [state, setState] = useState<{
    loading: boolean;
    error: string | null;
    notOnboarded: boolean;
    me: User | null;
    program: ProgramView | null;
  }>({ loading: true, error: null, notOnboarded: false, me: null, program: null });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const me = await api.getMe();
      const program = await api.getProgram();
      setState({ loading: false, error: null, notOnboarded: false, me, program });
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setState((s) => ({ ...s, loading: false, notOnboarded: true }));
        return;
      }
      setState((s) => ({
        ...s,
        loading: false,
        error:
          e instanceof Error ? e.message : "Couldn't reach the server.",
      }));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Coming back from a workout: flush any queued sets, then refresh.
  useFocusEffect(
    useCallback(() => {
      void flush().then(load);
    }, [load]),
  );

  async function onSignOut() {
    await signOutUser();
    router.replace("/sign-in");
  }

  const workout = state.program ? pickWorkout(state.program.workouts) : null;
  const greetingName = state.me?.displayName || auth.email?.split("@")[0] || "athlete";

  // A signed-in account that hasn't onboarded yet does it right here on mobile.
  if (!state.loading && state.notOnboarded) {
    return <Redirect href="/onboarding" />;
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.topbar}>
        <Text style={type.title}>Today</Text>
        <Pressable onPress={onSignOut} hitSlop={8}>
          <Text style={styles.signout}>Sign out</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {state.loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : state.error ? (
          <View style={styles.card}>
            <Text style={type.title}>Couldn't load your plan</Text>
            <Text style={[type.bodyVariant, styles.mt2]}>{state.error}</Text>
            <Button label="Retry" variant="secondary" onPress={load} style={styles.mt4} />
          </View>
        ) : (
          <>
            <Text style={[type.bodyVariant, styles.mb4]}>
              Welcome back, {greetingName}.
            </Text>

            {workout ? (
              <View style={styles.card}>
                <Text style={styles.kicker}>
                  {workout.scheduledFor === localDate() ? "TODAY" : "NEXT SESSION"}
                </Text>
                <Text style={[type.title, styles.mt1]}>{workout.name}</Text>
                <Text style={[type.bodyVariant, styles.mt1]}>
                  {(workout.exercises?.length ?? 0)} exercises
                  {workout.warmup?.length
                    ? ` · ${workout.warmup.length}-move warm-up`
                    : ""}
                </Text>
                <Button
                  label={
                    workout.status === "in_progress"
                      ? "Continue workout"
                      : "Start workout"
                  }
                  onPress={() => router.push(`/workout/${workout.id}`)}
                  style={styles.mt4}
                />
              </View>
            ) : (
              <View style={styles.card}>
                <Text style={type.title}>Rest day</Text>
                <Text style={[type.bodyVariant, styles.mt2]}>
                  No session scheduled. Recover well — the next one will appear
                  here.
                </Text>
              </View>
            )}

            {state.program?.program && (
              <Text style={[type.label, styles.mt4]}>
                {state.program.program.phase.toUpperCase()} · week{" "}
                {state.program.program.weekInPhase}
              </Text>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  signout: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.onSurfaceVariant },
  scroll: { padding: space(4) },
  center: { paddingVertical: space(16), alignItems: "center" },
  card: {
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    padding: space(4),
  },
  kicker: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    letterSpacing: 1,
    color: colors.primary,
  },
  mt1: { marginTop: space(1) },
  mt2: { marginTop: space(2) },
  mt4: { marginTop: space(4) },
  mb4: { marginBottom: space(4) },
});
