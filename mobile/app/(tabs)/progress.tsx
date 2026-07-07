import { useCallback, useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { BarChart, LineChart } from "../../components/charts/Charts";
import { api } from "../../lib/api";
import { formatLoad } from "../../lib/units";
import { fonts, radius, space, type Palette } from "../../lib/theme";
import { useTheme } from "../../lib/theme-context";
import type { Dashboard, Unit } from "../../lib/types";

function Card({ title, children, styles }: { title: string; children: ReactNode; styles: ReturnType<typeof makeStyles> }) {
  return (
    <View style={styles.card}>
      <Text style={styles.kicker}>{title}</Text>
      <View style={{ marginTop: space(2) }}>{children}</View>
    </View>
  );
}

export default function Progress() {
  const { colors, type } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
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
      .catch((e) => setError(e instanceof Error ? e.message : t("progress.couldntLoadStats")))
      .finally(() => setLoading(false));
  }, [t]);

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
        <Text style={type.title}>{t("progress.title")}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {loading && !data ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : error ? (
          <View style={styles.card}>
            <Text style={type.title}>{t("progress.couldntLoad")}</Text>
            <Text style={[type.bodyVariant, { marginTop: space(2) }]}>{error}</Text>
          </View>
        ) : data ? (
          <>
            <Card title={t("progress.energy.title")} styles={styles}>
              {data.energy.available ? (
                <>
                  <Text style={styles.bigStat}>
                    {data.energy.maintenanceKcal} <Text style={styles.unit}>{t("progress.energy.maintenance")}</Text>
                  </Text>
                  <Text style={[type.bodyVariant, { marginTop: space(1) }]}>
                    {t("progress.energy.rangeLine", {
                      low: data.energy.targetKcalLow,
                      high: data.energy.targetKcalHigh,
                      kcal: data.energy.trainingKcalPerDay,
                    })}
                  </Text>
                </>
              ) : (
                <Text style={type.bodyVariant}>
                  {t("progress.energy.missingIntro")}
                </Text>
              )}
            </Card>

            <Card title={t("progress.weight.title")} styles={styles}>
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
                  {t("progress.weight.empty")}
                </Text>
              )}
            </Card>

            <Card title={t("progress.weeklyVolume.title")} styles={styles}>
              {volumes.length > 0 ? (
                <>
                  <BarChart values={volumes.map((v) => v.totalSets)} />
                  <Text style={[type.bodyVariant, { marginTop: space(2) }]}>
                    {t("progress.weeklyVolume.setsThisWeek", { count: volumes[volumes.length - 1].totalSets })}
                  </Text>
                </>
              ) : (
                <Text style={type.bodyVariant}>{t("progress.weeklyVolume.empty")}</Text>
              )}
            </Card>

            <Card title={t("progress.recovery.title")} styles={styles}>
              {data.recovery.avgScore7 > 0 ? (
                // avgScore7 is 0..1 on the wire
                <Text style={styles.bigStat}>
                  {Math.round(data.recovery.avgScore7 * 100)}{" "}
                  <Text style={styles.unit}>{t("progress.recovery.outOf100")}</Text>
                </Text>
              ) : (
                <Text style={type.bodyVariant}>
                  {t("progress.recovery.empty")}
                </Text>
              )}
            </Card>

            <Card title={t("progress.strength.title")} styles={styles}>
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
                <Text style={type.bodyVariant}>{t("progress.strength.empty")}</Text>
              )}
            </Card>
          </>
        ) : null}
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
