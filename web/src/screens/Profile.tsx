import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
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
import { setLanguage, type AppLanguage } from "../i18n";
import { splitCompatible } from "../lib/types";
import type {
  Goal,
  Experience,
  Equipment,
  Unit,
  User,
  SplitStyle,
  TrainingProfile,
} from "../lib/types";

const DEV_MODE = import.meta.env.VITE_AUTH_MODE === "dev";

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

const EXPERIENCE_OPTIONS: Experience[] = ["beginner", "intermediate", "advanced"];

/** "auto" means no preference — the engine picks the split. */
type SplitChoice = "auto" | SplitStyle;

const SPLIT_OPTIONS: SplitChoice[] = [
  "auto",
  "full_body",
  "upper_lower",
  "push_pull_legs",
  "body_part",
];

// Option labels deliberately stay in their own language — never translated.
const LANGUAGE_OPTIONS: { value: AppLanguage; label: string }[] = [
  { value: "en", label: "English" },
  { value: "nl", label: "Nederlands" },
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
  const { t } = useTranslation("profile");
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
          {t("freqRange", { min: profile.frequencyMin, max: profile.frequencyMax })}
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
  const { t } = useTranslation("profile");
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
      <p className="type-title text-on-surface">
        {t(`experienceOptions.${value}.title`)}
      </p>
      <p className="type-body-sm text-on-surface-variant mt-0.5">
        {t(`experienceOptions.${value}.description`)}
      </p>
    </button>
  );
}

