-- 0009_notice_acknowledgment_rpc.sql
-- Lets a nurse record their own acknowledgment of the mandatory data-entry
-- notice (0008_notice_acknowledgment.sql).
--
-- Same reasoning as set_my_language (0007_nurse_language_rpc.sql): `nurses`
-- grants clients select + insert only (0001), no UPDATE policy, so a direct
-- client-side update has nowhere to land. A narrow SECURITY DEFINER function
-- writes exactly one column, for exactly the calling user, rather than
-- opening a row-level update policy that could also let a nurse rewrite
-- their own `facility_id`.
--
-- Not needed for the brand-new-signup path: there, the nurses row doesn't
-- exist yet at the point the notice is shown, so the app stamps
-- `notice_acknowledged_at` directly in the same insert that creates the row
-- (FacilityScreen), which the existing `nurses_insert_self` policy already
-- allows for any column on a nurse's own new row.
--
-- search_path is pinned, as for get_my_facility_id in 0002.

create or replace function acknowledge_notice()
returns void
language sql
security definer
set search_path = public
as $$
  update nurses
     set notice_acknowledged_at = now()
   where id = auth.uid();
$$;

revoke all on function acknowledge_notice() from public;
grant execute on function acknowledge_notice() to authenticated;
