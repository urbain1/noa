import { supabase } from './supabase'
import { isMissingColumnError } from './patients'

// Read side of the audit log (migration 0012). Nothing in the client ever
// writes to `audit_log`: Postgres triggers on patients, tasks and notes are
// its only writer, and INSERT is revoked from every client role.
//
// Every query here carries an explicit `facility_id` filter, per CLAUDE.md.
// RLS (`audit_log_select_same_facility`) enforces the same boundary on the
// server; the filter is there so this file never depends on it alone.

export const HISTORY_PAGE_SIZE = 50

// Only what the history view needs. `details` holds column names and derived
// events, never field values (see 0012), but nothing here asks for more
// than the list renders anyway.
const HISTORY_COLUMNS = 'id, nurse_id, action, resource_type, resource_id, patient_id, details, created_at'

// True when the error means "the audit log isn't readable here yet" rather
// than "something went wrong": 0012 not applied (no patient_id column, no
// SELECT grant), or the table missing from the API's schema cache. The
// history view shows a translated "not available yet" message for these
// instead of a failure.
function isAuditUnavailable(error) {
  if (!error) return false
  if (isMissingColumnError(error, 'patient_id')) return true
  // 42501 insufficient_privilege, 42P01 undefined_table, PGRST205 table not
  // found in PostgREST's schema cache.
  return error.code === '42501' || error.code === '42P01' || error.code === 'PGRST205'
}

function unavailableError(cause) {
  const err = new Error('AUDIT_UNAVAILABLE')
  err.code = 'AUDIT_UNAVAILABLE'
  err.cause = cause
  return err
}

// One page of a patient's history, newest first: the patient row itself
// plus every task and note that belongs (or belonged) to it. Deleted tasks
// and notes are still here, because audit_log.patient_id has no foreign key.
//
// Asks for one row more than a page to know whether another page exists,
// without a separate count query.
export async function fetchPatientHistory(facilityId, patientId, offset = 0) {
  if (!facilityId || !patientId) {
    throw new Error('fetchPatientHistory: facilityId and patientId are required')
  }

  const { data, error } = await supabase
    .from('audit_log')
    .select(HISTORY_COLUMNS)
    .eq('facility_id', facilityId)
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + HISTORY_PAGE_SIZE)

  if (error) {
    if (isAuditUnavailable(error)) throw unavailableError(error)
    throw error
  }

  const rows = data || []
  return {
    rows: rows.slice(0, HISTORY_PAGE_SIZE),
    hasMore: rows.length > HISTORY_PAGE_SIZE,
  }
}
