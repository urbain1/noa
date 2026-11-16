-- 0013_edit_lock_realtime_policies.sql
--
-- Facility isolation for edit locking (decisions.md, 2026-11-16).
--
-- WRITTEN, NOT APPLIED. Independent of 0012: either can be applied or rolled
-- back without the other. Undo with supabase/rollback_0013.sql.
--
-- Edit locks are Supabase Realtime Presence on one channel per facility,
-- named 'edit-locks:<facility_id>'. A plain (public) Realtime channel is open
-- to anyone holding the publishable key who knows its name, and every
-- facility id is readable by any signed-in user (facilities_read_all, 0001).
-- So a channel name alone would let a nurse at one facility watch another
-- facility's lock traffic (nurse ids, record ids) and inject fake locks into
-- it. The app therefore joins the channel as a PRIVATE channel, which makes
-- Realtime check these two policies on realtime.messages before letting a
-- client receive or send presence on it.
--
-- Exactly two policies, approved in the same session as 0012. Both:
--   - apply to the `authenticated` role only;
--   - cover the 'presence' extension only (no broadcast, no DB changes);
--   - match only the topic built from the caller's own facility, via the
--     same get_my_facility_id() every facility policy already uses. A nurse
--     with no facility gets NULL, which matches nothing.
--
-- Effect on everything else: none. No policy on any public table changes.
-- Public channels don't consult realtime.messages policies, and the older
-- frontend build testers still run uses no Realtime at all.
--
-- If this is NOT applied, joining the private channel is refused, the app
-- marks locking as unavailable, nothing in the UI is disabled, and every
-- save still goes through the stale-write check.
--
-- Presence payloads carry nurse_id, record_type, record_id and two numbers
-- used to order claims (since, gen). No patient data.

begin;

create policy "edit_locks_presence_read_same_facility" on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'presence'
    and (select realtime.topic()) = 'edit-locks:' || (select public.get_my_facility_id())::text
  );

create policy "edit_locks_presence_write_same_facility" on realtime.messages
  for insert to authenticated
  with check (
    realtime.messages.extension = 'presence'
    and (select realtime.topic()) = 'edit-locks:' || (select public.get_my_facility_id())::text
  );

commit;
