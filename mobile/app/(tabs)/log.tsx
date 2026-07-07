import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/Button";
import { Badge, statusTone } from "../../components/ui/Badge";
import { SyncChip } from "../../components/shell/SyncChip";
import { BodyweightSheet } from "../../components/fitness/BodyweightSheet";
import { CheckInSheet } from "../../components/fitness/CheckInSheet";
import { api } from "../../lib/api";
import { fmtDay, localDate } from "../../lib/dates";
import { enqueue, newId } from "../../lib/sync";
import { workoutName } from "../../lib/i18n";
import { fonts, radius, space, type Palette } from "../../lib/theme";
import { useTheme } from "../../lib/theme-context";
import type { BodyweightEntry, CheckIn, Unit, Workout, WorkoutStatus } from "../../lib/types";

const DONE: WorkoutStatus[] = ["completed", "aborted"];

export default function Log() {
  const router = useRouter();
  const { colors, type } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();

  const [items, setItems] = useState<Workout[] | null>(null);
  const [programWorkouts, setProgramWorkouts] = useState<Workout[]>([]);
  const [unit, setUnit] = useState<Unit>("kg");
  const [lastWeight, setLastWeight] = useState<BodyweightEntry | undefined>();
  const [todayCheckin, setTodayCheckin] = useState<CheckIn | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bwOpen, setBwOpen] = useState(false);
  const [ciOpen, setCiOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    return Promise.all([
      api.listWorkouts(localDate(-14), localDate(0)),
      api.getProgram().catch(() => null),
    ])
      .then(([all, program]) => {
        const done = all
          .filter((w) => DONE.includes(w.status))
          .sort((a, b) => (b.scheduledFor ?? "").localeCompare(a.scheduledFor ?? ""));
        setItems(done);
        setProgramWorkouts(program?.workouts ?? []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : t("log.couldntLoad")))
      .finally(() => setLoading(false));
  }, [t]);

  const loadQuickLogContext = useCallback(() => {
    void api
      .getMe()
      .then((me) => setUnit(me.unit))
      .catch(() => {});
    void api
      .listBodyweight(90)
      .then((entries) => setLastWeight(entries.at(-1)))
      .catch(() => {});
    void api
      .listCheckins(7)
      .then((cs) => setTodayCheckin(cs.find((c) => c.date === localDate())))
      .catch(() => {});
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
      loadQuickLogContext();
    }, [load, loadQuickLogContext]),
  );

  const today = localDate();
  const inProgressWorkout = programWorkouts.find((w) => w.status === "in_progress");
  const todayPlanned = programWorkouts.find((w) => w.scheduledFor === today && w.status === "planned");

  const handleStartToday = async (workout: Workout) => {
    await enqueue("workout", "upsert", {
      ...workout,
      status: "in_progress",
      startedAt: new Date().toISOString(),
    });
    router.push(`/workout/${workout.id}`);
  };

  const handleStartEmpty = async () => {
    const id = newId();
    await enqueue("workout", "upsert", {
      id,
      name: "Custom workout",
      dayIndex: 0,
      status: "in_progress",
      startedAt: new Date().toISOString(),
      scheduledFor: today,
      edited: true,
    });
    router.push(`/workout/${id}`);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.topbar}>
        <Text style={type.title}>{t("log.title")}</Text>
        <SyncChip />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {loading && !items ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <>
            {/* Today section */}
            <View style={styles.section}>
              <Text style={type.label}>{t("common.nav.today")}</Text>
              {inProgressWorkout ? (
                <Button
                  label={t("log.resumeWorkout")}
                  onPress={() => router.push(`/workout/${inProgressWorkout.id}`)}
                  style={styles.mt2}
                />
              ) : todayPlanned ? (
                <Button
                  label={t("log.startToday")}
                  onPress={() => void handleStartToday(todayPlanned)}
                  style={styles.mt2}
                />
              ) : (
                <Text style={[type.bodyVariant, styles.mt2]}>{t("log.restDay")}</Text>
              )}
              <Button
                label={t("log.startEmpty")}
                variant="secondary"
                onPress={() => void handleStartEmpty()}
                style={styles.mt2}
              />
            </View>

            {/* Quick log section */}
            <View style={styles.section}>
              <Text style={type.label}>{t("log.quickLog")}</Text>
              <View style={styles.quickRow}>
                <Pressable style={styles.quick} onPress={() => setBwOpen(true)}>
                  <Ionicons name="scale-outline" size={20} color={colors.primary} />
                  <Text style={[type.bodyVariant, styles.quickLabel]}>{t("log.bodyweight")}</Text>
                </Pressable>
                <Pressable style={styles.quick} onPress={() => setCiOpen(true)}>
                  <Ionicons name="pulse-outline" size={20} color={colors.primary} />
                  <Text style={[type.bodyVariant, styles.quickLabel]}>{t("log.checkIn")}</Text>
                </Pressable>
              </View>
            </View>

            {/* History section */}
            <View style={styles.section}>
              <Text style={type.label}>{t("log.history")}</Text>
              {error ? (
                <View style={[styles.card, styles.mt2]}>
                  <Text style={type.title}>{t("log.couldntLoad")}</Text>
                  <Text style={[type.bodyVariant, styles.mt2]}>{error}</Text>
                  <Button label={t("common.retry")} variant="secondary" onPress={load} style={styles.mt4} />
                </View>
              ) : !items || items.length === 0 ? (
                <View style={[styles.card, styles.mt2]}>
                  <Text style={type.bodyVariant}>{t("log.empty.history")}</Text>
                </View>
              ) : (
                <View style={[styles.mt2, { gap: space(2) }]}>
                  {items.map((w) => {
                    const sets = (w.exercises ?? []).reduce(
                      (n, we) => n + (we.sets?.length ?? 0),
                      0,
                    );
                    const dateStr = w.scheduledFor ?? w.completedAt?.slice(0, 10) ?? w.updatedAt.slice(0, 10);
                    return (
                      <Pressable
                        key={w.id}
                        onPress={() => router.push(`/workout/${w.id}`)}
                        style={styles.row}
                      >
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[type.bodyMd, { fontFamily: fonts.bodyMedium }]} numberOfLines={1}>
                            {workoutName(w.name, t)}
                          </Text>
                          <Text style={[type.bodyVariant, styles.mt1]}>
                            {fmtDay(dateStr)}
                            {sets > 0 ? ` · ${t("log.setCount", { count: sets })}` : ""}
                          </Text>
                        </View>
                        <Badge
                          label={
                            w.status === "completed" ? t("common.status.completed") : t("common.status.aborted")
                          }
                          tone={statusTone(w.status)}
                        />
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>

      <BodyweightSheet
        open={bwOpen}
        onClose={() => setBwOpen(false)}
        unit={unit}
        lastWeightKg={lastWeight?.weightKg}
        onSaved={load}
      />
      <CheckInSheet
        open={ciOpen}
        onClose={() => setCiOpen(false)}
        existing={todayCheckin}
        onSaved={load}
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
    scroll: { padding: space(4) },
    center: { paddingVertical: space(16), alignItems: "center" },
    section: { marginBottom: space(6) },
    card: {
      backgroundColor: colors.surfaceContainer,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      padding: space(4),
    },
    quickRow: { flexDirection: "row", gap: space(3), marginTop: space(2) },
    quick: {
      flex: 1,
      minHeight: 72,
      backgroundColor: colors.surfaceContainer,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      padding: space(4),
      gap: space(2),
      alignItems: "flex-start",
      justifyContent: "center",
    },
    quickLabel: { fontFamily: fonts.bodyMedium, color: colors.onSurface },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: space(3),
      backgroundColor: colors.surfaceContainer,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      padding: space(4),
      minHeight: 56,
    },
    mt1: { marginTop: space(1) },
    mt2: { marginTop: space(2) },
    mt4: { marginTop: space(4) },
  });
