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

  // Layout is one wrapping column, not a two-column row.
  //
  // The previous version put the description in a `flex-1` column beside a
  // `shrink-0` stack of up to four buttons plus the status badge. On a phone
  // that column could not give up any width, so the description was squeezed
  // into a strip that wrapped one word per line while the action labels ran
  // off the right edge of the screen. Nothing shrinks or scales here
  // instead: every row wraps, the description gets the full card width, and
  // the reading order is status and the primary action first, then the
  // task's categories and its secondary actions, then the description, then
  // the timing metadata underneath.
  return (
    <div className={`rounded-lg border p-3 shadow-sm transition-shadow duration-200 hover:shadow-md ${isNew ? 'bg-blue-50 border-blue-200' : 'border-gray-200 bg-white'}`}>
      {/* Status + primary action. `justify-between` puts them at opposite
          ends when there is room and lets them stack when there isn't. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors duration-300 ${badgeClass}`}
        >
          {statusLabel(t, task.status)}
        </span>
        {!isCompleted && (
          <button
            onClick={() => onComplete?.(task)}
            className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-600 transition-colors hover:bg-blue-600 hover:text-white"
          >
            {t("taskCard.complete")}
          </button>
        )}
      </div>

      {/* Category labels and secondary actions. Same row while it fits,
          separate rows when it doesn't -- the labels stay left, the buttons
          stay together. */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
          <span className="break-words">{departmentLabel(t, task.department)}</span>
          <span aria-hidden="true" className="text-gray-300">|</span>
          <span
            className={`font-semibold ${task.priority === "Stat" ? "text-red-600" : task.priority === "Urgent" ? "text-orange-600" : "text-gray-500"}`}
          >
            {priorityLabel(t, task.priority)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => onEdit?.(task)}
            className="rounded-md bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-700 hover:text-white"
          >
            {t("taskCard.edit")}
          </button>
          {overdue && (
            <button
              onClick={() => onRepage?.(task)}
              title={repagedText || undefined}
              className="rounded-md bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700 transition-colors hover:bg-orange-600 hover:text-white"
            >
              {t("taskCard.repage")}
            </button>
          )}
          {overdue && (
            <button
              onClick={() => onEscalate?.(task)}
              title={escalatedText || undefined}
              className="rounded-md bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 transition-colors hover:bg-red-600 hover:text-white"
            >
              {t("taskCard.escalate")}
            </button>
          )}
        </div>
      </div>

      {/* The description, at full card width. `break-words` covers a long
          unbroken token (a drug name, a pasted identifier) that would
          otherwise widen the card past the viewport. */}
      <p className="mt-2 break-words font-medium leading-snug text-gray-900">{task.description}</p>

      {/* Metadata last: when it was raised, when it is due, and what has
          been done about it. */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
        <span>{getTimeElapsed(t, task.created_at)}</span>
        {deadlineInfo && (
          <span className={`flex items-center gap-1 font-medium ${deadlineInfo.colorClass}`}>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
            </svg>
            {deadlineInfo.text}
          </span>
        )}
      </div>
      {overdue && (repagedText || escalatedText) && (
        <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-gray-400">
          {repagedText && <span>{repagedText}</span>}
          {escalatedText && <span>{escalatedText}</span>}
        </div>
      )}
    </div>
  );
}
