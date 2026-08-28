// FL6. Four dialogs used to render `err.message` directly, falling back to a
// translated `errors.*` string only when the Error had no message at all --
// which a thrown Error essentially never does. The translated (and so the
// French) message was therefore close to unreachable, and what a nurse
// actually saw was raw English Postgres, Supabase or network text.
//
// The rule those dialogs now follow: show the translated message, and
// `console.error` the raw one so it is still there to diagnose with.
//
// The one thing that survives is a message the app itself already put in the
// nurse's language -- "this patient already has discharge planning tasks",
// which is more useful than the generic fallback and is not a provider
// string. Those are thrown through `translatedError` so they can be told
// apart from a provider message by something more reliable than reading them.
//
// `ProfileScreen`'s email-change error is deliberately outside all of this:
// Supabase's own message (a rate limit, an address already in use) is the
// honest, specific answer there, and a generic translated string would be
// worse. Same for AuthScreen, FacilityScreen and NoticeScreen.

/**
 * An Error carrying a message that is already translated and safe to show.
 *
 * @param {string} message - an already-resolved `t("errors.*")` string
 * @returns {Error}
 */
export function translatedError(message) {
  const err = new Error(message);
  err.translated = true;
  return err;
}

/**
 * What to put in front of the nurse for a caught error: the app's own
 * translated message if it has one, otherwise the caller's translated
 * fallback. Never the provider's own text -- log that separately.
 *
 * @param {unknown} err
 * @param {string} fallback - an already-resolved `t("errors.*")` string
 * @returns {string}
 */
export function errorText(err, fallback) {
  return err?.translated && err.message ? err.message : fallback;
}
