import { useState } from "react";
import { useTranslation } from "react-i18next";
import { departmentLabel, priorityLabel } from "../i18n/enums";
import AssigneeSelect from "./AssigneeSelect";
import OperationStatus from "./OperationStatus";
import { useOperationStatus } from "../hooks/useOperationStatus";
import { errorText } from "../utils/errors";
import { fromLocalDatetimeValue, toLocalDatetimeValue } from "../utils/datetimeLocal";
import VoiceStepHeader from "./VoiceStepHeader";

// Canonical values, stored and matched as-is. Only the <option> label is
// translated, never the value.
const DEPARTMENT_OPTIONS = ["Radiology", "Lab", "Pharmacy", "Nursing", "Physical Therapy", "Social Work", "Transport", "Other"];
const PRIORITY_OPTIONS = ["Stat", "Routine"];

// A new task, reviewed before it exists.
//
// Until the universal voice command there was no form for creating a task:
// the single-task capture writes it straight after parsing. A step of a
// voice command must be confirmed first, so this is that form, with the same
// fields as the manual side of TaskEditDialog. Nothing is written until the
// nurse confirms; a new task has no row yet, so there is nothing to lock.
//
// `initial`: { description, department, priority, deadline (ISO or null),
//   assigneeId, assigneeHeard }. `assigneeHeard` is a spoken name that did
//   not match exactly one colleague: it is shown, never applied.
// `onSave(fields)` receives { description, department, priority, deadline,
//   assignedTo } and creates the task; it throws on failure.
// `voiceStep` makes it one step of a voice command (VoiceQueue).
export default function AddTaskDialog({ patientLabel, initial, nurses = [], currentNurseId, onCancel, onSave, voiceStep }) {
  const { t } = useTranslation();
  const [description, setDescription] = useState(initial?.description || "");
  const [department, setDepartment] = useState(initial?.department || "Other");
  const [priority, setPriority] = useState(initial?.priority || "Routine");
  const [deadline, setDeadline] = useState(() => toLocalDatetimeValue(initial?.deadline));
  const [assigneeId, setAssigneeId] = useState(initial?.assigneeId || null);
  const [error, setError] = useState(null);
  const ops = useOperationStatus();
  const saving = ops.isRunning("createTask");

  const handleSave = async () => {
    const trimmed = description.trim();
    if (!trimmed) {
      setError(t("errors.descriptionRequired"));
      return;
    }
    setError(null);
    try {
      await ops.run(
        "createTask",
        { messageKey: "status.creatingTask", errorKey: "status.failed", surface: "button" },
        () =>
          onSave({
            description: trimmed,
            department,
            priority,
            deadline: fromLocalDatetimeValue(deadline),
            assignedTo: assigneeId || null,
          }),
      );
    } catch (err) {
      // FL6: the nurse gets the translated message, the console gets the
      // provider's own text.
      console.error("Create task error:", err);
      setError(errorText(err, t("errors.createTaskDialog")));
      voiceStep?.onError?.(err);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 px-4"
      onClick={saving || voiceStep ? undefined : onCancel}
    >
      <div
        className="relative flex w-full max-w-lg flex-col rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{t("taskDialog.addTitle")}</h2>
            <p className="text-sm text-gray-500">{patientLabel || t("tasksView.unknownPatient")}</p>
          </div>
          <button
            onClick={voiceStep ? voiceStep.onClose : onCancel}
            disabled={saving}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:text-gray-700 disabled:opacity-40"
            aria-label={voiceStep ? t("voiceQueue.closeAria") : t("taskEdit.closeAria")}
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-4 overflow-y-auto px-6 pb-2" style={{ maxHeight: "70vh" }}>
          <VoiceStepHeader step={voiceStep} />

          <div>
            <label htmlFor="add-task-description" className="mb-1 block text-sm font-medium text-gray-700">
              {t("taskEdit.description")}
            </label>
            <textarea
              id="add-task-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="add-task-department" className="mb-1 block text-sm font-medium text-gray-700">
              {t("taskEdit.department")}
            </label>
            <select
              id="add-task-department"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {DEPARTMENT_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{departmentLabel(t, opt)}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="add-task-priority" className="mb-1 block text-sm font-medium text-gray-700">
              {t("taskEdit.priority")}
            </label>
            <select
              id="add-task-priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {PRIORITY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{priorityLabel(t, opt)}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="add-task-deadline" className="mb-1 block text-sm font-medium text-gray-700">
              {t("taskEdit.deadline")}
            </label>
            <input
              id="add-task-deadline"
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-400">{t("taskEdit.deadlineHint")}</p>
          </div>

          <div>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <AssigneeSelect compact value={assigneeId || ""} nurses={nurses} onChange={(id) => setAssigneeId(id || null)} disabled={saving} />
              </div>
              {currentNurseId && assigneeId !== currentNurseId && (
                <button
                  type="button"
                  onClick={() => setAssigneeId(currentNurseId)}
                  disabled={saving}
                  className="whitespace-nowrap rounded-lg bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 ring-1 ring-blue-200 transition-colors hover:bg-blue-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {t("taskEdit.assignToMe")}
                </button>
              )}
            </div>
            {initial?.assigneeHeard && (
              <p role="note" className="mt-1 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-900 ring-1 ring-amber-200">
                {t("voiceQueue.assigneeHeard", { name: initial.assigneeHeard })}
              </p>
            )}
          </div>

          {error && (
            <div role="alert" className="rounded-lg bg-red-50 p-3 text-center text-sm text-red-600">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 border-t border-gray-200 px-6 py-4">
          <button
            onClick={voiceStep ? () => voiceStep.onSkip() : onCancel}
            disabled={saving}
            className="flex-1 rounded-lg bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-700 hover:text-white active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {voiceStep ? t("voiceQueue.skip") : t("common.cancel")}
          </button>
          <button
            onClick={handleSave}
            disabled={!description.trim() || saving}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? (
              <OperationStatus operations={ops.operations} name="createTask" variant="button" />
            ) : voiceStep ? (
              t("voiceQueue.confirm")
            ) : (
              t("taskDialog.addButton")
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
