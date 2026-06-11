// Today screen — hero session card, engine notes, weekly arc, quick actions.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { workoutName } from "../i18n";
import { AppShell } from "../components/shell/AppShell";
import { Arc } from "../components/ui/Arc";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { BodyweightSheet } from "../components/fitness/BodyweightSheet";
import { CheckInSheet } from "../components/fitness/CheckInSheet";
import { api, queryKeys } from "../lib/api";
import { enqueue } from "../lib/sync";
import { todayISO } from "../lib/units";
import type { Workout } from "../lib/types";

// ---- helpers ----------------------------------------------------------------

function estimateMinutes(workout: Workout): number {
  if (!workout.exercises?.length) return 0;
  const totalSeconds = workout.exercises.reduce(
    (sum, we) => sum + we.targetSets * (we.restSeconds + 45),
    0,
  );
  const mins = totalSeconds / 60;
  return Math.max(5, Math.round(mins / 5) * 5);
}

function selectTodayWorkout(workouts: Workout[]): Workout | null {
  if (!workouts.length) return null;
  const today = todayISO();

  // 1. first in_progress
  const inProg = workouts.find((w) => w.status === "in_progress");
  if (inProg) return inProg;

  // 2. first planned with scheduledFor <= today
  const due = workouts
    .filter(
      (w) =>
        w.status === "planned" &&
        w.scheduledFor != null &&
        w.scheduledFor <= today,
    )
    .sort((a, b) => (a.scheduledFor ?? "").localeCompare(b.scheduledFor ?? ""));
  if (due.length) return due[0];

  // 3. next planned
  const next = workouts
    .filter((w) => w.status === "planned" && w.scheduledFor != null)
    .sort((a, b) => (a.scheduledFor ?? "").localeCompare(b.scheduledFor ?? ""));
  return next[0] ?? null;
}

// ---- engine note callout ----------------------------------------------------

// The engine ships stable note CODES; deloads and eased days get the warning
// tint, everything else the accent tint.
function isWarningNote(code: string): boolean {
  return code.startsWith("deload_") || code === "eased_today";
}

function EngineNote({ code }: { code: string }) {
  const { t } = useTranslation("common");
  const isWarning = isWarningNote(code);
  return (
    <div
      className={`rounded-lg px-4 py-3 border ${
        isWarning
          ? "border-[color-mix(in_srgb,var(--warning)_40%,var(--outline-variant))] bg-[color-mix(in_srgb,var(--warning)_8%,transparent)] text-warning"
          : "border-[color-mix(in_srgb,var(--primary)_30%,var(--outline-variant))] tint-primary-8 text-primary"
      }`}
    >
      <p className="type-body-sm">{t(`notes.${code}`)}</p>
    </div>
  );
}

// ---- main -------------------------------------------------------------------

