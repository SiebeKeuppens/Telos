// Exercise detail screen: form cues (numbered), common mistakes, substitute
// and progression callouts. Token-driven; no hex colours. design.md § Components.
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import { AppShell } from "../components/shell/AppShell";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { api, queryKeys } from "../lib/api";
import type { Exercise } from "../lib/types";

// ---- Substitute / progression callout cards --------------------------------

function SubstituteCallout({
  sub,
  onNavigate,
}: {
  sub: Exercise;
  onNavigate: (id: string) => void;
}) {
  const { t } = useTranslation("exercise");
  return (
    <div
      className="rounded-lg p-4 border space-y-2"
      style={{
        background: "color-mix(in srgb, var(--primary) 8%, transparent)",
        borderColor: "color-mix(in srgb, var(--primary) 30%, transparent)",
      }}
    >
      <p className="type-label text-primary">{t("substitute.title")}</p>
      <div>
        <p className="type-data text-on-surface">{sub.name}</p>
        {sub.formCues[0] && (
          <p className="type-body-sm text-on-surface-variant mt-0.5">
            {sub.formCues[0]}
          </p>
        )}
        <p className="type-body-sm text-on-surface-variant mt-1">
          {t("substitute.blurb")}
        </p>
      </div>
      <Button
        variant="ghost"
        fullWidth={false}
        size="compact"
        className="px-0 text-primary"
        onClick={() => onNavigate(sub.id)}
      >
        {t("viewExercise", { name: sub.name })}
      </Button>
    </div>
  );
}

function ProgressionCallout({
  progression,
  onNavigate,
}: {
  progression: Exercise;
  onNavigate: (id: string) => void;
}) {
  const { t } = useTranslation("exercise");
  return (
    <Card className="p-4 space-y-2">
      <p className="type-label text-on-surface-variant">{t("progression.title")}</p>
      <p className="type-data text-on-surface">{progression.name}</p>
      <Button
        variant="ghost"
        fullWidth={false}
        size="compact"
        className="px-0 text-on-surface-variant"
        onClick={() => onNavigate(progression.id)}
      >
        {t("viewExercise", { name: progression.name })}
      </Button>
    </Card>
  );
}

// ===========================================================================
// ROOT EXPORT
// ===========================================================================

export default function ExerciseDetail() {
  const { t } = useTranslation(["exercise", "common"]);
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const exercisesQ = useQuery({
    queryKey: queryKeys.exercises,
    queryFn: api.getExercises,
  });

  const exercise = exercisesQ.data?.find((e) => e.id === id);

  // Resolve substitute and progression exercises from the same cached list
  const substitute = exercise?.substituteId
    ? exercisesQ.data?.find((e) => e.id === exercise.substituteId)
    : undefined;
  const progression = exercise?.progressionId
    ? exercisesQ.data?.find((e) => e.id === exercise.progressionId)
    : undefined;

  // Deep links (installed PWA, shared URL) have no history to pop — fall
  // back to the Program tab instead of a dead button.
  const goBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/program");
    }
  };

  const backAction = (
    <button
      aria-label={t("common:back")}
      onClick={goBack}
      className="flex items-center justify-center w-11 h-11 rounded text-on-surface-variant hover:text-on-surface transition-colors -ml-2"
    >
      <ArrowLeft size={22} strokeWidth={1.5} />
    </button>
  );

  if (exercisesQ.isPending) {
    return (
      <AppShell title={t("title")} contextAction={backAction}>
        <div className="type-body-sm text-on-surface-variant text-center py-12">
          {t("common:loading")}
        </div>
      </AppShell>
    );
  }

  if (!exercise) {
    return (
      <AppShell title={t("title")} contextAction={backAction}>
        <div className="py-12 space-y-4 text-center">
          <p className="type-body-md text-on-surface-variant">
            {t("notFound")}
          </p>
          <Button
            variant="ghost"
            fullWidth={false}
            onClick={goBack}
          >
            {t("goBack")}
          </Button>
        </div>
      </AppShell>
    );
  }

  // Truncate long names to ~28 chars for the top bar
  const titleText =
    exercise.name.length > 28
      ? exercise.name.slice(0, 27) + "…"
      : exercise.name;

  return (
    <AppShell title={titleText} contextAction={backAction}>
      <div className="space-y-4">
        {/* ---- Header ---- */}
        <div className="space-y-3">
          <h1 className="type-headline-md text-on-surface">{exercise.name}</h1>

          {/* Equipment chips */}
          {exercise.equipment.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {exercise.equipment.map((eq) => (
                <Badge key={eq} variant="neutral">
                  {t(`common:equipment.${eq}`)}
                </Badge>
              ))}
            </div>
          )}

          {/* Primary muscles */}
          {exercise.primaryMuscles.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {exercise.primaryMuscles.map((m) => (
                <Badge key={m} variant="accent">
                  {t(`common:muscles.${m}`)}
                </Badge>
              ))}
            </div>
          )}

          {/* Secondary muscles (lighter neutral) */}
          {exercise.secondaryMuscles.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {exercise.secondaryMuscles.map((m) => (
                <Badge
                  key={m}
                  variant="neutral"
                  className="opacity-70"
                >
                  {t(`common:muscles.${m}`)}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* ---- Form cues ---- */}
        {exercise.formCues.length > 0 && (
          <Card className="p-4">
            <p className="type-label text-on-surface-variant mb-3">{t("form")}</p>
            <ol className="space-y-3">
              {exercise.formCues.map((cue, i) => (
                <li key={i} className="flex gap-3 items-start">
                  {/* Accent-tinted circle with step number */}
                  <span
                    className="shrink-0 w-6 h-6 rounded-full tint-primary-14 text-primary type-data flex items-center justify-center text-[12px] mt-[1px]"
                  >
                    {i + 1}
                  </span>
                  <span className="type-body-md text-on-surface leading-6">
                    {cue}
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        )}

        {/* ---- Common mistakes ---- */}
        {exercise.commonMistakes.length > 0 && (
          <Card className="p-4">
            <p className="type-label text-on-surface-variant mb-3">
              {t("commonMistakes")}
            </p>
            <ul className="space-y-3">
              {exercise.commonMistakes.map((mistake, i) => (
                <li key={i} className="flex gap-3 items-start">
                  <span className="shrink-0 mt-[4px]">
                    <TriangleAlert
                      size={14}
                      strokeWidth={1.5}
                      className="text-warning"
                    />
                  </span>
                  <span className="type-body-md text-on-surface leading-6">
                    {mistake}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* ---- Substitute callout ---- */}
        {substitute && (
          <SubstituteCallout
            sub={substitute}
            onNavigate={(subId) => navigate(`/exercise/${subId}`)}
          />
        )}

        {/* ---- Progression callout ---- */}
        {progression && (
          <ProgressionCallout
            progression={progression}
            onNavigate={(progId) => navigate(`/exercise/${progId}`)}
          />
        )}
      </div>
    </AppShell>
  );
}
