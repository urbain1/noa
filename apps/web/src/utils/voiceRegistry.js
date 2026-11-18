// The client half of the voice action registry. The server half
// (supabase/functions/claude-proxy/voiceCommand.mjs ACTION_REGISTRY) says
// what an action may carry; this says what the app does with it: which
// existing dialog it opens, what it needs resolved first, and whether it can
// be undone.
//
// Adding an action type (a real discharge outcome, temporary leave) is one
// entry here, one on the server, and its step in VoiceQueue.jsx. The queue
// itself (utils/voiceQueue.js) does not change.

import { findDependencies, matchNurse, resolvePatient, resolveTask } from "./voiceResolve";
import { toLocalDatetimeValue } from "./datetimeLocal";

// Mirrors of the server's lists. The client cannot import the Edge Function
// module (it sits outside the web app's build root), so a unit test asserts
// these stay identical to it (voiceRegistry.test.js).
export const VOICE_PRIORITIES = ["Routine", "Stat"];
export const VOICE_TASK_STATUSES = ["Pending", "Confirmed", "Delayed", "Completed"];
export const VOICE_DEPARTMENTS = ["Radiology", "Lab", "Pharmacy", "Nursing", "Physical Therapy", "Social Work", "Transport", "Other"];
export const VOICE_CODE_STATUSES = ["Full Code", "DNR", "DNR/DNI", "Comfort Care"];
export const VOICE_UNSUPPORTED_REASONS = ["delete", "patient_label_fixed", "discharge_outcome", "other"];
export const VOICE_MAX_ACTIONS = 5;
export const VOICE_TRANSCRIPT_MAX = 1000;
const PATIENT_LABEL_RE = /^Patient_Test_\d{1,6}$/;

/**
 * patient: "new"   creates a patient, nothing to resolve
 *          "ref"   needs an existing patient resolved (or picked) first
 *          "scope" needs one only when fields.scope === "patient"
 *          "none"
 * task:    needs an existing task resolved (or picked) first
 * note:    needs an existing note picked first. Always a picker: note
 *          content never goes to the parser, so it cannot name one
 * step:    which step VoiceQueue renders
 * undo:    how the summary can undo it, or null when it cannot
 *          (no delete path exists for notes or patients)
 * deferred: runs when the summary is closed, not when confirmed
 */
export const VOICE_ACTIONS = {
  create_patient: { patient: "new", task: false, step: "addPatient", undo: null },
  edit_patient: { patient: "ref", task: false, step: "editPatient", undo: "restorePatient" },
  create_task: { patient: "ref", task: false, step: "addTask", undo: "deleteTasks" },
  edit_task: { patient: "ref", task: true, step: "editTask", undo: "restoreTask" },
  create_note: { patient: "ref", task: false, step: "addNote", undo: null },
  edit_note: { patient: "ref", task: false, note: true, step: "editNote", undo: "restoreNote" },
  start_discharge_planning: { patient: "ref", task: false, step: "discharge", undo: "deleteTasks" },
  open_handoff: { patient: "scope", task: false, step: "handoff", undo: null, deferred: true },
  unsupported: { patient: "none", task: false, step: "unsupported", undo: null },
};

export function needsPatient(action) {
  const spec = VOICE_ACTIONS[action.type];
  if (!spec) return false;
  if (spec.patient === "ref") return true;
  return spec.patient === "scope" && action.fields?.scope === "patient";
}

export function needsTask(action) {
  return Boolean(VOICE_ACTIONS[action.type]?.task);
}

export function needsNote(action) {
  return Boolean(VOICE_ACTIONS[action.type]?.note);
}

/**
 * The notes a voice step may edit: this patient's notes written by the
 * current nurse, newest first. Only the author edits a note (decisions.md,
 * 2026-11-18), the same rule as the Edit control on the patient card.
 */
export function editableNotes(patient, currentNurseId) {
  if (!patient || !currentNurseId) return [];
  return (patient.notes || [])
    .filter((n) => n?.id && n.nurse_id === currentNurseId)
    .sort((a, b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0));
}

