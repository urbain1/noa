// Turning what the parser reported into records, on the client, with what
// the app already has loaded. Nothing here guesses: every function returns
// either one certain record or nothing, and "nothing" opens a picker.
//
// Patients go through the EXISTING matcher (utils/roomMatcher.js), which is
// not changed. What is decided here is only what the queue does with its
// answer, and that is stricter than the old single-task capture: only an
// `exact` match pre-selects. A sole partial match is a suggestion in the
// picker, never a selection. With Patient_Test_N labels every patient shares
// the words "patient" and "test", so in a facility with one patient a spoken
// "patient 7" comes back as a sole partial match on Patient_Test_1.

import { findMatchingPatients } from "./roomMatcher";

function normaliseName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Resolve the patient an action refers to.
 *
 * @param {{ patient?: { spoken?: string|null, label?: string|null } }} action
 * @param {Array<object>} patients
 * @returns {{ patientId: string|null, candidateIds: string[] }}
 *   `candidateIds` are suggestions to list first in the picker; never used
 *   to select.
 */
export function resolvePatient(action, patients) {
  const roster = (patients || []).filter((p) => p && typeof p.label === "string");
  const label = action?.patient?.label || null;
  const spoken = action?.patient?.spoken || null;
  const none = { patientId: null, candidateIds: [] };

  if (label) {
    // Two records carrying the same label cannot be told apart by voice.
    const sameLabel = roster.filter((p) => p.label === label);
    if (sameLabel.length > 1) return { patientId: null, candidateIds: sameLabel.map((p) => p.id) };

    const match = findMatchingPatients(label, roster);
    if (match.matchType === "exact" && match.exactMatch.label === label) {
      return { patientId: match.exactMatch.id, candidateIds: [] };
    }
    // A label that matches nobody: every patient "partially" matches on the
    // shared words, which says nothing. No suggestions.
    return none;
  }

  if (spoken) {
    const match = findMatchingPatients(spoken, roster);
    if (match.matchType === "exact") {
      const twins = roster.filter((p) => p.label === match.exactMatch.label);
      if (twins.length === 1) return { patientId: match.exactMatch.id, candidateIds: [] };
      return { patientId: null, candidateIds: twins.map((p) => p.id) };
    }
    if (match.matchType === "partial" && match.partialMatches.length < roster.length) {
      return { patientId: null, candidateIds: match.partialMatches.map((p) => p.id) };
    }
  }

  return none;
}

/**
 * The task an edit refers to, only if the id the server validated really is
 * a task of the resolved patient at this facility. Otherwise null, and the
 * nurse picks.
 */
export function resolveTask(action, patient, facilityId) {
  if (!action?.task_id || !patient || !facilityId) return null;
  if (patient.facility_id !== facilityId) return null;
  const task = (patient.tasks || []).find((t) => t.id === action.task_id);
  if (!task) return null;
  if (task.patient_id !== patient.id || task.facility_id !== facilityId) return null;
  return task;
}

/**
 * Match a spoken nurse name against the facility's nurses. A unique match
 * only: the full name, or name parts that exactly one nurse has. No fuzzy
 * matching, a near miss opens the assignee picker.
 *
 * @returns {{ nurseId: string|null, matches: number }}
 */
export function matchNurse(spoken, nurses) {
  const wanted = normaliseName(spoken);
  if (!wanted) return { nurseId: null, matches: 0 };
  const list = (nurses || []).filter((n) => n?.id && n.name);

  const full = list.filter((n) => normaliseName(n.name) === wanted);
  if (full.length === 1) return { nurseId: full[0].id, matches: 1 };
  if (full.length > 1) return { nurseId: null, matches: full.length };

  const wantedParts = wanted.split(" ");
  const partial = list.filter((n) => {
    const parts = normaliseName(n.name).split(" ");
    return wantedParts.every((w) => parts.includes(w));
  });
  return partial.length === 1 ? { nurseId: partial[0].id, matches: 1 } : { nurseId: null, matches: partial.length };
}

/**
 * For each action, the index of an earlier `create_patient` in the same
 * utterance that it depends on, or null. An action depends on a creation
 * when it names that creation's label and no existing patient resolved.
 *
 * @param {Array<object>} actions
 * @param {Array<{ patientId: string|null }>} resolutions - same order
 * @returns {Array<number|null>}
 */
export function findDependencies(actions, resolutions) {
  return actions.map((action, i) => {
    if (action.type === "create_patient") return null;
    if (resolutions[i]?.patientId) return null;
    const label = action.patient?.label;
    if (!label) return null;
    for (let k = 0; k < i; k++) {
      if (actions[k].type === "create_patient" && actions[k].patient?.label === label) return k;
    }
    return null;
  });
}
