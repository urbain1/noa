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