/**
 * What the queue starts from: for each parsed action, the patient and task
 * it could be bound to with certainty, suggestions for the picker otherwise,
 * and the earlier creation it depends on, if any.
 *
 * @returns entries for `createQueue` (utils/voiceQueue.js)
 */
export function buildQueueEntries(actions, patients, facilityId) {
  const empty = { patientId: null, candidateIds: [] };
  const resolutions = actions.map((action) => (needsPatient(action) ? resolvePatient(action, patients) : empty));
  const dependencies = findDependencies(actions, resolutions);

  return actions.map((action, i) => {
    const { patientId, candidateIds } = resolutions[i];
    const patient = patientId ? patients.find((p) => p.id === patientId) : null;
    const task = needsTask(action) && patient ? resolveTask(action, patient, facilityId) : null;
    // Tasks the parser listed as possible matches, kept only if they really
    // are this patient's. Shown first in the task picker, never selected.
    const patientTaskIds = new Set((patient?.tasks || []).map((tk) => tk.id));
    return {
      action,
      patientId,
      taskId: task ? task.id : null,
      taskCandidateIds: needsTask(action) ? (action.task_candidates || []).filter((id) => patientTaskIds.has(id)) : [],
      candidateIds,
      dependsOn: needsPatient(action) ? dependencies[i] : null,
    };
  });
}

// Free-text fields that must be a non-empty string to be kept.
const TEXT_FIELDS = ["append", "replace"];

const ENUM_FIELDS = {
  priority: VOICE_PRIORITIES,
  status: VOICE_TASK_STATUSES,
  department: VOICE_DEPARTMENTS,
  code_status: VOICE_CODE_STATUSES,
};

/**
 * A second look at the parser's answer, on the client. The Edge Function
 * already validated it; this exists because the client cannot assume which
 * version of the function answered. Unknown types become "not available",
 * enum values outside the lists are dropped, a label that is not
 * Patient_Test_N is dropped, and nothing past five actions is kept.
 */
export function sanitiseVoiceResult(result) {
  const source = result && typeof result === "object" ? result : {};
  const actions = [];

  for (const raw of Array.isArray(source.actions) ? source.actions : []) {
    if (!raw || typeof raw !== "object") continue;
    const words = typeof raw.words === "string" ? raw.words : "";
    const patient = {
      spoken: typeof raw.patient?.spoken === "string" ? raw.patient.spoken : null,
      label: typeof raw.patient?.label === "string" && PATIENT_LABEL_RE.test(raw.patient.label) ? raw.patient.label : null,
    };
    const base = {
      words,
      confidence: ["high", "medium", "low"].includes(raw.confidence) ? raw.confidence : "low",
      patient,
      task_id: null,
      task_candidates: [],
      task_spoken: typeof raw.task_spoken === "string" ? raw.task_spoken : null,
      fields: {},
    };

    if (!VOICE_ACTIONS[raw.type] || raw.type === "unsupported") {
      actions.push({
        ...base,
        type: "unsupported",
        reason: VOICE_UNSUPPORTED_REASONS.includes(raw.reason) ? raw.reason : "other",
      });
      continue;
    }

    const fields = {};
    for (const [name, value] of Object.entries(raw.fields && typeof raw.fields === "object" ? raw.fields : {})) {
      if (ENUM_FIELDS[name] && !ENUM_FIELDS[name].includes(value)) continue;
      if (TEXT_FIELDS.includes(name) && (typeof value !== "string" || !value.trim())) continue;
      fields[name] = value;
    }
    // Add to a note, or rewrite it: not both.
    if (fields.append !== undefined && fields.replace !== undefined) {
      delete fields.append;
      delete fields.replace;
    }
    actions.push({
      ...base,
      type: raw.type,
      task_id: needsTask(raw) && typeof raw.task_id === "string" ? raw.task_id : null,
      task_candidates: needsTask(raw) && Array.isArray(raw.task_candidates) ? raw.task_candidates.filter((id) => typeof id === "string") : [],
      fields,
    });
  }

  const dropped = [
    ...actions.slice(VOICE_MAX_ACTIONS).map((a) => ({ type: a.type, words: a.words })),
    ...(Array.isArray(source.dropped) ? source.dropped : []).filter((d) => d && typeof d.words === "string"),
  ];

  return {
    actions: actions.slice(0, VOICE_MAX_ACTIONS),
    dropped,
    unparsed: (Array.isArray(source.unparsed) ? source.unparsed : []).filter((u) => typeof u === "string" && u.trim()),
    contextTruncated: source.context_truncated === true,
  };
}

