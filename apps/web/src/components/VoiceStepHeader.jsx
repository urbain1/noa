import { useTranslation } from "react-i18next";

// The strip at the top of every step of a universal voice command: where the
// nurse is in the queue ("2 of 3") and the words this step came from, so a
// mis-heard command is recognisable before anything is confirmed.
//
// `step`: { index, total, words, confidence, onClose }
// `showClose`: for steps whose dialog has no close button of its own. Closing
// ends the queue: the remaining actions are not done, and the summary says so.
export default function VoiceStepHeader({ step, showClose = false }) {
  const { t } = useTranslation();
  if (!step) return null;
  return (
    <div className="relative rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-900 ring-1 ring-indigo-200">
      {showClose && step.onClose && (
        <button
          type="button"
          onClick={step.onClose}
          aria-label={t("voiceQueue.closeAria")}
          className="absolute right-1.5 top-1.5 rounded p-1 text-indigo-500 transition-colors hover:bg-indigo-100 hover:text-indigo-900"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
      <p className={`flex flex-wrap items-center gap-2 font-semibold ${showClose ? "pr-7" : ""}`}>
        <span>{t("voiceQueue.stepOf", { index: step.index, total: step.total })}</span>
        {step.confidence === "low" && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 ring-1 ring-amber-200">
            {t("voiceCapture.lowConfidence")}
          </span>
        )}
      </p>
      {step.words && <p className="mt-0.5 break-words italic">{t("voiceQueue.heard", { words: step.words })}</p>}
    </div>
  );
}
