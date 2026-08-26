import { localeTag } from "../i18n";

// Formats "Repaged today at 1:30 PM" / "Relancé aujourd'hui à 13:30" (and the
// non-today variant) for a `last_repaged_at`/`escalated_at` column value.
// `kind` is "repaged" or "escalated", matching the taskCard.<kind>Today /
// taskCard.<kind>On translation keys. Locale alone drives 12h-vs-24h time
// display (fr-FR is 24h, en-US is 12h with AM/PM) -- see CLAUDE.md decisions
// on why there's no separate per-nurse region field for this.
export function formatActionTimestamp(t, language, isoTimestamp, kind) {
  if (!isoTimestamp) return null;

  const date = new Date(isoTimestamp);
  const tag = localeTag(language);
  const time = date.toLocaleTimeString(tag, { hour: "numeric", minute: "2-digit" });

  if (date.toDateString() === new Date().toDateString()) {
    return t(`taskCard.${kind}Today`, { time });
  }

  const dateStr = date.toLocaleDateString(tag, { day: "numeric", month: "short" });
  return t(`taskCard.${kind}On`, { date: dateStr, time });
}
