// Progress screen — Overview · Weight · Strength · Recovery tabs.
// Charts are instruments: tokens only, horizontal gridlines only, no legends.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
} from "recharts";
import { AppShell } from "../components/shell/AppShell";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { BodyweightSheet } from "../components/fitness/BodyweightSheet";
import { CheckInSheet } from "../components/fitness/CheckInSheet";
import { api, queryKeys } from "../lib/api";
import { formatLoad, toDisplay, todayISO } from "../lib/units";
import { dateLocale, workoutName } from "../i18n";
import type { CheckIn, Dashboard, Unit } from "../lib/types";

// ---- Inline tab bar -------------------------------------------------------

type Tab = "overview" | "weight" | "strength" | "recovery";
const TABS: Tab[] = ["overview", "weight", "strength", "recovery"];

function TabBar({
  active,
  onChange,
}: {
  active: Tab;
  onChange: (t: Tab) => void;
}) {
  const { t } = useTranslation("progress");
  return (
    <div
      className="flex border-b border-outline-variant mb-4"
      role="tablist"
      aria-label={t("tabsAria")}
    >
      {TABS.map((tab) => (
        <button
          key={tab}
          role="tab"
          aria-selected={active === tab}
          onClick={() => onChange(tab)}
          className={`relative flex-1 h-11 type-label text-[11px] tracking-wide transition-colors select-none ${
            active === tab
              ? "text-on-surface"
              : "text-on-surface-variant hover:text-on-surface"
          }`}
        >
          {t(`tabs.${tab}`)}
          {active === tab && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
          )}
        </button>
      ))}
    </div>
  );
}

// ---- Shared tooltip -------------------------------------------------------

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; unit?: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="bg-surface-container-highest rounded-lg px-3 py-2 shadow-[0_4px_16px_rgba(0,0,0,0.4)]"
      style={{ border: "1px solid var(--outline-variant)" }}
    >
      {label && (
        <p className="type-label text-on-surface-variant mb-1">{label}</p>
      )}
      {payload.map((p, i) => (
        <p key={i} className="type-data text-on-surface">
          {p.name ? `${p.name}: ` : ""}
          {p.value !== undefined
            ? typeof p.value === "number"
              ? Math.round(p.value * 10) / 10
              : p.value
            : "—"}
          {p.unit ? ` ${p.unit}` : ""}
        </p>
      ))}
    </div>
  );
}

// ---- Shared axis tick style -----------------------------------------------
// Font family comes from the global `.recharts-text` rule (var(--font-head)).
const axisStyle = {
  fill: "var(--on-surface-variant)",
  fontSize: 11,
} as const;

// ---- Format short date label ----------------------------------------------
// Parse YYYY-MM-DD as a LOCAL date: `Date.parse` would treat it as UTC
// midnight, which renders the previous day in negative-offset timezones.
function parseLocalDay(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
function fmtDate(iso: string): string {
  return parseLocalDay(iso).toLocaleDateString(dateLocale(), {
    month: "short",
    day: "numeric",
  });
}
function fmtWeek(iso: string): string {
  return fmtDate(iso);
}

// ---- Empty state ----------------------------------------------------------
function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="type-body-sm text-on-surface-variant py-6 text-center">
      {children}
    </p>
  );
}

// ---- Daily energy card ------------------------------------------------------
// A guide, not a rule: maintenance estimate + a goal-support range derived
// from logged training. Never shows a deficit (wellbeing guardrail).

