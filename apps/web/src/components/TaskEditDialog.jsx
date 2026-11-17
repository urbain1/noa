import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { localeTag } from "../i18n";
import { departmentLabel, priorityLabel, statusLabel } from "../i18n/enums";
import AssigneeSelect from "./AssigneeSelect";
import { isDeleteCommand } from "../utils/taskEditParse";
import OperationStatus from "./OperationStatus";
import { useOperationStatus } from "../hooks/useOperationStatus";
import { useEditSession } from "../hooks/useEditSession";
import { fetchTaskRow } from "../lib/patients";
import { errorText } from "../utils/errors";
import { columnLabels } from "../utils/historyFormat";
import EditLockBanner from "./EditLockBanner";
import VoiceStepHeader from "./VoiceStepHeader";
import VoiceChangeList from "./VoiceChangeList";
import { toLocalDatetimeValue } from "../utils/datetimeLocal";

// How long description/deadline wait after the last keystroke before
// saving -- long enough that a fast typist doesn't fire a write per
// character, short enough that it still reads as "auto". How long the
// "Saved" confirmation then stays up is the shared hook's business
// (useOperationStatus DONE_FLASH_MS), not this dialog's.
const DEBOUNCE_MS = 700;

// Canonical values, stored and matched as-is. Only the <option> label is
// translated, never the value.
const STATUS_OPTIONS = ["Pending", "Confirmed", "Delayed", "Completed"];
const DEPARTMENT_OPTIONS = [
  "Radiology",
  "Lab",
  "Pharmacy",
  "Nursing",
  "Physical Therapy",
  "Social Work",
  // Tasks can already carry this department (the capture fallback assigns
  // it); without the option the select showed such a task as "Radiology".
  "Transport",
  "Other",
];
const PRIORITY_OPTIONS = ["Stat", "Routine"];

const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

const statusStyles = {
  Pending: "bg-yellow-100 text-yellow-800",
  Confirmed: "bg-green-100 text-green-800",
  Delayed: "bg-red-100 text-red-800",
  Completed: "bg-blue-100 text-blue-800",
};

// Nurses come from the same facility-scoped list AssigneeSelect uses --
// display name, falling back to email the same way that select does.
function nurseName(nurses, id) {
  if (!id) return null;
  const nurse = nurses.find((n) => n.id === id);
  if (!nurse) return null;
  return nurse.name || nurse.email;
}

// Manual-mode fields, named by their tasks column. Values are held the way
// the inputs need them (deadline in local "YYYY-MM-DDTHH:mm"); `toDb` gives
// the value that would be written.
const MANUAL_FIELDS = ["description", "status", "department", "priority", "deadline", "assigned_to"];

function fieldsFromTask(task) {
  return {
    description: task?.description || "",
    status: task?.status || "Pending",
    department: task?.department || "Other",
    priority: task?.priority || "Routine",
    deadline: toLocalDatetimeValue(task?.deadline),
    assigned_to: task?.assigned_to || null,
  };
}

function toDb(field, value) {
  if (field === "deadline") return value ? new Date(value).toISOString() : null;
  if (field === "assigned_to") return value || null;
  return value;
}

// Deadlines are compared to the minute: the input has no seconds, a stored
// deadline may.
function sameDbValue(field, a, b) {
  if (field === "deadline") {
    if (!a || !b) return !a && !b;
    return Math.floor(Date.parse(a) / 60000) === Math.floor(Date.parse(b) / 60000);
  }
  return (a ?? null) === (b ?? null);
}

// Fields whose value in the form isn't what `row` (the last saved state)
// holds: what would be lost if the dialog vanished now.
function unsavedFieldsOf(fields, row) {
  return MANUAL_FIELDS.filter((f) => !sameDbValue(f, toDb(f, fields[f]), row?.[f] ?? null));
}

