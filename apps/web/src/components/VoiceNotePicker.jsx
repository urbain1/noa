import { useTranslation } from "react-i18next";
import { formatHistoryTime } from "../utils/historyFormat";
import VoiceStepHeader from "./VoiceStepHeader";

const PREVIEW_MAX = 160;

// The note picker inside a voice step. Every edit_note goes through it: note
// content never goes to the parser, so the parser cannot name a note, and
// nothing is pre-selected, not even the newest. `notes` are the ones the
// current nurse may edit (their own, newest first: voiceRegistry
// editableNotes).
export default function VoiceNotePicker({ step, patient, notes, onPick, onSkip }) {
  const { t, i18n } = useTranslation();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="voice-note-picker-title" className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <VoiceStepHeader step={step} showClose />
        <h2 id="voice-note-picker-title" className="mt-4 text-xl font-bold text-gray-900">
          {t("voiceQueue.chooseNoteTitle")}
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          {notes.length === 0
            ? t("voiceQueue.chooseNoteNone", { patient: patient.label })
            : t("voiceQueue.chooseNoteBody", { patient: patient.label })}
        </p>

        <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
          {notes.map((note) => {
            const content = String(note.content || "");
            const preview = content.length > PREVIEW_MAX ? `${content.slice(0, PREVIEW_MAX).trimEnd()}...` : content;
            return (
              <button
                key={note.id}
                type="button"
                onClick={() => onPick(note)}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 p-3 text-left transition-colors hover:border-blue-300 hover:bg-blue-50"
              >
                <span className="block break-words text-sm text-gray-900">{preview}</span>
                <span className="mt-1 block text-xs text-gray-500">{formatHistoryTime(note.created_at, i18n.language)}</span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => onSkip()}
          className="mt-4 w-full rounded-lg bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-700 hover:text-white"
        >
          {t("voiceQueue.skip")}
        </button>
      </div>
    </div>
  );
}
