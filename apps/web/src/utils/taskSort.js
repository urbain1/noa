import { isTaskOverdue } from "./taskOverdue";

// Single shared ordering for every cross-patient and per-patient task list,
// so the Tasks screen and a patient card can't drift into disagreeing about
// what is most urgent (scenarios.md SC-7).
//
// Three groups, in this order:
//   0. Urgent    -- Stat (or Urgent) priority with work still outstanding
//   1. Overdue   -- deadline already passed, or the department flagged it Delayed
//   2. Everything else
//
// Overdue-ness is `isTaskOverdue` from taskOverdue.js, the same definition
// Unit View's overdue count and the attention list use. It is deliberately
// not re-implemented here.
//
// A task that is both Stat and overdue lands in group 0 only. It is one task
// and appears once, in the higher group. (Unit View's Attention Needed
// *counts* it under both figures -- that is a count of two different
// questions, not a list of two rows. See ChargeNurseDashboard.)
export const SORT_GROUP_URGENT = 0;
export const SORT_GROUP_OVERDUE = 1;
export const SORT_GROUP_OTHER = 2;

// A task with no work left doesn't get urgency ranking. Without this, a
// completed Stat task would sit permanently at the top of every list,
// which is the opposite of what a nurse mid-shift needs. Matches the
// exclusions `needsAttention` already applies.
function isActionable(task) {
  return task.status !== "Completed" && task.status !== "Cancelled";
}

export function taskSortGroup(task) {
  if (isActionable(task) && (task.priority === "Stat" || task.priority === "Urgent")) {
    return SORT_GROUP_URGENT;
  }
  if (isTaskOverdue(task) || (isActionable(task) && task.status === "Delayed")) {
    return SORT_GROUP_OVERDUE;
  }
  return SORT_GROUP_OTHER;
}

// Earliest deadline first within a group. Tasks with no deadline sort after
// every task that has one -- an undated task isn't more urgent than one due
// in ten minutes, and putting nulls first would say it is.
function deadlineRank(task) {
  if (!task.deadline) return Number.POSITIVE_INFINITY;
  const time = new Date(task.deadline).getTime();
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}

// Returns a new array; never sorts the caller's array in place, since these
// are React state values.
//
// Array.prototype.sort is stable, so tasks that tie on group and deadline
// keep whatever order they arrived in -- newest-first from fetchPatients.
export function sortTasks(tasks) {
  return [...(tasks || [])].sort((a, b) => {
    const groupDiff = taskSortGroup(a) - taskSortGroup(b);
    if (groupDiff !== 0) return groupDiff;
    return deadlineRank(a) - deadlineRank(b);
  });
}
