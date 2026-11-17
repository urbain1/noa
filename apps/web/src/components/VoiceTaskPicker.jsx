import { useTranslation } from "react-i18next";
import { departmentLabel, priorityLabel, statusLabel } from "../i18n/enums";
import { sortTasks } from "../utils/taskSort";
import VoiceStepHeader from "./VoiceStepHeader";

const statusStyles = {
  Pending: "bg-yellow-100 text-yellow-800",
  Confirmed: "bg-green-100 text-green-800",
  Delayed: "bg-red-100 text-red-800",
  Completed: "bg-blue-100 text-blue-800",
};

// The task picker inside a voice step, shown whenever the task a command
// refers to is not exactly one task of the resolved patient: the parser
// named none, named one that is not this patient's, or several could match.
// Never a guess: the nurse taps the task. Lists every task of this one
// patient except cancelled ones, in the same order as the patient card.
export default function VoiceTaskPicker({ step, patient, heard, onPick, onSkip }) {
  const { t } = useTranslation();
  const tasks = sortTasks((patient.tasks || []).filter((task) => task.status !== "Cancelled"));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="voice-task-picker-title" className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <VoiceStepHeader step={step} showClose />
        <h2 id="voice-task-picker-title" className="mt-4 text-xl font-bold text-gray-900">
          {t("voiceQueue.chooseTaskTitle")}
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          {tasks.length === 0
            ? t("voiceQueue.chooseTaskNone", { patient: patient.label })
            : heard
              ? t("voiceQueue.chooseTaskHeard", { words: heard, patient: patient.label })
              : t("voiceQueue.chooseTaskNoHint", { patient: patient.label })}
        </p>

        <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
          {tasks.map((task) => (
            <button
              key={task.id}
              type="button"
              onClick={() => onPick(task)}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 p-3 text-left transition-colors hover:border-blue-300 hover:bg-blue-50"
            >
              <span className="block text-sm font-medium text-gray-900">{task.description}</span>
              <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                <span className={`rounded-full px-2 py-0.5 font-semibold ${statusStyles[task.status] || "bg-gray-100 text-gray-800"}`}>
                  {statusLabel(t, task.status)}
                </span>
                <span className={task.priority === "Stat" ? "font-semibold text-red-600" : ""}>{priorityLabel(t, task.priority)}</span>
                <span>{departmentLabel(t, task.department)}</span>
              </span>
            </button>
          ))}
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
