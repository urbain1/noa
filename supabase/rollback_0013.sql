-- rollback_0013.sql
--
-- Undoes supabase/migrations/0013_edit_lock_realtime_policies.sql: drops the
-- two presence policies on realtime.messages. Safe on its own, safe to run
-- twice, safe when 0013 was never applied. Independent of 0012.
--
-- After rollback the app keeps working: joining the private lock channel is
-- refused, the app marks live locking as unavailable, nothing is disabled,
-- and saves are still protected by the stale-write check.

begin;

drop policy if exists "edit_locks_presence_read_same_facility" on realtime.messages;
drop policy if exists "edit_locks_presence_write_same_facility" on realtime.messages;

commit;