function EnergyCard({ energy }: { energy: Dashboard["energy"] | undefined }) {
  const { t } = useTranslation(["progress", "common"]);
  const navigate = useNavigate();
  const me = useQuery({ queryKey: queryKeys.me, queryFn: api.getMe });
  if (!energy) return null;

  const fmtKcal = (n: number): string =>
    `${Math.round(n).toLocaleString(dateLocale())} ${t("common:kcal")}`;

  if (!energy.available) {
    const needs: string[] = [];
    if (energy.missing.includes("weight")) needs.push(t("energy.missing.weight"));
    if (energy.missing.includes("height")) needs.push(t("energy.missing.height"));
    if (energy.missing.includes("birthYear")) needs.push(t("energy.missing.birthYear"));
    return (
      <Card className="p-4 space-y-2">
        <p className="type-label text-on-surface-variant">{t("energy.title")}</p>
        <p className="type-body-sm text-on-surface-variant">
          {t("energy.missingIntro", { list: needs.join(", ") })}
        </p>
        <button
          type="button"
          onClick={() =>
            navigate(energy.missing.includes("weight") && needs.length === 1 ? "/log" : "/profile")
          }
          className="type-body-sm text-primary text-left"
        >
          {energy.missing.includes("weight") && needs.length === 1
            ? t("energy.logWeightLink")
            : t("energy.addDetailsLink")}
        </button>
      </Card>
    );
  }

  const goal = me.data?.goal;
  const supportLabel = goal
    ? t(`energy.support.${goal}`, { defaultValue: t("energy.support.default") })
    : t("energy.support.default");
  return (
    <Card className="p-4 space-y-3">
      <p className="type-label text-on-surface-variant">{t("energy.title")}</p>
      <div>
        <p className="type-data !text-[22px] !leading-7 text-on-surface">
          {t("energy.range", {
            low: fmtKcal(energy.targetKcalLow),
            high: fmtKcal(energy.targetKcalHigh),
          })}
        </p>
        <p className="type-body-sm text-on-surface-variant mt-0.5">
          {supportLabel}
          {energy.goalAdjustPct > 0 &&
            ` ${t("energy.maintenance", { kcal: fmtKcal(energy.maintenanceKcal) })}`}
        </p>
      </div>
      <p className="type-body-sm text-on-surface-variant">
        {t("energy.explainer", { kcal: Math.round(energy.trainingKcalPerDay) })}
      </p>
    </Card>
  );
}

// ===========================================================================
// TAB: Overview
// ===========================================================================