// `voiceStep` + `proposal` make this dialog one step of a universal voice
// command (VoiceQueue), in PROPOSAL MODE:
//   - `proposal(row)` returns the field values the command asks for; they
//     are laid over the fresh row when the dialog opens and again whenever
//     the row is re-read, so the stored values never silently replace them.
//   - Nothing auto-saves. Changing a field only changes the form. One
//     Confirm writes every changed field in a single guarded update; Skip
//     writes nothing.
//   - The lock and the stale-write check apply exactly as in a normal edit:
//     a colleague's lock shows the banner (wait, take over, or skip).
// Without `voiceStep` the dialog behaves exactly as before.
export default function TaskEditDialog({ task, patientId, patientLabel, nurses = [], currentNurseId, facilityId, onRowRefreshed, onAssign, onCancel, onUpdate, onManualUpdate, proposal, voiceStep }) {
  const { t, i18n } = useTranslation();
  const proposing = Boolean(voiceStep);
  const withProposal = (row) => (proposal ? { ...fieldsFromTask(row), ...proposal(row) } : fieldsFromTask(row));
  const [isRecording, setIsRecording] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [textCommand, setTextCommand] = useState("");
  const [error, setError] = useState(null);
  const recognitionRef = useRef(null);
  const [editMode, setEditMode] = useState("manual"); // "manual" or "ai"
  const [manualFields, setManualFields] = useState(() => withProposal(task));
  // Fields with a debounced save waiting to fire (description, deadline).
  const [pending, setPending] = useState({});
  const [closing, setClosing] = useState(false);

  // Lock + stale-write protection (hooks/useEditSession.js). Every write
  // below goes through `guard`; when it refuses (lock taken over, paused,
  // or the task changed under us) the typed value stays in the field and the
  // banner lists it as not saved. Nothing is dropped without the nurse
  // choosing to.
  const session = useEditSession({
    recordType: "task",
    recordId: task.id,
    facilityId,
    initialRow: task,
    loadRow: () => fetchTaskRow(facilityId, task.id),
    onFreshRow: (row) => onRowRefreshed?.("task", row),
    onBaselineReplaced: (row) => setManualFields(withProposal(row)),
    hasUnsaved: (baselineRow) => unsavedFieldsOf(manualFields, baselineRow).length > 0,
  });
  const { guard, canEdit } = session;

  // Per-field auto-save state, on the same primitive every other async
  // operation in the app uses. Operations are keyed by DB column name
  // (description/status/department/priority/deadline/assigned_to), not by
  // form field name, so the assignee's own save path reports identically.
  const ops = useOperationStatus();
  const isProcessing = ops.isRunning("applyCommand");
  const debounceTimers = useRef({});
  // The last saved row, for debounce callbacks that fire after renders.
  const baselineRef = useRef(session.baseline);
  useEffect(() => {
    baselineRef.current = session.baseline;
  });

  useEffect(() => {
    const debounceTimersAtMount = debounceTimers.current;
    return () => {
      Object.values(debounceTimersAtMount).forEach(clearTimeout);
    };
  }, []);

  const { run } = ops;

  // The one place that actually writes a field. `dbValue` is already in the
  // shape the database expects (deadline as ISO, assignee as id or null).
  // Resolves true once the value is saved, false otherwise.
  const commitField = useCallback(
    async (field, dbValue) => {
      setError(null);
      try {
        const saved = await run(
          field,
          {
            messageKey: field === "assigned_to" ? "status.assigning" : "common.saving",
            doneKey: "common.saved",
            errorKey: "status.failed",
            surface: "inline",
          },
          () =>
            guard(() =>
              field === "assigned_to"
                ? onAssign(task, dbValue)
                : onManualUpdate({ [field]: dbValue }, task, patientId)
            ),
        );
        // onAssign reports its own failures (alert) and resolves undefined.
        return Boolean(saved);
      } catch (err) {
        // Refused by the lock or by a change made by someone else: the
        // banner says why and the value stays in the field.
        if (err?.code === "EDIT_NOT_HELD" || err?.code === "EDIT_CONFLICT") return false;
        // The inline marker says the save failed; the banner says why.
        // FL6: "why" is the translated message, not the provider's own
        // English text -- that goes to the console instead.
        console.error("Task field save error:", field, err);
        setError(errorText(err, t("errors.updateTask")));
        return false;
      }
    },
    [guard, onAssign, onManualUpdate, task, patientId, t, run]
  );

  // Selects/status/department/priority save the moment they change -- a
  // discrete choice, not something to debounce. Description and deadline
  // debounce: typing (or picking a date/time digit by digit) fires the
  // native onChange repeatedly, and saving on every one of those would mean
  // a write per keystroke.
  const scheduleField = useCallback(
    (field, dbValue) => {
      clearTimeout(debounceTimers.current[field]);
      setPending((prev) => ({ ...prev, [field]: true }));
      debounceTimers.current[field] = setTimeout(() => {
        debounceTimers.current[field] = null;
        setPending((prev) => ({ ...prev, [field]: false }));
        if (sameDbValue(field, dbValue, baselineRef.current?.[field] ?? null)) return;
        commitField(field, dbValue);
      }, DEBOUNCE_MS);
    },
    [commitField]
  );

  const setField = (field, value) => setManualFields((prev) => ({ ...prev, [field]: value }));

  // In proposal mode a change only changes the form: nothing is written
  // until the nurse confirms the step.
  const handleDescriptionChange = (value) => {
    setField("description", value);
    if (!proposing) scheduleField("description", value);
  };

  const handleDeadlineChange = (value) => {
    setField("deadline", value);
    if (!proposing) scheduleField("deadline", toDb("deadline", value));
  };

  const handleStatusChange = (value) => {
    setField("status", value);
    if (!proposing) commitField("status", value);
  };

  const handleDepartmentChange = (value) => {
    setField("department", value);
    if (!proposing) commitField("department", value);
  };

  const handlePriorityChange = (value) => {
    setField("priority", value);
    if (!proposing) commitField("priority", value);
  };

  // Everything typed but not saved. While saving is possible, fields still
  // waiting on their debounce or mid-save aren't listed: they're on their way.
  const unsavedFields = unsavedFieldsOf(manualFields, session.baseline);
  const blockedFields = proposing
    ? unsavedFields
    : canEdit
      ? unsavedFields.filter((f) => !pending[f] && !ops.isRunning(f))
      : unsavedFields;

  // Writes the given fields one by one; true only if every one was saved.
  const saveFields = async (fields, values = manualFields) => {
    let allSaved = true;
    for (const field of fields) {
      const ok = await commitField(field, toDb(field, values[field]));
      allSaved = allSaved && ok;
    }
    return allSaved;
  };

  const handleSaveUnsaved = () => saveFields(blockedFields);

  // "Save mine anyway": take the colleague's version for every field I
  // didn't change, keep mine for the ones I did, then write only mine.
  const handleKeepMine = () => {
    const fresh = session.conflict?.fresh;
    if (!fresh) return;
    const mine = unsavedFieldsOf(manualFields, session.baseline);
    const merged = fieldsFromTask(fresh);
    for (const f of mine) merged[f] = manualFields[f];
    if (!session.keepMine()) return;
    setManualFields(merged);
    // In proposal mode this only re-bases the proposal on the colleague's
    // version: their other changes are kept, and the write still waits for
    // Confirm.
    if (!proposing) saveFields(mine, merged);
  };

  // Closing never drops a typed value silently. Pending debounced saves are
  // written now, and the dialog only closes once they have landed. If saving
  // isn't possible (lock lost, paused, conflict), the nurse is asked first.
  const handleClose = async () => {
    if (closing) return;
    // As a voice step, closing ends the queue. Nothing has been written, and
    // the summary lists this action as not done.
    if (proposing) {
      voiceStep.onClose();
      return;
    }
    Object.values(debounceTimers.current).forEach((timer) => timer && clearTimeout(timer));
    debounceTimers.current = {};
    setPending({});

    const unsaved = unsavedFieldsOf(manualFields, baselineRef.current);
    if (unsaved.length === 0) {
      onCancel();
      return;
    }
    if (canEdit) {
      setClosing(true);
      const allSaved = await saveFields(unsaved);
      setClosing(false);
      // If anything was refused, stay open: the banner lists what wasn't saved.
      if (allSaved) onCancel();
      return;
    }
    const fieldsText = columnLabels(t, "task", unsaved).join(", ");
    if (window.confirm(t("editLock.closeUnsaved", { fields: fieldsText }))) onCancel();
  };

  const handleAssigneeChange = (nurseId) => {
    setField("assigned_to", nurseId || null);
    if (proposing) return Promise.resolve(true);
    return commitField("assigned_to", nurseId || null);
  };

  // Proposal mode's only write: every changed field, in one guarded update.
  // The row before and the row after go back to the queue, which keeps them
  // in memory so the change can be undone.
  const confirming = ops.isRunning("confirmStep");
  const handleVoiceConfirm = async () => {
    if (!canEdit || confirming) return;
    const before = baselineRef.current;
    const changed = unsavedFieldsOf(manualFields, before);
    if (changed.length === 0) return;
    const updates = {};
    for (const field of changed) {
      updates[field === "assigned_to" ? "assignedTo" : field] = toDb(field, manualFields[field]);
    }
    setError(null);
    try {
      const after = await ops.run(
        "confirmStep",
        { messageKey: "common.saving", errorKey: "status.failed", surface: "button" },
        () => guard(() => onManualUpdate(updates, task, patientId)),
      );
      voiceStep.onConfirmed({ before, after, columns: changed });
    } catch (err) {
      // Refused by the lock or a conflicting change: the banner explains.
      if (err?.code === "EDIT_NOT_HELD" || err?.code === "EDIT_CONFLICT") return;
      console.error("Voice task edit error:", err);
      setError(errorText(err, t("errors.updateTask")));
      voiceStep.onError?.(err);
    }
  };

  const displayOf = (field, value) => {
    if (field === "status") return statusLabel(t, value);
    if (field === "priority") return priorityLabel(t, value);
    if (field === "department") return departmentLabel(t, value);
    if (field === "assigned_to") return nurseName(nurses, value) || t("tasksView.unassigned");
    if (field === "deadline") {
      return value
        ? new Date(value).toLocaleString(localeTag(i18n.language), { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
        : t("common.none");
    }
    return value;
  };
  const voiceChanges = proposing
    ? unsavedFields.map((field) => ({
        field: columnLabels(t, "task", [field])[0],
        from: displayOf(field, session.baseline?.[field] ?? null),
        to: displayOf(field, toDb(field, manualFields[field])),
      }))
    : null;
  const nothingToChange = proposing && session.ready && unsavedFields.length === 0 && !voiceStep.assigneeHeard;

  const assigningToMe = ops.isRunning("assigned_to");
  const handleAssignToMe = () => {
    if (!currentNurseId || assigningToMe || !canEdit) return;
    handleAssigneeChange(currentNurseId);
  };

  const finalCommand = voiceTranscript.trim() || textCommand.trim();
  const isDelete = isDeleteCommand(finalCommand);
  const badgeClass = statusStyles[task?.status] || "bg-gray-100 text-gray-800";

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
    // Read at press time from the one live value, never a cached copy.
    recognition.lang = localeTag(i18n.language);

    recognition.onresult = (event) => {
      let text = "";
      for (let i = 0; i < event.results.length; i++) {
        text += event.results[i][0].transcript;
      }
      setVoiceTranscript(text);
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

  const handleApply = async () => {
    // Stop recording if active
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsRecording(false);

    if (!finalCommand || !canEdit) return;
    setError(null);
    try {
      // The stale-write check runs before the command is applied. `guard` is
      // also handed over so that a command read as a delete is checked again
      // at the moment the nurse confirms it (App.handleConfirmDeleteTask).
      await ops.run(
        "applyCommand",
        { messageKey: "status.applyingChanges", errorKey: "status.failed", surface: "button" },
        () => guard(() => onUpdate(finalCommand, task, patientId, guard)),
      );
    } catch (err) {
      // Refused by the lock or a conflicting change: the banner explains and
      // the command stays in the box.
      if (err?.code === "EDIT_NOT_HELD" || err?.code === "EDIT_CONFLICT") return;
      // On success the dialog closes; on failure it stays, un-stuck, with
      // the reason on screen. `handleAiUpdateTask` marks the messages it
      // has already translated ("Couldn't understand that change...") and
      // those are shown as-is -- a nurse who mis-phrased a command needs to
      // know that, not a generic failure. Everything else is a raw
      // provider/network string: FL6 replaces it with the translated
      // generic and keeps the original in the console.
      console.error("Apply task edit error:", err);
      setError(errorText(err, t("errors.applyChanges")));
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 px-4"
      onClick={proposing ? undefined : handleClose}
    >
      <div
        className="relative flex w-full max-w-2xl flex-col rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onPointerDownCapture={session.touch}
        onKeyDownCapture={session.touch}
        onInputCapture={session.touch}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <h2 className="text-2xl font-bold text-gray-900">{t("taskEdit.title")}</h2>
          <button
            onClick={handleClose}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:text-gray-700"
            aria-label={proposing ? t("voiceQueue.closeAria") : t("taskEdit.closeAria")}
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-5 overflow-y-auto px-6 pb-2" style={{ maxHeight: "70vh" }}>
          <VoiceStepHeader step={voiceStep} />
          {proposing && patientLabel && (
            <p className="text-sm font-semibold text-gray-900">{patientLabel}</p>
          )}
          {proposing && session.ready && <VoiceChangeList changes={voiceChanges} />}

          {/* Lock and change-detection state: who else is editing, what
              wasn't saved and why, and the way back. Above the mode toggle so
              it shows in both modes. In proposal mode the changes are waiting
              on Confirm, not interrupted, so there is no "save my changes". */}
          <EditLockBanner
            session={session}
            recordType="task"
            unsavedColumns={blockedFields}
            onKeepMine={handleKeepMine}
            onDiscardMine={session.discardMine}
            onSaveUnsaved={proposing ? undefined : handleSaveUnsaved}
            busy={closing || confirming}
          />

          {/* Mode toggle. A voice step is a proposal to confirm, so it has
              no second command box. */}
          <div className={proposing ? "hidden" : "flex rounded-lg bg-gray-100 p-1"}>
            <button
              type="button"
              onClick={() => setEditMode("manual")}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                editMode === "manual"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t("taskEdit.manualMode")}
            </button>
            <button
              type="button"
              onClick={() => setEditMode("ai")}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                editMode === "ai"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t("taskEdit.aiMode")}
            </button>
          </div>

          {/* Attribution: created / assigned / completed, each named
              explicitly rather than merged into one line. Visible in both
              modes since it isn't something either mode "owns". Completed
              by only appears once the task actually has been -- a Pending
              task showing "Completed by: —" would just be noise. Tasks
              from before 0011 have no completed_by on record even when
              Completed, shown as unknown rather than guessed from
              created_by (decisions.md). */}
          <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span>
                <span className="font-semibold text-gray-500">{t("taskEdit.createdBy")}</span>{" "}
                {nurseName(nurses, task?.created_by) || t("taskEdit.unknownNurse")}
              </span>
              <span>
                <span className="font-semibold text-gray-500">{t("taskEdit.assignedTo")}</span>{" "}
                {nurseName(nurses, task?.assigned_to) || t("tasksView.unassigned")}
              </span>
              {task?.status === "Completed" && (
                <span>
                  <span className="font-semibold text-gray-500">{t("taskEdit.completedBy")}</span>{" "}
                  {nurseName(nurses, task?.completed_by) || t("taskEdit.unknownNurse")}
                </span>
              )}
            </div>
          </div>

          {editMode === "manual" ? (
            <div className="flex flex-col gap-4">
              {/* Description */}
              <div>
                <label className="mb-1 flex items-center text-sm font-medium text-gray-700">
                  {t("taskEdit.description")}
                  <OperationStatus operations={ops.operations} name="description" />
                </label>
                <textarea
                  value={manualFields.description}
                  onChange={(e) => handleDescriptionChange(e.target.value)}
                  disabled={!canEdit}
                  rows={2}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none disabled:bg-gray-50 disabled:text-gray-600"
                />
              </div>

              {/* Status dropdown */}
              <div>
                <label className="mb-1 flex items-center text-sm font-medium text-gray-700">
                  {t("taskEdit.status")}
                  <OperationStatus operations={ops.operations} name="status" />
                </label>
                <select
                  value={manualFields.status}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  disabled={!canEdit}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-600"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{statusLabel(t, opt)}</option>
                  ))}
                </select>
              </div>

              {/* Department dropdown */}
              <div>
                <label className="mb-1 flex items-center text-sm font-medium text-gray-700">
                  {t("taskEdit.department")}
                  <OperationStatus operations={ops.operations} name="department" />
                </label>
                <select
                  value={manualFields.department}
                  onChange={(e) => handleDepartmentChange(e.target.value)}
                  disabled={!canEdit}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-600"
                >
                  {DEPARTMENT_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{departmentLabel(t, opt)}</option>
                  ))}
                </select>
              </div>

              {/* Priority dropdown */}
              <div>
                <label className="mb-1 flex items-center text-sm font-medium text-gray-700">
                  {t("taskEdit.priority")}
                  <OperationStatus operations={ops.operations} name="priority" />
                </label>
                <select
                  value={manualFields.priority}
                  onChange={(e) => handlePriorityChange(e.target.value)}
                  disabled={!canEdit}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-600"
                >
                  {PRIORITY_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{priorityLabel(t, opt)}</option>
                  ))}
                </select>
              </div>

              {/* Deadline */}
              <div>
                <label className="mb-1 flex items-center text-sm font-medium text-gray-700">
                  {t("taskEdit.deadline")}
                  <OperationStatus operations={ops.operations} name="deadline" />
                </label>
                <input
                  type="datetime-local"
                  value={manualFields.deadline}
                  onChange={(e) => handleDeadlineChange(e.target.value)}
                  disabled={!canEdit}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-600"
                />
                <p className="mt-1 text-xs text-gray-400">{t("taskEdit.deadlineHint")}</p>
              </div>

              {/* Assignee, plus the one-click "assign to me" fast path.
                  Created/assigned/completed stay deliberately independent
                  (decisions.md) -- this is a shortcut for the nurse acting
                  on the task right now, not an automatic side effect of
                  editing or completing it. */}
              {onAssign && (
                <div>
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <AssigneeSelect
                        compact
                        value={manualFields.assigned_to || ""}
                        nurses={nurses}
                        onChange={handleAssigneeChange}
                        disabled={!canEdit}
                      />
                    </div>
                    {currentNurseId && manualFields.assigned_to !== currentNurseId && (
                      <button
                        type="button"
                        onClick={handleAssignToMe}
                        disabled={assigningToMe || !canEdit}
                        className="whitespace-nowrap rounded-lg bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 ring-1 ring-blue-200 transition-colors hover:bg-blue-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {assigningToMe ? t("status.assigning") : t("taskEdit.assignToMe")}
                      </button>
                    )}
                  </div>
                  <OperationStatus operations={ops.operations} name="assigned_to" className="mt-1" />
                  {proposing && voiceStep.assigneeHeard && (
                    <p role="note" className="mt-1 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-900 ring-1 ring-amber-200">
                      {t("voiceQueue.assigneeHeard", { name: voiceStep.assigneeHeard })}
                    </p>
                  )}
                </div>
              )}

              {error && (
                <div className="rounded-lg bg-red-50 p-3 text-center text-sm text-red-600">
                  {error}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Current task details - existing read-only block */}
              <div className="rounded-lg bg-gray-100 p-4">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  {t("taskEdit.currentTask")}
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex">
                    <span className="w-24 shrink-0 font-medium text-gray-500">{t("taskEdit.description")}</span>
                    <span className="text-gray-900">{task?.description}</span>
                  </div>
                  <div className="flex items-center">
                    <span className="w-24 shrink-0 font-medium text-gray-500">{t("taskEdit.status")}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badgeClass}`}>
                      {statusLabel(t, task?.status)}
                    </span>
                  </div>
                  <div className="flex">
                    <span className="w-24 shrink-0 font-medium text-gray-500">{t("taskEdit.department")}</span>
                    <span className="text-gray-900">{departmentLabel(t, task?.department)}</span>
                  </div>
                  <div className="flex">
                    <span className="w-24 shrink-0 font-medium text-gray-500">{t("taskEdit.priority")}</span>
                    <span className={`font-semibold ${task?.priority === "Stat" ? "text-red-600" : task?.priority === "Urgent" ? "text-orange-600" : "text-gray-900"}`}>
                      {priorityLabel(t, task?.priority)}
                    </span>
                  </div>
                  {/* The patient, not a room. Real task rows have no `room`
                      column -- that was a demo-era field, so this line read
                      "Room —" for every task. Tasks reference a patient. */}
                  <div className="flex">
                    <span className="w-24 shrink-0 font-medium text-gray-500">{t("taskEdit.patient")}</span>
                    <span className="text-gray-900">{patientLabel || t("tasksView.unknownPatient")}</span>
                  </div>
                  <div className="flex">
                    <span className="w-24 shrink-0 font-medium text-gray-500">{t("taskEdit.deadline")}</span>
                    <span className="text-gray-900">
                      {task?.deadline
                        ? new Date(task.deadline).toLocaleString(localeTag(i18n.language), {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })
                        : t("common.none")}
                    </span>
                  </div>
                </div>
              </div>

              {/* Voice input - keep exactly as currently implemented */}
              <div className="flex flex-col items-center gap-2">
                <button
                  onClick={toggleRecording}
                  className={`flex h-24 w-24 items-center justify-center rounded-full border-none bg-blue-600 text-white shadow-lg ring-4 ring-blue-600/20 transition-all duration-200 hover:bg-blue-700 active:scale-95 ${
                    isRecording ? "animate-pulse" : ""
                  }`}
                  aria-label={isRecording ? t("voiceCapture.stopRecordingAria") : t("voiceCapture.startRecordingAria")}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-10 w-10">
                    <path d="M12 1a4 4 0 0 0-4 4v6a4 4 0 0 0 8 0V5a4 4 0 0 0-4-4Z" />
                    <path d="M19 11a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.93V21H8a1 1 0 1 0 0 2h8a1 1 0 1 0 0-2h-3v-3.07A7 7 0 0 0 19 11Z" />
                  </svg>
                </button>
                <p className="text-sm font-medium text-gray-500">
                  {isRecording ? t("common.listening") : t("taskEdit.tapToSpeak")}
                </p>
                {voiceTranscript && (
                  <p className="mt-1 max-w-full text-center text-sm text-gray-700">
                    {voiceTranscript}
                  </p>
                )}
              </div>

              {/* OR divider - keep exactly as currently implemented */}
              <div className="flex items-center gap-4">
                <div className="h-px flex-1 bg-gray-200" />
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold uppercase text-gray-400">
                  {t("common.or")}
                </span>
                <div className="h-px flex-1 bg-gray-200" />
              </div>

              {/* Text input - keep exactly as currently implemented */}
              <div>
                <input
                  type="text"
                  value={textCommand}
                  onChange={(e) => setTextCommand(e.target.value)}
                  placeholder={t("taskEdit.commandPlaceholder")}
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && finalCommand) handleApply();
                  }}
                />
                <p className="mt-2 text-xs text-gray-400">
                  {t("taskEdit.commandExamples")}
                </p>
              </div>

              {/* Command preview - keep exactly as currently implemented */}
              {finalCommand && (
                <div className="rounded-lg bg-blue-50 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-400">
                    {t("taskEdit.yourCommand")}
                  </p>
                  <p className="mt-1 text-sm text-blue-800">{finalCommand}</p>
                </div>
              )}

              {/* Error - keep exactly as currently implemented */}
              {error && (
                <div className="rounded-lg bg-red-50 p-3 text-center text-sm text-red-600">
                  {error}
                </div>
              )}

              {/* Delete warning - keep exactly as currently implemented */}
              {isDelete && (
                <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3">
                  <svg className="h-5 w-5 shrink-0 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <p className="text-sm font-medium text-red-600">
                    {t("taskEdit.deleteWarning")}
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer buttons. Manual mode has nothing to apply any more --
            every field saves itself -- so it gets one full-width Close,
            not a Cancel it would be misleading to keep next to a
            non-functional Save. AI mode still needs both: the typed/spoken
            command isn't applied until Apply Changes. */}
        {proposing ? (
          <div className="flex gap-3 border-t border-gray-200 px-6 py-4">
            <button
              onClick={() => voiceStep.onSkip(nothingToChange ? "nothing_to_change" : undefined)}
              disabled={confirming}
              className="flex-1 rounded-lg bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-700 hover:text-white active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {nothingToChange ? t("voiceQueue.next") : t("voiceQueue.skip")}
            </button>
            {!nothingToChange && (
              <button
                onClick={handleVoiceConfirm}
                disabled={!canEdit || confirming || unsavedFields.length === 0}
                className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {confirming ? (
                  <OperationStatus operations={ops.operations} name="confirmStep" variant="button" />
                ) : (
                  t("voiceQueue.confirm")
                )}
              </button>
            )}
          </div>
        ) : (
        <div className="flex gap-3 border-t border-gray-200 px-6 py-4">
          <button
            onClick={handleClose}
            disabled={closing}
            className="flex-1 rounded-lg bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-700 hover:text-white active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {closing ? t("common.saving") : editMode === "manual" ? t("common.close") : t("common.cancel")}
          </button>
          {editMode === "ai" && (
            <button
              onClick={handleApply}
              disabled={!finalCommand || isProcessing || !canEdit}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isProcessing ? (
                <OperationStatus operations={ops.operations} name="applyCommand" variant="button" />
              ) : (
                t("taskEdit.applyChanges")
              )}
            </button>
          )}
        </div>
        )}
      </div>
    </div>
  );
}
