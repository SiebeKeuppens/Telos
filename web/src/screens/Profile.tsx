import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { AppShell } from "../components/shell/AppShell";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { BottomSheet } from "../components/ui/BottomSheet";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { useToast } from "../components/ui/Toast";
import { useTheme, type ThemePref } from "../lib/theme";
import { enqueue } from "../lib/sync";
import { api, queryKeys } from "../lib/api";
import { logOut } from "../lib/firebase";
import type { Goal, Experience, Equipment, Unit, User } from "../lib/types";
import type { TrainingProfile } from "../lib/types";

const DEV_MODE = import.meta.env.VITE_AUTH_MODE === "dev";

const EQUIPMENT_OPTIONS: { value: Equipment; label: string }[] = [
  { value: "barbell", label: "Barbell" },
  { value: "dumbbell", label: "Dumbbell" },
  { value: "machine", label: "Machine" },
  { value: "cable", label: "Cable" },
  { value: "kettlebell", label: "Kettlebell" },
  { value: "band", label: "Band" },
  { value: "bench", label: "Bench" },
  { value: "pullup_bar", label: "Pull-up bar" },
];

const EXPERIENCE_OPTIONS: { value: Experience; title: string; description: string }[] = [
  {
    value: "beginner",
    title: "New to lifting",
    description: "New to lifting, or returning after a break",
  },
  {
    value: "intermediate",
    title: "Building a base",
    description: "Around 1–3 years of consistent training",
  },
  {
    value: "advanced",
    title: "Seasoned lifter",
    description: "Several years; progress comes slowly now",
  },
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="type-label text-on-surface-variant px-1 mb-2">{children}</p>
  );
}

function GoalCard({
  profile,
  selected,
  onSelect,
}: {
  profile: TrainingProfile;
  selected: boolean;
  onSelect: () => void;
}) {
  const freqLabel = `${profile.frequencyMin}–${profile.frequencyMax} days/wk`;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left rounded-xl p-4 border transition-colors ${
        selected
          ? "tint-primary-8 border-[color-mix(in_srgb,var(--primary)_50%,transparent)]"
          : "bg-surface-container border-outline-variant active:bg-surface-container-high"
      }`}
      aria-pressed={selected}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <p className="type-title text-on-surface">{profile.displayName}</p>
          <p className="type-body-sm text-on-surface-variant">{profile.summary}</p>
        </div>
        <span
          className={`shrink-0 mt-0.5 type-label px-2 py-0.5 rounded-full border ${
            selected
              ? "text-primary border-[color-mix(in_srgb,var(--primary)_40%,transparent)] bg-[color-mix(in_srgb,var(--primary)_12%,transparent)]"
              : "text-on-surface-variant border-outline-variant bg-surface-container-high"
          }`}
        >
          {freqLabel}
        </span>
      </div>
    </button>
  );
}

function ExperienceCard({
  option,
  selected,
  onSelect,
}: {
  option: (typeof EXPERIENCE_OPTIONS)[number];
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left rounded-xl p-4 border transition-colors ${
        selected
          ? "tint-primary-8 border-[color-mix(in_srgb,var(--primary)_50%,transparent)]"
          : "bg-surface-container border-outline-variant active:bg-surface-container-high"
      }`}
      aria-pressed={selected}
    >
      <p className="type-title text-on-surface">{option.title}</p>
      <p className="type-body-sm text-on-surface-variant mt-0.5">
        {option.description}
      </p>
    </button>
  );
}

function EquipmentChip({
  label,
  selected,
  onToggle,
}: {
  label: string;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`min-h-11 px-4 rounded-full border type-body-sm transition-colors ${
        selected
          ? "tint-primary-14 text-primary border-[color-mix(in_srgb,var(--primary)_40%,transparent)]"
          : "bg-surface-container text-on-surface-variant border-outline-variant active:bg-surface-container-high"
      }`}
      aria-pressed={selected}
    >
      {label}
    </button>
  );
}

