import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { api, queryKeys } from "../lib/api";
import { Button } from "../components/ui/Button";
import { Input, Field, Textarea } from "../components/ui/Input";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import type { Goal, Experience, Equipment, Unit } from "../lib/types";
import type { TrainingProfile } from "../lib/types";

const TOTAL_STEPS = 6;

// Equipment options (bodyweight is always included; not shown as a chip)
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

function ProgressDots({
  total,
  current,
}: {
  total: number;
  current: number;
}) {
  return (
    <div className="flex gap-1.5 justify-center" aria-label={`Step ${current + 1} of ${total}`}>
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-1.5 rounded-full transition-all ${
            i === current
              ? "w-5 bg-primary"
              : i < current
                ? "w-1.5 bg-primary opacity-40"
                : "w-1.5 bg-outline-variant"
          }`}
        />
      ))}
    </div>
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

export default function Onboarding() {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);

  // Form state
  const [displayName, setDisplayName] = useState("");
  const [goal, setGoal] = useState<Goal>("build_muscle");
  const [experience, setExperience] = useState<Experience>("intermediate");
  const [daysPerWeek, setDaysPerWeek] = useState(3);
  const [equipment, setEquipment] = useState<Set<Equipment>>(new Set(["barbell", "bench"]));
  const [unit, setUnit] = useState<Unit>("kg");
  const [limitations, setLimitations] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const profilesQuery = useQuery({
    queryKey: queryKeys.profiles,
    queryFn: api.getProfiles,
  });

  const profiles = profilesQuery.data ?? [];
  const selectedProfile = profiles.find((p) => p.goal === goal);

  // Clamp daysPerWeek whenever the profile changes
  const freqMin = selectedProfile?.frequencyMin ?? 2;
  const freqMax = selectedProfile?.frequencyMax ?? 6;

  function handleGoalSelect(g: Goal) {
    setGoal(g);
    // Find new profile and clamp
    const prof = profiles.find((p) => p.goal === g);
    if (prof) {
      const clamped = Math.min(
        prof.frequencyMax,
        Math.max(prof.frequencyMin, daysPerWeek),
      );
      setDaysPerWeek(clamped);
    }
  }

  function toggleEquipment(item: Equipment) {
    setEquipment((prev) => {
      const next = new Set(prev);
      if (next.has(item)) {
        next.delete(item);
      } else {
        next.add(item);
      }
      return next;
    });
  }

  const daysOptions = Array.from(
    { length: freqMax - freqMin + 1 },
    (_, i) => ({
      value: String(freqMin + i) as string,
      label: String(freqMin + i),
    }),
  );

  async function handleSubmit() {
    setSubmitError(null);
    setSubmitting(true);
    try {
      await api.putMe({
        displayName: displayName.trim() || undefined,
        goal,
        experience,
        daysPerWeek,
        equipment: [...equipment, "bodyweight"],
        unit,
        limitations: limitations.trim() || undefined,
      });
      await queryClient.invalidateQueries();
    } catch {
      setSubmitError(
        navigator.onLine
          ? "Couldn't save your profile. Give it another try."
          : "You're offline — connect once to finish setup.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function canContinue(): boolean {
    switch (step) {
      case 0: return true; // display name is optional
      case 1: return !!goal && profiles.length > 0;
      case 2: return !!experience;
      case 3: return daysPerWeek >= freqMin && daysPerWeek <= freqMax;
      case 4: return true; // equipment is optional (bodyweight is always available)
      case 5: return true;
      default: return false;
    }
  }

  function goBack() {
    if (step > 0) setStep((s) => s - 1);
  }

  function goNext() {
    if (step < TOTAL_STEPS - 1) setStep((s) => s + 1);
    else void handleSubmit();
  }

  return (
    <div className="min-h-dvh bg-surface flex flex-col safe-top safe-bottom">
      {/* Progress dots */}
      <div className="pt-4 pb-2 px-4">
        <ProgressDots total={TOTAL_STEPS} current={step} />
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto px-4 pb-32">
        {/* Step 0 — Welcome */}
        {step === 0 && (
          <div className="pt-8 space-y-6 animate-fade">
            <div className="space-y-2">
              <h1 className="type-headline-lg text-on-surface">Telos</h1>
              <p className="type-body-md text-on-surface-variant">
                An adaptive training plan built around your goal — not a
                template. Each week adjusts based on how you're actually
                progressing.
              </p>
            </div>
            <Field label="Your name (optional)">
              <Input
                type="text"
                autoComplete="given-name"
                placeholder="How should we address you?"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </Field>
          </div>
        )}

        {/* Step 1 — Goal */}
        {step === 1 && (
          <div className="pt-6 space-y-4 animate-fade">
            <div className="space-y-1">
              <h2 className="type-headline-md text-on-surface">What's your goal?</h2>
              <p className="type-body-sm text-on-surface-variant">
                This sets everything — how often you train, how hard you push,
                and which exercises you see.
              </p>
            </div>
            {profilesQuery.isPending && (
              <p className="type-body-sm text-on-surface-variant">Loading…</p>
            )}
            {profilesQuery.isError && (
              <p className="type-body-sm text-error">
                Couldn't load goals. Check your connection.
              </p>
            )}
            <div className="space-y-3">
              {profiles.map((p) => (
                <GoalCard
                  key={p.goal}
                  profile={p}
                  selected={goal === p.goal}
                  onSelect={() => handleGoalSelect(p.goal)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Step 2 — Experience */}
        {step === 2 && (
          <div className="pt-6 space-y-4 animate-fade">
            <div className="space-y-1">
              <h2 className="type-headline-md text-on-surface">
                How long have you been training?
              </h2>
              <p className="type-body-sm text-on-surface-variant">
                Sets the starting intensity and how quickly the plan progresses.
              </p>
            </div>
            <div className="space-y-3">
              {EXPERIENCE_OPTIONS.map((opt) => (
                <ExperienceCard
                  key={opt.value}
                  option={opt}
                  selected={experience === opt.value}
                  onSelect={() => setExperience(opt.value)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Step 3 — Days per week */}
        {step === 3 && (
          <div className="pt-6 space-y-6 animate-fade">
            <div className="space-y-1">
              <h2 className="type-headline-md text-on-surface">
                How many days can you train?
              </h2>
              <p className="type-body-sm text-on-surface-variant">
                {selectedProfile
                  ? `${selectedProfile.displayName} works best at ${freqMin}–${freqMax} days per week.`
                  : ""}
              </p>
            </div>
            <SegmentedControl
              options={daysOptions}
              value={String(daysPerWeek)}
              onChange={(v) => setDaysPerWeek(Number(v))}
              ariaLabel="Days per week"
            />
            <p className="type-body-sm text-on-surface-variant">
              {daysPerWeek === 1
                ? "1 day per week"
                : `${daysPerWeek} days per week`}
            </p>
          </div>
        )}

        {/* Step 4 — Equipment */}
        {step === 4 && (
          <div className="pt-6 space-y-5 animate-fade">
            <div className="space-y-1">
              <h2 className="type-headline-md text-on-surface">
                What equipment do you have?
              </h2>
              <p className="type-body-sm text-on-surface-variant">
                Select everything available to you. Bodyweight exercises are
                always included.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {EQUIPMENT_OPTIONS.map((opt) => (
                <EquipmentChip
                  key={opt.value}
                  label={opt.label}
                  selected={equipment.has(opt.value)}
                  onToggle={() => toggleEquipment(opt.value)}
                />
              ))}
            </div>
            <p className="type-body-sm text-on-surface-variant">
              Bodyweight is always available — no need to select it.
            </p>
          </div>
        )}

        {/* Step 5 — Units + Limitations */}
        {step === 5 && (
          <div className="pt-6 space-y-6 animate-fade">
            <div className="space-y-1">
              <h2 className="type-headline-md text-on-surface">
                A couple more things
              </h2>
            </div>

            <div className="space-y-2">
              <p className="type-label text-on-surface-variant">Weight unit</p>
              <SegmentedControl
                options={[
                  { value: "kg", label: "kg" },
                  { value: "lb", label: "lb" },
                ]}
                value={unit}
                onChange={(v) => setUnit(v as Unit)}
                ariaLabel="Weight unit"
              />
            </div>

            <Field label="Anything we should work around? (optional)">
              <Textarea
                placeholder="E.g. left knee pain, avoid overhead pressing"
                value={limitations}
                onChange={(e) => setLimitations(e.target.value)}
              />
            </Field>

            {submitError && (
              <p role="alert" className="type-body-sm text-error">
                {submitError}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Bottom action area (thumb zone) */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[560px] bg-surface border-t border-outline-variant px-4 pt-3 pb-4 safe-bottom z-10">
        <div className="flex gap-3">
          {step > 0 && (
            <Button
              type="button"
              variant="ghost"
              fullWidth={false}
              className="!px-3"
              onClick={goBack}
              aria-label="Go back"
            >
              <ChevronLeft size={20} strokeWidth={1.5} aria-hidden="true" />
            </Button>
          )}
          <Button
            type="button"
            variant="primary"
            onClick={goNext}
            disabled={!canContinue() || submitting}
          >
            {submitting
              ? "Building your plan…"
              : step === TOTAL_STEPS - 1
                ? "Build my plan"
                : "Continue"}
          </Button>
        </div>
      </div>
    </div>
  );
}
