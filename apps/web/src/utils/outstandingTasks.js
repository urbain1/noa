import { isTaskOverdue } from "./taskOverdue";
import { getDeadlineDisplay } from "./taskDeadline";
import { sortTasks } from "./taskSort";
import { departmentLabel, priorityLabel, statusLabel } from "../i18n/enums";

// "Outstanding" means the task still has work left: not Completed, not
// Cancelled. Confirmed stays on the list -- the department has acknowledged
// it, but nobody has done it yet. Shared by the on-screen panel
// (HandoffOutstandingTasks) and the plain-text rendering below so the two
// can't drift out of sync with each other.
export function isOutstanding(task) {
  return task.status !== "Completed" && task.status !== "Cancelled";
}

// One flat, sorted list per patient -- same ordering as the rest of the app
// (urgent, then overdue, then the rest, earliest deadline first).
export function outstandingFor(patient) {
  return sortTasks((patient.tasks || []).filter(isOutstanding));
}

export function outstandingGroups(patients) {
  return (patients || [])
    .map((patient) => ({ patient, tasks: outstandingFor(patient) }))
    .filter((group) => group.tasks.length > 0);
}

// Plain-text rendering of the same list the panel shows -- patient, task,
// department, deadline/overdue status -- for Copy and Send, which only
// carry plain text. Not a re-derivation: same groups, same order, same
// fields as the panel, read off the same task rows.
export function renderOutstandingText(t, patients) {
  const groups = outstandingGroups(patients);
  const lines = [t("handoff.outstanding.title").toUpperCase()];

  if (groups.length === 0) {
    lines.push(t("handoff.outstanding.none"));
    return lines.join("\n");
  }

  for (const { patient, tasks } of groups) {
    lines.push(
      patient.location_label ? `${patient.label} · ${patient.location_label}` : patient.label,
    );
    for (const task of tasks) {
      const overdue = isTaskOverdue(task);
      const isStat = task.priority === "Stat" || task.priority === "Urgent";
      const deadline = getDeadlineDisplay(t, task.deadline);
      const deadlineText = deadline ? deadline.text : t("handoff.outstanding.noDeadline");

      const tags = [];
      if (overdue) tags.push(t("handoff.outstanding.badgeOverdue"));
      if (isStat) tags.push(priorityLabel(t, task.priority));
      const tagText = tags.length ? ` [${tags.join("] [")}]` : "";
      const statusText = !overdue ? ` · ${statusLabel(t, task.status)}` : "";

      lines.push(
        `  - ${task.description}${tagText} — ${departmentLabel(t, task.department)} · ${deadlineText}${statusText}`,
      );
    }
  }

  return lines.join("\n");
}
