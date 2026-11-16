-- 0012_audit_log_triggers.sql
--
-- Wires up `audit_log` (created in 0001, never written to until now).
-- Every INSERT, UPDATE and DELETE on patients, tasks and notes is recorded by
-- an AFTER trigger, so no application code path (current client, the older
-- build testers still run, the Edge Function, the SQL editor) can skip it.
--
-- WRITTEN, NOT APPLIED. Run it by hand in the SQL editor, then run
-- supabase/verify_audit_log.sql. Undo with supabase/rollback_0012.sql.
--
-- What is recorded, and what never is:
--   who        auth.uid(); NULL means a system write (no signed-in user)
--   action     'create' | 'update' | 'delete'
--   what       resource_type ('patient' | 'task' | 'note') + resource_id
--   where      facility_id and patient_id, copied from the row itself
--   when       created_at, the clock time of the write
--   details    {"columns": [...names of changed columns...],
--               "events":  [...completed | reopened | cancelled |
--                           discharged | assigned | unassigned...]}
--
-- Column NAMES only. No field value is ever copied into the log: no
-- description, note content, diagnosis, label, location or contact detail.
-- The only exception is the short list of semantic events above, each
-- derived from an enum or boolean transition rather than copied from it.
--
-- Backward compatibility (critical: testers' older build keeps writing to
-- these tables the moment this is applied):
--   - Additive only. One new nullable column, two indexes, one function,
--     three triggers, one SELECT policy, grant changes on audit_log only.
--     No rename, no drop, no new NOT NULL, no change to any other policy.
--   - The trigger reads the row through to_jsonb(), so it works for any
--     column set, before or after 0011, and for every write shape in
--     lib/patients.js at the deployed commit (7d81de0), which is identical
--     to the current one.
--   - The only things that could make the trigger's own INSERT fail are the
--     two foreign keys on audit_log. facility_id is copied from a row whose
--     own facility_id is a NOT NULL FK to facilities, so it always exists.
--     nurse_id is checked against nurses first (see "actor" below).
--   - auth.uid() is already evaluated by the RLS policies on these tables
--     (through get_my_facility_id()), so calling it again here cannot
--     introduce a new failure.
--   - No blanket exception handler: an unexpected error surfaces rather than
--     being swallowed, and verify_audit_log.sql exercises every case.

begin;

-- 1. patient_id -------------------------------------------------------------
--
-- facility_id already exists (0001). patient_id is new: a plain uuid with no
-- foreign key, so a patient's history survives a hard delete of the patient
-- (and the cascade delete of its tasks and notes).

alter table public.audit_log
  add column if not exists patient_id uuid;

comment on column public.audit_log.patient_id is
  'Patient the audited row belongs to (the patient itself, or the parent of a task/note). No FK on purpose: history must survive a hard delete.';

-- 2. Indexes ----------------------------------------------------------------
--
-- The history view reads one patient at a time, newest first, within the
-- nurse's facility. The stale-write check reads the latest entry for one
-- record.

create index if not exists audit_log_facility_patient_created_idx
  on public.audit_log (facility_id, patient_id, created_at desc);

create index if not exists audit_log_resource_created_idx
  on public.audit_log (resource_id, created_at desc);

-- 3. Trigger function -------------------------------------------------------
--
-- SECURITY DEFINER so it can write to audit_log after clients lose INSERT on
-- it (section 5). search_path is pinned to empty and every name below is
-- schema-qualified, the strictest form of the hardening 0002 applied to
-- get_my_facility_id.
--
-- The resource type is passed in by each trigger (TG_ARGV[0]) rather than
-- derived from the table name, so the mapping is explicit.

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resource_type text := TG_ARGV[0];
  v_action        text;
  v_old           jsonb;
  v_new           jsonb;
  v_row           jsonb;
  v_columns       text[] := '{}';
  v_events        text[] := '{}';
  v_actor         uuid := auth.uid();
  v_unresolved    boolean := false;
  v_details       jsonb;