function SplitCard({
  value,
  selected,
  compatible,
  onSelect,
}: {
  value: SplitChoice;
  selected: boolean;
  compatible: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation("profile");
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!compatible}
      className={`w-full text-left rounded-xl p-4 border transition-colors ${
        selected
          ? "tint-primary-8 border-[color-mix(in_srgb,var(--primary)_50%,transparent)]"
          : "bg-surface-container border-outline-variant active:bg-surface-container-high"
      } ${compatible ? "" : "opacity-50"}`}
      aria-pressed={selected}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <p className="type-title text-on-surface">
            {t(`common:splits.${value}`)}
          </p>
          <p className="type-body-sm text-on-surface-variant">
            {t(`split.desc.${value}`)}
          </p>
        </div>
        {!compatible && value !== "auto" && (
          <span className="shrink-0 mt-0.5 type-label px-2 py-0.5 rounded-full border text-on-surface-variant border-outline-variant bg-surface-container-high">
            {t("split.needsDays", { range: t(`split.range.${value}`) })}
          </span>
        )}
      </div>
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
  const { t, i18n } = useTranslation("profile");
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
  const [splitSheetOpen, setSplitSheetOpen] = useState(false);

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
      splitPreference: user.splitPreference,
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
    toast(t("goalUpdated"));
    void queryClient.invalidateQueries();
  }

  async function handleExperienceChange(exp: Experience) {
    await save({ experience: exp });
    setExperienceSheetOpen(false);
    toast(t("common:saved"));
  }

  async function handleDaysChange(v: string) {
    const days = Number(v);
    await save({ daysPerWeek: days });
    toast(t("common:saved"));
  }

  async function handleSplitChange(value: SplitChoice) {
    await save({ splitPreference: value === "auto" ? undefined : value });
    setSplitSheetOpen(false);
    toast(t("split.updated"));
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
    toast(t("common:saved"));
  }

  async function handleUnitChange(v: string) {
    await save({ unit: v as Unit });
    toast(t("common:saved"));
  }

  async function handleSignOut() {
    try {
      await logOut();
    } catch {
      toast(t("signOutError"), "error");
    }
  }

  if (meQuery.isPending) {
    return (
      <AppShell title={t("common:nav.profile")}>
        <p className="type-body-sm text-on-surface-variant">
          {t("common:loading")}
        </p>
      </AppShell>
    );
  }

  if (meQuery.isError || !user) {
    return (
      <AppShell title={t("common:nav.profile")}>
        <p className="type-body-sm text-error">{t("loadError")}</p>
      </AppShell>
    );
  }

  const goalDisplayName = t(`common:goals.${user.goal}.name`);
  const experienceDisplay = t(`experienceOptions.${user.experience}.title`);
  const splitDisplay = t(`common:splits.${user.splitPreference ?? "auto"}`);
  const currentLanguage: AppLanguage = i18n.language === "nl" ? "nl" : "en";

  return (
    <AppShell title={t("common:nav.profile")}>
      <div className="space-y-6">
        {/* Training section */}
        <section aria-label={t("sections.training")}>
          <SectionLabel>{t("sections.training")}</SectionLabel>
          <Card className="divide-y divide-outline-variant">
            {/* Goal */}
            <button
              type="button"
              onClick={() => setGoalSheetOpen(true)}
              className="w-full flex items-center justify-between px-4 py-3.5 active:bg-surface-container-high transition-colors"
              aria-label={t("goalAria", { value: goalDisplayName })}
            >
              <span className="type-body-md text-on-surface">{t("goal")}</span>
              <span className="type-body-sm text-on-surface-variant">
                {goalDisplayName}
              </span>
            </button>

            {/* Experience */}
            <button
              type="button"
              onClick={() => setExperienceSheetOpen(true)}
              className="w-full flex items-center justify-between px-4 py-3.5 active:bg-surface-container-high transition-colors"
              aria-label={t("experienceAria", { value: experienceDisplay })}
            >
              <span className="type-body-md text-on-surface">
                {t("experience")}
              </span>
              <span className="type-body-sm text-on-surface-variant">
                {experienceDisplay}
              </span>
            </button>

            {/* Days per week */}
            <div className="px-4 py-3.5 space-y-3">
              <p className="type-body-md text-on-surface">{t("daysPerWeek")}</p>
              {daysOptions.length > 0 ? (
                <SegmentedControl
                  options={daysOptions}
                  value={String(
                    Math.min(freqMax, Math.max(freqMin, user.daysPerWeek)),
                  )}
                  onChange={handleDaysChange}
                  ariaLabel={t("daysPerWeek")}
                />
              ) : (
                <p className="type-body-sm text-on-surface-variant">
                  {t("selectGoalFirst")}
                </p>
              )}
            </div>

            {/* Workout split */}
            <button
              type="button"
              onClick={() => setSplitSheetOpen(true)}
              className="w-full flex items-center justify-between px-4 py-3.5 active:bg-surface-container-high transition-colors"
              aria-label={t("split.aria", { value: splitDisplay })}
            >
              <span className="type-body-md text-on-surface">
                {t("split.label")}
              </span>
              <span className="type-body-sm text-on-surface-variant">
                {splitDisplay}
              </span>
            </button>
          </Card>

          {/* Equipment */}
          <div className="mt-4 space-y-2">
            <SectionLabel>{t("sections.equipment")}</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {EQUIPMENT_OPTIONS.map((value) => (
                <EquipmentChip
                  key={value}
                  label={t(`common:equipment.${value}`)}
                  selected={currentEquipment.has(value)}
                  onToggle={() => toggleEquipment(value)}
                />
              ))}
            </div>
            <p className="type-body-sm text-on-surface-variant px-1">
              {t("bodyweightAlways")}
            </p>
          </div>

          {/* Re-run the full setup walkthrough */}
          <div className="mt-4 space-y-2">
            <Button
              variant="secondary"
              onClick={() => navigate("/onboarding")}
            >
              <RotateCcw size={16} strokeWidth={1.5} aria-hidden="true" />
              {t("redoSetup")}
            </Button>
            <p className="type-body-sm text-on-surface-variant px-1">
              {t("redoSetupHint")}
            </p>
          </div>
        </section>

        {/* Body section — optional details powering the daily-energy estimate */}
        <section aria-label={t("sections.body")}>
          <SectionLabel>{t("sections.body")}</SectionLabel>
          <Card className="divide-y divide-outline-variant">
            <div className="px-4 py-3.5 space-y-3">
              <p className="type-body-md text-on-surface">{t("heightCm")}</p>
              <Input
                type="number"
                inputMode="numeric"
                placeholder={t("heightPlaceholder")}
                defaultValue={user.heightCm ?? ""}
                onBlur={(e) => {
                  const v = parseInt(e.target.value, 10);
                  const next = Number.isFinite(v) && v >= 100 && v <= 250 ? v : undefined;
                  if (next !== user.heightCm) {
                    void save({ heightCm: next });
                    toast(t("common:saved"));
                  }
                }}
              />
            </div>
            <div className="px-4 py-3.5 space-y-3">
              <p className="type-body-md text-on-surface">{t("birthYear")}</p>
              <Input
                type="number"
                inputMode="numeric"
                placeholder={t("birthYearPlaceholder")}
                defaultValue={user.birthYear ?? ""}
                onBlur={(e) => {
                  const v = parseInt(e.target.value, 10);
                  const year = new Date().getFullYear();
                  const next =
                    Number.isFinite(v) && v >= year - 120 && v <= year - 13 ? v : undefined;
                  if (next !== user.birthYear) {
                    void save({ birthYear: next });
                    toast(t("common:saved"));
                  }
                }}
              />
            </div>
            <div className="px-4 py-3.5 space-y-3">
              <p className="type-body-md text-on-surface">{t("sex")}</p>
              <SegmentedControl
                options={[
                  { value: "male", label: t("sexOptions.male") },
                  { value: "female", label: t("sexOptions.female") },
                  { value: "unspecified", label: t("sexOptions.unspecified") },
                ]}
                value={user.sex ?? "unspecified"}
                onChange={(v) => {
                  void save({ sex: v === "unspecified" ? undefined : (v as "male" | "female") });
                  toast(t("common:saved"));
                }}
                ariaLabel={t("sex")}
              />
            </div>
          </Card>
          <p className="type-body-sm text-on-surface-variant px-1 mt-2">
            {t("bodyHint")}
          </p>
        </section>

        {/* Preferences section */}
        <section aria-label={t("sections.preferences")}>
          <SectionLabel>{t("sections.preferences")}</SectionLabel>
          <Card className="divide-y divide-outline-variant">
            {/* Units */}
            <div className="px-4 py-3.5 space-y-3">
              <p className="type-body-md text-on-surface">{t("weightUnit")}</p>
              <SegmentedControl
                options={[
                  { value: "kg", label: "kg" },
                  { value: "lb", label: "lb" },
                ]}
                value={user.unit}
                onChange={handleUnitChange}
                ariaLabel={t("weightUnit")}
              />
            </div>

            {/* Theme */}
            <div className="px-4 py-3.5 space-y-3">
              <p className="type-body-md text-on-surface">{t("theme")}</p>
              <SegmentedControl
                options={[
                  { value: "system", label: t("themeOptions.system") },
                  { value: "light", label: t("themeOptions.light") },
                  { value: "dark", label: t("themeOptions.dark") },
                ]}
                value={themePref}
                onChange={(v) => setThemePref(v as ThemePref)}
                ariaLabel={t("theme")}
              />
            </div>

            {/* Language — device preference, not saved to the server */}
            <div className="px-4 py-3.5 space-y-3">
              <p className="type-body-md text-on-surface">{t("language")}</p>
              <SegmentedControl
                options={LANGUAGE_OPTIONS}
                value={currentLanguage}
                onChange={(v) => setLanguage(v)}
                ariaLabel={t("language")}
              />
            </div>
          </Card>
        </section>

        {/* Account section */}
        <section aria-label={t("sections.account")}>
          <SectionLabel>{t("sections.account")}</SectionLabel>
          <Card className="divide-y divide-outline-variant">
            {user.email && (
              <div className="px-4 py-3.5 flex items-center justify-between">
                <span className="type-body-md text-on-surface">{t("email")}</span>
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
                  {t("signOut")}
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
        title={t("goalSheetTitle")}
      >
        <div className="space-y-3 pt-1">
          {profilesQuery.isPending && (
            <p className="type-body-sm text-on-surface-variant">
              {t("common:loading")}
            </p>
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
        title={t("experienceSheetTitle")}
      >
        <div className="space-y-3 pt-1">
          {EXPERIENCE_OPTIONS.map((value) => (
            <ExperienceCard
              key={value}
              value={value}
              selected={user.experience === value}
              onSelect={() => void handleExperienceChange(value)}
            />
          ))}
        </div>
      </BottomSheet>

      {/* Split sheet */}
      <BottomSheet
        open={splitSheetOpen}
        onClose={() => setSplitSheetOpen(false)}
        title={t("split.title")}
      >
        <div className="space-y-3 pt-1">
          {SPLIT_OPTIONS.map((value) => (
            <SplitCard
              key={value}
              value={value}
              selected={(user.splitPreference ?? "auto") === value}
              compatible={
                value === "auto" || splitCompatible(value, user.daysPerWeek)
              }
              onSelect={() => void handleSplitChange(value)}
            />
          ))}
        </div>
      </BottomSheet>
    </AppShell>
  );
}
