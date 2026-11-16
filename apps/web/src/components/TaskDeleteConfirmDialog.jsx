import { useState } from "react";
import { useTranslation } from "react-i18next";
import { errorText } from "../utils/errors";

// The second, explicit confirmation for the one action in the app that
// destroys a row: the AI edit dialog's "delete this task" command.
//
// TaskEditDialog's red banner is a *warning* shown while the command is
// still being composed -- it says what Apply would do. This is the
// confirmation: it is raised by App.handleAiUpdateTask only once a command
// has actually been read as a delete, so it names the task that is about to
// go and requires a separate, deliberate press.
//
// Deliberately gated at the App level rather than inside TaskEditDialog, so
// it covers every reading of a delete, not just the ones the local regex
// (`isDeleteCommand`) recognises. Voice and typed commands both arrive here
// through the same path, and `deleteTask` has no other caller.
//
// The demo-era `DeleteConfirmModal.jsx` is a near-sibling of this file and
// stays untouched: it is unwired, hardcoded English, and shaped around the
// demo's task objects. Wiring it is a separate, deferred call.
export default function TaskDeleteConfirmDialog({ task, command, onCancel, onConfirm }) {
  const { t } = useTranslation();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  async function handleConfirm() {
    if (deleting) return;
    setDeleting(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      // A delete refused by the edit lock or by a change made since the
      // dialog opened arrives already translated ("Nothing was deleted...")
      // and is shown as-is; anything else gets the generic message (FL6).
      console.error("Delete task error:", err);
      setError(errorText(err, t("errors.deleteTask")));
      setDeleting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4"
      onClick={deleting ? undefined : onCancel}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-label={t("taskEdit.deleteConfirmTitle")}
      >
        <div className="flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <svg className="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>

          <h2 className="mt-4 text-xl font-bold text-gray-900">
            {t("taskEdit.deleteConfirmTitle")}
          </h2>

          <div className="mt-3 w-full rounded-md bg-gray-100 px-4 py-3">
            <p className="text-sm italic text-gray-600">
              &ldquo;{task?.description}&rdquo;
            </p>
          </div>

          {/* What the nurse actually said or typed. A voice command that was
              mis-transcribed into a delete is exactly the mistake this step
              exists to catch, so the transcript is shown, not just the
              interpretation of it. */}
          {command && (
            <div className="mt-3 w-full rounded-md bg-blue-50 px-4 py-2 text-left">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-400">
                {t("taskEdit.deleteConfirmCommand")}
              </p>
              <p className="mt-0.5 text-sm text-blue-800">{command}</p>
            </div>
          )}

          <p className="mt-3 text-sm font-medium text-red-500">
            {t("taskEdit.deleteConfirmIrreversible")}
          </p>
        </div>

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-center text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="mt-6 flex gap-3">
          <button
            onClick={onCancel}
            disabled={deleting}
            className="flex-1 rounded-lg border border-gray-300 bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-700 hover:text-white active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t("taskEdit.deleteConfirmKeep")}
          </button>
          <button
            onClick={handleConfirm}
            disabled={deleting}
            className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {deleting ? t("taskEdit.deleteConfirmDeleting") : t("taskEdit.deleteConfirmCta")}
          </button>
        </div>
      </div>
    </div>
  );
}
