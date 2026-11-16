-- verify_audit_log.sql
--
-- Exercises every case 0012_audit_log_triggers.sql has to handle, against the
-- real database, and prints one PASS/FAIL row per check.
--
-- HOW TO RUN: paste the whole file into the Supabase SQL editor and press Run,
-- after applying 0012. The result grid shows a SUMMARY row first, then one
-- row per check. A FAIL row's `detail` says what was found instead.
--
-- IT CHANGES NOTHING. Every row it creates (two throwaway facilities, two
-- auth users, two nurses, a Patient_Test_9001 patient, tasks, notes, alerts
-- and all their audit rows) is written inside a sub-transaction that is
-- always rolled back at the end, pass or fail. The last check confirms the
-- rollback happened. Only a temp table and two temp helper functions are
-- left, in this session's private pg_temp schema, gone when the session ends.
--
-- What it covers:
--   1. Static: privileges, the one SELECT policy, the trigger function's
--      SECURITY DEFINER + pinned search_path, and that its owner can write
--      audit_log without being stopped by RLS.
--   2. Old client: every write shape in apps/web/src/lib/patients.js at the
--      deployed commit 7d81de0 (identical to the current file), sent as the
--      `authenticated` role with a nurse's JWT claims, through RLS, the same
--      way PostgREST sends them. Each must succeed and log exactly what it
--      should: action, type, record, patient, facility, actor, changed
--      column names, derived events. A save that changes nothing logs
--      nothing. No field value (description, diagnosis, note text, label,
--      location, transcript) appears anywhere in the log.
--   3. Read access: a nurse sees their own facility's history, a nurse at
--      another facility sees none of it, anon sees nothing.
--   4. Append-only: a nurse cannot UPDATE, DELETE or INSERT audit rows.
--   5. System cases: no signed-in user, a signed-in user with no nurses row,
--      a discharge, a task with no patient, a hard patient delete cascading
--      to tasks and notes (history survives), and a row with a NULL facility.

drop table if exists pg_temp.audit_verify_results;
create temp table audit_verify_results (n int, result text, check_name text, detail text);

-- One result entry, as a one-element jsonb array to append to the running list.
create or replace function pg_temp.av_result(p_check text, p_ok boolean, p_detail text default null)
returns jsonb
language sql
as $f$
  select jsonb_build_array(jsonb_build_object(
    'check',  p_check,
    'ok',     coalesce(p_ok, false),
    'detail', case when coalesce(p_ok, false) then null else coalesce(p_detail, 'condition was false') end
  ));
$f$;

-- True when exactly the expected audit row exists for a record.
-- plpgsql, so it is only compiled when first called (after the pre-flight).
create or replace function pg_temp.av_row_exists(
  p_resource uuid, p_action text, p_type text, p_patient uuid, p_facility uuid,
  p_actor uuid, p_columns text[], p_events text[]
)
returns boolean
language plpgsql
as $f$
begin
  return exists (
    select 1
      from public.audit_log a
     where a.resource_id = p_resource
       and a.action = p_action
       and a.resource_type = p_type
       and a.patient_id is not distinct from p_patient
       and a.facility_id is not distinct from p_facility
       and a.nurse_id is not distinct from p_actor
       and a.details -> 'columns' = to_jsonb(p_columns)
       and a.details -> 'events' = to_jsonb(p_events)
  );
end;
$f$;

-- What the log actually holds for a record, for FAIL details. Column names,
-- events and ids only, which is all the log ever holds.
create or replace function pg_temp.av_describe(p_resource uuid)
returns text
language plpgsql
as $f$
begin
  return coalesce((
    select string_agg(
             format('%s %s cols=%s events=%s actor=%s',
                    a.action, a.resource_type, a.details -> 'columns', a.details -> 'events',
                    coalesce(a.nurse_id::text, 'null')),
             ' | ' order by a.created_at)
      from public.audit_log a
     where a.resource_id = p_resource
  ), 'no audit rows');
end;
$f$;

