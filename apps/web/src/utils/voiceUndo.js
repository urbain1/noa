// Undo for a universal voice command (decisions.md, 2026-11-16).
//
// The audit log records column NAMES only, so undo cannot read old values
// from it. Each applied action keeps, in memory only, the row before and the
// row after. For 60 seconds the summary offers Undo.
//
// This file decides WHAT an undo writes (`planUndo`) and performs those
// writes (`executeUndoSteps`). WHETHER it may write is decided by the same
// guard every edit goes through: components/VoiceUndoSession.jsx runs each
// plan inside useEditSession (lock + stale-write check) and first refuses if
// the record is no longer exactly what the voice command left behind
// (`changeSince`).
//
// What can be undone:
//   an edit           the columns that action changed, put back
//                     (a note edit: its previous text, through updateNote)
//   a created task    deleted, through the existing delete path
// What cannot: a created note or patient. No delete path exists for them and
// none is added here.

import { deleteTask, updateNote, updatePatient, updateTask } from "../lib/patients";
import { restoreTaskSnapshot } from "../lib/taskRestore";
import { findConflict } from "./editLock";

export const UNDO_WINDOW_MS = 60 * 1000;

// Stamps the moment an action was applied: the start of its undo window.
export function stampApplied(applied, now = Date.now()) {
  return { ...applied, at: now };
}

export function undoSecondsLeft(applied, now = Date.now()) {
  if (!applied?.at) return 0;
  return Math.max(0, Math.ceil((applied.at + UNDO_WINDOW_MS - now) / 1000));
}

// The form of a patient row that `updatePatient` takes.
function patientPayload(row) {
  return {
    diagnosis: row.diagnosis || "",
    codeStatus: row.code_status,
    allergies: row.allergies || [],
    admissionDate: row.admission_date || null,
    locationLabel: row.location_label || "",
    age: row.age ?? null,
  };
}

// tasks column -> the key `updateTask` takes for it.
const TASK_UPDATE_KEYS = {
  description: "description",
  department: "department",
  priority: "priority",
  deadline: "deadline",
  assigned_to: "assignedTo",
};

/**
 * What undoing one applied action would do, as a list of per-record plans:
 *   { recordType, recordId, expected, steps }
 * `expected` is the row the voice command left; the undo is refused if the
 * record is no longer that. Returns [] when the action cannot be undone.
 */
export function planUndo(applied) {
  if (!applied) return [];

  if (applied.kind === "editTask") {
    const { before, after, columns = [] } = applied;
    if (!before || !after || columns.length === 0) return [];
    const steps = [];
    if (columns.includes("status")) {
      // Status first, with the completion it carried. The only step that
      // goes through restoreTaskSnapshot.
      steps.push({
        type: "restoreTaskStatus",
        columns: ["status"],
        expectedStatus: after.status,
        restore: {
          status: before.status,
          completed_at: before.completed_at ?? null,
          completed_by: before.completed_by ?? null,
        },
      });
    }
    const others = columns.filter((c) => c !== "status" && TASK_UPDATE_KEYS[c]);
    if (others.length > 0) {
      const updates = {};
      for (const column of others) updates[TASK_UPDATE_KEYS[column]] = before[column] ?? null;
      steps.push({ type: "updateTask", columns: others, updates });
    }
    return steps.length > 0 ? [{ recordType: "task", recordId: after.id, expected: after, steps }] : [];
  }

  if (applied.kind === "editPatient") {
    const { before, after, columns = [] } = applied;
    if (!before || !after || columns.length === 0) return [];
    return [
      {
        recordType: "patient",
        recordId: after.id,
        expected: after,
        // updatePatient writes its six columns together. The stale check has
        // established the row is still what this action left, so only the
        // columns this action changed actually change back.
        steps: [{ type: "updatePatient", columns, payload: patientPayload(before) }],
      },
    ];
  }

  if (applied.kind === "editNote") {
    const { before, after } = applied;
    if (!before?.content || !after?.id) return [];
    return [
      {
        recordType: "note",
        recordId: after.id,
        expected: after,
        steps: [{ type: "updateNote", columns: ["content"], content: before.content }],
      },
    ];
  }

  if (applied.kind === "createTasks") {
    return (applied.tasks || [])
      .filter((task) => task?.id)
      .map((task) => ({ recordType: "task", recordId: task.id, expected: task, steps: [{ type: "deleteTask", columns: [] }] }));
  }

  return [];
}

export function canUndo(applied) {
  return planUndo(applied).length > 0;
}

/**
 * Has the record changed since the voice command left it as `expected`?
 * @returns {null | { reason: "deleted" } | { reason: "changed", columns: string[] }}
 */
export function changeSince(expected, fresh) {
  if (!fresh) return { reason: "deleted" };
  const columns = findConflict(expected, fresh);
  return columns.length > 0 ? { reason: "changed", columns } : null;
}

function partial(restored, missing, row, cause) {
  const err = new Error("UNDO_PARTIAL");
  err.code = "UNDO_PARTIAL";
  err.restored = restored;
  err.missing = missing;
  err.row = row;
  err.cause = cause;
  return err;
}

/**
 * Perform a plan's writes, in order. Meant to be the `write` passed to
 * useEditSession's `guard`: it resolves to the restored row (null after a
 * delete), which becomes the session's new baseline.
 *
 * If a later step fails after an earlier one succeeded, it throws
 * UNDO_PARTIAL carrying what was and was not restored and the row as it now
 * is, so the caller can say exactly that.
 */
export async function executeUndoSteps(plan, facilityId) {
  let row = plan.expected;
  const restored = [];

  for (const [i, step] of plan.steps.entries()) {
    try {
      if (step.type === "restoreTaskStatus") {
        row = await restoreTaskSnapshot({ facilityId, taskId: plan.recordId, expectedStatus: step.expectedStatus, restore: step.restore });
      } else if (step.type === "updateTask") {
        row = await updateTask(plan.recordId, step.updates, null, facilityId);
      } else if (step.type === "updateNote") {
        row = await updateNote(plan.recordId, step.content, facilityId);
      } else if (step.type === "updatePatient") {
        row = await updatePatient(plan.recordId, step.payload, facilityId);
      } else if (step.type === "deleteTask") {
        await deleteTask(plan.recordId, facilityId);
        row = null;
      } else {
        throw new Error(`Unknown undo step: ${step.type}`);
      }
      restored.push(...step.columns);
    } catch (err) {
      if (restored.length === 0) throw err;
      const missing = plan.steps.slice(i).flatMap((s) => s.columns);
      throw partial(restored, missing, row, err);
    }
  }

  return row;
}
