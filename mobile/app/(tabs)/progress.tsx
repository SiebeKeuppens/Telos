import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { BarChart, LineChart } from "../../components/charts/Charts";
import { Button } from "../../components/ui/Button";
import { SyncChip } from "../../components/shell/SyncChip";
import { BodyweightSheet } from "../../components/fitness/BodyweightSheet";
import { CheckInSheet } from "../../components/fitness/CheckInSheet";
import { api } from "../../lib/api";
import { fmtDay, localDate } from "../../lib/dates";
import { workoutName } from "../../lib/i18n";
import { formatLoad, toDisplay } from "../../lib/units";
import { fonts, radius, space, withAlpha, type Palette, type TypeScale } from "../../lib/theme";
import { useTheme } from "../../lib/theme-context";
import type { CheckIn, Dashboard, Unit } from "../../lib/types";

type Tab = "overview" | "weight" | "strength" | "recovery";
const TABS: Tab[] = ["overview", "weight", "strength", "recovery"];

/** score in 0..1: (energy + sleep + motivation + (6-stress) + (6-soreness)) / 25
 * — mirrors web Progress.tsx's scoreCheckin(). */
function scoreCheckin(c: CheckIn): number {
  return (c.energy + c.sleep + c.motivation + (6 - c.stress) + (6 - c.soreness)) / 25;
}

function recoveryTierKey(avg: number): string {
  if (avg >= 0.65) return "progress.recovery.tierHigh";
  if (avg >= 0.45) return "progress.recovery.tierMid";
  return "progress.recovery.tierLow";
}

