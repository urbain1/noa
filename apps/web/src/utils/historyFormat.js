import { localeTag } from "../i18n";

// Turns one audit_log row (migration 0012) into the line the History dialog
// shows: what happened, who did it, when.
//
// The log never holds field values, only column names and a few derived
// events, so nothing here reads a description out of it. The one piece of
// content a line can carry, `subject`, comes from data the app has already
// loaded (the patient's current tasks and notes). A record that has since
// been deleted is not in that data, so its line stays generic.

// Column -> label key, per resource type. Several columns share a label when
// the nurse would think of them as one thing (completed_at + completed_by are
// both "completion"). A column missing from this map still renders, as the
// generic "another field", so a column added later never shows a raw name.
const COLUMN_LABELS = {
  patient: {
    label: "label",
    diagnosis: "diagnosis",
    code_status: "codeStatus",
    attending_physician: "attendingPhysician",
    allergies: "allergies",
    admission_date: "admissionDate",
    location_label: "locationLabel",
    age: "age",
    is_discharged: "discharge",
    discharged_at: "discharge",
  },
  task: {
    description: "description",
    department: "department",
    status: "status",
    priority: "priority",
    deadline: "deadline",
    completed_at: "completion",
    completed_by: "completion",
    assigned_to: "assignee",
    escalated_at: "escalation",
    escalated_to: "escalation",
    last_repaged_at: "repage",
    task_type: "type",
    patient_id: "patient",
    raw_transcript: "transcript",
    created_by: "createdBy",
  },
  note: {
    content: "content",
    type: "type",
    nurse_id: "author",
    patient_id: "patient",
  },
};

// The columns each event already explains. Whatever changed beyond these is
// listed after the event as "(also changed: ...)".
const EVENT_COLUMNS = {
  completed: ["status", "completed_at", "completed_by"],
  reopened: ["status", "completed_at", "completed_by"],
  cancelled: ["status"],
  assigned: ["assigned_to"],
  unassigned: ["assigned_to"],
  discharged: ["is_discharged", "discharged_at"],
};

// Which verbs each resource type has a phrase for. An event outside this
// list (or a future one) falls back to the plain "modified" line.
const EVENTS_BY_TYPE = {
  patient: ["discharged"],
  task: ["completed", "reopened", "cancelled", "assigned", "unassigned"],
  note: [],
};

const ACTION_VERBS = { create: "created", delete: "deleted", update: "modified" };

const NOTE_SUBJECT_MAX = 80;

// Translated, deduplicated labels for a list of column names, in the order
// the columns arrived (the trigger sorts them, so the order is stable).
export function columnLabels(t, resourceType, columns) {
  const map = COLUMN_LABELS[resourceType] || {};
  const labels = [];
  for (const column of columns || []) {
    const key = map[column];
    const label = key ? t(`history.columns.${resourceType}.${key}`) : t("history.columns.other");
    if (!labels.includes(label)) labels.push(label);
  }
  return labels;
}

// Who did it. NULL nurse_id is a system write (no signed-in user), unless the
// trigger flagged that a signed-in user had no nurses row. A nurse id the
// facility list doesn't contain is shown as unknown rather than as an id.
export function actorName(t, row, nurses) {
  if (!row.nurse_id) {
    return row.details?.actor_unresolved ? t("history.actor.unknown") : t("history.actor.system");
  }
  const nurse = (nurses || []).find((n) => n.id === row.nurse_id);
  if (!nurse) return t("history.actor.unknown");
  return nurse.name || nurse.email || t("history.actor.unknown");
}

export function formatHistoryTime(createdAt, language, now = new Date()) {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "";
  const options = { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" };
  if (date.getFullYear() !== now.getFullYear()) options.year = "numeric";
  return new Intl.DateTimeFormat(localeTag(language), options).format(date);
}

// The current text of a task or note that still exists, from loaded data.
function subjectFor(row, tasksById, notesById) {
  if (row.resource_type === "task") {
    return tasksById?.get(row.resource_id)?.description || null;
  }
  if (row.resource_type === "note") {
    const content = notesById?.get(row.resource_id)?.content;
    if (!content) return null;
    return content.length > NOTE_SUBJECT_MAX ? `${content.slice(0, NOTE_SUBJECT_MAX).trimEnd()}...` : content;
  }
  return null;
}

/**
 * @param {object} row - one audit_log row
 * @param {object} ctx
 * @param {Function} ctx.t - i18next t()
 * @param {string} ctx.language - the nurse's current language
 * @param {Array} ctx.nurses - facility colleagues ({ id, name, email })
 * @param {Map} [ctx.tasksById] - the patient's currently loaded tasks
 * @param {Map} [ctx.notesById] - the patient's currently loaded notes
 * @param {Date} [ctx.now] - for the "same year" check; injectable for tests
 * @returns {{ id: string, text: string, subject: string|null, when: string }}
 */
export function formatHistoryEntry(row, { t, language, nurses, tasksById, notesById, now }) {
  const type = COLUMN_LABELS[row.resource_type] ? row.resource_type : "other";
  const actor = actorName(t, row, nurses);
  const columns = Array.isArray(row.details?.columns) ? row.details.columns : [];
  const events = Array.isArray(row.details?.events) ? row.details.events : [];

  let text;
  if (type === "other") {
    text = t("history.entry.other.changed", { actor });
  } else if (row.action === "update") {
    const event = events.find((e) => (EVENTS_BY_TYPE[type] || []).includes(e));
    if (event) {
      const explained = EVENT_COLUMNS[event] || [];
      const rest = columnLabels(t, type, columns.filter((c) => !explained.includes(c)));
      text = t(`history.entry.${type}.${event}`, { actor });
      if (rest.length > 0) text = t("history.withAlso", { text, fields: rest.join(", ") });
    } else {
      const fields = columnLabels(t, type, columns);
      text = fields.length > 0
        ? t(`history.entry.${type}.modified`, { actor, fields: fields.join(", ") })
        : t(`history.entry.${type}.changed`, { actor });
    }
  } else if (ACTION_VERBS[row.action]) {
    text = t(`history.entry.${type}.${ACTION_VERBS[row.action]}`, { actor });
  } else {
    text = t(`history.entry.${type}.changed`, { actor });
  }

  return {
    id: row.id,
    text,
    subject: subjectFor(row, tasksById, notesById),
    when: formatHistoryTime(row.created_at, language, now),
  };
}
