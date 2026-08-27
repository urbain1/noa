import { supabase } from './supabase'

// Colleagues at the current nurse's facility, for the task assignee picker
// and Unit View's personnel overview.
//
// No facility filter is written here on purpose: `nurses_read_same_facility`
// (0001/0002) already restricts SELECT to rows sharing the caller's
// facility_id, and it is the only thing that may decide that. Adding a
// client-side filter would suggest the boundary lives in this file.
//
// `nurses` grants clients select + insert only, so this is read-only by
// construction.
export async function fetchFacilityNurses() {
  const { data, error } = await supabase
    .from('nurses')
    .select('id, name, email')
    .order('name')

  if (error) throw error
  return data || []
}

// Renames the signed-in nurse via `set_my_name` (0011). Goes through the
// SECURITY DEFINER function rather than a direct update for the reason
// documented there: `nurses` has no UPDATE policy, and adding one would also
// expose facility_id to rewriting.
export async function updateMyName(name) {
  const { error } = await supabase.rpc('set_my_name', { new_name: name })
  if (error) throw error
}
