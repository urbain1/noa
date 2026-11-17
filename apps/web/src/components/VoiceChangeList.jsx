import { useTranslation } from "react-i18next";

// "Will change": one line per field an edit step is about to write, old
// value to new value, so the nurse confirms a difference rather than a form.
//
// `changes`: [{ field, from, to }] with values already formatted for display.
export default function VoiceChangeList({ changes }) {
  const { t } = useTranslation();
  if (!changes) return null;

  if (changes.length === 0) {
    return (
      <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600 ring-1 ring-gray-200">
        {t("voiceQueue.noChange")}
      </p>
    );
  }

  const show = (value) => (value === null || value === undefined || value === "" ? t("voiceQueue.emptyValue") : value);

  return (
    <div className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900 ring-1 ring-blue-200">
      <p className="text-xs font-semibold uppercase tracking-wide text-blue-500">{t("voiceQueue.willChange")}</p>
      <ul className="mt-1 space-y-1">
        {changes.map((change) => (
          <li key={change.field} className="break-words">
            {t("voiceQueue.changeLine", { field: change.field, from: show(change.from), to: show(change.to) })}
          </li>
        ))}
      </ul>
    </div>
  );
}
