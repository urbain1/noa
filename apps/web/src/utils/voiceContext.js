// What the universal voice command sends to the parser alongside the
// transcript (Edge Function action `parseVoiceCommand`).
//
// Deliberately minimal (decisions.md, 2026-11-16):
//   patients  id, label, location label
//   tasks     id, patient id, description, status, priority, department,
//             assignee display name. Open tasks, plus tasks completed in the
//             last 24 hours (at most 20) so "reopen" can name its task.
//             Cancelled tasks are never sent.
//   nurses    display names only. Never an email.
//
// No note content, no diagnosis, no age, no allergies, nothing else. The ids
// never reach the model: the Edge Function shows tasks under short aliases
// and maps them back (voiceCommand.mjs capContext).

export const RECENTLY_COMPLETED_MS = 24 * 60 * 60 * 1000;
export const MAX_COMPLETED_TASKS = 20;

/**
 * @param {Array<object>} patients - the facility roster as App holds it (RLS-scoped)
 * @param {Array<{id, name}>} nurses - colleagues at the same facility
 * @param {number} [now]
 */
export function buildVoiceContext(patients, nurses, now = Date.now()) {
  const nameById = new Map();
  for (const nurse of nurses || []) {
    if (nurse?.id && nurse.name) nameById.set(nurse.id, nurse.name);
  }

  const contextPatients = [];
  const open = [];
  const completed = [];

  for (const patient of patients || []) {
    if (!patient?.id || typeof patient.label !== "string") continue;
    contextPatients.push({ id: patient.id, label: patient.label, location: patient.location_label || null });

    for (const task of patient.tasks || []) {
      if (!task?.id || task.status === "Cancelled") continue;
      const entry = {
        id: task.id,
        patient_id: patient.id,
        description: task.description,
        status: task.status,
        priority: task.priority,
        department: task.department,
        assignee: nameById.get(task.assigned_to) || null,
      };
      if (task.status === "Completed") {
        const at = Date.parse(task.completed_at || "");
        if (Number.isFinite(at) && now - at <= RECENTLY_COMPLETED_MS) completed.push({ entry, at });
      } else {
        open.push(entry);
      }
    }
  }

  completed.sort((a, b) => b.at - a.at);

  return {
    patients: contextPatients,
    tasks: [...open, ...completed.slice(0, MAX_COMPLETED_TASKS).map((c) => c.entry)],
    nurses: [...nameById.values()],
  };
}
