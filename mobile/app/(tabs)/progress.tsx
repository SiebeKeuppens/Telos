import { useCallback, useState, type ReactNode } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { BarChart, LineChart } from "../../components/charts/Charts";
import { api } from "../../lib/api";
import { formatLoad } from "../../lib/units";
import { colors, fonts, radius, space, type } from "../../lib/theme";
import type { Dashboard, Unit } from "../../lib/types";

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.kicker}>{title}</Text>
      <View style={{ marginTop: space(2) }}>{children}</View>
    </View>
  );
}

export default function Progress() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [unit, setUnit] = useState<Unit>("kg");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    return Promise.all([api.getDashboard(), api.getMe().catch(() => null)])
      .then(([d, me]) => {
        setData(d);
        if (me) setUnit(me.unit);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load your stats."))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const weight = data ? (data.bodyweight.trend.length ? data.bodyweight.trend : data.bodyweight.entries) : [];
  const volumes = data?.weeklyVolume ?? [];
  const e1rm = (data?.e1rm ?? []).slice(0, 6);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.topbar}>
        <Text style={type.title}>Progress</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {loading && !data ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : error ? (
          <View style={styles.card}>
            <Text style={type.title}>Couldn't load</Text>
            <Text style={[type.bodyVariant, { marginTop: space(2) }]}>{error}</Text>
          </View>
        ) : data ? (
          <>
            <Card title="DAILY ENERGY">
              {data.energy.available ? (
                <>
                  <Text style={styles.bigStat}>
                    {data.energy.maintenanceKcal} <Text style={styles.unit}>kcal maintenance</Text>
                  </Text>
                  <Text style={[type.bodyVariant, { marginTop: space(1) }]}>
                    Goal range {data.energy.targetKcalLow}–{data.energy.targetKcalHigh} kcal · about{" "}
                    {data.energy.trainingKcalPerDay} kcal/day from training
                  </Text>
                </>
              ) : (
                <Text style={type.bodyVariant}>
                  Add your body details (Profile) and log a bodyweight (Today) to
                  see a daily energy estimate.
                </Text>
              )}
            </Card>

            <Card title="BODYWEIGHT">
              {weight.length >= 1 ? (
                <>
                  <Text style={styles.bigStat}>
                    {formatLoad(weight[weight.length - 1].weightKg, unit)}
                  </Text>
                  {weight.length >= 2 && (
                    <View style={{ marginTop: space(2) }}>
                      <LineChart values={weight.map((p) => p.weightKg)} />
                    </View>
                  )}
                </>
              ) : (
                <Text style={type.bodyVariant}>
                  No weight logged yet — use "Log weight" on Today.
                </Text>
              )}
            </Card>

            <Card title="WEEKLY VOLUME (SETS)">
              {volumes.length > 0 ? (
                <>
                  <BarChart values={volumes.map((v) => v.totalSets)} />
                  <Text style={[type.bodyVariant, { marginTop: space(2) }]}>
                    {volumes[volumes.length - 1].totalSets} sets this week
                  </Text>
                </>
              ) : (
                <Text style={type.bodyVariant}>Log some sessions to see your volume.</Text>
              )}
            </Card>

            <Card title="7-DAY RECOVERY">
              {data.recovery.avgScore7 > 0 ? (
                // avgScore7 is 0..1 on the wire
                <Text style={styles.bigStat}>
                  {Math.round(data.recovery.avgScore7 * 100)}{" "}
                  <Text style={styles.unit}>/ 100</Text>
                </Text>
              ) : (
                <Text style={type.bodyVariant}>
                  No check-ins yet — use "Daily check-in" on Today.
                </Text>
              )}
            </Card>

            <Card title="STRENGTH (EST. 1RM)">
              {e1rm.length > 0 ? (
                <View style={{ gap: space(3) }}>
                  {e1rm.map((ex) => {
                    const latest = ex.points[ex.points.length - 1]?.e1rmKg ?? 0;
                    return (
                      <View key={ex.exerciseId} style={{ gap: space(1) }}>
                        <View style={styles.e1rmRow}>
                          <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>
                            {ex.name}
                          </Text>
                          <Text style={type.data}>{formatLoad(latest, unit)}</Text>
                        </View>
                        {ex.points.length >= 2 && (
                          <LineChart values={ex.points.map((p) => p.e1rmKg)} height={40} />
                        )}
                      </View>
                    );
                  })}
                </View>
              ) : (
                <Text style={type.bodyVariant}>Log a few sessions to track strength trends.</Text>
              )}
            </Card>
          </>
        ) : null}
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
  scroll: { padding: space(4), gap: space(3) },
  center: { paddingVertical: space(16), alignItems: "center" },
  card: {
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    padding: space(4),
  },
  kicker: { fontFamily: fonts.bodyMedium, fontSize: 11, letterSpacing: 1, color: colors.onSurfaceVariant },
  bigStat: { fontFamily: fonts.head, fontSize: 26, color: colors.onSurface },
  unit: { fontFamily: fonts.body, fontSize: 14, color: colors.onSurfaceVariant },
  e1rmRow: { flexDirection: "row", alignItems: "center", gap: space(2) },
});
