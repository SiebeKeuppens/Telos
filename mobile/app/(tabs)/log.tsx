import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../../components/ui/Button";
import { Badge, statusTone } from "../../components/ui/Badge";
import { api } from "../../lib/api";
import { fmtDay, localDate } from "../../lib/dates";
import { colors, fonts, radius, space, type } from "../../lib/theme";
import type { Workout, WorkoutStatus } from "../../lib/types";

const DONE: WorkoutStatus[] = ["completed", "aborted", "skipped"];
const STATUS_LABEL: Record<WorkoutStatus, string> = {
  planned: "Planned",
  in_progress: "In progress",
  completed: "Done",
  skipped: "Skipped",
  aborted: "Ended early",
};

export default function Log() {
  const router = useRouter();
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
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load history."))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.topbar}>
        <Text style={type.title}>Log</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {loading && !items ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : error ? (
          <View style={styles.card}>
            <Text style={type.title}>Couldn't load history</Text>
            <Text style={[type.bodyVariant, { marginTop: space(2) }]}>{error}</Text>
            <Button label="Retry" variant="secondary" onPress={load} style={{ marginTop: space(4) }} />
          </View>
        ) : !items || items.length === 0 ? (
          <View style={styles.card}>
            <Text style={type.title}>No sessions yet</Text>
            <Text style={[type.bodyVariant, { marginTop: space(2) }]}>
              Finish a workout and it shows up here.
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
                    <Text style={type.title}>{w.name}</Text>
                    <Text style={type.bodyVariant}>
                      {(w.exercises?.length ?? 0)} exercises · {sets} sets
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

const styles = StyleSheet.create({
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
