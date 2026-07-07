import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/Button";
import { Badge, statusTone } from "../../components/ui/Badge";
import { api } from "../../lib/api";
import { fmtDay, localDate } from "../../lib/dates";
import { workoutName } from "../../lib/i18n";
import { fonts, radius, space, type Palette } from "../../lib/theme";
import { useTheme } from "../../lib/theme-context";
import type { Workout, WorkoutStatus } from "../../lib/types";

const DONE: WorkoutStatus[] = ["completed", "aborted", "skipped"];

export default function Log() {
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
  const [items, setItems] = useState<Workout[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    return api
      .listWorkouts(localDate(-180), localDate(0))
      .then((all) => {
        const done = all
          .filter((w) => DONE.includes(w.status))
          .sort((a, b) => (b.scheduledFor ?? "").localeCompare(a.scheduledFor ?? ""));
        setItems(done);
      })
      .catch((e) => setError(e instanceof Error ? e.message : t("log.couldntLoad")))
      .finally(() => setLoading(false));
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.topbar}>
        <Text style={type.title}>{t("log.title")}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {loading && !items ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : error ? (
          <View style={styles.card}>
            <Text style={type.title}>{t("log.couldntLoad")}</Text>
            <Text style={[type.bodyVariant, { marginTop: space(2) }]}>{error}</Text>
            <Button label={t("common.retry")} variant="secondary" onPress={load} style={{ marginTop: space(4) }} />
          </View>
        ) : !items || items.length === 0 ? (
          <View style={styles.card}>
            <Text style={type.title}>{t("log.noSessionsYet")}</Text>
            <Text style={[type.bodyVariant, { marginTop: space(2) }]}>
              {t("log.empty.history")}
            </Text>
          </View>
        ) : (
          <View style={{ gap: space(3) }}>
            {items.map((w) => {
              const sets = (w.exercises ?? []).reduce(
                (n, we) => n + (we.sets?.length ?? 0),
                0,
              );
              return (
                <Pressable
                  key={w.id}
                  onPress={() => router.push(`/workout/${w.id}`)}
                  style={styles.row}
                >
                  <View style={{ flex: 1, gap: space(1) }}>
                    <Text style={styles.day}>
                      {w.scheduledFor ? fmtDay(w.scheduledFor) : "—"}
                    </Text>
                    <Text style={type.title}>{workoutName(w.name, t)}</Text>
                    <Text style={type.bodyVariant}>
                      {t("log.exerciseCount", { count: w.exercises?.length ?? 0 })} · {t("log.setCount", { count: sets })}
                    </Text>
                  </View>
                  <Badge label={STATUS_LABEL[w.status]} tone={statusTone(w.status)} />
                </Pressable>
              );
            })}
          </View>
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
