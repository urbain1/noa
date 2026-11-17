import { useTranslation } from "react-i18next";
import { ITEM_STATUS, notDoneCount } from "../utils/voiceQueue";
import { describeAction } from "../utils/voiceRegistry";

const STATUS_STYLE = {
  [ITEM_STATUS.DONE]: "bg-green-100 text-green-800",
  [ITEM_STATUS.SKIPPED]: "bg-gray-100 text-gray-700",
  [ITEM_STATUS.FAILED]: "bg-red-100 text-red-800",
  [ITEM_STATUS.UNAVAILABLE]: "bg-amber-100 text-amber-900",
  [ITEM_STATUS.BLOCKED]: "bg-amber-100 text-amber-900",
  [ITEM_STATUS.CANCELLED]: "bg-gray-100 text-gray-700",
};

function statusText(t, item) {
  if (item.status === ITEM_STATUS.DONE && item.applied?.kind === "handoff") return t("voiceQueue.summary.opensOnClose");
  if (item.status === ITEM_STATUS.SKIPPED && (item.note === "nothing_to_change" || item.note === "already_planned")) {
    return t("voiceQueue.summary.nothingToChange");
  }
  return t(`voiceQueue.summary.${item.status}`);
}

// The end of a universal voice command: every action on one line with what
// happened to it (done, skipped, failed, not available, not done), what was
// not understood, and what was left out past five actions. Closing the queue
// early lands here too, with the count of actions that were not done.
//
// `createdPatients`: labels of patients created from a picker along the way.
// `renderExtra(item)`: per-line extra content (the Undo control).
export default function VoiceSummary({ queue, patients, createdPatients = [], dropped = [], unparsed = [], hasDeferredReport, onClose, renderExtra }) {
  const { t } = useTranslation();
  const labelOf = (id) => patients.find((p) => p.id === id)?.label;
  const notDone = notDoneCount(queue);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="voice-summary-title" className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-lg bg-white shadow-xl">
        <div className="px-6 pt-6 pb-3">
          <h2 id="voice-summary-title" className="text-xl font-bold text-gray-900">{t("voiceQueue.summary.title")}</h2>
          <p role="status" className="mt-1 text-sm text-gray-600">
            {notDone === 0 ? t("voiceQueue.summary.allDone") : t("voiceQueue.summary.notDone", { count: notDone })}
          </p>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto px-6 pb-2">
          {createdPatients.map((label) => (
            <div key={`created-${label}`} className="rounded-lg border border-gray-200 p-3">
              <div className="flex items-start gap-2">
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[ITEM_STATUS.DONE]}`}>
                  {t("voiceQueue.summary.done")}
                </span>
                <span className="break-words text-sm text-gray-900">{t("voiceQueue.line.createPatient", { patient: label })}</span>
              </div>
            </div>
          ))}

          {queue.items.map((item) => (
            <div key={item.index} className="rounded-lg border border-gray-200 p-3" data-status={item.status}>
              <div className="flex items-start gap-2">
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[item.status]}`}>
                  {statusText(t, item)}
                </span>
                <span className="break-words text-sm text-gray-900">
                  {describeAction(t, item.action, { patientLabel: labelOf(item.patientId) })}
                </span>
              </div>
              {renderExtra?.(item)}
            </div>
          ))}

          {unparsed.length > 0 && (
            <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
              <p className="font-semibold">{t("voiceCapture.notUnderstoodTitle")}</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {unparsed.map((words, i) => (
                  <li key={i} className="break-words">{words}</li>
                ))}
              </ul>
            </div>
          )}

          {dropped.length > 0 && (
            <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
              <p className="font-semibold">{t("voiceCapture.droppedTitle")}</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {dropped.map((d, i) => (
                  <li key={i} className="break-words">{d.words}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
          >
            {hasDeferredReport ? t("voiceQueue.summary.closeAndOpen") : t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
