import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/Button";
import { Badge, statusTone } from "../../components/ui/Badge";
import { api } from "../../lib/api";
import { fmtDay } from "../../lib/dates";
import { workoutName } from "../../lib/i18n";
import { fonts, radius, space, type Palette } from "../../lib/theme";
import { useTheme } from "../../lib/theme-context";
import type { ProgramView, Workout, WorkoutStatus } from "../../lib/types";

export default function Program() {
  const router = useRouter();
  const { colors, type } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const STATUS_LABEL: Record<WorkoutStatus, string> = {
    planned: t("common.status.planned"),
    in_progress: t("common.status.in_progress"),
    completed: t("common.status.completed"),
    skipped: t("common.status.skipped"),
    aborted: t("common.status.aborted"),
  };
  const [data, setData] = useState<ProgramView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    return api
      .getProgram()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : t("program.couldntLoad")))
      .finally(() => setLoading(false));
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const workouts: Workout[] = (data?.workouts ?? [])
    .slice()
    .sort((a, b) =>
      (a.scheduledFor ?? "").localeCompare(b.scheduledFor ?? "") || a.dayIndex - b.dayIndex,
    );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.topbar}>
        <Text style={type.title}>{t("program.title")}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {loading && !data ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : error ? (
          <View style={styles.card}>
            <Text style={type.title}>{t("program.couldntLoad")}</Text>
            <Text style={[type.bodyVariant, { marginTop: space(2) }]}>{error}</Text>
            <Button label={t("common.retry")} variant="secondary" onPress={load} style={{ marginTop: space(4) }} />
          </View>
        ) : !data?.program ? (
          <View style={styles.card}>
            <Text style={type.title}>{t("program.noActiveProgram")}</Text>
            <Text style={[type.bodyVariant, { marginTop: space(2) }]}>
              {t("program.empty.noProgram")}
            </Text>
          </View>
        ) : (
          <>
            <Text style={[type.label, { marginBottom: space(3) }]}>
              {t(`common.phases.${data.program.phase}`, { defaultValue: data.program.phase }).toString().toUpperCase()} · WEEK {data.program.weekInPhase} ·{" "}
              {data.program.daysPerWeek}×/WEEK
            </Text>

            {workouts.length === 0 ? (
              <Text style={type.bodyVariant}>{t("program.empty.noWorkouts")}</Text>
            ) : (
              <View style={{ gap: space(3) }}>
                {workouts.map((w) => (
                  <Pressable
                    key={w.id}
                    onPress={() => router.push(`/workout/${w.id}`)}
                    style={styles.row}
                  >
                    <View style={{ flex: 1, gap: space(1) }}>
                      <Text style={styles.day}>
                        {w.scheduledFor ? fmtDay(w.scheduledFor) : t("program.day", { index: w.dayIndex + 1 })}
                      </Text>
                      <Text style={type.title}>{workoutName(w.name, t)}</Text>
                      <Text style={type.bodyVariant}>{t("today.hero.exerciseCount", { count: w.exercises?.length ?? 0 })}</Text>
                    </View>
                    <Badge label={STATUS_LABEL[w.status]} tone={statusTone(w.status)} />
                  </Pressable>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.surface },
    topbar: {
      height: 56,
      paddingHorizontal: space(4),
      justifyContent: "center",
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
    row: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: space(3),
      backgroundColor: colors.surfaceContainer,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      padding: space(4),
    },
    day: { fontFamily: fonts.bodyMedium, fontSize: 11, letterSpacing: 1, color: colors.primary },
  });