function OverviewTab({
  dashboard,
  unit,
}: {
  dashboard: Dashboard | undefined;
  unit: Unit;
}) {
  const { t } = useTranslation("progress");
  if (!dashboard) return null;

  const weeklyData = (dashboard.weeklyVolume ?? []).slice(-8).map((w, i, arr) => ({
    week: fmtWeek(w.weekStart),
    sets: w.totalSets,
    isCurrent: i === arr.length - 1,
  }));

  return (
    <div className="space-y-4">
      {/* Daily energy estimate */}
      <EnergyCard energy={dashboard.energy} />

      {/* Weekly volume chart */}
      <Card className="p-4">
        <p className="type-label text-on-surface-variant mb-3">{t("overview.thisWeek")}</p>
        {weeklyData.length === 0 ? (
          <Empty>{t("overview.emptyWorkouts")}</Empty>
        ) : (
          <ResponsiveContainer width="100%" height={160}>
            <BarChart
              data={weeklyData}
              margin={{ top: 4, right: 0, left: -20, bottom: 0 }}
            >
              <CartesianGrid
                vertical={false}
                stroke="var(--outline-variant)"
                strokeDasharray=""
              />
              <XAxis
                dataKey="week"
                tick={axisStyle}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={axisStyle}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                content={<ChartTooltip />}
                cursor={{ fill: "color-mix(in srgb, var(--primary) 8%, transparent)" }}
              />
              <Bar
                dataKey="sets"
                radius={3}
                name={t("overview.sets")}
                fill="var(--surface-container-highest)"
              >
                {weeklyData.map((entry, index) => (
                  <Cell
                    key={`bar-${index}`}
                    fill={
                      entry.isCurrent
                        ? "var(--primary)"
                        : "var(--surface-container-highest)"
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Recent workouts */}
      <Card className="p-4">
        <p className="type-label text-on-surface-variant mb-3">{t("overview.recentWorkouts")}</p>
        {dashboard.recentWorkouts.length === 0 ? (
          <Empty>{t("overview.emptyWorkouts")}</Empty>
        ) : (
          <div className="divide-y divide-outline-variant">
            {dashboard.recentWorkouts.map((w) => (
              <div key={w.id} className="py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="type-data text-on-surface truncate">{workoutName(w.name)}</p>
                  <p className="type-body-sm text-on-surface-variant mt-0.5">
                    {fmtDate(w.date)} · {t("overview.setsCount", { count: w.sets })}
                  </p>
                </div>
                <span className="type-data text-on-surface-variant shrink-0">
                  {formatLoad(w.volumeKg, unit)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ===========================================================================
// TAB: Weight
// ===========================================================================

// Custom scatter dot: faint raw point
function RawDot(props: {
  cx?: number;
  cy?: number;
}) {
  const { cx, cy } = props;
  if (cx === undefined || cy === undefined) return null;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={2}
      fill="var(--on-surface-variant)"
      fillOpacity={0.4}
    />
  );
}

function WeightTab({
  dashboard,
  unit,
  onLogWeight,
}: {
  dashboard: Dashboard | undefined;
  unit: Unit;
  onLogWeight: () => void;
}) {
  const { t } = useTranslation("progress");
  if (!dashboard) return null;

  const entries = dashboard.bodyweight.entries ?? [];
  const trend = dashboard.bodyweight.trend ?? [];

  // Merge raw + trend into one dataset keyed by date
  const dateSet = new Set([
    ...entries.map((e) => e.date),
    ...trend.map((t) => t.date),
  ]);
  const sortedDates = Array.from(dateSet).sort();

  const rawByDate = new Map<string, number>(
    entries.map((e) => [e.date, toDisplay(e.weightKg, unit)]),
  );
  const trendByDate = new Map<string, number>(
    trend.map((t) => [t.date, toDisplay(t.weightKg, unit)]),
  );

  const chartData = sortedDates.map((date) => ({
    date,
    label: fmtDate(date),
    raw: rawByDate.get(date),
    trend: trendByDate.get(date),
  }));

  // Domain: padded ±1 in user unit
  const allVals = [
    ...entries.map((e) => toDisplay(e.weightKg, unit)),
    ...trend.map((t) => toDisplay(t.weightKg, unit)),
  ];
  const minVal = allVals.length ? Math.floor(Math.min(...allVals)) - 1 : 0;
  const maxVal = allVals.length ? Math.ceil(Math.max(...allVals)) + 1 : 100;

  // Latest weight + 7-day change
  const sortedEntries = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sortedEntries[sortedEntries.length - 1];
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoISO = sevenDaysAgo.toISOString().slice(0, 10);
  const oldEntry = sortedEntries.find((e) => e.date >= sevenDaysAgoISO);
  let changeLine = "";
  if (latest && oldEntry && oldEntry.date !== latest.date) {
    const deltaKg = latest.weightKg - oldEntry.weightKg;
    const delta = toDisplay(Math.abs(deltaKg), unit);
    const rounded = Math.round(delta * 10) / 10;
    const dir = deltaKg < 0 ? "↘" : deltaKg > 0 ? "↗" : "→";
    changeLine = t("weight.change", { dir, value: rounded, unit });
  }

  // Recent entries list (last 7)
  const recentEntries = sortedEntries.slice(-7).reverse();

  return (
    <div className="space-y-4">
      {entries.length === 0 ? (
        <Card className="p-4">
          <Empty>{t("weight.empty")}</Empty>
          <Button onClick={onLogWeight} className="mt-2">
            {t("weight.logWeight")}
          </Button>
        </Card>
      ) : (
        <>
          {/* Chart */}
          <Card className="p-4">
            <ResponsiveContainer width="100%" height={180}>
              <ComposedChart
                data={chartData}
                margin={{ top: 4, right: 0, left: -20, bottom: 0 }}
              >
                <CartesianGrid
                  vertical={false}
                  stroke="var(--outline-variant)"
                  strokeDasharray=""
                />
                <XAxis
                  dataKey="label"
                  tick={axisStyle}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={axisStyle}
                  axisLine={false}
                  tickLine={false}
                  domain={[minVal, maxVal]}
                  unit={` ${unit}`}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div
                        className="bg-surface-container-highest rounded-lg px-3 py-2 shadow-[0_4px_16px_rgba(0,0,0,0.4)]"
                        style={{ border: "1px solid var(--outline-variant)" }}
                      >
                        <p className="type-label text-on-surface-variant mb-1">
                          {label}
                        </p>
                        {payload.map((p, i) =>
                          p.value !== undefined ? (
                            <p key={i} className="type-data text-on-surface">
                              {p.name === "trend" ? t("weight.trend") : t("weight.logged")}:{" "}
                              {Math.round((p.value as number) * 10) / 10} {unit}
                            </p>
                          ) : null,
                        )}
                      </div>
                    );
                  }}
                />
                {/* Area under trend */}
                <Area
                  type="monotone"
                  dataKey="trend"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  fill="color-mix(in srgb, var(--primary) 14%, transparent)"
                  dot={false}
                  activeDot={false}
                  connectNulls
                />
                {/* Raw dots — rendered as scatter-like points via Line with custom dot */}
                <Line
                  type="monotone"
                  dataKey="raw"
                  stroke="none"
                  dot={(props: { cx?: number; cy?: number; index?: number }) => (
                    <RawDot key={props.index} cx={props.cx} cy={props.cy} />
                  )}
                  activeDot={false}
                  connectNulls={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </Card>

          {/* Big number + change */}
          {latest && (
            <div className="px-1">
              <p className="type-metric-xl text-on-surface">
                {Math.round(toDisplay(latest.weightKg, unit) * 10) / 10}
                <span className="type-body-md text-on-surface-variant ml-2">
                  {unit}
                </span>
              </p>
              {changeLine && (
                <p className="type-body-sm text-on-surface-variant mt-1">
                  {changeLine}
                </p>
              )}
            </div>
          )}

          <Button variant="secondary" fullWidth={false} className="w-full" onClick={onLogWeight}>
            {t("weight.logWeight")}
          </Button>

          {/* Recent entries list */}
          {recentEntries.length > 0 && (
            <Card className="p-4">
              <p className="type-label text-on-surface-variant mb-3">
                {t("weight.recentEntries")}
              </p>
              <div className="divide-y divide-outline-variant">
                {recentEntries.map((e) => (
                  <div
                    key={e.date}
                    className="py-2.5 flex items-center justify-between"
                  >
                    <span className="type-body-sm text-on-surface-variant">
                      {fmtDate(e.date)}
                    </span>
                    <span className="type-data text-on-surface">
                      {Math.round(toDisplay(e.weightKg, unit) * 10) / 10} {unit}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ===========================================================================
// TAB: Strength
// ===========================================================================

function StrengthTab({
  dashboard,
  unit,
}: {
  dashboard: Dashboard | undefined;
  unit: Unit;
}) {
  const { t } = useTranslation("progress");
  const series = dashboard?.e1rm ?? [];
  const [activeIdx, setActiveIdx] = useState(0);

  if (series.length === 0) {
    return <Empty>{t("strength.empty")}</Empty>;
  }

  const active = series[Math.min(activeIdx, series.length - 1)];
  const chartData = active.points
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((p) => ({
      date: fmtDate(p.date),
      e1rm: Math.round(toDisplay(p.e1rmKg, unit) * 10) / 10,
    }));

  const vals = chartData.map((d) => d.e1rm);
  const minV = vals.length ? Math.floor(Math.min(...vals)) - 2 : 0;
  const maxV = vals.length ? Math.ceil(Math.max(...vals)) + 2 : 100;

  return (
    <div className="space-y-4">
      {/* Selector chips */}
      <div className="flex flex-wrap gap-2">
        {series.slice(0, 4).map((s, i) => (
          <button
            key={s.exerciseId}
            onClick={() => setActiveIdx(i)}
            className={`px-3 h-9 rounded-full type-label text-[11px] border transition-colors ${
              activeIdx === i
                ? "tint-primary-14 text-primary border-[color-mix(in_srgb,var(--primary)_30%,transparent)]"
                : "bg-surface-container-high text-on-surface-variant border-outline-variant"
            }`}
          >
            {s.name}
          </button>
        ))}
      </div>

      {/* Chart */}
      <Card className="p-4">
        <ResponsiveContainer width="100%" height={200}>
          <LineChart
            data={chartData}
            margin={{ top: 4, right: 0, left: -20, bottom: 0 }}
          >
            <CartesianGrid
              vertical={false}
              stroke="var(--outline-variant)"
              strokeDasharray=""
            />
            <XAxis
              dataKey="date"
              tick={axisStyle}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={axisStyle}
              axisLine={false}
              tickLine={false}
              domain={[minV, maxV]}
              unit={` ${unit}`}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                return (
                  <div
                    className="bg-surface-container-highest rounded-lg px-3 py-2 shadow-[0_4px_16px_rgba(0,0,0,0.4)]"
                    style={{ border: "1px solid var(--outline-variant)" }}
                  >
                    <p className="type-label text-on-surface-variant mb-1">
                      {label}
                    </p>
                    <p className="type-data text-on-surface">
                      {t("strength.tooltip", { value: payload[0].value, unit })}
                    </p>
                  </div>
                );
              }}
            />
            <Line
              type="monotone"
              dataKey="e1rm"
              stroke="var(--primary)"
              strokeWidth={2}
              dot={{ fill: "var(--primary)", r: 3, strokeWidth: 0 }}
              activeDot={{ fill: "var(--primary)", r: 4, strokeWidth: 0 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <p className="type-body-sm text-on-surface-variant px-1">
        {t("strength.explainer")}
      </p>
    </div>
  );
}

// ===========================================================================
// TAB: Recovery
// ===========================================================================

/** score ∈ 0..1: (energy + sleep + motivation + (6-stress) + (6-soreness)) / 25 */
function scoreCheckin(c: CheckIn): number {
  return (c.energy + c.sleep + c.motivation + (6 - c.stress) + (6 - c.soreness)) / 25;
}

/** i18n key for the recovery tier sentence under the 7-day average. */
function recoveryTierKey(avg: number): string {
  if (avg >= 0.65) return "recovery.tierHigh";
  if (avg >= 0.45) return "recovery.tierMid";
  return "recovery.tierLow";
}

function RecoveryTab({
  dashboard,
  onCheckIn,
}: {
  dashboard: Dashboard | undefined;
  onCheckIn: () => void;
}) {
  const { t } = useTranslation("progress");
  if (!dashboard) return null;

  const checkins = dashboard.recovery.checkins ?? [];
  const avg7 = dashboard.recovery.avgScore7 ?? 0;

  if (checkins.length === 0) {
    return (
      <div className="space-y-4">
        <Empty>{t("recovery.empty")}</Empty>
        <Button onClick={onCheckIn}>{t("recovery.checkIn")}</Button>
      </div>
    );
  }

  // Build last-30-day chart data
  const sorted = [...checkins]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30);

  const chartData = sorted.map((c) => ({
    date: fmtDate(c.date),
    score: Math.round(scoreCheckin(c) * 100),
  }));

  return (
    <div className="space-y-4">
      {/* Area chart */}
      <Card className="p-4">
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart
            data={chartData}
            margin={{ top: 4, right: 0, left: -28, bottom: 0 }}
          >
            <CartesianGrid
              vertical={false}
              stroke="var(--outline-variant)"
              strokeDasharray=""
            />
            <XAxis
              dataKey="date"
              tick={axisStyle}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={axisStyle}
              axisLine={false}
              tickLine={false}
              domain={[0, 100]}
              unit="%"
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                return (
                  <div
                    className="bg-surface-container-highest rounded-lg px-3 py-2 shadow-[0_4px_16px_rgba(0,0,0,0.4)]"
                    style={{ border: "1px solid var(--outline-variant)" }}
                  >
                    <p className="type-label text-on-surface-variant mb-1">{label}</p>
                    <p className="type-data text-on-surface">
                      {t("recovery.tooltip", { value: payload[0].value })}
                    </p>
                  </div>
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="score"
              stroke="var(--primary)"
              strokeWidth={2}
              fill="color-mix(in srgb, var(--primary) 14%, transparent)"
              dot={false}
              activeDot={{ fill: "var(--primary)", r: 3, strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      {/* 7-day average + message */}
      <div className="px-1 space-y-1">
        <p className="type-data text-on-surface">
          {t("recovery.sevenDayAverage")}{" "}
          <span className="text-primary">
            {Math.round(avg7 * 100)}%
          </span>
        </p>
        <p className="type-body-sm text-on-surface-variant">
          {t(recoveryTierKey(avg7))}
        </p>
      </div>

      <Button variant="secondary" fullWidth={false} className="w-full" onClick={onCheckIn}>
        {t("recovery.checkIn")}
      </Button>

      {/* Recent check-ins */}
      <Card className="p-4">
        <p className="type-label text-on-surface-variant mb-3">
          {t("recovery.recentCheckins")}
        </p>
        <div className="divide-y divide-outline-variant">
          {sorted
            .slice()
            .reverse()
            .slice(0, 7)
            .map((c) => (
              <div
                key={c.id}
                className="py-2.5 flex items-center justify-between gap-3"
              >
                <span className="type-body-sm text-on-surface-variant">
                  {fmtDate(c.date)}
                </span>
                <div className="flex gap-2 type-label text-[10px] text-on-surface-variant">
                  <span title={t("recovery.metrics.energy")}>{t("recovery.abbr.energy")}{c.energy}</span>
                  <span title={t("recovery.metrics.stress")}>{t("recovery.abbr.stress")}{c.stress}</span>
                  <span title={t("recovery.metrics.sleep")}>{t("recovery.abbr.sleep")}{c.sleep}</span>
                  <span title={t("recovery.metrics.motivation")}>{t("recovery.abbr.motivation")}{c.motivation}</span>
                  <span title={t("recovery.metrics.soreness")}>{t("recovery.abbr.soreness")}{c.soreness}</span>
                </div>
              </div>
            ))}
        </div>
      </Card>
    </div>
  );
}

// ===========================================================================
// ROOT EXPORT
// ===========================================================================

export default function Progress() {
  const { t } = useTranslation(["progress", "common"]);
  const [tab, setTab] = useState<Tab>("overview");
  const [bwOpen, setBwOpen] = useState(false);
  const [ciOpen, setCiOpen] = useState(false);

  const dashQ = useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: api.getDashboard,
  });
  const meQ = useQuery({
    queryKey: queryKeys.me,
    queryFn: api.getMe,
  });
  const bwQ = useQuery({
    queryKey: queryKeys.bodyweight,
    queryFn: () => api.listBodyweight(90),
  });
  const ciQ = useQuery({
    queryKey: queryKeys.checkins,
    queryFn: () => api.listCheckins(30),
  });

  const unit: Unit = meQ.data?.unit ?? "kg";
  const dashboard = dashQ.data;

  // Today's check-in
  const today = todayISO();
  const todayCheckin = ciQ.data?.find((c) => c.date === today);

  // Latest bodyweight for seeding the sheet
  const lastEntry = bwQ.data?.slice().sort((a, b) => a.date.localeCompare(b.date)).pop();

  if (dashQ.isPending) {
    return (
      <AppShell title={t("common:nav.progress")}>
        <div className="type-body-sm text-on-surface-variant text-center py-12">
          {t("common:loading")}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title={t("common:nav.progress")}>
      <TabBar active={tab} onChange={setTab} />

      {tab === "overview" && (
        <OverviewTab dashboard={dashboard} unit={unit} />
      )}
      {tab === "weight" && (
        <WeightTab
          dashboard={dashboard}
          unit={unit}
          onLogWeight={() => setBwOpen(true)}
        />
      )}
      {tab === "strength" && (
        <StrengthTab dashboard={dashboard} unit={unit} />
      )}
      {tab === "recovery" && (
        <RecoveryTab
          dashboard={dashboard}
          onCheckIn={() => setCiOpen(true)}
        />
      )}

      <BodyweightSheet
        open={bwOpen}
        onClose={() => setBwOpen(false)}
        unit={unit}
        lastWeightKg={lastEntry?.weightKg}
      />
      <CheckInSheet
        open={ciOpen}
        onClose={() => setCiOpen(false)}
        existing={todayCheckin}
      />
    </AppShell>
  );
}
