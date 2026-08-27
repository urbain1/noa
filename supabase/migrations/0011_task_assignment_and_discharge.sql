-- 0011_task_assignment_and_discharge.sql
--
-- Three additive changes, all nullable, no RLS or policy changes anywhere:
--
--   1. tasks.assigned_to    -- which nurse is meant to do this task
--   2. tasks.completed_by   -- which nurse actually marked it complete
--   3. tasks.task_type      -- marks discharge-planning tasks as such
--   4. set_my_name()        -- lets a nurse rename themselves (profile screen)
--
-- Existing rows keep NULL for every new column and nothing about how tasks
-- are read changes: `tasks_facility_scope` (0001/0002) still governs
-- visibility, so every nurse continues to see every task at their facility.
-- Assignment here is DATA ONLY. "Nurses see only their own tasks" is
-- deferred to the ward-manager design session per project.md, and must not
-- be inferred from the presence of these columns.

-- 1 + 2. Assignment and completion attribution -------------------------------
--
-- Both reference nurses(id) with no ON DELETE behaviour, matching the
-- existing created_by / escalated_to / nurse_id columns. Nurse deletion
-- already fails on those foreign keys today; see the account-deletion
-- proposal in FINAL_REVIEW.md, nothing here makes that better or worse.
--
-- completed_by is written going forward only. Tasks completed before this
-- migration have status 'Completed' with completed_by NULL, and that is
-- honestly unknown -- it must never be backfilled from created_by, which
-- would assert something that was never recorded.

alter table tasks
  add column if not exists assigned_to uuid references nurses(id),
  add column if not exists completed_by uuid references nurses(id);

-- 3. Discharge-planning marker ----------------------------------------------
--
-- Discharge planning creates ordinary tasks (they sort, filter, complete,
-- and appear in every existing view exactly like any other task) that also
-- need to be recognisable as discharge-planning work. department could not
-- carry that: the two tasks the workflow creates legitimately belong to two
-- different departments (Nursing for notifying the patient, Social Work for
-- placement), and overloading either one would corrupt the department
-- bottleneck counts in Unit View.
--
-- The pre-existing alternative was inferring it from the description text
-- ("discharge" appearing anywhere), which the discharge badge on the patient
-- card still falls back to for historical rows. That heuristic flags any
-- task that merely mentions discharge, so it is kept only as a fallback.
--
-- The check constraint accepts NULL (every task that isn't discharge
-- planning) plus the one value in use. Adding another type later needs a
-- follow-up migration to widen it, same as status and priority in 0001.

alter table tasks
  add column if not exists task_type text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tasks_task_type_check'
  ) then
    alter table tasks
      add constraint tasks_task_type_check
      check (task_type is null or task_type in ('discharge'));
  end if;
end $$;

-- 4. Nurse display name -----------------------------------------------------
--
-- Same reasoning as set_my_language (0007) and acknowledge_notice (0009):
-- `nurses` grants clients select + insert only (0001) and has no UPDATE
-- policy, so a client-side update of `name` has nowhere to land. A row-level
-- UPDATE policy cannot restrict which columns are written, so it would also
-- let a nurse rewrite their own facility_id and read another facility's
-- patients -- the cross-facility leak CLAUDE.md rates at the same severity
-- as a real PHI leak. This function writes exactly one column, for exactly
-- the calling user; facility_id and role stay unwritable by any client.
--
-- Rejects blank/whitespace-only names rather than storing one: `name` is
-- `not null` in 0001 and is what colleagues see in the personnel overview
-- and the task assignee picker.
--
-- search_path is pinned, as for get_my_facility_id in 0002.

create or replace function set_my_name(new_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if new_name is null or btrim(new_name) = '' then
    raise exception 'Name cannot be empty';
  end if;

  update nurses
     set name = btrim(new_name)
   where id = auth.uid();
end;
$$;

revoke all on function set_my_name(text) from public;
grant execute on function set_my_name(text) to authenticated;
