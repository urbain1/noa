// The review queue for a universal voice command: pure state, no React, no
// knowledge of what an action IS. It tracks, for each parsed action, whether
// it is still to do, done, skipped, failed, not available, cancelled, or
// blocked because the patient it needed was never created. Action types
// live in the registry (utils/voiceRegistry.js); adding one does not touch
// this file.
//
// Nothing here writes anything. An item only becomes "done" after the nurse
// confirmed its dialog and the write succeeded.

export const ITEM_STATUS = {
  PENDING: "pending",
  DONE: "done",
  SKIPPED: "skipped",
  FAILED: "failed",
  UNAVAILABLE: "unavailable", // recognised, not allowed by voice
  BLOCKED: "blocked", // depended on a creation that did not happen
  CANCELLED: "cancelled", // the queue was closed before reaching it
};

const OPEN = ITEM_STATUS.PENDING;

/**
 * @param {Array<{ action: object, patientId?: string|null, taskId?: string|null,
 *   candidateIds?: string[], dependsOn?: number|null }>} entries
 */
export function createQueue(entries) {
  return {
    closed: false,
    items: entries.map((entry, index) => ({
      index,
      action: entry.action,
      status: OPEN,
      patientId: entry.patientId ?? null,
      taskId: entry.taskId ?? null,
      candidateIds: entry.candidateIds || [],
      dependsOn: entry.dependsOn ?? null,
      applied: null,
      error: null,
      note: null,
    })),
  };
}

function update(queue, index, patch) {
  return { ...queue, items: queue.items.map((item) => (item.index === index ? { ...item, ...patch } : item)) };
}

// A creation that will not happen takes the actions that needed it with it,
// and those can themselves have dependents.
function blockDependents(queue, index) {
  let next = queue;
  for (const item of queue.items) {
    if (item.dependsOn === index && item.status === OPEN) {
      next = update(next, item.index, { status: ITEM_STATUS.BLOCKED, note: "dependency" });
      next = blockDependents(next, item.index);
    }
  }
  return next;
}

/**
 * Events:
 *   { type: "bind", index, patientId?, taskId? }   a picker choice
 *   { type: "done", index, applied }               confirmed and written
 *       applied.patientId, when given, is handed to dependents
 *   { type: "error", index, message }              a write failed; the step stays open
 *   { type: "skip", index, note? }                 skipped by the nurse
 *   { type: "acknowledge", index }                 an "not available" step was read
 *   { type: "close" }                              the queue was closed
 */
export function queueReducer(queue, event) {
  const item = queue.items.find((i) => i.index === event.index);

  switch (event.type) {
    case "bind": {
      if (!item || item.status !== OPEN) return queue;
      const patch = {};
      if (event.patientId !== undefined) {
        patch.patientId = event.patientId;
        // A different patient means the task that was resolved no longer applies.
        if (event.patientId !== item.patientId) patch.taskId = null;
      }
      if (event.taskId !== undefined) patch.taskId = event.taskId;
      return update(queue, item.index, patch);
    }

    case "done": {
      if (!item || item.status !== OPEN) return queue;
      let next = update(queue, item.index, { status: ITEM_STATUS.DONE, applied: event.applied || {}, error: null });
      const createdPatientId = event.applied?.patientId;
      if (createdPatientId) {
        for (const dependent of next.items) {
          if (dependent.dependsOn === item.index && dependent.status === OPEN) {
            next = update(next, dependent.index, { patientId: createdPatientId });
          }
        }
      }
      return next;
    }

    case "error": {
      if (!item || item.status !== OPEN) return queue;
      return update(queue, item.index, { error: event.message || "failed" });
    }

    case "skip": {
      if (!item || item.status !== OPEN) return queue;
      // Skipped after a write failed is a failure, and the summary says so.
      const status = item.error ? ITEM_STATUS.FAILED : ITEM_STATUS.SKIPPED;
      return blockDependents(update(queue, item.index, { status, note: event.note || null }), item.index);
    }

    case "acknowledge": {
      if (!item || item.status !== OPEN) return queue;
      return blockDependents(update(queue, item.index, { status: ITEM_STATUS.UNAVAILABLE }), item.index);
    }

    case "close": {
      if (queue.closed) return queue;
      return {
        closed: true,
        items: queue.items.map((i) => (i.status === OPEN ? { ...i, status: ITEM_STATUS.CANCELLED } : i)),
      };
    }

    default:
      return queue;
  }
}

// The step to show: the first item still to do, or null when the queue is over.
export function currentItem(queue) {
  if (queue.closed) return null;
  return queue.items.find((i) => i.status === OPEN) || null;
}

export function isFinished(queue) {
  return currentItem(queue) === null;
}

export function countByStatus(queue) {
  const counts = {};
  for (const status of Object.values(ITEM_STATUS)) counts[status] = 0;
  for (const item of queue.items) counts[item.status] += 1;
  return counts;
}

// How many actions were not carried out: for "Closing the queue cancels the
// rest and says how many were not done".
export function notDoneCount(queue) {
  return queue.items.filter((i) => i.status !== ITEM_STATUS.DONE).length;
}
