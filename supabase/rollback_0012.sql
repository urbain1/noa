-- rollback_0012.sql
--
-- Undoes supabase/migrations/0012_audit_log_triggers.sql. Safe to run on its
-- own, safe to run twice, and safe to run when 0012 was never applied: every
-- statement is IF EXISTS or a grant/revoke, which are no-ops when already in
-- the target state. One transaction, so it applies fully or not at all.
--
-- Independent of 0013: rolling this back does not touch edit locking.
--
-- What it leaves behind, on purpose:
--   - Existing audit_log rows are KEPT. Only the patient_id column is
--     dropped, so those rows lose their patient link but keep who, what and
--     when. Export them first if you want the link
--     (select * from audit_log where patient_id is not null).
--   - UPDATE, DELETE and TRUNCATE on audit_log stay revoked from
--     authenticated and anon. 0001 never granted them, no client has ever
--     used them, and re-granting would only reopen a hole.
--   - INSERT is re-granted to authenticated, restoring exactly what 0001
--     granted. The 0001 policy "audit_log_insert_self" was never touched.
--   - SELECT is revoked from authenticated. Before 0012 it may have been
--     present through Supabase's project-level default grants (see the
--     corrected comment in 0001), but with no SELECT policy it returned zero
--     rows either way, so nothing a client could see changes.
--
-- After rollback the app keeps working: the History dialog shows its
-- "not available yet" message and the stale-write check names "someone"
-- instead of a nurse.

begin;

drop trigger if exists audit_patients on public.patients;
drop trigger if exists audit_tasks on public.tasks;
drop trigger if exists audit_notes on public.notes;

drop function if exists public.audit_row_change();

drop policy if exists "audit_log_select_same_facility" on public.audit_log;

revoke select on public.audit_log from authenticated;
grant insert on public.audit_log to authenticated;

drop index if exists public.audit_log_facility_patient_created_idx;
drop index if exists public.audit_log_resource_created_idx;

alter table public.audit_log drop column if exists patient_id;

commit;
