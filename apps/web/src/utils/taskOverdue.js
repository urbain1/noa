// Single source of truth for "is this task overdue" so Unit View's count,
// the attention list, and per-task card actions can't drift out of sync.
export function isTaskOverdue(task) {
  return Boolean(
    task.deadline &&
    new Date(task.deadline).getTime() < Date.now() &&
    task.status !== "Completed" &&
    task.status !== "Confirmed" &&
    task.status !== "Cancelled"
  );
}

// Anything that should surface in the three-dot menu's attention list:
// overdue tasks, plus Stat-priority tasks that haven't been confirmed or
// completed yet -- those are urgent by definition and shouldn't wait for
// a deadline to pass before a nurse sees them. Cancelled tasks are excluded
// even if Stat/overdue -- a cancelled task has no outstanding work left to
// flag, so surfacing it here would just be noise.
export function needsAttention(task) {
  return Boolean(
    isTaskOverdue(task) ||
    (task.priority === "Stat" && task.status !== "Completed" && task.status !== "Confirmed" && task.status !== "Cancelled")
  );
}
