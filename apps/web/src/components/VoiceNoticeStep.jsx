import VoiceStepHeader from "./VoiceStepHeader";

// A voice step that has no form: something the nurse asked for that is not
// available by voice (a delete, a rename), a navigation to confirm (open a
// report), or a step with nothing to do (discharge planning already
// started). It writes nothing; the buttons only move the queue on.
export default function VoiceNoticeStep({ step, title, message, tone = "info", primaryLabel, onPrimary, secondaryLabel, onSecondary }) {
  const toneClass = tone === "warn" ? "bg-amber-50 text-amber-900 ring-amber-200" : "bg-gray-50 text-gray-700 ring-gray-200";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="voice-notice-title" className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <VoiceStepHeader step={step} showClose />
        <h2 id="voice-notice-title" className="mt-4 text-xl font-bold text-gray-900">{title}</h2>
        <p className={`mt-3 rounded-lg px-3 py-2 text-sm ring-1 ${toneClass}`}>{message}</p>
        <div className="mt-5 flex gap-3">
          {secondaryLabel && (
            <button
              type="button"
              onClick={onSecondary}
              className="flex-1 rounded-lg bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-700 hover:text-white"
            >
              {secondaryLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onPrimary}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
          >
            {primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