export default function Today() {
  const { t } = useTranslation("today");
  const navigate = useNavigate();

  const [bwOpen, setBwOpen] = useState(false);
  const [ciOpen, setCiOpen] = useState(false);

  const program = useQuery({
    queryKey: queryKeys.program,
    queryFn: api.getProgram,
  });
  const me = useQuery({ queryKey: queryKeys.me, queryFn: api.getMe });
  const exercises = useQuery({
    queryKey: queryKeys.exercises,
    queryFn: api.getExercises,
  });
  const bodyweight = useQuery({
    queryKey: queryKeys.bodyweight,
    queryFn: () => api.listBodyweight(90),
  });
  const checkins = useQuery({
    queryKey: queryKeys.checkins,
    queryFn: () => api.listCheckins(30),
  });

  const unit = me.data?.unit ?? "kg";
  const today = todayISO();

  const todayCheckin = checkins.data?.find((c) => c.date === today);
  // Entries arrive oldest-first; the latest weight is the last element.
  const lastWeightKg = bodyweight.data?.at(-1)?.weightKg;

  // exercise name lookup
  const exMap = new Map(exercises.data?.map((e) => [e.id, e]) ?? []);

  // Weekly progress arc — count only the CURRENT program's week (a raw
  // date-range workout query would also count leftovers from archived
  // programs after a goal change).
  const weekAll = program.data?.workouts ?? [];
  const weekCompleted = weekAll.filter((w) => w.status === "completed").length;
  const weekTotal = Math.max(
    weekAll.length,
    program.data?.program?.daysPerWeek ?? me.data?.daysPerWeek ?? 3,
  );

  const workouts = program.data?.workouts ?? [];
  const todayWorkout = selectTodayWorkout(workouts);
  const notes = program.data?.notes ?? [];

  const noProgram =
    program.isSuccess &&
    (program.data.program === null || workouts.length === 0);

  const startWorkout = async (workout: Workout) => {
    if (workout.status !== "in_progress") {
      await enqueue("workout", "upsert", {
        ...workout,
        status: "in_progress",
        startedAt: new Date().toISOString(),
      });
    }
    navigate(`/workout/${workout.id}`);
  };

  return (
    <AppShell>
      <div className="space-y-4">
        {/* Engine notes (codes) */}
        {notes.length > 0 && (
          <div className="space-y-2">
            {notes.map((code, i) => (
              <EngineNote key={i} code={code} />
            ))}
          </div>
        )}

        {/* Hero + weekly arc row */}
        <div className="flex items-start gap-4">
          {/* Hero session card */}
          <div className="flex-1 min-w-0">
            {program.isPending ? (
              <Card className="p-4">
                <p className="type-body-sm text-on-surface-variant">{t("loadingWeek")}</p>
              </Card>
            ) : noProgram ? (
              <Card className="p-4 space-y-3">
                <p className="type-body-md text-on-surface-variant">
                  {t("planPreparing")}
                </p>
                <Button
                  variant="ghost"
                  fullWidth={false}
                  className="px-3"
                  onClick={() => navigate("/program")}
                >
                  {t("viewProgram")}
                  <ChevronRight size={16} strokeWidth={1.5} />
                </Button>
              </Card>
            ) : todayWorkout ? (
              <Card className="p-4 space-y-3">
                <div>
                  <h2 className="type-headline-md text-on-surface truncate">
                    {workoutName(todayWorkout.name)}
                  </h2>
                  <p className="type-body-sm text-on-surface-variant mt-1">
                    {(todayWorkout.exercises?.length ?? 0) > 0
                      ? t("hero.summary", {
                          count: todayWorkout.exercises?.length ?? 0,
                          minutes: estimateMinutes(todayWorkout),
                        })
                      : t("hero.exerciseCount", { count: 0 })}
                  </p>
                </div>

                {/* First 3 exercises */}
                {todayWorkout.exercises && todayWorkout.exercises.length > 0 && (
                  <ul className="space-y-1">
                    {todayWorkout.exercises.slice(0, 3).map((we) => {
                      const ex = exMap.get(we.exerciseId);
                      const reps =
                        we.targetRepsMin === we.targetRepsMax
                          ? `${we.targetRepsMin}`
                          : `${we.targetRepsMin}–${we.targetRepsMax}`;
                      return (
                        <li
                          key={we.id}
                          className="type-body-sm text-on-surface-variant flex gap-2"
                        >
                          <span className="text-on-surface font-medium truncate">
                            {ex?.name ?? t("hero.exerciseFallback")}
                          </span>
                          <span className="shrink-0">
                            {we.targetSets}×{reps}
                          </span>
                        </li>
                      );
                    })}
                    {(todayWorkout.exercises.length ?? 0) > 3 && (
                      <li className="type-body-sm text-on-surface-variant">
                        {t("hero.more", { count: todayWorkout.exercises.length - 3 })}
                      </li>
                    )}
                  </ul>
                )}

                <Button onClick={() => void startWorkout(todayWorkout)}>
                  {todayWorkout.status === "in_progress"
                    ? t("hero.resume")
                    : t("hero.start")}
                </Button>
              </Card>
            ) : (
              <Card className="p-4 space-y-3">
                <p className="type-body-md text-on-surface">
                  {t("restDay")}
                </p>
                <Button
                  variant="ghost"
                  fullWidth={false}
                  className="px-3"
                  onClick={() => navigate("/program")}
                >
                  {t("viewProgram")}
                  <ChevronRight size={16} strokeWidth={1.5} />
                </Button>
              </Card>
            )}
          </div>

          {/* Weekly arc */}
          <div className="shrink-0 flex flex-col items-center gap-1 pt-2">
            <Arc
              value={weekTotal > 0 ? weekCompleted / weekTotal : 0}
              size={96}
              strokeWidth={3.5}
              metric={`${weekCompleted}/${weekTotal}`}
              label={t("weekLabel")}
            />
          </div>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-3">
          <Card
            pressable
            className="p-4 flex flex-col gap-1 cursor-pointer"
            role="button"
            tabIndex={0}
            onClick={() => setBwOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setBwOpen(true);
            }}
          >
            <span className="type-label text-on-surface-variant">
              {t("quick.bodyweightLabel")}
            </span>
            <span className="type-body-md text-on-surface font-medium">
              {t("quick.bodyweightAction")}
            </span>
          </Card>

          <Card
            pressable
            className="p-4 flex flex-col gap-1 cursor-pointer"
            role="button"
            tabIndex={0}
            onClick={() => setCiOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setCiOpen(true);
            }}
          >
            <span className="type-label text-on-surface-variant">
              {t("quick.recoveryLabel")}
            </span>
            <span className="type-body-md text-on-surface font-medium">
              {t("quick.recoveryAction")}
            </span>
          </Card>
        </div>
      </div>

      {/* Sheets */}
      <BodyweightSheet
        open={bwOpen}
        onClose={() => setBwOpen(false)}
        unit={unit}
        lastWeightKg={lastWeightKg}
      />
      <CheckInSheet
        open={ciOpen}
        onClose={() => setCiOpen(false)}
        existing={todayCheckin}
      />
    </AppShell>
  );
}
