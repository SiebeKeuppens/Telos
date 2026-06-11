// Log screen — the logging hub. Today section + quick-log cards + 14-day history.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Scale, Activity } from "lucide-react";
import { AppShell } from "../components/shell/AppShell";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { useToast } from "../components/ui/Toast";
import { BodyweightSheet } from "../components/fitness/BodyweightSheet";
import { CheckInSheet } from "../components/fitness/CheckInSheet";
import { api, queryKeys } from "../lib/api";
import { enqueue, newId } from "../lib/sync";
import { todayISO } from "../lib/units";
import type { Workout } from "../lib/types";

// ---- helpers ----------------------------------------------------------------

/** Return a date string YYYY-MM-DD that is `daysBack` days ago. */
function daysAgoISO(daysBack: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function countSets(workout: Workout): number {
  return (workout.exercises ?? []).reduce(
    (total, we) => total + (we.sets?.length ?? 0),
    0,
  );
}

// ---- main screen ------------------------------------------------------------

export default function Log() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [bwOpen, setBwOpen] = useState(false);
  const [checkInOpen, setCheckInOpen] = useState(false);

  const today = todayISO();
  const from = daysAgoISO(14);

  const programQ = useQuery({
    queryKey: queryKeys.program,
    queryFn: api.getProgram,
  });

  const meQ = useQuery({
    queryKey: queryKeys.me,
    queryFn: api.getMe,
  });

  const bodyweightQ = useQuery({
    queryKey: queryKeys.bodyweight,
    queryFn: () => api.listBodyweight(),
  });

  const checkinsQ = useQuery({
    queryKey: queryKeys.checkins,
    queryFn: () => api.listCheckins(),
  });

  const workoutsQ = useQuery({
    queryKey: queryKeys.workouts(from, today),
    queryFn: () => api.listWorkouts(from, today),
  });

  const unit = meQ.data?.unit ?? "kg";

  // Latest bodyweight entry
  const bwEntries = bodyweightQ.data ?? [];
  const lastBw = bwEntries.length > 0
    ? [...bwEntries].sort((a, b) => b.date.localeCompare(a.date))[0]
    : undefined;

  // Today's check-in
  const todayCheckIn = (checkinsQ.data ?? []).find((c) => c.date === today);

  // Program workouts
  const programWorkouts = programQ.data?.workouts ?? [];
  const inProgressWorkout = programWorkouts.find((w) => w.status === "in_progress");
  const todayPlanned = programWorkouts.find(
    (w) => w.scheduledFor === today && w.status === "planned",
  );

  // History: completed or aborted in the 14-day window, newest first
  const historyWorkouts: Workout[] = [...(workoutsQ.data ?? [])]
    .filter((w) => w.status === "completed" || w.status === "aborted")
    .sort((a, b) => {
      const aDate = a.completedAt ?? a.updatedAt;
      const bDate = b.completedAt ?? b.updatedAt;
      return bDate.localeCompare(aDate);
    });

  const handleStartToday = async (workout: Workout) => {
    await enqueue("workout", "upsert", {
      ...workout,
      status: "in_progress",
      startedAt: new Date().toISOString(),
    });
    navigate(`/workout/${workout.id}`);
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
    toast("Workout started");
    navigate(`/workout/${id}`);
  };

  return (
    <AppShell title="Log">
      <div className="space-y-6">
        {/* ---- Today section ---- */}
        <section className="space-y-3">
          <h2 className="type-label text-on-surface-variant">Today</h2>

          {inProgressWorkout ? (
            <Button
              variant="primary"
              onClick={() => navigate(`/workout/${inProgressWorkout.id}`)}
            >
              Resume workout
            </Button>
          ) : todayPlanned ? (
            <Button
              variant="primary"
              onClick={() => void handleStartToday(todayPlanned)}
            >
              Start today&apos;s workout
            </Button>
          ) : (
            <p className="type-body-sm text-on-surface-variant">
              Rest day — nothing scheduled.
            </p>
          )}

          <Button
            variant="secondary"
            onClick={() => void handleStartEmpty()}
          >
            Start an empty workout
          </Button>
        </section>

        {/* ---- Quick-log row ---- */}
        <section className="space-y-3">
          <h2 className="type-label text-on-surface-variant">Quick log</h2>
          <div className="grid grid-cols-2 gap-3">
            <Card
              pressable
              className="p-4 flex flex-col items-start gap-2 min-h-[72px] cursor-pointer"
              role="button"
              tabIndex={0}
              onClick={() => setBwOpen(true)}
              onKeyDown={(e) => { if (e.key === "Enter") setBwOpen(true); }}
            >
              <Scale size={20} strokeWidth={1.5} className="text-primary" />
              <span className="type-body-sm font-medium text-on-surface">Bodyweight</span>
            </Card>

            <Card
              pressable
              className="p-4 flex flex-col items-start gap-2 min-h-[72px] cursor-pointer"
              role="button"
              tabIndex={0}
              onClick={() => setCheckInOpen(true)}
              onKeyDown={(e) => { if (e.key === "Enter") setCheckInOpen(true); }}
            >
              <Activity size={20} strokeWidth={1.5} className="text-primary" />
              <span className="type-body-sm font-medium text-on-surface">Check-in</span>
            </Card>
          </div>
        </section>

        {/* ---- History section ---- */}
        <section className="space-y-3">
          <h2 className="type-label text-on-surface-variant">History</h2>

          {workoutsQ.isPending ? (
            <div className="py-4 flex items-center justify-center">
              <span className="type-label text-on-surface-variant">Loading…</span>
            </div>
          ) : historyWorkouts.length === 0 ? (
            <Card className="px-4 py-8 text-center">
              <p className="type-body-sm text-on-surface-variant">
                Nothing logged yet. Your finished workouts land here.
              </p>
            </Card>
          ) : (
            <div className="space-y-2">
              {historyWorkouts.map((workout) => {
                const sets = countSets(workout);
                const dateStr = workout.scheduledFor ?? workout.completedAt?.slice(0, 10) ?? workout.updatedAt.slice(0, 10);
                return (
                  <Card
                    key={workout.id}
                    pressable
                    className="px-4 py-3 flex items-center gap-3 min-h-[56px] cursor-pointer"
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/workout/${workout.id}`)}
                    onKeyDown={(e) => { if (e.key === "Enter") navigate(`/workout/${workout.id}`); }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="type-body-md font-medium text-on-surface truncate">
                        {workout.name}
                      </div>
                      <div className="type-body-sm text-on-surface-variant mt-0.5">
                        {formatDate(dateStr)}
                        {sets > 0 && ` · ${sets} set${sets !== 1 ? "s" : ""}`}
                      </div>
                    </div>
                    {workout.status === "completed" ? (
                      <Badge variant="success">Done</Badge>
                    ) : (
                      <Badge variant="neutral">Ended early</Badge>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* ---- sheets ---- */}
      <BodyweightSheet
        open={bwOpen}
        onClose={() => setBwOpen(false)}
        unit={unit}
        lastWeightKg={lastBw?.weightKg}
      />

      <CheckInSheet
        open={checkInOpen}
        onClose={() => setCheckInOpen(false)}
        existing={todayCheckIn}
      />
    </AppShell>
  );
}