// --- One line per action, for "what Noa understood" and for the summary ----

const FIELD_LABEL_KEYS = {
  status: "voiceQueue.field.status",
  priority: "voiceQueue.field.priority",
  department: "voiceQueue.field.department",
  description: "voiceQueue.field.description",
  deadline: "voiceQueue.field.deadline",
  assignee: "voiceQueue.field.assignee",
  assign_to_self: "voiceQueue.field.assignee",
  unassign: "voiceQueue.field.assignee",
  age: "voiceQueue.field.age",
  diagnosis: "voiceQueue.field.diagnosis",
  code_status: "voiceQueue.field.codeStatus",
  allergies_add: "voiceQueue.field.allergies",
  allergies_remove: "voiceQueue.field.allergies",
  admission_date: "voiceQueue.field.admissionDate",
  location_label: "voiceQueue.field.location",
};

function fieldList(t, fields) {
  const labels = [];
  for (const name of Object.keys(fields || {})) {
    const key = FIELD_LABEL_KEYS[name];
    if (!key) continue;
    const label = t(key);
    if (!labels.includes(label)) labels.push(label);
  }
  return labels.join(", ");
}

/**
 * @param {Function} t
 * @param {object} action
 * @param {{ patientLabel?: string }} [resolved] - the bound patient's label, when known
 */
export function describeAction(t, action, resolved = {}) {
  const patient = resolved.patientLabel || action.patient?.label || action.patient?.spoken || t("voiceQueue.line.patientToChoose");
  const fields = fieldList(t, action.fields);

  switch (action.type) {
    case "create_patient":
      return action.patient?.label
        ? t("voiceQueue.line.createPatient", { patient: action.patient.label })
        : t("voiceQueue.line.createPatientNoLabel");
    case "edit_patient":
      return t("voiceQueue.line.editPatient", { patient, fields });
    case "create_task":
      return t("voiceQueue.line.createTask", { patient, description: action.fields?.description || "" });
    case "edit_task":
      return t("voiceQueue.line.editTask", { patient, task: action.task_spoken || t("voiceQueue.line.taskToChoose"), fields });
    case "create_note":
      return t("voiceQueue.line.createNote", { patient });
    case "edit_note":
      return t("voiceQueue.line.editNote", { patient });
    case "start_discharge_planning":
      return t("voiceQueue.line.discharge", { patient });
    case "open_handoff":
      return action.fields?.scope === "patient" ? t("voiceQueue.line.handoffPatient", { patient }) : t("voiceQueue.line.handoffUnit");
    default:
      return t(`voiceQueue.unsupported.${action.reason || "other"}Line`);
  }
}

// --- Pre-fill: from an action to what a dialog's form holds -----------------

// For AddPatientDialog (`initialFields`). Only what was said; the rest stays blank.
export function patientDraft(action) {
  const f = action.fields || {};
  return {
    label: action.patient?.label || "",
    age: f.age ?? null,
    diagnosis: f.diagnosis || "",
    codeStatus: f.code_status || undefined,
    attendingPhysician: f.attending_physician || "",
    allergies: Array.isArray(f.allergies) ? f.allergies : [],
    admissionDate: f.admission_date || "",
    locationLabel: f.location_label || "",
  };
}

const sameAllergen = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

