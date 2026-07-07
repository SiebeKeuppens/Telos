// i18n core (mobile). Mirrors web/src/i18n/index.ts but flattens the
// per-namespace locale files into a single resource bundle per language —
// mobile has one screen per file rather than a big SPA, so one JSON per
// language keeps things simple. Sections (today, workout, …) act as the
// same logical namespaces the web uses, just nested instead of split.
import AsyncStorage from "@react-native-async-storage/async-storage";
import i18n, { type LanguageDetectorAsyncModule } from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import nl from "./locales/nl.json";

export const SUPPORTED_LANGUAGES = ["en", "nl"] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const STORAGE_KEY = "telos-lang";

function isAppLanguage(v: unknown): v is AppLanguage {
  return v === "en" || v === "nl";
}

// Minimal languageDetector: AsyncStorage is inherently async, but i18next's
// LanguageDetector plugin supports an async `detect(callback)` signature, so
// init() can still be called synchronously below (i18next queues until the
// detector calls back). No expo-localization — default is "en" until a
// stored preference is found.
const asyncStorageDetector: LanguageDetectorAsyncModule = {
  type: "languageDetector",
  async: true,
  init: () => {},
  detect: (callback) => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => callback(isAppLanguage(stored) ? stored : "en"))
      .catch(() => callback("en"));
  },
  cacheUserLanguage: (lng) => {
    void AsyncStorage.setItem(STORAGE_KEY, lng).catch(() => {
      // non-fatal
    });
  },
};

void i18n
  .use(asyncStorageDetector)
  .use(initReactI18next)
  .init({
    // One flat namespace holding the whole nested tree: every call site uses
    // dot paths like t("today.title"), so sections are key prefixes, NOT
    // i18next namespaces. nsSeparator off so ":" never splits a key.
    resources: {
      en: { translation: en },
      nl: { translation: nl },
    },
    fallbackLng: "en",
    defaultNS: "translation",
    nsSeparator: false,
    interpolation: { escapeValue: false }, // RN has no HTML escaping concerns
    // react-i18next: avoid Suspense (no built-in loader UI on mobile) and
    // keep isInitializing short — the detector resolves from AsyncStorage
    // almost immediately, so a synchronous first render briefly shows the
    // fallback language rather than a spinner.
    react: { useSuspense: false },
  });

export function setLanguage(lang: AppLanguage): void {
  void i18n.changeLanguage(lang);
  void AsyncStorage.setItem(STORAGE_KEY, lang).catch(() => {
    // non-fatal
  });
}

export function getLanguage(): AppLanguage {
  return isAppLanguage(i18n.language) ? i18n.language : "en";
}

/** Translate an engine-generated workout name ("Chest + Triceps", "Upper A"…)
 * via common.workoutNames; unknown (user-custom) names pass through.
 * Pass the `t` from useTranslation() (namespaced or not — we always read
 * the "common" namespace explicitly) so callers don't need a second hook. */
export function workoutName(raw: string, t: typeof i18n.t): string {
  const translated = t(`common.workoutNames.${raw}`, { defaultValue: "" });
  return translated || raw;
}

export default i18n;
