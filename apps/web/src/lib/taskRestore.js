import { supabase } from './supabase'

// The one write that exists only for UNDO (decisions.md, 2026-11-16).
//
// Undoing a voice command that completed or reopened a task has to put back
// the task's previous status together with who completed it and when. The
// ordinary write (`updateTask`) cannot: setting a status through it stamps
// completed_at = now and completed_by = the nurse pressing the button, which
// on an undo would credit the wrong nurse at the wrong time, or erase a
// completion that had happened.
//
// It is deliberately narrow:
//   - imported by utils/voiceUndo.js and nothing else (a unit test fails if
//     any other file imports it);
//   - it writes exactly three columns, status, completed_at and completed_by,
//     all three every time, and rejects anything else;
//   - it filters by task id AND facility_id (CLAUDE.md);
//   - it also filters by the status the voice command left behind, so a task
//     whose status changed in the meantime matches no row and nothing is
//     written. That closes the gap between the stale-write check and the
//     write for the one column this function is about.
//
// The caller runs it inside useEditSession's lock and stale-write guard.
// Migration 0012's trigger logs it as an ordinary task update.

const RESTORABLE_COLUMNS = ['completed_at', 'completed_by', 'status']

function coded(code) {
  const err = new Error(code)
  err.code = code
  return err
}

/**
 * @param {object} args
 * @param {string} args.facilityId
 * @param {string} args.taskId
 * @param {string} args.expectedStatus - the status the voice command wrote
 * @param {{ status: string, completed_at: string|null, completed_by: string|null }} args.restore
 * @returns {Promise<object>} the restored row
 * @throws code RESTORE_BAD_ARGS, RESTORE_BAD_COLUMNS, or RESTORE_STALE when
 *   the task no longer has `expectedStatus` (or no longer exists)
 */
export async function restoreTaskSnapshot({ facilityId, taskId, expectedStatus, restore } = {}) {
  if (!facilityId || !taskId || !expectedStatus) throw coded('RESTORE_BAD_ARGS')

  const columns = restore && typeof restore === 'object' ? Object.keys(restore).sort() : []
  if (columns.length !== RESTORABLE_COLUMNS.length || columns.some((c, i) => c !== RESTORABLE_COLUMNS[i])) {
    throw coded('RESTORE_BAD_COLUMNS')
  }
  if (typeof restore.status !== 'string' || !restore.status) throw coded('RESTORE_BAD_COLUMNS')

  const { data, error } = await supabase
    .from('tasks')
    .update({
      status: restore.status,
      completed_at: restore.completed_at ?? null,
      completed_by: restore.completed_by ?? null,
    })
    .eq('id', taskId)
    .eq('facility_id', facilityId)
    .eq('status', expectedStatus)
    .select()

  if (error) throw error
  if (!data || data.length === 0) throw coded('RESTORE_STALE')
  return data[0]
}
