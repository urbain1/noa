import { supabase } from './supabase'

// Fetches active (non-discharged) patients for the current nurse's facility,
// with their tasks and notes nested. RLS scopes every row to the caller's
// facility_id already, no manual filter needed here.
export async function fetchPatients() {
  const { data, error } = await supabase
    .from('patients')
    .select('*, tasks(*), notes(*)')
    .eq('is_discharged', false)
    .order('created_at', { ascending: false })
    .order('created_at', { foreignTable: 'tasks', ascending: false })
    .order('created_at', { foreignTable: 'notes', ascending: false })

  if (error) throw error
  return data
}

export async function createPatient(facilityId, fields) {
  const { data, error } = await supabase
    .from('patients')
    .insert({
      facility_id: facilityId,
      label: fields.label,
      diagnosis: fields.diagnosis || null,
      code_status: fields.codeStatus || 'Full Code',
      attending_physician: fields.attendingPhysician || null,
      allergies: fields.allergies && fields.allergies.length > 0 ? fields.allergies : null,
      admission_date: fields.admissionDate || null,
      location_label: fields.locationLabel || null,
      age: fields.age ?? null,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

// Label is intentionally excluded: fixed once set, per the
// retire-don't-reuse rule in SECURITY.md.
export async function updatePatient(patientId, fields) {
  const { data, error } = await supabase
    .from('patients')
    .update({
      diagnosis: fields.diagnosis || null,
      code_status: fields.codeStatus,
      allergies: fields.allergies && fields.allergies.length > 0 ? fields.allergies : null,
      admission_date: fields.admissionDate || null,
      location_label: fields.locationLabel || null,
      age: fields.age ?? null,
    })
    .eq('id', patientId)
    .select()
    .single()

  if (error) throw error
  return data
}

// priority is clamped to the DB check constraint ('Routine' | 'Stat') --
// upstream voice parsing can still produce 'Urgent', which has no real
// column value, so anything other than an exact 'Stat' is stored as
// 'Routine'.
export async function createTask(facilityId, patientId, createdBy, fields) {
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      facility_id: facilityId,
      patient_id: patientId,
      created_by: createdBy,
      description: fields.description,
      department: fields.department || 'Other',
      priority: fields.priority === 'Stat' ? 'Stat' : 'Routine',
      deadline: fields.deadline || null,
      raw_transcript: fields.rawTranscript || null,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function completeTask(taskId) {
  const { data, error } = await supabase
    .from('tasks')
    .update({ status: 'Completed', completed_at: new Date().toISOString() })
    .eq('id', taskId)
    .select()
    .single()

  if (error) throw error
  return data
}

// Only fields present in `fields` are sent, so partial edits (e.g. status
// only) don't clobber unrelated columns. priority is clamped to the DB check
// constraint ('Routine' | 'Stat'), same reasoning as createTask above.
export async function updateTask(taskId, fields) {
  const updates = {}
  if (fields.description !== undefined) updates.description = fields.description
  if (fields.department !== undefined) updates.department = fields.department
  if (fields.priority !== undefined) updates.priority = fields.priority === 'Stat' ? 'Stat' : 'Routine'
  if (fields.deadline !== undefined) updates.deadline = fields.deadline || null
  if (fields.status !== undefined) updates.status = fields.status

  const { data, error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', taskId)
    .select()
    .single()

  if (error) throw error
  return data
}

// Repage: reset an overdue task back to Pending and log a delay alert.
// `task` must carry its own `facility_id` (present on every fetched task)
// so the alerts row lands in the right facility without a separate lookup.
//
// Guarded against Completed/Cancelled even though the UI only ever shows
// the repage button for overdue tasks (which already excludes both) --
// this is defense against a stale `task` reference, e.g. a second tab or
// a click that lands after the task was completed elsewhere. A repage or
// alert against a task with no outstanding work is never useful.
export async function repageTask(task) {
  if (task.status === 'Completed' || task.status === 'Cancelled') {
    throw new Error(`Cannot repage a task with status "${task.status}"`)
  }

  const { data, error } = await supabase
    .from('tasks')
    .update({ status: 'Pending', last_repaged_at: new Date().toISOString() })
    .eq('id', task.id)
    .select()
    .single()

  if (error) throw error

  const { error: alertError } = await supabase
    .from('alerts')
    .insert({
      task_id: task.id,
      facility_id: task.facility_id,
      type: 'delay',
      triggered_at: new Date().toISOString(),
    })

  if (alertError) throw alertError
  return data
}

// Escalate: bump priority to Stat, stamp escalated_at, log an escalation
// alert. `escalated_to` is deliberately left unset -- there's no
// charge-nurse assignment system yet (see CLAUDE.md).
//
// Guarded against Completed/Cancelled for the same stale-reference reason
// as repageTask. Stays clickable indefinitely even once priority is
// already Stat -- escalated_at and the alert row still update on every
// click (re-escalating tracks "when was this last flagged as urgent
// again", not just "has it ever been Stat"), only the priority write
// itself is skipped since it's already at Stat.
export async function escalateTask(task) {
  if (task.status === 'Completed' || task.status === 'Cancelled') {
    throw new Error(`Cannot escalate a task with status "${task.status}"`)
  }

  const { data, error } = await supabase
    .from('tasks')
    .update({ priority: 'Stat', escalated_at: new Date().toISOString() })
    .eq('id', task.id)
    .select()
    .single()

  if (error) throw error

  const { error: alertError } = await supabase
    .from('alerts')
    .insert({
      task_id: task.id,
      facility_id: task.facility_id,
      type: 'escalation',
      triggered_at: new Date().toISOString(),
    })

  if (alertError) throw alertError
  return data
}

export async function addNote(facilityId, patientId, nurseId, content) {
  const { data, error } = await supabase
    .from('notes')
    .insert({
      facility_id: facilityId,
      patient_id: patientId,
      nurse_id: nurseId,
      content,
      type: 'clinical',
    })
    .select()
    .single()

  if (error) throw error
  return data
}
