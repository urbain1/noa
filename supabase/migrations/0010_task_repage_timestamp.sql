-- 0010_task_repage_timestamp.sql
-- Tracks the most recent repage time directly on the task, mirroring
-- how escalated_at already tracks escalation. Needed so "last repaged"
-- persists and survives reload, per today's UX spec. The alerts table
-- still logs every individual repage/escalation event as an audit
-- trail; this column is just the fast "what's the latest" read.

alter table tasks
  add column if not exists last_repaged_at timestamptz;