export default function Profile() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { pref: themePref, setPref: setThemePref } = useTheme();

  const meQuery = useQuery({
    queryKey: queryKeys.me,
    queryFn: api.getMe,
  });

  const profilesQuery = useQuery({
    queryKey: queryKeys.profiles,
    queryFn: api.getProfiles,
  });

  const user = meQuery.data;
  const profiles = profilesQuery.data ?? [];

  const [goalSheetOpen, setGoalSheetOpen] = useState(false);
  const [experienceSheetOpen, setExperienceSheetOpen] = useState(false);

  // Local state for fields that need immediate UI feedback before save
  const [localEquipment, setLocalEquipment] = useState<Set<Equipment> | null>(null);

  const currentEquipment: Set<Equipment> = localEquipment ??
    new Set(user?.equipment ?? []);

  const selectedProfile = profiles.find((p) => p.goal === user?.goal);
  const freqMin = selectedProfile?.frequencyMin ?? 2;
  const freqMax = selectedProfile?.frequencyMax ?? 6;

  const daysOptions = Array.from(
    { length: freqMax - freqMin + 1 },
    (_, i) => ({
      value: String(freqMin + i),
      label: String(freqMin + i),
    }),
  );

  /** Save a partial profile change. Always sends the full user object. */
  async function save(patch: Partial<User>) {
    if (!user) return;
    const updated: Partial<User> = {
      displayName: user.displayName ?? undefined,
      goal: user.goal,
      experience: user.experience,
      daysPerWeek: user.daysPerWeek,
      equipment: user.equipment,
      unit: user.unit,
      limitations: user.limitations ?? undefined,
      // Whole-object upsert: omitting these would clear them server-side.
      heightCm: user.heightCm,
      birthYear: user.birthYear,
      sex: user.sex,
      ...patch,
    };
    await enqueue("profile", "upsert", updated);
    void queryClient.invalidateQueries();
  }

  async function handleGoalChange(newGoal: Goal) {
    if (!user) return;
    const prof = profiles.find((p) => p.goal === newGoal);
    const clampedDays = prof
      ? Math.min(prof.frequencyMax, Math.max(prof.frequencyMin, user.daysPerWeek))
      : user.daysPerWeek;
    await save({ goal: newGoal, daysPerWeek: clampedDays });
    setGoalSheetOpen(false);
    toast("Goal updated — your plan is being rebuilt");
    void queryClient.invalidateQueries();
  }

  async function handleExperienceChange(exp: Experience) {
    await save({ experience: exp });
    setExperienceSheetOpen(false);
    toast("Saved");
  }

  async function handleDaysChange(v: string) {
    const days = Number(v);
    await save({ daysPerWeek: days });
    toast("Saved");
  }

  function toggleEquipment(item: Equipment) {
    const next = new Set(currentEquipment);
    if (item === "bodyweight") return; // bodyweight is always included
    if (next.has(item)) {
      next.delete(item);
    } else {
      next.add(item);
    }
    setLocalEquipment(next);
    void saveEquipment(next);
  }

  async function saveEquipment(eq: Set<Equipment>) {
    await save({ equipment: [...eq] });
    toast("Saved");
  }

  async function handleUnitChange(v: string) {
    await save({ unit: v as Unit });
    toast("Saved");
  }

  async function handleSignOut() {
    try {
      await logOut();
    } catch {
      toast("Couldn't sign out. Try again.", "error");
    }
  }

  if (meQuery.isPending) {
    return (
      <AppShell title="Profile">
        <p className="type-body-sm text-on-surface-variant">Loading…</p>
      </AppShell>
    );
  }

  if (meQuery.isError || !user) {
    return (
      <AppShell title="Profile">
        <p className="type-body-sm text-error">
          Couldn't load your profile. Check your connection.
        </p>
      </AppShell>
    );
  }

  const goalDisplayName =
    profiles.find((p) => p.goal === user.goal)?.displayName ?? user.goal;
  const experienceDisplay =
    EXPERIENCE_OPTIONS.find((e) => e.value === user.experience)?.title ??
    user.experience;

  return (
    <AppShell title="Profile">
      <div className="space-y-6">
        {/* Training section */}
        <section aria-label="Training">
          <SectionLabel>Training</SectionLabel>
          <Card className="divide-y divide-outline-variant">
            {/* Goal */}
            <button
              type="button"
              onClick={() => setGoalSheetOpen(true)}
              className="w-full flex items-center justify-between px-4 py-3.5 active:bg-surface-container-high transition-colors"
              aria-label={`Goal: ${goalDisplayName}. Tap to change.`}
            >
              <span className="type-body-md text-on-surface">Goal</span>
              <span className="type-body-sm text-on-surface-variant">
                {goalDisplayName}
              </span>
            </button>

            {/* Experience */}
            <button
              type="button"
              onClick={() => setExperienceSheetOpen(true)}
              className="w-full flex items-center justify-between px-4 py-3.5 active:bg-surface-container-high transition-colors"
              aria-label={`Experience: ${experienceDisplay}. Tap to change.`}
            >
              <span className="type-body-md text-on-surface">Experience</span>
              <span className="type-body-sm text-on-surface-variant">
                {experienceDisplay}
              </span>
            </button>

            {/* Days per week */}
            <div className="px-4 py-3.5 space-y-3">
              <p className="type-body-md text-on-surface">Days per week</p>
              {daysOptions.length > 0 ? (
                <SegmentedControl
                  options={daysOptions}
                  value={String(
                    Math.min(freqMax, Math.max(freqMin, user.daysPerWeek)),
                  )}
                  onChange={handleDaysChange}
                  ariaLabel="Days per week"
                />
              ) : (
                <p className="type-body-sm text-on-surface-variant">
                  Select a goal first.
                </p>
              )}
            </div>
          </Card>

          {/* Equipment */}
          <div className="mt-4 space-y-2">
            <SectionLabel>Equipment</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {EQUIPMENT_OPTIONS.map((opt) => (
                <EquipmentChip
                  key={opt.value}
                  label={opt.label}
                  selected={currentEquipment.has(opt.value)}
                  onToggle={() => toggleEquipment(opt.value)}
                />
              ))}
            </div>
            <p className="type-body-sm text-on-surface-variant px-1">
              Bodyweight is always available.
            </p>
          </div>

          {/* Re-run the full setup walkthrough */}
          <div className="mt-4 space-y-2">
            <Button
              variant="secondary"
              onClick={() => navigate("/onboarding")}
            >
              <RotateCcw size={16} strokeWidth={1.5} aria-hidden="true" />
              Redo setup walkthrough
            </Button>
            <p className="type-body-sm text-on-surface-variant px-1">
              Step back through goal, experience, schedule, and equipment —
              prefilled with your current answers. Saving rebuilds your plan.
            </p>
          </div>
        </section>

        {/* Body section — optional details powering the daily-energy estimate */}
        <section aria-label="Body">
          <SectionLabel>Body</SectionLabel>
          <Card className="divide-y divide-outline-variant">
            <div className="px-4 py-3.5 space-y-3">
              <p className="type-body-md text-on-surface">Height (cm)</p>
              <Input
                type="number"
                inputMode="numeric"
                placeholder="e.g. 180"
                defaultValue={user.heightCm ?? ""}
                onBlur={(e) => {
                  const v = parseInt(e.target.value, 10);
                  const next = Number.isFinite(v) && v >= 100 && v <= 250 ? v : undefined;
                  if (next !== user.heightCm) {
                    void save({ heightCm: next });
                    toast("Saved");
                  }
                }}
              />
            </div>
            <div className="px-4 py-3.5 space-y-3">
              <p className="type-body-md text-on-surface">Birth year</p>
              <Input
                type="number"
                inputMode="numeric"
                placeholder="e.g. 1995"
                defaultValue={user.birthYear ?? ""}
                onBlur={(e) => {
                  const v = parseInt(e.target.value, 10);
                  const year = new Date().getFullYear();
                  const next =
                    Number.isFinite(v) && v >= year - 120 && v <= year - 13 ? v : undefined;
                  if (next !== user.birthYear) {
                    void save({ birthYear: next });
                    toast("Saved");
                  }
                }}
              />
            </div>
            <div className="px-4 py-3.5 space-y-3">
              <p className="type-body-md text-on-surface">Sex</p>
              <SegmentedControl
                options={[
                  { value: "male", label: "Male" },
                  { value: "female", label: "Female" },
                  { value: "unspecified", label: "Rather not say" },
                ]}
                value={user.sex ?? "unspecified"}
                onChange={(v) => {
                  void save({ sex: v === "unspecified" ? undefined : (v as "male" | "female") });
                  toast("Saved");
                }}
                ariaLabel="Sex"
              />
            </div>
          </Card>
          <p className="type-body-sm text-on-surface-variant px-1 mt-2">
            Used only for the daily-energy estimate on Progress. All optional —
            training never requires them.
          </p>
        </section>

        {/* Preferences section */}
        <section aria-label="Preferences">
          <SectionLabel>Preferences</SectionLabel>
          <Card className="divide-y divide-outline-variant">
            {/* Units */}
            <div className="px-4 py-3.5 space-y-3">
              <p className="type-body-md text-on-surface">Weight unit</p>
              <SegmentedControl
                options={[
                  { value: "kg", label: "kg" },
                  { value: "lb", label: "lb" },
                ]}
                value={user.unit}
                onChange={handleUnitChange}
                ariaLabel="Weight unit"
              />
            </div>

            {/* Theme */}
            <div className="px-4 py-3.5 space-y-3">
              <p className="type-body-md text-on-surface">Theme</p>
              <SegmentedControl
                options={[
                  { value: "system", label: "System" },
                  { value: "light", label: "Light" },
                  { value: "dark", label: "Dark" },
                ]}
                value={themePref}
                onChange={(v) => setThemePref(v as ThemePref)}
                ariaLabel="Theme"
              />
            </div>
          </Card>
        </section>

        {/* Account section */}
        <section aria-label="Account">
          <SectionLabel>Account</SectionLabel>
          <Card className="divide-y divide-outline-variant">
            {user.email && (
              <div className="px-4 py-3.5 flex items-center justify-between">
                <span className="type-body-md text-on-surface">Email</span>
                <span className="type-body-sm text-on-surface-variant">
                  {user.email}
                </span>
              </div>
            )}
            {!DEV_MODE && (
              <div className="px-4 py-3.5">
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleSignOut}
                >
                  Sign out
                </Button>
              </div>
            )}
          </Card>
        </section>
      </div>

      {/* Goal sheet */}
      <BottomSheet
        open={goalSheetOpen}
        onClose={() => setGoalSheetOpen(false)}
        title="Change goal"
      >
        <div className="space-y-3 pt-1">
          {profilesQuery.isPending && (
            <p className="type-body-sm text-on-surface-variant">Loading…</p>
          )}
          {profiles.map((p) => (
            <GoalCard
              key={p.goal}
              profile={p}
              selected={user.goal === p.goal}
              onSelect={() => void handleGoalChange(p.goal)}
            />
          ))}
        </div>
      </BottomSheet>

      {/* Experience sheet */}
      <BottomSheet
        open={experienceSheetOpen}
        onClose={() => setExperienceSheetOpen(false)}
        title="Change experience"
      >
        <div className="space-y-3 pt-1">
          {EXPERIENCE_OPTIONS.map((opt) => (
            <ExperienceCard
              key={opt.value}
              option={opt}
              selected={user.experience === opt.value}
              onSelect={() => void handleExperienceChange(opt.value)}
            />
          ))}
        </div>
      </BottomSheet>
    </AppShell>
  );
}
