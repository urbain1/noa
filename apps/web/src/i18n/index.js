import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import fr from "./locales/fr.json";

// Only the two languages `nurses.preferred_language` allows
// (0006_nurse_language_preference.sql). Anything else falls back to English.
export const SUPPORTED_LANGUAGES = ["en", "fr"];
export const DEFAULT_LANGUAGE = "en";

export function normalizeLanguage(value) {
  const code = (value || "").slice(0, 2).toLowerCase();
  return SUPPORTED_LANGUAGES.includes(code) ? code : DEFAULT_LANGUAGE;
}

// BCP 47 tags for the Web Speech API and Intl date/time formatting.
const LOCALE_TAGS = { en: "en-US", fr: "fr-FR" };

export function localeTag(value) {
  return LOCALE_TAGS[normalizeLanguage(value)];
}

/**
 * The single source of truth for "this nurse's current language".
 *
 * `i18n.language` is the only place the active language lives at runtime.
 * Nothing else caches it -- not a nurse object, not a prop, not component
 * state -- so a change made anywhere is visible everywhere on the next read,
 * with no copy left behind to go stale. `nurses.preferred_language` is the
 * durable record of it, read on sign-in and written on change, never rendered
 * from directly.
 */
export function currentLanguage() {
  return normalizeLanguage(i18n.language);
}

/**
 * Set the active language. Returns the normalised code that was applied.
 * Callers that need the switch to have taken effect before they continue
 * should await the returned promise from `i18n.changeLanguage` instead.
 */
export function applyLanguage(value) {
  const next = normalizeLanguage(value);
  if (normalizeLanguage(i18n.language) !== next) i18n.changeLanguage(next);
  return next;
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    fr: { translation: fr },
  },
  // The nurse's saved `preferred_language` is applied by App.jsx once the
  // profile loads; until then everything renders in English, matching the
  // column default.
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: SUPPORTED_LANGUAGES,
  interpolation: { escapeValue: false },
});

export default i18n;
