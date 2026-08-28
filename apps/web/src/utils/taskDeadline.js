// Deadline wording, shared rather than re-derived. Lifted out of TaskCard
// unchanged when the handover report needed the same "Overdue by 3h 20m" /
// "Due in 45m" line, on the same reasoning taskOverdue.js already carries:
// two places computing the same figure are two places that can disagree
// about it, and a nurse reading one screen against another has no way to
// tell which is right.
//
// Overdue-ness itself is not decided here -- that is `isTaskOverdue`. This
// only phrases a deadline relative to now.

// Builds "3h 20m" / "3 h 20 min" from a minute count, using whichever unit
// suffixes the active locale defines.
export function formatDuration(t, totalMinutes) {
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

// `{ text, colorClass }` for a deadline, or null when the task has none.
// Red once the deadline has passed, orange inside the last two hours,
// green beyond that.
export function getDeadlineDisplay(t, deadline) {
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