do $verify$
declare
  v_results jsonb := '[]'::jsonb;
  v_step    text  := 'pre-flight';

  sfx      text := substr(md5(random()::text), 1, 8);
  fac_a    uuid := gen_random_uuid();
  fac_b    uuid := gen_random_uuid();
  nurse_a  uuid := gen_random_uuid();
  nurse_b  uuid := gen_random_uuid();
  ghost    uuid := gen_random_uuid();   -- a signed-in user with no nurses row
  claims_a text := json_build_object('sub', nurse_a, 'role', 'authenticated')::text;
  claims_b text := json_build_object('sub', nurse_b, 'role', 'authenticated')::text;

  pat     uuid;
  task1   uuid;
  task2   uuid;
  dis1    uuid;
  dis2    uuid;
  note1   uuid;
  orphan  uuid;
  nullfac uuid;

  n  bigint;
  m  bigint;
  ok boolean;
  d  text;
begin
  -- Pre-flight -------------------------------------------------------------
  if not exists (
       select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'audit_log' and column_name = 'patient_id')
     or (select count(*) from pg_trigger
          where not tgisinternal
            and tgname in ('audit_patients', 'audit_tasks', 'audit_notes')) < 3 then
    insert into audit_verify_results values
      (0, 'FAIL', 'SUMMARY', '0012 is not applied: audit_log.patient_id or the three audit triggers are missing. Apply 0012 first.');
    return;
  end if;

  -- 1. Static checks --------------------------------------------------------
  v_results := v_results || pg_temp.av_result(
    'static: authenticated can SELECT audit_log',
    has_table_privilege('authenticated', 'public.audit_log', 'SELECT'));
  v_results := v_results || pg_temp.av_result(
    'static: authenticated cannot INSERT, UPDATE, DELETE or TRUNCATE audit_log',
    not (has_table_privilege('authenticated', 'public.audit_log', 'INSERT')
         or has_table_privilege('authenticated', 'public.audit_log', 'UPDATE')
         or has_table_privilege('authenticated', 'public.audit_log', 'DELETE')
         or has_table_privilege('authenticated', 'public.audit_log', 'TRUNCATE')));
  v_results := v_results || pg_temp.av_result(
    'static: anon cannot INSERT, UPDATE, DELETE or TRUNCATE audit_log',
    not (has_table_privilege('anon', 'public.audit_log', 'INSERT')
         or has_table_privilege('anon', 'public.audit_log', 'UPDATE')
         or has_table_privilege('anon', 'public.audit_log', 'DELETE')
         or has_table_privilege('anon', 'public.audit_log', 'TRUNCATE')));

  select string_agg(format('%s (%s, roles %s)', policyname, cmd, roles), '; ')
    into d
    from pg_policies
   where schemaname = 'public' and tablename = 'audit_log';
  v_results := v_results || pg_temp.av_result(
    'static: audit_log policies are exactly the 0001 insert policy plus the new facility SELECT policy',
    (select count(*) from pg_policies where schemaname = 'public' and tablename = 'audit_log') = 2
      and exists (select 1 from pg_policies
                   where schemaname = 'public' and tablename = 'audit_log'
                     and policyname = 'audit_log_select_same_facility'
                     and cmd = 'SELECT'
                     and roles = '{authenticated}'
                     and qual like '%get_my_facility_id()%'),
    d);

  select p.prosecdef and 'search_path=""' = any (p.proconfig),
         format('prosecdef=%s proconfig=%s', p.prosecdef, p.proconfig)
    into ok, d
    from pg_proc p
   where p.oid = 'public.audit_row_change()'::regprocedure;
  v_results := v_results || pg_temp.av_result(
    'static: audit_row_change is SECURITY DEFINER with search_path pinned to empty', ok, d);

  select (p.proowner = c.relowner) or r.rolbypassrls,
         format('function owner=%s, audit_log owner=%s, owner bypassrls=%s',
                r.rolname, pg_get_userbyid(c.relowner), r.rolbypassrls)
    into ok, d
    from pg_proc p
    join pg_roles r on r.oid = p.proowner
    cross join pg_class c
   where p.oid = 'public.audit_row_change()'::regprocedure
     and c.oid = 'public.audit_log'::regclass;
  v_results := v_results || pg_temp.av_result(
    'static: trigger function owner writes audit_log without RLS (owns it, or bypasses RLS)', ok, d);

  -- Everything below is rolled back ----------------------------------------
  begin
    v_step := 'setup';
    insert into public.facilities (id, name) values
      (fac_a, 'Verify_Facility_A_' || sfx),
      (fac_b, 'Verify_Facility_B_' || sfx);

    insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
      (nurse_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'verify-nurse-a-' || sfx || '@example.invalid', '{}'::jsonb, '{}'::jsonb, now(), now()),
      (nurse_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'verify-nurse-b-' || sfx || '@example.invalid', '{}'::jsonb, '{}'::jsonb, now(), now());

    insert into public.nurses (id, email, name, facility_id) values
      (nurse_a, 'verify-nurse-a-' || sfx || '@example.invalid', 'Verify Nurse Alpha', fac_a),
      (nurse_b, 'verify-nurse-b-' || sfx || '@example.invalid', 'Verify Nurse Bravo', fac_b);

    -- 2. Old client write shapes, as nurse A, through RLS --------------------
    perform set_config('request.jwt.claims', claims_a, true);
    set local role authenticated;

    v_step := 'old client: createPatient';
    insert into public.patients
      (facility_id, label, diagnosis, code_status, attending_physician, allergies, admission_date, location_label, age)
    values
      (fac_a, 'Patient_Test_9001', 'VERIFY_MARKER_DIAGNOSIS', 'Full Code', null,
       array['VERIFY_MARKER_ALLERGY'], current_date, 'VERIFY_MARKER_LOCATION', 70)
    returning id into pat;

    -- updatePatient always sends every editable field; only two change here.
    v_step := 'old client: updatePatient';
    update public.patients
       set diagnosis = 'VERIFY_MARKER_DIAGNOSIS_2', code_status = 'Full Code',
           allergies = array['VERIFY_MARKER_ALLERGY'], admission_date = current_date,
           location_label = 'VERIFY_MARKER_LOCATION', age = 71
     where id = pat;

    v_step := 'old client: identical re-save of the patient';
    update public.patients
       set diagnosis = 'VERIFY_MARKER_DIAGNOSIS_2', code_status = 'Full Code',
           allergies = array['VERIFY_MARKER_ALLERGY'], admission_date = current_date,
           location_label = 'VERIFY_MARKER_LOCATION', age = 71
     where id = pat;

    v_step := 'old client: createTask';
    insert into public.tasks
      (facility_id, patient_id, created_by, description, department, priority, deadline, raw_transcript)
    values
      (fac_a, pat, nurse_a, 'VERIFY_MARKER_TASK', 'Lab', 'Routine', now() + interval '2 hours', 'VERIFY_MARKER_TRANSCRIPT')
    returning id into task1;

    v_step := 'old client: completeTask';
    update public.tasks set status = 'Completed', completed_at = now(), completed_by = nurse_a where id = task1;

    v_step := 'old client: updateTask back to Pending';
    update public.tasks set status = 'Pending', completed_at = null, completed_by = null where id = task1;

    v_step := 'old client: updateTask priority + deadline';
    update public.tasks set priority = 'Stat', deadline = now() + interval '1 hour' where id = task1;

    v_step := 'old client: assignTask';
    update public.tasks set assigned_to = nurse_a where id = task1;

    v_step := 'old client: assignTask(null)';
    update public.tasks set assigned_to = null where id = task1;

    -- updateTask with a non-Completed status also sends completed_at and
    -- completed_by as null; they already are, so only status changes.
    v_step := 'old client: updateTask status Delayed';
    update public.tasks set status = 'Delayed', completed_at = null, completed_by = null where id = task1;

    v_step := 'old client: repageTask';
    update public.tasks set status = 'Pending', last_repaged_at = now() where id = task1;
    insert into public.alerts (task_id, facility_id, type, triggered_at) values (task1, fac_a, 'delay', now());

    -- priority is already Stat, so only escalated_at changes.
    v_step := 'old client: escalateTask';
    update public.tasks set priority = 'Stat', escalated_at = now() where id = task1;
    insert into public.alerts (task_id, facility_id, type, triggered_at) values (task1, fac_a, 'escalation', now());

    v_step := 'old client: createDischargeTasks (one multi-row insert)';
    insert into public.tasks
      (facility_id, patient_id, created_by, description, department, priority, deadline, task_type)
    values
      (fac_a, pat, nurse_a, 'VERIFY_MARKER_DISCHARGE_1', 'Nursing', 'Routine', null, 'discharge'),
      (fac_a, pat, nurse_a, 'VERIFY_MARKER_DISCHARGE_2', 'Social Work', 'Routine', null, 'discharge');
    select id into dis1 from public.tasks where patient_id = pat and task_type = 'discharge' and department = 'Nursing';
    select id into dis2 from public.tasks where patient_id = pat and task_type = 'discharge' and department = 'Social Work';

    v_step := 'old client: cancelDischargeTasks (one bulk update)';
    update public.tasks set status = 'Cancelled' where id in (dis1, dis2);

    v_step := 'old client: addNote';
    insert into public.notes (facility_id, patient_id, nurse_id, content, type)
    values (fac_a, pat, nurse_a, 'VERIFY_MARKER_NOTE', 'clinical')
    returning id into note1;

    v_step := 'old client: createTask (kept for the cascade test)';
    insert into public.tasks (facility_id, patient_id, created_by, description, department, priority, deadline, raw_transcript)
    values (fac_a, pat, nurse_a, 'VERIFY_MARKER_TASK_2', 'Pharmacy', 'Routine', null, null)
    returning id into task2;

    v_step := 'old client: deleteTask (hard delete)';
    delete from public.tasks where id = task1;

    reset role;
    perform set_config('request.jwt.claims', '{}', true);

    v_step := 'assertions: old client writes';
    v_results := v_results || pg_temp.av_result(
      'old client: every write shape above succeeded through RLS as a nurse', true);

    v_results := v_results || pg_temp.av_result(
      'createPatient: logged as create, by nurse A, facility A, patient set',
      pg_temp.av_row_exists(pat, 'create', 'patient', pat, fac_a, nurse_a, '{}', '{}'),
      pg_temp.av_describe(pat));
    v_results := v_results || pg_temp.av_result(
      'updatePatient: only the changed columns are named (age, diagnosis)',
      pg_temp.av_row_exists(pat, 'update', 'patient', pat, fac_a, nurse_a, '{age,diagnosis}', '{}'),
      pg_temp.av_describe(pat));
    select count(*) into n from public.audit_log where resource_id = pat;
    v_results := v_results || pg_temp.av_result(
      'no-op update: an identical re-save logs nothing (2 rows for the patient, not 3)',
      n = 2, format('%s rows: %s', n, pg_temp.av_describe(pat)));

    v_results := v_results || pg_temp.av_result(
      'createTask: logged as create with the parent patient_id',
      pg_temp.av_row_exists(task1, 'create', 'task', pat, fac_a, nurse_a, '{}', '{}'),
      pg_temp.av_describe(task1));
    v_results := v_results || pg_temp.av_result(
      'completeTask: event "completed"',
      pg_temp.av_row_exists(task1, 'update', 'task', pat, fac_a, nurse_a, '{completed_at,completed_by,status}', '{completed}'),
      pg_temp.av_describe(task1));
    v_results := v_results || pg_temp.av_result(
      'updateTask off Completed: event "reopened"',
      pg_temp.av_row_exists(task1, 'update', 'task', pat, fac_a, nurse_a, '{completed_at,completed_by,status}', '{reopened}'),
      pg_temp.av_describe(task1));
    v_results := v_results || pg_temp.av_result(
      'updateTask priority + deadline: columns only, no event',
      pg_temp.av_row_exists(task1, 'update', 'task', pat, fac_a, nurse_a, '{deadline,priority}', '{}'),
      pg_temp.av_describe(task1));
    v_results := v_results || pg_temp.av_result(
      'assignTask: event "assigned"',
      pg_temp.av_row_exists(task1, 'update', 'task', pat, fac_a, nurse_a, '{assigned_to}', '{assigned}'),
      pg_temp.av_describe(task1));
    v_results := v_results || pg_temp.av_result(
      'assignTask(null): event "unassigned"',
      pg_temp.av_row_exists(task1, 'update', 'task', pat, fac_a, nurse_a, '{assigned_to}', '{unassigned}'),
      pg_temp.av_describe(task1));
    v_results := v_results || pg_temp.av_result(
      'updateTask to Delayed: only status named, no event',
      pg_temp.av_row_exists(task1, 'update', 'task', pat, fac_a, nurse_a, '{status}', '{}'),
      pg_temp.av_describe(task1));
    v_results := v_results || pg_temp.av_result(
      'repageTask: columns only, Delayed to Pending is not "reopened"',
      pg_temp.av_row_exists(task1, 'update', 'task', pat, fac_a, nurse_a, '{last_repaged_at,status}', '{}'),
      pg_temp.av_describe(task1));
    v_results := v_results || pg_temp.av_result(
      'escalateTask: only escalated_at (priority was already Stat)',
      pg_temp.av_row_exists(task1, 'update', 'task', pat, fac_a, nurse_a, '{escalated_at}', '{}'),
      pg_temp.av_describe(task1));
    v_results := v_results || pg_temp.av_result(
      'deleteTask: logged as delete, patient_id kept',
      pg_temp.av_row_exists(task1, 'delete', 'task', pat, fac_a, nurse_a, '{}', '{}'),
      pg_temp.av_describe(task1));
    v_results := v_results || pg_temp.av_result(
      'createDischargeTasks: one create row per inserted task',
      pg_temp.av_row_exists(dis1, 'create', 'task', pat, fac_a, nurse_a, '{}', '{}')
        and pg_temp.av_row_exists(dis2, 'create', 'task', pat, fac_a, nurse_a, '{}', '{}'),
      pg_temp.av_describe(dis1) || ' || ' || pg_temp.av_describe(dis2));
    v_results := v_results || pg_temp.av_result(
      'cancelDischargeTasks: event "cancelled" on each row of the bulk update',
      pg_temp.av_row_exists(dis1, 'update', 'task', pat, fac_a, nurse_a, '{status}', '{cancelled}')
        and pg_temp.av_row_exists(dis2, 'update', 'task', pat, fac_a, nurse_a, '{status}', '{cancelled}'),
      pg_temp.av_describe(dis1) || ' || ' || pg_temp.av_describe(dis2));
    v_results := v_results || pg_temp.av_result(
      'addNote: logged as create, type note, with the parent patient_id',
      pg_temp.av_row_exists(note1, 'create', 'note', pat, fac_a, nurse_a, '{}', '{}'),
      pg_temp.av_describe(note1));

    select count(*) into n
      from public.audit_log a
     where a.resource_id in (select al.id from public.alerts al where al.task_id = task1);
    v_results := v_results || pg_temp.av_result(
      'alerts are not audited (out of scope) and the repage/escalate alert inserts still work',
      n = 0, format('%s audit rows point at alert ids', n));

    select count(*) into n
      from public.audit_log a
     where a.facility_id = fac_a
       and (a.details::text like '%VERIFY_MARKER%' or a.details::text like '%Patient_Test_9001%');
    v_results := v_results || pg_temp.av_result(
      'no field value is copied into the log (no description, diagnosis, note, label, location, transcript)',
      n = 0, format('%s audit rows contain a seeded value', n));

    -- 3. Read access ---------------------------------------------------------
    v_step := 'read access';
    select count(*) into m from public.audit_log where patient_id = pat;

    perform set_config('request.jwt.claims', claims_a, true);
    set local role authenticated;
    select count(*) into n from public.audit_log where patient_id = pat;
    reset role;
    v_results := v_results || pg_temp.av_result(
      'SELECT policy: nurse A sees all of facility A''s rows for the patient',
      n = m and n > 0, format('nurse A sees %s of %s', n, m));

    perform set_config('request.jwt.claims', claims_b, true);
    set local role authenticated;
    select count(*) into n from public.audit_log where facility_id = fac_a;
    reset role;
    v_results := v_results || pg_temp.av_result(
      'SELECT policy: nurse B (another facility) sees none of facility A''s rows',
      n = 0, format('nurse B sees %s rows', n));

    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    set local role anon;
    begin
      select count(*) into n from public.audit_log;
    exception when insufficient_privilege then
      n := 0;
    end;
    reset role;
    v_results := v_results || pg_temp.av_result(
      'anon sees no audit rows', n = 0, format('anon sees %s rows', n));

    -- 4. Append-only, as nurse A -----------------------------------------------
    v_step := 'append-only';
    perform set_config('request.jwt.claims', claims_a, true);
    set local role authenticated;

    begin
      update public.audit_log set action = action where patient_id = pat;
      d := 'UPDATE was permitted';
    exception when insufficient_privilege then
      d := null;
    end;
    v_results := v_results || pg_temp.av_result('append-only: nurse cannot UPDATE audit_log', d is null, d);

    begin
      delete from public.audit_log where patient_id = pat;
      d := 'DELETE was permitted';
    exception when insufficient_privilege then
      d := null;
    end;
    v_results := v_results || pg_temp.av_result('append-only: nurse cannot DELETE from audit_log', d is null, d);

    begin
      insert into public.audit_log (nurse_id, facility_id, patient_id, action, resource_type, resource_id, details)
      values (nurse_a, fac_b, pat, 'create', 'patient', pat, '{}'::jsonb);
      d := 'INSERT was permitted';
    exception when insufficient_privilege then
      d := null;
    end;
    v_results := v_results || pg_temp.av_result('append-only: nurse cannot INSERT into audit_log', d is null, d);

    reset role;
    perform set_config('request.jwt.claims', '{}', true);

    -- 5. System cases, as postgres -------------------------------------------
    v_step := 'system: write with no signed-in user';
    update public.patients set location_label = 'VERIFY_MARKER_LOCATION_2' where id = pat;
    select pg_temp.av_row_exists(pat, 'update', 'patient', pat, fac_a, null, '{location_label}', '{}')
           and not exists (select 1 from public.audit_log
                            where resource_id = pat and details -> 'columns' = '["location_label"]'::jsonb
                              and details ? 'actor_unresolved')
      into ok;
    v_results := v_results || pg_temp.av_result(
      'null auth.uid(): recorded with nurse_id null (system), no error', ok, pg_temp.av_describe(pat));

    v_step := 'system: signed-in user with no nurses row';
    perform set_config('request.jwt.claims', json_build_object('sub', ghost, 'role', 'authenticated')::text, true);
    update public.patients set age = 72 where id = pat;
    perform set_config('request.jwt.claims', '{}', true);
    select exists (select 1 from public.audit_log
                    where resource_id = pat and nurse_id is null
                      and details -> 'columns' = '["age"]'::jsonb
                      and details ->> 'actor_unresolved' = 'true')
      into ok;
    v_results := v_results || pg_temp.av_result(
      'actor with no nurses row: nurse_id null + actor_unresolved, no FK error', ok, pg_temp.av_describe(pat));

    v_step := 'system: discharge';
    update public.patients set is_discharged = true, discharged_at = now() where id = pat;
    v_results := v_results || pg_temp.av_result(
      'discharge: event "discharged"',
      pg_temp.av_row_exists(pat, 'update', 'patient', pat, fac_a, null, '{discharged_at,is_discharged}', '{discharged}'),
      pg_temp.av_describe(pat));

    v_step := 'system: task with no patient';
    insert into public.tasks (facility_id, patient_id, description, department)
    values (fac_a, null, 'VERIFY_MARKER_ORPHAN', 'Other')
    returning id into orphan;
    v_results := v_results || pg_temp.av_result(
      'task with a null patient_id: logged with patient_id null, no error',
      pg_temp.av_row_exists(orphan, 'create', 'task', null, fac_a, null, '{}', '{}'),
      pg_temp.av_describe(orphan));

    v_step := 'system: hard delete of a patient, cascading to tasks and notes';
    delete from public.patients where id = pat;
    v_results := v_results || pg_temp.av_result(
      'cascade delete: patient, remaining tasks and note each logged as delete with patient_id kept',
      pg_temp.av_row_exists(pat,   'delete', 'patient', pat, fac_a, null, '{}', '{}')
        and pg_temp.av_row_exists(task2, 'delete', 'task', pat, fac_a, null, '{}', '{}')
        and pg_temp.av_row_exists(dis1,  'delete', 'task', pat, fac_a, null, '{}', '{}')
        and pg_temp.av_row_exists(dis2,  'delete', 'task', pat, fac_a, null, '{}', '{}')
        and pg_temp.av_row_exists(note1, 'delete', 'note', pat, fac_a, null, '{}', '{}'),
      pg_temp.av_describe(pat) || ' || ' || pg_temp.av_describe(task2) || ' || ' || pg_temp.av_describe(note1));

    select count(*) into n from public.audit_log where patient_id = pat;
    v_results := v_results || pg_temp.av_result(
      'history survives the hard delete (rows still found by patient_id)',
      n >= 20, format('%s rows for the deleted patient', n));

    v_step := 'system: row with a null facility';
    create temp table verify_null_facility (
      id uuid primary key default gen_random_uuid(),
      facility_id uuid,
      patient_id uuid
    );
    create trigger audit_verify_null_facility
      after insert on verify_null_facility
      for each row execute function public.audit_row_change('task');
    insert into verify_null_facility (facility_id, patient_id) values (null, null) returning id into nullfac;
    v_results := v_results || pg_temp.av_result(
      'null facility: logged with facility_id null, no error',
      pg_temp.av_row_exists(nullfac, 'create', 'task', null, null, null, '{}', '{}'),
      pg_temp.av_describe(nullfac));

    perform set_config('request.jwt.claims', claims_a, true);
    set local role authenticated;
    select count(*) into n from public.audit_log where resource_id = nullfac;
    reset role;
    perform set_config('request.jwt.claims', '{}', true);
    v_results := v_results || pg_temp.av_result(
      'null facility: that row is visible to no nurse', n = 0, format('nurse A sees %s', n));

    -- Always roll everything above back.
    v_step := 'rollback';
    raise exception using errcode = 'P0001', message = 'audit_verify_rollback';
  exception
    when others then
      if not (sqlstate = 'P0001' and sqlerrm = 'audit_verify_rollback') then
        v_results := v_results || pg_temp.av_result(
          'no unexpected error (stopped at step: ' || v_step || ')',
          false, sqlstate || ': ' || sqlerrm);
      end if;
  end;

  -- Confirm the rollback actually happened.
  select count(*) into n
    from (
      select id from public.facilities where id in (fac_a, fac_b)
      union all select id from auth.users where id in (nurse_a, nurse_b)
      union all select id from public.nurses where id in (nurse_a, nurse_b)
      union all select id from public.audit_log where facility_id in (fac_a, fac_b)
      union all select id from public.patients where facility_id in (fac_a, fac_b)
    ) leftovers;
  v_results := v_results || pg_temp.av_result(
    'cleanup: every test row was rolled back', n = 0, format('%s rows left behind', n));

  insert into audit_verify_results (n, result, check_name, detail)
  select x.ord,
         case when (x.e ->> 'ok')::boolean then 'PASS' else 'FAIL' end,
         x.e ->> 'check',
         x.e ->> 'detail'
    from jsonb_array_elements(v_results) with ordinality as x(e, ord);

  insert into audit_verify_results (n, result, check_name, detail)
  select 0,
         case when count(*) filter (where result = 'FAIL') = 0 then 'PASS' else 'FAIL' end,
         'SUMMARY',
         format('%s checks, %s failed', count(*), count(*) filter (where result = 'FAIL'))
    from audit_verify_results;
end
$verify$;

select result, check_name, detail
  from audit_verify_results
 order by n;
