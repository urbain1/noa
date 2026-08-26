-- 0007_nurse_language_rpc.sql
-- Lets a nurse change their own `preferred_language` (0006).
--
-- `nurses` grants clients select + insert only (0001), and has no UPDATE
-- policy, so the language toggle's write silently had nowhere to land: the
-- choice applied to the running session and was gone on the next sign-in.
--
-- Fixed with a narrow SECURITY DEFINER function rather than `grant update on
-- nurses` plus a `using (id = auth.uid())` policy. A row-level update policy
-- cannot restrict which columns are written, so it would also let a nurse
-- rewrite their own `facility_id` -- moving themselves into another facility
-- and reading its patients. That is the cross-facility leak CLAUDE.md rates
-- at the same severity as a real PHI leak. This function writes exactly one
-- column, for exactly the calling user, and `facility_id` and `role` stay
-- unwritable by any client.
--
-- search_path is pinned, as for get_my_facility_id in 0002.

create or replace function set_my_language(new_language text)
returns void
language sql
security definer
set search_path = public
as $$
  update nurses
     set preferred_language = new_language
   where id = auth.uid();
$$;

-- Invalid codes are rejected by the check constraint from 0006, which this
-- function does not bypass: SECURITY DEFINER changes who the statement runs
-- as, not which constraints apply.
revoke all on function set_my_language(text) from public;
grant execute on function set_my_language(text) to authenticated;