begin
  -- A mis-declared trigger is a migration bug, not a row shape: fail loudly.
  if v_resource_type is null or v_resource_type not in ('patient', 'task', 'note') then
    raise exception 'audit_row_change: unexpected resource type %', coalesce(v_resource_type, '<none>');
  end if;

  if TG_OP = 'INSERT' then
    v_action := 'create';
    v_new := to_jsonb(NEW);
    v_row := v_new;

  elsif TG_OP = 'UPDATE' then
    v_action := 'update';
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_row := v_new;

    -- Names of the columns whose value actually changed. Bookkeeping columns
    -- are excluded so they never count as a change on their own (none of the
    -- three tables has one today; `updated_at` is listed so adding one later
    -- doesn't start logging no-op saves).
    select coalesce(array_agg(changed.key order by changed.key collate "C"), '{}'::text[])
      into v_columns
      from jsonb_object_keys(v_new) as changed(key)
     where changed.key <> all (array['updated_at'])
       and (v_new -> changed.key) is distinct from (v_old -> changed.key);

    -- No-op update (a save that changed nothing): record nothing.
    if cardinality(v_columns) = 0 then
      return null;
    end if;

    -- Semantic events. Derived from the transition; the values themselves
    -- are never stored.
    if v_resource_type = 'task' then
      if 'status' = any (v_columns) then
        if v_new ->> 'status' = 'Completed' then
          v_events := array_append(v_events, 'completed');
        elsif v_new ->> 'status' = 'Cancelled' then
          v_events := array_append(v_events, 'cancelled');
        elsif v_old ->> 'status' in ('Completed', 'Cancelled') then
          v_events := array_append(v_events, 'reopened');
        end if;
      end if;

      if 'assigned_to' = any (v_columns) then
        if v_new ->> 'assigned_to' is null then
          v_events := array_append(v_events, 'unassigned');
        else
          v_events := array_append(v_events, 'assigned');
        end if;
      end if;

    elsif v_resource_type = 'patient' then
      if 'is_discharged' = any (v_columns)
         and (v_new ->> 'is_discharged') = 'true'
         and (v_old ->> 'is_discharged') is distinct from 'true' then
        v_events := array_append(v_events, 'discharged');
      end if;
    end if;

  elsif TG_OP = 'DELETE' then
    -- Read from OLD only. Nothing here looks up the parent patient, so a
    -- cascade delete whose patient row is already gone is recorded normally.
    v_action := 'delete';
    v_old := to_jsonb(OLD);
    v_row := v_old;

  else
    -- The triggers below are declared for INSERT/UPDATE/DELETE only.
    return null;
  end if;

  -- Actor. NULL auth.uid() is a system write (SQL editor, service role) and
  -- is recorded as such. A signed-in user with no nurses row cannot pass the
  -- facility RLS policies today, but if one ever writes through a path that
  -- bypasses RLS, recording NULL with a flag keeps the write working instead
  -- of failing on audit_log's nurse_id foreign key.
  if v_actor is not null
     and not exists (select 1 from public.nurses n where n.id = v_actor) then
    v_actor := null;
    v_unresolved := true;
  end if;

  v_details := jsonb_build_object(
    'columns', to_jsonb(v_columns),
    'events',  to_jsonb(v_events)
  );
  if v_unresolved then
    v_details := v_details || jsonb_build_object('actor_unresolved', true);
  end if;

  insert into public.audit_log
    (nurse_id, facility_id, patient_id, action, resource_type, resource_id, details, created_at)
  values (
    v_actor,
    (v_row ->> 'facility_id')::uuid,   -- NULL passes through; such a row is visible to no nurse
    case
      when v_resource_type = 'patient' then (v_row ->> 'id')::uuid
      else (v_row ->> 'patient_id')::uuid   -- tasks.patient_id is nullable
    end,
    v_action,
    v_resource_type,
    (v_row ->> 'id')::uuid,
    v_details,
    -- Clock time, not transaction time: several rows written by one request
    -- (a bulk cancel, a cascade delete) keep their real order in the history.
    clock_timestamp()
  );

  return null;
end;
$$;

comment on function public.audit_row_change() is
  'AFTER trigger for patients/tasks/notes. Writes one audit_log row per real change: column names and derived events only, never field values. See 0012_audit_log_triggers.sql.';

-- Trigger functions cannot be called through the Data API, but Supabase's
-- default privileges grant EXECUTE on new functions to anon/authenticated.
-- Remove it anyway: nothing should call this except the triggers.
revoke all on function public.audit_row_change() from public, anon, authenticated;

-- 4. Triggers ---------------------------------------------------------------

create or replace trigger audit_patients
  after insert or update or delete on public.patients
  for each row execute function public.audit_row_change('patient');

create or replace trigger audit_tasks
  after insert or update or delete on public.tasks
  for each row execute function public.audit_row_change('task');

create or replace trigger audit_notes
  after insert or update or delete on public.notes
  for each row execute function public.audit_row_change('note');

-- 5. Read access and append-only --------------------------------------------
--
-- The one new policy approved for this change (decisions.md, 2026-11-16):
-- a nurse can read audit rows for their own facility, nothing else. No
-- other policy anywhere is created, altered or dropped.

create policy "audit_log_select_same_facility" on public.audit_log
  for select to authenticated
  using (facility_id = public.get_my_facility_id());

grant select on public.audit_log to authenticated;

-- Append-only: no UPDATE or DELETE policy exists, and the privileges are
-- revoked as well. TRUNCATE is revoked because RLS does not apply to it.
revoke update, delete, truncate on public.audit_log from authenticated, anon;

-- No client-side inserts, ever: the triggers above are the only writer.
-- This is a grant change, not a policy change. The 0001 policy
-- "audit_log_insert_self" is deliberately left in place, untouched, and is
-- now inert. It checks nurse_id but not facility_id, so with SELECT now
-- open it would have let any nurse plant fake history in another facility.
-- No client code has ever inserted into audit_log (checked by grep).
revoke insert on public.audit_log from authenticated, anon;

commit;
