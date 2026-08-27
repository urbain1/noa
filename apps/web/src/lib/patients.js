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

// True when Postgres/PostgREST rejected a write because a column doesn't
// exist yet -- i.e. migration 0011 hasn't been run against this project.
// 42703 is Postgres' undefined_column; PGRST204 is PostgREST's schema-cache
// equivalent. Used to keep pre-0011 behaviour working instead of breaking
// task completion outright, per the "degrade visibly, don't crash" rule.
function isMissingColumnError(error, column) {
  if (!error) return false
  return (
    error.code === '42703' ||
    error.code === 'PGRST204' ||
    (typeof error.message === 'string' && error.message.includes(column))
  )
}

// `completedBy` records which nurse actually marked the task complete
// (0011). It is deliberately separate from `created_by`: the nurse who
// raised a task is very often not the one who closed it, and Unit View's
// personnel overview reports the two as distinct figures.
//
// Tasks completed before 0011 keep completed_by NULL, which is shown as
// "unknown" rather than being attributed to anyone.
export async function completeTask(taskId, completedBy = null) {
  const completion = { status: 'Completed', completed_at: new Date().toISOString() }

  const { data, error } = await supabase
    .from('tasks')
    .update({ ...completion, completed_by: completedBy })
    .eq('id', taskId)
    .select()
    .single()

  if (error && isMissingColumnError(error, 'completed_by')) {
    // 0011 not applied yet: complete the task anyway, without attribution.
    console.warn('[patients] completed_by column missing -- migration 0011 not applied. Completing without attribution.')
    const retry = await supabase
      .from('tasks')
      .update(completion)
      .eq('id', taskId)
      .select()
      .single()
    if (retry.error) throw retry.error
    return retry.data
  }

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
  // null is a real value here -- it clears the assignee back to unassigned,
  // which stays a valid state for any task (0011).
  if (fields.assignedTo !== undefined) updates.assigned_to = fields.assignedTo

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

// Assign a task to a nurse at the same facility, or clear the assignment by
// passing null. Assignment is optional -- unassigned is a valid resting
// state, not an error.
//
// Visibility is deliberately untouched: `tasks_facility_scope` (0001/0002)
// still shows every task at the facility to every nurse there, assigned or
// not. Per-nurse task visibility is a ward-manager decision (project.md),
// not something this write should quietly start implying.
//
// If 0011 hasn't been applied, this throws a `MISSING_MIGRATION_0011` error
// the UI can recognise and explain, rather than failing with a raw Postgres
// message or silently doing nothing.
export async function assignTask(taskId, nurseId) {
  const { data, error } = await supabase
    .from('tasks')
    .update({ assigned_to: nurseId })
    .eq('id', taskId)
    .select()
    .single()

  if (error && isMissingColumnError(error, 'assigned_to')) {
    const err = new Error('MISSING_MIGRATION_0011')
    err.code = 'MISSING_MIGRATION_0011'
    throw err
  }
  if (error) throw error
  return data
}

// Discharge planning creates ordinary tasks: same table, same facility
// scope, same statuses, so they appear and sort in every existing view
// exactly like any other task. `task_type: 'discharge'` (0011) is the only
// thing that marks them, so the discharge badge and any future filter don't
// have to guess from the description text.
//
// Falls back to creating them untagged if 0011 hasn't been applied -- a
// discharge task that exists but isn't tagged is far better than a nurse's
// discharge planning silently failing. The caller is told via the returned
// `tagged` flag so it can say so.
export async function createDischargeTasks(facilityId, patientId, createdBy, taskDrafts) {
  const rows = taskDrafts.map((draft) => ({
    facility_id: facilityId,
    patient_id: patientId,
    created_by: createdBy,
    description: draft.description,
    department: draft.department || 'Other',
    priority: draft.priority === 'Stat' ? 'Stat' : 'Routine',
    deadline: draft.deadline || null,
    task_type: 'discharge',
  }))

  const { data, error } = await supabase.from('tasks').insert(rows).select()

  if (error && isMissingColumnError(error, 'task_type')) {
    console.warn('[patients] task_type column missing -- migration 0011 not applied. Creating discharge tasks untagged.')
    const untagged = rows.map((row) => {
      const copy = { ...row }
      delete copy.task_type
      return copy
    })
    const retry = await supabase.from('tasks').insert(untagged).select()
    if (retry.error) throw retry.error
    return { tasks: retry.data, tagged: false }
  }

  if (error) throw error
  return { tasks: data, tagged: true }
}
