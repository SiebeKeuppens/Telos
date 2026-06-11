// i18n core. UI language is a client concern: the server ships stable CODES
// (engine notes, warmup moves, generated workout names) and the client owns
// all display text. Locale files live per-namespace under ./locales.
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import enCommon from "./locales/en/common.json";
import nlCommon from "./locales/nl/common.json";
import enSignin from "./locales/en/signin.json";
import nlSignin from "./locales/nl/signin.json";
import enOnboarding from "./locales/en/onboarding.json";
import nlOnboarding from "./locales/nl/onboarding.json";
import enToday from "./locales/en/today.json";
import nlToday from "./locales/nl/today.json";
import enProgram from "./locales/en/program.json";
import nlProgram from "./locales/nl/program.json";
import enLog from "./locales/en/log.json";
import nlLog from "./locales/nl/log.json";
import enProgress from "./locales/en/progress.json";
import nlProgress from "./locales/nl/progress.json";
import enProfile from "./locales/en/profile.json";
import nlProfile from "./locales/nl/profile.json";
import enWorkout from "./locales/en/workout.json";
import nlWorkout from "./locales/nl/workout.json";
import enExercise from "./locales/en/exercise.json";
import nlExercise from "./locales/nl/exercise.json";
import enComponents from "./locales/en/components.json";
import nlComponents from "./locales/nl/components.json";

export const SUPPORTED_LANGUAGES = ["en", "nl"] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const STORAGE_KEY = "telos-lang";

function initialLanguage(): AppLanguage {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "nl") return stored;
  } catch {
    // storage unavailable — fall through to browser language
  }
  return navigator.language?.toLowerCase().startsWith("nl") ? "nl" : "en";
}

void i18n.use(initReactI18next).init({
  resources: {
    en: {
      common: enCommon,
      signin: enSignin,
      onboarding: enOnboarding,
      today: enToday,
      program: enProgram,
      log: enLog,
      progress: enProgress,
      profile: enProfile,
      workout: enWorkout,
      exercise: enExercise,
      components: enComponents,
    },
    nl: {
      common: nlCommon,
      signin: nlSignin,
      onboarding: nlOnboarding,
      today: nlToday,
      program: nlProgram,
      log: nlLog,
      progress: nlProgress,
      profile: nlProfile,
      workout: nlWorkout,
      exercise: nlExercise,
      components: nlComponents,
    },
  },
  lng: initialLanguage(),
  fallbackLng: "en",
  defaultNS: "common",
  interpolation: { escapeValue: false }, // React escapes already
});

document.documentElement.lang = i18n.language;

export function setLanguage(lang: AppLanguage): void {
  void i18n.changeLanguage(lang);
  document.documentElement.lang = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // non-fatal
  }
}

/** Locale for date formatting (toLocaleDateString etc.). */
export function dateLocale(): string {
  return i18n.language === "nl" ? "nl-BE" : "en-US";
}

/** Translate an engine-generated workout name ("Chest + Triceps", "Upper A"…)
 * via common.workoutNames; unknown (user-custom) names pass through. */
export function workoutName(raw: string): string {
  const key = `workoutNames.${raw}`;
  const translated = i18n.t(key, { ns: "common", defaultValue: "" });
  return translated || raw;
}

export default i18n;
