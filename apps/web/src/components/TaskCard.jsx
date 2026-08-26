import { useTranslation } from "react-i18next";
import { departmentLabel, priorityLabel, statusLabel } from "../i18n/enums";
import { isTaskOverdue } from "../utils/taskOverdue";
import { formatActionTimestamp } from "../utils/actionTimestamp";

const statusStyles = {
  Pending: "bg-yellow-100 text-yellow-800",
  Confirmed: "bg-green-100 text-green-800",
  Delayed: "bg-red-100 text-red-800",
  Completed: "bg-blue-100 text-blue-800",
};

function getTimeElapsed(t, timestamp) {
  const diff = Math.floor((Date.now() - new Date(timestamp).getTime()) / 60000);
  if (diff < 1) return t("taskCard.justNow");
  return t("taskCard.minAgo", { count: diff });
}

// Builds "3h 20m" / "3 h 20 min" from a minute count, using whichever unit
// suffixes the active locale defines.
function formatDuration(t, totalMinutes) {
  if (totalMinutes < 60) {
    return t("taskCard.unitMinutes", { count: totalMinutes });
  }
  if (totalMinutes < 1440) {
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return mins > 0
      ? `${t("taskCard.unitHours", { count: hours })} ${t("taskCard.unitMinutes", { count: mins })}`
      : t("taskCard.unitHours", { count: hours });
  }
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  return hours > 0
    ? `${t("taskCard.unitDays", { count: days })} ${t("taskCard.unitHours", { count: hours })}`
    : t("taskCard.unitDays", { count: days });
}

function getDeadlineDisplay(t, deadline) {
  if (!deadline) return null;

  const now = Date.now();
  const deadlineTime = new Date(deadline).getTime();
  const diffMs = deadlineTime - now;
  const diffMin = Math.round(diffMs / 60000);
  const absDiffMin = Math.abs(diffMin);

  let text;
  let colorClass;

  if (diffMin < 0) {
    // Overdue
    text = t("taskCard.overdueBy", { value: formatDuration(t, absDiffMin) });
    colorClass = "text-red-600";
  } else if (diffMin <= 120) {
    // Approaching (2 hours or less)
    text = t("taskCard.dueIn", { value: formatDuration(t, absDiffMin) });
    colorClass = "text-orange-600";
  } else {
    // Plenty of time (more than 2 hours)
    text = t("taskCard.dueIn", { value: formatDuration(t, absDiffMin) });
    colorClass = "text-green-600";
  }

  return { text, colorClass };
}

export default function TaskCard({ task, isNew, onComplete, onEdit, onRepage, onEscalate }) {
  const { t, i18n } = useTranslation();
  const badgeClass = statusStyles[task.status] || "bg-gray-100 text-gray-800";
  const deadlineInfo = getDeadlineDisplay(t, task.deadline);
  const isCompleted = task.status === "Completed";
  const overdue = isTaskOverdue(task);
  const repagedText = formatActionTimestamp(t, i18n.language, task.last_repaged_at, "repaged");
  const escalatedText = formatActionTimestamp(t, i18n.language, task.escalated_at, "escalated");

  return (
    <div className={`rounded-lg border p-3 shadow-sm transition-shadow duration-200 hover:shadow-md ${isNew ? 'bg-blue-50 border-blue-200' : 'border-gray-200 bg-white'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-gray-900 leading-snug">{task.description}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <span>{departmentLabel(t, task.department)}</span>
            <span className="text-gray-300">|</span>
            <span>{getTimeElapsed(t, task.created_at)}</span>
            <span className="text-gray-300">|</span>
            <span
              className={`font-semibold ${task.priority === "Stat" ? "text-red-600" : task.priority === "Urgent" ? "text-orange-600" : "text-gray-500"}`}
            >
              {priorityLabel(t, task.priority)}
            </span>
          </div>
          {deadlineInfo && (
            <div className={`mt-1 flex items-center gap-1 text-xs font-medium ${deadlineInfo.colorClass}`}>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
              </svg>
              {deadlineInfo.text}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors duration-300 ${badgeClass}`}
          >
            {statusLabel(t, task.status)}
          </span>
          <button
            onClick={() => onEdit?.(task)}
            className="rounded-md bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-200 transition-colors"
          >
            {t("taskCard.edit")}
          </button>
          {!isCompleted && (
            <button
              onClick={() => onComplete?.(task)}
              className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-100 transition-colors"
            >
              {t("taskCard.complete")}
            </button>
          )}
          {overdue && (
            <button
              onClick={() => onRepage?.(task)}
              title={repagedText || undefined}
              className="rounded-md bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700 hover:bg-orange-100 transition-colors"
            >
              {t("taskCard.repage")}
            </button>
          )}
          {overdue && (
            <button
              onClick={() => onEscalate?.(task)}
              title={escalatedText || undefined}
              className="rounded-md bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 transition-colors"
            >
              {t("taskCard.escalate")}
            </button>
          )}
        </div>
      </div>
      {overdue && (repagedText || escalatedText) && (
        <div className="mt-1 flex flex-wrap gap-x-2 text-[11px] text-gray-400">
          {repagedText && <span>{repagedText}</span>}
          {escalatedText && <span>{escalatedText}</span>}
        </div>
      )}
    </div>
  );
}