/**
 * For EditPatientDialog: given the row as it is NOW, the form values the
 * action proposes. A function of the row, because the dialog re-reads the
 * row when it opens and whenever a colleague changed it, and "add latex to
 * the allergies" must be laid over the current list, not a stale one.
 */
export function patientProposal(action) {
  const f = action.fields || {};
  return (row) => {
    const next = {};
    if (f.diagnosis !== undefined) next.diagnosis = f.diagnosis;
    if (f.age !== undefined) next.age = String(f.age);
    if (f.code_status !== undefined) next.codeStatus = f.code_status;
    if (f.admission_date !== undefined) next.admissionDate = f.admission_date;
    if (f.location_label !== undefined) next.locationLabel = f.location_label;
    if (f.allergies_add || f.allergies_remove) {
      let list = [...(row?.allergies || [])];
      for (const gone of f.allergies_remove || []) list = list.filter((a) => !sameAllergen(a, gone));
      for (const added of f.allergies_add || []) if (!list.some((a) => sameAllergen(a, added))) list.push(added);
      next.allergiesInput = list.join(", ");
    }
    return next;
  };
}

/**
 * Who an action assigns to. `set` is false when nothing was said about it.
 * A spoken name that does not match exactly one nurse is NOT applied:
 * `heard` carries it so the dialog can ask.
 */
export function resolveAssignee(fields, nurses, currentNurseId) {
  const f = fields || {};
  if (f.unassign === true) return { set: true, nurseId: null, heard: null };
  if (f.assign_to_self === true && currentNurseId) return { set: true, nurseId: currentNurseId, heard: null };
  if (typeof f.assignee === "string" && f.assignee.trim()) {
    const { nurseId } = matchNurse(f.assignee, nurses);
    return nurseId ? { set: true, nurseId, heard: null } : { set: false, nurseId: null, heard: f.assignee.trim() };
  }
  return { set: false, nurseId: null, heard: null };
}

/**
 * For TaskEditDialog's proposal mode: the form values the action proposes,
 * in the shape that dialog holds them (deadline as a local input value).
 * @returns {{ apply: (row: object) => object, assigneeHeard: string|null }}
 */
export function taskProposal(action, nurses, currentNurseId) {
  const f = action.fields || {};
  const assignee = resolveAssignee(f, nurses, currentNurseId);
  return {
    assigneeHeard: assignee.heard,
    apply: () => {
      const next = {};
      if (f.status !== undefined) next.status = f.status;
      if (f.priority !== undefined) next.priority = f.priority;
      if (f.department !== undefined) next.department = f.department;
      if (f.description !== undefined) next.description = f.description;
      if (f.deadline !== undefined) next.deadline = toLocalDatetimeValue(f.deadline);
      if (assignee.set) next.assigned_to = assignee.nurseId;
      return next;
    },
  };
}

// For AddTaskDialog.
export function taskDraft(action, nurses, currentNurseId) {
  const f = action.fields || {};
  const assignee = resolveAssignee(f, nurses, currentNurseId);
  return {
    description: f.description || "",
    department: f.department || "Other",
    priority: f.priority || "Routine",
    deadline: f.deadline || null,
    assigneeId: assignee.set ? assignee.nurseId : null,
    assigneeHeard: assignee.heard,
  };
}

/**
 * For EditNoteDialog: given the note as it is NOW, the text the action
 * proposes. An addition goes at the end of the current text, never of a
 * stale copy. Without either field the note opens unchanged, to be edited
 * by hand.
 */
export function noteProposal(action) {
  const f = action.fields || {};
  return (row) => {
    const current = String(row?.content || "").trim();
    if (typeof f.replace === "string" && f.replace.trim()) return f.replace.trim();
    if (typeof f.append === "string" && f.append.trim()) return current ? `${current} ${f.append.trim()}` : f.append.trim();
    return row?.content || "";
  };
}

// For DischargeDialog.
export function dischargeDraft(action) {
  const f = action.fields || {};
  return { needsNursingHome: f.needs_nursing_home === true, notes: f.notes || "" };
}