function TabBar({
  active,
  onChange,
  styles,
  colors,
  t,
}: {
  active: Tab;
  onChange: (tab: Tab) => void;
  styles: ReturnType<typeof makeStyles>;
  colors: Palette;
  t: (key: string) => string;
}) {
  return (
    <View style={styles.tabBar} accessibilityRole="tablist" accessibilityLabel={t("progress.tabsAria")}>
      {TABS.map((tab) => {
        const isActive = tab === active;
        return (
          <Pressable
            key={tab}
            style={styles.tabItem}
            onPress={() => onChange(tab)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
          >
            <Text style={[styles.tabLabel, { color: isActive ? colors.onSurface : colors.onSurfaceVariant }]}>
              {t(`progress.tabs.${tab}`)}
            </Text>
            {isActive && <View style={styles.tabIndicator} />}
          </Pressable>
        );
      })}
    </View>
  );
}

function EnergyCard({
  energy,
  goal,
  styles,
  type,
  colors,
  t,
  onNavigate,
}: {
  energy: Dashboard["energy"] | undefined;
  goal: string | undefined;
  styles: ReturnType<typeof makeStyles>;
  type: TypeScale;
  colors: Palette;
  t: (key: string, opts?: Record<string, unknown>) => string;
  onNavigate: (to: "/log" | "/profile") => void;
}) {
  if (!energy) return null;
  const fmtKcal = (n: number) => `${Math.round(n).toLocaleString()} ${t("common.kcal")}`;

  if (!energy.available) {
    const needs: string[] = [];
    if (energy.missing.includes("weight")) needs.push(t("progress.energy.missing.weight"));
    if (energy.missing.includes("height")) needs.push(t("progress.energy.missing.height"));
    if (energy.missing.includes("birthYear")) needs.push(t("progress.energy.missing.birthYear"));
    const weightOnly = energy.missing.includes("weight") && needs.length === 1;
    return (
      <View style={styles.card}>
        <Text style={type.label}>{t("progress.energy.title")}</Text>
        <Text style={[type.bodyVariant, styles.mt2]}>{t("progress.energy.missingIntro")}</Text>
        <Pressable onPress={() => onNavigate(weightOnly ? "/log" : "/profile")} style={styles.mt2}>
          <Text style={[type.body, { color: colors.primary }]}>
            {weightOnly ? t("progress.energy.logWeightLink") : t("progress.energy.addDetailsLink")}
          </Text>
        </Pressable>
      </View>
    );
  }

  const supportLabel = goal
    ? t(`progress.energy.support.${goal}`, { defaultValue: t("progress.energy.support.default") })
    : t("progress.energy.support.default");

  return (
    <View style={styles.card}>
      <Text style={type.label}>{t("progress.energy.title")}</Text>
      <Text style={[styles.energyRange, styles.mt2]}>
        {t("progress.energy.range", { low: fmtKcal(energy.targetKcalLow), high: fmtKcal(energy.targetKcalHigh) })}
      </Text>
      <Text style={[type.bodyVariant, styles.mt1]}>
        {supportLabel}
        {energy.goalAdjustPct > 0 ? ` ${t("progress.energy.maintenanceParen", { kcal: fmtKcal(energy.maintenanceKcal) })}` : ""}
      </Text>
      <Text style={[type.bodyVariant, styles.mt2]}>
        {t("progress.energy.explainer", { kcal: Math.round(energy.trainingKcalPerDay) })}
      </Text>
    </View>
  );
}

export default function Progress() {
  const router = useRouter();
  const { colors, type } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("overview");
  const [data, setData] = useState<Dashboard | null>(null);
  const [checkins, setCheckins] = useState<CheckIn[]>([]);
  const [goal, setGoal] = useState<string | undefined>();
  const [unit, setUnit] = useState<Unit>("kg");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeE1rmIdx, setActiveE1rmIdx] = useState(0);
  const [bwOpen, setBwOpen] = useState(false);
  const [ciOpen, setCiOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    return Promise.all([
      api.getDashboard(),
      api.getMe().catch(() => null),
      api.listCheckins(30).catch(() => []),
    ])
      .then(([d, me, cs]) => {
        setData(d);
        if (me) {
          setUnit(me.unit);
          setGoal(me.goal);
        }
        setCheckins(cs);
      })
      .catch((e) => setError(e instanceof Error ? e.message : t("progress.couldntLoadStats")))
      .finally(() => setLoading(false));
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const weeklyVolume = (data?.weeklyVolume ?? []).slice(-8);
  // Weight tab mirrors web's WeightTab: raw entries drive the metric, the
  // 7-day change and the recent list; the chart prefers the smoothed trend.
  const bwEntries = data
    ? [...data.bodyweight.entries].sort((a, b) => a.date.localeCompare(b.date))
    : [];
  const bwChart = data && data.bodyweight.trend.length ? data.bodyweight.trend : bwEntries;
  const latestBw = bwEntries[bwEntries.length - 1];
  const oldBw = bwEntries.find((e) => e.date >= localDate(-7));
  let bwChange = "";
  if (latestBw && oldBw && oldBw.date !== latestBw.date) {
    const deltaKg = latestBw.weightKg - oldBw.weightKg;
    const delta = Math.round(toDisplay(Math.abs(deltaKg), unit) * 10) / 10;
    const dir = deltaKg < 0 ? "↘" : deltaKg > 0 ? "↗" : "→";
    bwChange = t("progress.weight.change", { dir, value: delta, unit });
  }
  const e1rmSeries = data?.e1rm ?? [];
  const activeE1rm = e1rmSeries[Math.min(activeE1rmIdx, Math.max(0, e1rmSeries.length - 1))];

  const sortedCheckins = [...checkins].sort((a, b) => a.date.localeCompare(b.date)).slice(-30);
  const avg7 = data?.recovery.avgScore7 ?? 0;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.topbar}>
        <Text style={type.title}>{t("progress.title")}</Text>
        <SyncChip />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {loading && !data ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : error ? (
          <View style={styles.card}>
            <Text style={type.title}>{t("progress.couldntLoad")}</Text>
            <Text style={[type.bodyVariant, styles.mt2]}>{error}</Text>
            <Button label={t("common.retry")} variant="secondary" onPress={load} style={styles.mt4} />
          </View>
        ) : data ? (
          <>
            <TabBar active={tab} onChange={setTab} styles={styles} colors={colors} t={t} />

            {tab === "overview" && (
              <View style={{ gap: space(4) }}>
                <EnergyCard energy={data.energy} goal={goal} styles={styles} type={type} colors={colors} t={t} onNavigate={(to) => router.push(to)} />

                <View style={styles.card}>
                  <Text style={type.label}>{t("progress.overview.thisWeek")}</Text>
                  {weeklyVolume.length === 0 ? (
                    <Text style={[type.bodyVariant, styles.mt2]}>{t("progress.overview.emptyWorkouts")}</Text>
                  ) : (
                    <View style={styles.mt3}>
                      <BarChart values={weeklyVolume.map((v) => v.totalSets)} height={160} />
                    </View>
                  )}
                </View>

                <View style={styles.card}>
                  <Text style={type.label}>{t("progress.overview.recentWorkouts")}</Text>
                  {data.recentWorkouts.length === 0 ? (
                    <Text style={[type.bodyVariant, styles.mt2]}>{t("progress.overview.emptyWorkouts")}</Text>
                  ) : (
                    <View style={styles.mt2}>
                      {data.recentWorkouts.map((w, i) => (
                        <View key={w.id} style={[styles.divRow, i > 0 && styles.divRowBorder]}>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={type.data} numberOfLines={1}>
                              {workoutName(w.name, t)}
                            </Text>
                            <Text style={[type.bodyVariant, styles.mt1]}>
                              {fmtDay(w.date)} · {t("progress.overview.setsCount", { count: w.sets })}
                            </Text>
                          </View>
                          <Text style={[type.data, { color: colors.onSurfaceVariant }]}>
                            {formatLoad(w.volumeKg, unit)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            )}

            {tab === "weight" && (
              <View style={{ gap: space(4) }}>
                {bwEntries.length === 0 ? (
                  <View style={styles.card}>
                    <Text style={type.bodyVariant}>{t("progress.weight.empty")}</Text>
                    <Button label={t("progress.weight.logWeight")} onPress={() => setBwOpen(true)} style={styles.mt2} />
                  </View>
                ) : (
                  <>
                    <View style={styles.card}>
                      <LineChart values={bwChart.map((p) => p.weightKg)} height={160} />
                    </View>

                    {latestBw && (
                      <View style={styles.px1}>
                        <Text style={[type.metricXl, styles.metric]}>
                          {Math.round(toDisplay(latestBw.weightKg, unit) * 10) / 10}
                          <Text style={[type.bodyMd, { color: colors.onSurfaceVariant }]}> {unit}</Text>
                        </Text>
                        {bwChange ? <Text style={[type.bodyVariant, styles.mt1]}>{bwChange}</Text> : null}
                      </View>
                    )}

                    <Button label={t("progress.weight.logWeight")} variant="secondary" onPress={() => setBwOpen(true)} />

                    <View style={styles.card}>
                      <Text style={type.label}>{t("progress.weight.recentEntries")}</Text>
                      <View style={styles.mt2}>
                        {bwEntries
                          .slice(-7)
                          .reverse()
                          .map((e, i) => (
                            <View key={e.date} style={[styles.divRow, i > 0 && styles.divRowBorder]}>
                              <Text style={type.bodyVariant}>{fmtDay(e.date)}</Text>
                              <Text style={type.data}>{Math.round(toDisplay(e.weightKg, unit) * 10) / 10} {unit}</Text>
                            </View>
                          ))}
                      </View>
                    </View>
                  </>
                )}
              </View>
            )}

            {tab === "strength" && (
              <View style={{ gap: space(4) }}>
                {e1rmSeries.length === 0 ? (
                  <Text style={[type.bodyVariant, styles.centerText]}>{t("progress.strength.empty")}</Text>
                ) : (
                  <>
                    <View style={styles.chipRow}>
                      {e1rmSeries.slice(0, 4).map((s, i) => {
                        const active = i === activeE1rmIdx;
                        return (
                          <Pressable
                            key={s.exerciseId}
                            onPress={() => setActiveE1rmIdx(i)}
                            style={[
                              styles.chip,
                              active
                                ? { backgroundColor: withAlpha(colors.primary, 0.14), borderColor: withAlpha(colors.primary, 0.3) }
                                : { backgroundColor: colors.surfaceContainerHigh, borderColor: colors.outlineVariant },
                            ]}
                          >
                            <Text style={[type.label, { color: active ? colors.primary : colors.onSurfaceVariant }]}>
                              {s.name}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    {activeE1rm && (
                      <View style={styles.card}>
                        <LineChart values={activeE1rm.points.map((p) => p.e1rmKg)} height={200} />
                      </View>
                    )}

                    <Text style={[type.bodyVariant, styles.px1]}>{t("progress.strength.explainer")}</Text>
                  </>
                )}
              </View>
            )}

            {tab === "recovery" && (
              <View style={{ gap: space(4) }}>
                {sortedCheckins.length === 0 ? (
                  <>
                    <Text style={[type.bodyVariant, styles.centerText]}>{t("progress.recovery.empty")}</Text>
                    <Button label={t("progress.recovery.checkIn")} onPress={() => setCiOpen(true)} />
                  </>
                ) : (
                  <>
                    <View style={styles.card}>
                      <LineChart values={sortedCheckins.map((c) => Math.round(scoreCheckin(c) * 100))} height={160} />
                    </View>

                    <View style={styles.px1}>
                      <Text style={type.data}>
                        {t("progress.recovery.sevenDayAverage")}{" "}
                        <Text style={{ color: colors.primary }}>{Math.round(avg7 * 100)}%</Text>
                      </Text>
                      <Text style={[type.bodyVariant, styles.mt1]}>{t(recoveryTierKey(avg7))}</Text>
                    </View>

                    <Button label={t("progress.recovery.checkIn")} variant="secondary" onPress={() => setCiOpen(true)} />

                    <View style={styles.card}>
                      <Text style={type.label}>{t("progress.recovery.recentCheckins")}</Text>
                      <View style={styles.mt2}>
                        {sortedCheckins
                          .slice()
                          .reverse()
                          .slice(0, 7)
                          .map((c, i) => (
                            <View key={c.id} style={[styles.divRow, i > 0 && styles.divRowBorder]}>
                              <Text style={type.bodyVariant}>{fmtDay(c.date)}</Text>
                              <View style={styles.abbrRow}>
                                <Text style={styles.abbr}>{t("progress.recovery.abbr.energy")}{c.energy}</Text>
                                <Text style={styles.abbr}>{t("progress.recovery.abbr.stress")}{c.stress}</Text>
                                <Text style={styles.abbr}>{t("progress.recovery.abbr.sleep")}{c.sleep}</Text>
                                <Text style={styles.abbr}>{t("progress.recovery.abbr.motivation")}{c.motivation}</Text>
                                <Text style={styles.abbr}>{t("progress.recovery.abbr.soreness")}{c.soreness}</Text>
                              </View>
                            </View>
                          ))}
                      </View>
                    </View>
                  </>
                )}
              </View>
            )}
          </>
        ) : null}
      </ScrollView>

      <BodyweightSheet open={bwOpen} onClose={() => setBwOpen(false)} unit={unit} lastWeightKg={latestBw?.weightKg} onSaved={load} />
      <CheckInSheet open={ciOpen} onClose={() => setCiOpen(false)} existing={checkins.find((c) => c.date === localDate())} onSaved={load} />
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
    centerText: { textAlign: "center", paddingVertical: space(6) },
    card: {
      backgroundColor: colors.surfaceContainer,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      padding: space(4),
    },
    tabBar: {
      flexDirection: "row",
      borderBottomWidth: 1,
      borderBottomColor: colors.outlineVariant,
      marginBottom: space(4),
    },
    tabItem: {
      flex: 1,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
    },
    tabLabel: {
      fontFamily: fonts.headMedium,
      fontSize: 11,
      letterSpacing: 0.88,
      textTransform: "uppercase",
    },
    tabIndicator: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      height: 2,
      borderRadius: 1,
      backgroundColor: colors.primary,
    },
    energyRange: {
      fontFamily: fonts.headMedium,
      fontSize: 22,
      lineHeight: 28,
      color: colors.onSurface,
      fontVariant: ["tabular-nums"],
    },
    // Space Grotesk's ascent overflows the web's tight 48px metric line box;
    // the browser lets glyphs overflow, Android CLIPS them — give the digits
    // their full line height (~1.28em, scales with the OS font scale).
    metric: { lineHeight: 56 },
    divRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: space(3),
      paddingVertical: space(2.5),
    },
    // Web uses `divide-y` (border only BETWEEN rows) — applied to every row
    // after the first so a lone or first entry has no leading hairline.
    divRowBorder: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.outlineVariant,
    },
    chipRow: { flexDirection: "row", flexWrap: "wrap", gap: space(2) },
    chip: {
      paddingHorizontal: space(3),
      height: 36,
      borderRadius: radius.pill,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    abbrRow: { flexDirection: "row", gap: space(2) },
    abbr: {
      fontFamily: fonts.headMedium,
      fontSize: 10,
      color: colors.onSurfaceVariant,
    },
    px1: { paddingHorizontal: space(1) },
    mt1: { marginTop: space(1) },
    mt2: { marginTop: space(2) },
    mt3: { marginTop: space(3) },
    mt4: { marginTop: space(4) },
  });
