import { useState } from "react";
import { useTranslation } from "react-i18next";
import { errorText } from "../utils/errors";
import { columnLabels } from "../utils/historyFormat";
import { fetchNoteRow } from "../lib/patients";
import { useEditSession } from "../hooks/useEditSession";
import EditLockBanner from "./EditLockBanner";
import VoiceStepHeader from "./VoiceStepHeader";
import VoiceChangeList from "./VoiceChangeList";

const NOTE_COLUMNS = ["content"];

const same = (a, b) => String(a ?? "").trim() === String(b ?? "").trim();

// Editing a clinical note's text. Only `content` changes: the author, the
// patient and the time a note was written never do.
//
// Like the patient and task dialogs, it locks the note for colleagues while
// open and checks every save against changes made since it opened
// (useEditSession). Typed text is never discarded without the nurse choosing
// to. Who may open it is decided by the caller: only the note's author
// (decisions.md, 2026-11-18). That is a UI rule, not a security boundary;
// RLS lets any nurse at the facility update a note.
//
// `voiceStep` + `proposal` make this dialog one step of a universal voice
// command (VoiceQueue). `proposal(row)` returns the text the command asks
// for, given the note as it is now (an addition is laid over the current
// text, never a stale copy). Nothing is written until Confirm.
//
// `onSave(noteId, content)` resolves to the saved row and closes the dialog.
export default function EditNoteDialog({ note, patientLabel, facilityId, onRowRefreshed, onCancel, onSave, proposal, voiceStep }) {
  const { t } = useTranslation();
  const withProposal = (row) => (proposal ? proposal(row) : row?.content || "");
  const [text, setText] = useState(() => withProposal(note));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const session = useEditSession({
    recordType: "note",
    recordId: note.id,
    facilityId,
    initialRow: note,
    loadRow: () => fetchNoteRow(facilityId, note.id),
    onFreshRow: (row) => onRowRefreshed?.("note", row),
    onBaselineReplaced: (row) => setText(withProposal(row)),
    hasUnsaved: (baselineRow) => !same(text, baselineRow?.content),
  });

  const unsaved = !same(text, session.baseline?.content);
  const unsavedColumns = unsaved ? NOTE_COLUMNS : [];
  const empty = text.trim() === "";
  const disabled = !session.canEdit;

  const handleSave = async () => {
    if (empty) return;
    setSaving(true);
    setError(null);
    try {
      const before = session.baseline;
      const after = await session.guard(() => onSave(note.id, text));
      voiceStep?.onConfirmed({ before, after, columns: NOTE_COLUMNS });
    } catch (err) {
      // Refused by the lock or by someone else's change: the banner says
      // why, and the typed text stays in the box.
      if (err?.code !== "EDIT_NOT_HELD" && err?.code !== "EDIT_CONFLICT") {
        console.error("Update note error:", err);
        setError(errorText(err, t("errors.updateNote")));
        voiceStep?.onError?.(err);
      }
      setSaving(false);
    }
  };

  // "Save mine anyway": a note has one editable column, so mine replaces
  // theirs. The banner has already said who changed it and when.
  const handleKeepMine = () => {
    if (!session.keepMine()) return;
    handleSave();
  };

  const handleClose = () => {
    if (voiceStep) {
      voiceStep.onClose();
      return;
    }
    if (!session.canEdit && unsaved) {
      const fields = columnLabels(t, "note", NOTE_COLUMNS).join(", ");
      if (!window.confirm(t("editLock.closeUnsaved", { fields }))) return;
    }
    onCancel();
  };

  const voiceChanges = voiceStep
    ? unsaved
      ? [{ field: columnLabels(t, "note", NOTE_COLUMNS)[0], from: session.baseline?.content || "", to: text.trim() }]
      : []
    : null;
  const nothingToChange = Boolean(voiceStep) && session.ready && !unsaved;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 px-4"
      onClick={voiceStep ? undefined : handleClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-note-title"
        className="relative flex w-full max-w-lg flex-col rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onPointerDownCapture={session.touch}
        onKeyDownCapture={session.touch}
        onInputCapture={session.touch}
      >
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <div>
            <h2 id="edit-note-title" className="text-xl font-bold text-gray-900">{t("noteDialog.editTitle")}</h2>
            <p className="text-sm text-gray-500">{patientLabel}</p>
          </div>
          <button
            onClick={handleClose}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:text-gray-700"
            aria-label={voiceStep ? t("voiceQueue.closeAria") : t("noteDialog.closeAria")}
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto px-6 pb-2" style={{ maxHeight: "70vh" }}>
          <VoiceStepHeader step={voiceStep} />
          {voiceStep && session.ready && <VoiceChangeList changes={voiceChanges} />}
          <EditLockBanner
            session={session}
            recordType="note"
            unsavedColumns={unsavedColumns}
            onKeepMine={handleKeepMine}
            onDiscardMine={session.discardMine}
            busy={saving}
          />

          <div>
            <label htmlFor="edit-note-text" className="mb-1 block text-sm font-medium text-gray-700">
              {t("noteDialog.textLabel")}
            </label>
            <textarea
              id="edit-note-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={disabled}
              rows={5}
              className="w-full resize-none rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-600"
            />
            {empty && <p className="mt-1 text-xs text-red-600">{t("noteDialog.emptyNote")}</p>}
          </div>

          {error && <div className="rounded-lg bg-red-50 p-3 text-center text-sm text-red-600">{error}</div>}
        </div>

        <div className="flex gap-3 border-t border-gray-200 px-6 py-4">
          <button
            onClick={voiceStep ? () => voiceStep.onSkip(nothingToChange ? "nothing_to_change" : undefined) : handleClose}
            disabled={Boolean(voiceStep) && saving}
            className="flex-1 rounded-lg bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-700 hover:text-white active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {voiceStep ? (nothingToChange ? t("voiceQueue.next") : t("voiceQueue.skip")) : t("common.cancel")}
          </button>
          {!nothingToChange && (
            <button
              onClick={handleSave}
              disabled={saving || disabled || empty || !unsaved}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? t("common.saving") : voiceStep ? t("voiceQueue.confirm") : t("common.saveChanges")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
