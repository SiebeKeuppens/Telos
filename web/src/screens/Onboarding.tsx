import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ChevronLeft } from "lucide-react";
import { api, queryKeys } from "../lib/api";
import { Button } from "../components/ui/Button";
import { Input, Field, Textarea } from "../components/ui/Input";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { useToast } from "../components/ui/Toast";
import type { Goal, Experience, Equipment, Unit } from "../lib/types";
import type { TrainingProfile } from "../lib/types";

const TOTAL_STEPS = 6;

// Equipment options (bodyweight is always included; not shown as a chip).
// Labels come from common:equipment.*
const EQUIPMENT_OPTIONS: Equipment[] = [
  "barbell",
  "dumbbell",
  "machine",
  "cable",
  "kettlebell",
  "band",
  "bench",
  "pullup_bar",
];

// Titles/descriptions come from onboarding:experience.*
const EXPERIENCE_OPTIONS: Experience[] = ["beginner", "intermediate", "advanced"];

function ProgressDots({
  total,
  current,
}: {
  total: number;
  current: number;
}) {
  const { t } = useTranslation("onboarding");
  return (
    <div
      className="flex gap-1.5 justify-center"
      aria-label={t("progress.step", { current: current + 1, total })}
    >
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
  const { t } = useTranslation("onboarding");
  const freqLabel = t("goal.frequency", {
    min: profile.frequencyMin,
    max: profile.frequencyMax,
  });
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
          <p className="type-title text-on-surface">
            {t(`common:goals.${profile.goal}.name`)}
          </p>
          <p className="type-body-sm text-on-surface-variant">
            {t(`common:goals.${profile.goal}.summary`)}
          </p>
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
  value,
  selected,
  onSelect,
}: {
  value: Experience;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation("onboarding");
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
      <p className="type-title text-on-surface">{t(`experience.${value}.title`)}</p>
      <p className="type-body-sm text-on-surface-variant mt-0.5">
        {t(`experience.${value}.description`)}
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
  const { t } = useTranslation("onboarding");
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();
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

  // The wizard can be re-run from Profile ("Redo setup"). In that case the
  // user already exists: prefill every step from their current answers so it
  // works as a guided re-tune, not a blank slate. First-run users 404 here
  // and keep the defaults.
  const me = useQuery({
    queryKey: queryKeys.me,
    queryFn: api.getMe,
    retry: false,
  });
  const revisit = Boolean(me.data?.onboardedAt);
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !me.data?.onboardedAt) return;
    seeded.current = true;
    const u = me.data;
    setDisplayName(u.displayName ?? "");
    setGoal(u.goal);
    setExperience(u.experience);
    setDaysPerWeek(u.daysPerWeek);
    setEquipment(new Set(u.equipment.filter((e) => e !== "bodyweight")));
    setUnit(u.unit);
    setLimitations(u.limitations ?? "");
  }, [me.data]);

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
        // Body details and split preference aren't collected by the wizard —
        // carry the existing values through so a redo doesn't clear them
        // (whole-object upsert).
        heightCm: me.data?.heightCm,
        birthYear: me.data?.birthYear,
        sex: me.data?.sex,
        splitPreference: me.data?.splitPreference,
      });
      await queryClient.invalidateQueries();
      if (revisit) {
        toast(t("toastSaved"));
      }
      navigate("/", { replace: true });
    } catch {
      setSubmitError(
        navigator.onLine ? t("errors.saveFailed") : t("errors.offline"),
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
    if (step > 0) {
      setStep((s) => s - 1);
    } else if (revisit) {
      // Re-run from Profile: step one backs out without saving anything.
      navigate("/profile");
    }
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
              <h1 className="type-headline-lg text-on-surface">
                {t("common:appName")}
              </h1>
              <p className="type-body-md text-on-surface-variant">
                {revisit ? t("welcome.introRevisit") : t("welcome.introNew")}
              </p>
            </div>
            <Field label={t("welcome.nameLabel")}>
              <Input
                type="text"
                autoComplete="given-name"
                placeholder={t("welcome.namePlaceholder")}
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
              <h2 className="type-headline-md text-on-surface">{t("goal.heading")}</h2>
              <p className="type-body-sm text-on-surface-variant">
                {t("goal.sub")}
              </p>
            </div>
            {profilesQuery.isPending && (
              <p className="type-body-sm text-on-surface-variant">
                {t("common:loading")}
              </p>
            )}
            {profilesQuery.isError && (
              <p className="type-body-sm text-error">{t("goal.loadError")}</p>
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
                {t("experience.heading")}
              </h2>
              <p className="type-body-sm text-on-surface-variant">
                {t("experience.sub")}
              </p>
            </div>
            <div className="space-y-3">
              {EXPERIENCE_OPTIONS.map((value) => (
                <ExperienceCard
                  key={value}
                  value={value}
                  selected={experience === value}
                  onSelect={() => setExperience(value)}
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
                {t("days.heading")}
              </h2>
              <p className="type-body-sm text-on-surface-variant">
                {selectedProfile
                  ? t("days.sub", {
                      goal: t(`common:goals.${selectedProfile.goal}.name`),
                      min: freqMin,
                      max: freqMax,
                    })
                  : ""}
              </p>
            </div>
            <SegmentedControl
              options={daysOptions}
              value={String(daysPerWeek)}
              onChange={(v) => setDaysPerWeek(Number(v))}
              ariaLabel={t("days.aria")}
            />
            <p className="type-body-sm text-on-surface-variant">
              {t("days.perWeek", { count: daysPerWeek })}
            </p>
          </div>
        )}

        {/* Step 4 — Equipment */}
        {step === 4 && (
          <div className="pt-6 space-y-5 animate-fade">
            <div className="space-y-1">
              <h2 className="type-headline-md text-on-surface">
                {t("equipment.heading")}
              </h2>
              <p className="type-body-sm text-on-surface-variant">
                {t("equipment.sub")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {EQUIPMENT_OPTIONS.map((value) => (
                <EquipmentChip
                  key={value}
                  label={t(`common:equipment.${value}`)}
                  selected={equipment.has(value)}
                  onToggle={() => toggleEquipment(value)}
                />
              ))}
            </div>
            <p className="type-body-sm text-on-surface-variant">
              {t("equipment.bodyweightNote")}
            </p>
          </div>
        )}

        {/* Step 5 — Units + Limitations */}
        {step === 5 && (
          <div className="pt-6 space-y-6 animate-fade">
            <div className="space-y-1">
              <h2 className="type-headline-md text-on-surface">
                {t("extras.heading")}
              </h2>
            </div>

            <div className="space-y-2">
              <p className="type-label text-on-surface-variant">
                {t("extras.unitLabel")}
              </p>
              <SegmentedControl
                options={[
                  { value: "kg", label: "kg" },
                  { value: "lb", label: "lb" },
                ]}
                value={unit}
                onChange={(v) => setUnit(v as Unit)}
                ariaLabel={t("extras.unitLabel")}
              />
            </div>

            <Field label={t("extras.limitationsLabel")}>
              <Textarea
                placeholder={t("extras.limitationsPlaceholder")}
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
          {(step > 0 || revisit) && (
            <Button
              type="button"
              variant="ghost"
              fullWidth={false}
              className="!px-3"
              onClick={goBack}
              aria-label={step === 0 ? t("backAria.toProfile") : t("backAria.goBack")}
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
              ? revisit
                ? t("cta.updating")
                : t("cta.building")
              : step === TOTAL_STEPS - 1
                ? revisit
                  ? t("cta.updatePlan")
                  : t("cta.buildPlan")
                : t("common:continue")}
          </Button>
        </div>
      </div>
    </div>
  );
}
