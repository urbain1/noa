// The one place that decides whether a patient is "already planned" for
// discharge. Deliberately strict (task_type only, no description/department
// heuristic): PatientCard's badge falls back to guessing from department or
// description text for historical rows, but that fallback over-matches
// (any Social Work task, anything merely mentioning discharge) and using it
// here would block planning for patients who were never actually planned.
export function getActiveDischargeTasks(tasks) {
  return (tasks || []).filter(
    (task) => task.task_type === "discharge" && task.status !== "Cancelled"
  );
}

export function isDischargePlanned(patient) {
  return getActiveDischargeTasks(patient?.tasks).length > 0;
}
