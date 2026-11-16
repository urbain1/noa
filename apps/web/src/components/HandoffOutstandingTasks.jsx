import { useTranslation } from "react-i18next";
import { departmentLabel, priorityLabel, statusLabel } from "../i18n/enums";
import { isTaskOverdue } from "../utils/taskOverdue";
import { getDeadlineDisplay } from "../utils/taskDeadline";
import { outstandingGroups } from "../utils/outstandingTasks";

// The structured half of the handover report (scenarios.md SC-8): what is
// still outstanding, listed rather than narrated, so a nurse taking over can
// see it at a glance instead of reading for it.
//
// This sits beside the AI narrative and does not touch it. The narrative is
// generated text and is edited/copied as one block; this is read straight
// off the task rows the app already holds, using the same
// `isTaskOverdue` / `sortTasks` definitions Unit View's overdue count and the
// Tasks screen's ordering use. Nothing here re-implements "overdue" -- if
// that definition changes, this list changes with it.
//
// "Outstanding" means the task still has work left: not Completed, not
// Cancelled. Confirmed stays on the list -- the department has acknowledged
// it, but nobody has done it yet, and a handover that dropped acknowledged
// work would be hiding exactly the tasks most likely to be assumed handled.
// The grouping itself lives in utils/outstandingTasks.js, shared with the
// plain-text rendering appended to Copy/Send, so the two can't disagree.

function TaskRow({ task }) {
  const { t } = useTranslation();
  const overdue = isTaskOverdue(task);
  const deadline = getDeadlineDisplay(t, task.deadline);
  const isStat = task.priority === "Stat" || task.priority === "Urgent";
  const isDelayed = task.status === "Delayed";

  return (
    <li
      className={`flex gap-2 rounded-md px-2 py-1.5 ${
        overdue ? "bg-red-50" : isStat ? "bg-orange-50" : ""
      }`}
    >
      <span
        aria-hidden="true"
        className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
          overdue ? "bg-red-500" : isStat ? "bg-orange-500" : "bg-gray-400"
        }`}
      />
      <div className="min-w-0 flex-1">
        <p className={`text-sm ${overdue ? "font-semibold text-red-800" : "text-gray-800"}`}>
          {task.description}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {overdue && (
            <span className="rounded-full bg-red-600 px-2 py-0.5 font-bold uppercase tracking-wide text-white">
              {t("handoff.outstanding.badgeOverdue")}
            </span>
          )}
          {isStat && (
            <span className="rounded-full bg-orange-600 px-2 py-0.5 font-bold uppercase tracking-wide text-white">
              {priorityLabel(t, task.priority)}
            </span>
          )}
          {isDelayed && (
            <span className="rounded-full bg-yellow-100 px-2 py-0.5 font-semibold text-yellow-800">
              {statusLabel(t, task.status)}
            </span>
          )}
          <span className="text-gray-500">{departmentLabel(t, task.department)}</span>
          {deadline ? (
            <span className={`font-medium ${deadline.colorClass}`}>{deadline.text}</span>
          ) : (
            <span className="text-gray-400">{t("handoff.outstanding.noDeadline")}</span>
          )}
          {!overdue && !isStat && (
            <span className="text-gray-500">{statusLabel(t, task.status)}</span>
          )}
        </div>
      </div>
    </li>
  );
}

export default function HandoffOutstandingTasks({ patients = [] }) {
  const { t } = useTranslation();

  // Deliberately not memoised on `patients`: overdue-ness is a function of
  // the clock as much as of the data, so it is recomputed on every render
  // rather than frozen until a patient row happens to change.
  const groups = outstandingGroups(patients);

  const totalOutstanding = groups.reduce((n, g) => n + g.tasks.length, 0);
  const totalOverdue = groups.reduce(
    (n, g) => n + g.tasks.filter(isTaskOverdue).length,
    0,
  );

  return (
    <section
      className="mb-5 overflow-hidden rounded-lg border border-gray-300 bg-white"
      aria-label={t("handoff.outstanding.title")}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2.5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-gray-700">
          {t("handoff.outstanding.title")}
        </h2>
        <div className="flex items-center gap-2 text-xs">
          {totalOverdue > 0 && (
            <span className="rounded-full bg-red-600 px-2 py-0.5 font-bold text-white">
              {t("handoff.outstanding.overdueCount", { count: totalOverdue })}
            </span>
          )}
          <span className="font-semibold text-gray-600">
            {t("handoff.outstanding.outstandingCount", { count: totalOutstanding })}
          </span>
        </div>
      </div>

      {totalOutstanding === 0 ? (
        <p className="px-4 py-3 text-sm text-gray-500">
          {t("handoff.outstanding.none")}
        </p>
      ) : (
        <div className="divide-y divide-gray-100">
          {groups.map(({ patient, tasks }) => (
            <div key={patient.id} className="px-3 py-2.5">
              <p className="px-1 text-xs font-semibold text-gray-500">
                {patient.label}
                {patient.location_label ? ` · ${patient.location_label}` : ""}
              </p>
              <ul className="mt-1 flex flex-col gap-1">
                {tasks.map((task) => (
                  <TaskRow key={task.id} task={task} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <p className="border-t border-gray-100 bg-gray-50 px-4 py-2 text-xs text-gray-400">
        {t("handoff.outstanding.caption")}
      </p>
    </section>
  );
}
