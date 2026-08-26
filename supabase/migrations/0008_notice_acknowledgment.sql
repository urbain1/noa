-- 0008_notice_acknowledgment.sql
-- Tracks whether a nurse has acknowledged the mandatory data-entry
-- notice. Null means not yet acknowledged, including for nurses who
-- signed up before this notice existed, they'll be prompted on next
-- login too, nobody grandfathered out of seeing it.

alter table nurses
  add column if not exists notice_acknowledged_at timestamptz;
