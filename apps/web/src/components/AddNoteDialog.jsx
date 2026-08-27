import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { parseNoteInput } from "../utils/claudeAPI";
import { localeTag } from "../i18n";
import OperationStatus from "./OperationStatus";
import { useOperationStatus } from "../hooks/useOperationStatus";

const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

export default function AddNoteDialog({ patientName, onCancel, onSave }) {
  const { t, i18n } = useTranslation();
  const [isRecording, setIsRecording] = useState(false);
  const [text, setText] = useState("");
  const ops = useOperationStatus();
  const isProcessing = ops.isRunning("saveNote");
  const [error, setError] = useState(null);
  const recognitionRef = useRef(null);

  const finalInput = text.trim();

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  const toggleRecording = useCallback(() => {
    if (!SpeechRecognition) {
      setError(t("errors.speechUnsupported"));
      return;
    }

    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    // Dictation language follows the nurse's current language, so a French
    // nurse is transcribed with the French acoustic/language model. Read at
    // press time, so a mid-session change applies to the next recording.
    recognition.lang = localeTag(i18n.language);

    recognition.onresult = (event) => {
      let spoken = "";
      for (let i = 0; i < event.results.length; i++) {
        spoken += event.results[i][0].transcript;
      }
      setText(spoken);
    };

    recognition.onerror = (event) => {
      if (event.error === "not-allowed") {
        setError(t("errors.micDenied"));
      } else if (event.error !== "aborted") {
        setError(t("errors.speechError", { error: event.error }));
      }
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    setError(null);

    try {
      recognition.start();
      setIsRecording(true);
    } catch {
      setError(t("errors.speechStartFailed"));
    }
  }, [isRecording, i18n.language, t]);

  const handleSave = async () => {
    // Stop recording if active
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsRecording(false);

    if (!finalInput) return;
    setError(null);

    try {
      await ops.run(
        "saveNote",
        { messageKey: "status.savingNote", errorKey: "status.failed", surface: "button" },
        async () => {
          // Categorisation is best-effort; failing to reach Claude must not
          // cost the nurse the note they just dictated.
          let result = null;
          try {
            result = await parseNoteInput(finalInput);
          } catch (err) {
            console.error("Note categorisation failed, saving as Assessment:", err);
          }
          await onSave(result || { text: finalInput, category: "Assessment" });
        },
      );
    } catch (err) {
      // Previously this both re-called onSave and left the button spinning
      // for good, because nothing ever cleared isProcessing.
      console.error("Note creation error:", err);
      setError(err.message || t("errors.saveNote"));
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 px-4"
      onClick={onCancel}
    >
      <div
        className="relative flex w-full max-w-lg flex-col rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{t("noteDialog.title")}</h2>
            <p className="text-sm text-gray-500">{patientName}</p>
          </div>
          <button
            onClick={onCancel}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:text-gray-700"
            aria-label={t("noteDialog.closeAria")}
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-4 px-6 pb-2">
          {/* Mic button */}
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={toggleRecording}
              className={`flex h-20 w-20 items-center justify-center rounded-full border-none bg-blue-600 text-white shadow-lg ring-4 ring-blue-600/20 transition-all duration-200 hover:bg-blue-700 active:scale-95 ${
                isRecording ? "animate-pulse" : ""
              }`}
              aria-label={isRecording ? t("noteDialog.stopRecordingAria") : t("noteDialog.startRecordingAria")}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-8 w-8">
                <path d="M12 1a4 4 0 0 0-4 4v6a4 4 0 0 0 8 0V5a4 4 0 0 0-4-4Z" />
                <path d="M19 11a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.93V21H8a1 1 0 1 0 0 2h8a1 1 0 1 0 0-2h-3v-3.07A7 7 0 0 0 19 11Z" />
              </svg>
            </button>
            <p className="text-sm font-medium text-gray-500">
              {isRecording ? t("common.listening") : t("noteDialog.tapToSpeak")}
            </p>
          </div>

          {/* Combined voice + typed input */}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("noteDialog.placeholder")}
            rows={4}
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
          />

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-center text-sm text-red-600">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 border-t border-gray-200 px-6 py-4">
          <button
            onClick={onCancel}
            className="flex-1 rounded-lg bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-700 hover:text-white active:scale-[0.97]"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={handleSave}
            disabled={!finalInput || isProcessing}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isProcessing ? (
              <OperationStatus operations={ops.operations} name="saveNote" variant="button" />
            ) : (
              t("noteDialog.saveNote")
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
