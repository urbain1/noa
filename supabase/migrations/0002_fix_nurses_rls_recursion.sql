-- 0002_fix_nurses_rls_recursion.sql
-- Fixes: infinite recursion detected in policy for relation "nurses" (42P17)
--
-- Cause: the facility-scope policies queried the nurses table from inside
-- a policy defined ON the nurses table (and from patients/tasks/notes/
-- alerts policies, which also queried nurses to find the caller's
-- facility). Postgres re-applies RLS to that inner query, re-triggering
-- the same policy indefinitely.
--
-- Fix: look up the current user's facility_id through a SECURITY DEFINER
-- function. It runs with the privileges of its owner (the table owner in
-- Supabase), which bypasses RLS for that one internal lookup and breaks
-- the recursion. search_path is pinned as a standard hardening step for
-- SECURITY DEFINER functions.

create or replace function get_my_facility_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select facility_id from nurses where id = auth.uid()
$$;

drop policy if exists "nurses_read_same_facility" on nurses;
create policy "nurses_read_same_facility" on nurses
  for select using (
    facility_id = get_my_facility_id()
  );

drop policy if exists "patients_facility_scope" on patients;
create policy "patients_facility_scope" on patients
  for all
  using (facility_id = get_my_facility_id())
  with check (facility_id = get_my_facility_id());

drop policy if exists "tasks_facility_scope" on tasks;
create policy "tasks_facility_scope" on tasks
  for all
  using (facility_id = get_my_facility_id())
  with check (facility_id = get_my_facility_id());

drop policy if exists "notes_facility_scope" on notes;
create policy "notes_facility_scope" on notes
  for all
  using (facility_id = get_my_facility_id())
  with check (facility_id = get_my_facility_id());

drop policy if exists "alerts_facility_scope" on alerts;
create policy "alerts_facility_scope" on alerts
  for all
  using (facility_id = get_my_facility_id())
  with check (facility_id = get_my_facility_id());
