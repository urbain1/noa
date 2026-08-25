-- 0001_init.sql
-- Base schema for Noa beta. Adapted from SCHEMA_noa_demo.md per decisions.md
-- (facility-scoped multi-tenancy, relaxed from per-nurse patient_assignments).
-- Review before applying to a real project; treat as a starting point for
-- Claude Code to refine once the actual signup/auth flow is built.

create table facilities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

-- One row per authenticated user. id matches auth.users.id so RLS
-- policies can key off auth.uid() directly.
create table nurses (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  name text not null,
  role text not null default 'nurse' check (role in ('nurse', 'charge_nurse', 'admin')),
  facility_id uuid references facilities(id) not null,
  created_at timestamptz default now()
);

-- Synthetic test patients only. `label` follows the Patient_Test_N
-- convention from SECURITY.md, never a real identifier.
create table patients (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid references facilities(id) not null,
  label text not null,
  diagnosis text,
  code_status text default 'Full Code',
  attending_physician text,
  is_discharged boolean default false,
  discharged_at timestamptz,
  created_at timestamptz default now()
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients(id) on delete cascade,
  facility_id uuid references facilities(id) not null, -- denormalized to keep RLS simple
  created_by uuid references nurses(id),
  description text not null,
  department text not null,
  status text not null default 'Pending' check (status in ('Pending', 'Confirmed', 'Delayed', 'Completed', 'Cancelled')),
  priority text not null default 'Routine' check (priority in ('Routine', 'Stat')),
  deadline timestamptz,
  completed_at timestamptz,
  escalated_at timestamptz,
  escalated_to uuid references nurses(id),
  raw_transcript text,
  created_at timestamptz default now()
);

create table notes (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients(id) on delete cascade,
  facility_id uuid references facilities(id) not null,
  nurse_id uuid references nurses(id),
  content text not null,
  type text default 'clinical' check (type in ('clinical', 'voice')),
  created_at timestamptz default now()
);

create table alerts (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete cascade,
  facility_id uuid references facilities(id) not null,
  type text not null check (type in ('delay', 'escalation')),
  triggered_at timestamptz default now(),
  resolved_at timestamptz,
  resolved_by uuid references nurses(id),
  resolution_note text
);

-- Exists per SECURITY.md, not wired to anything yet. Needed before real data.
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  nurse_id uuid references nurses(id),
  facility_id uuid references facilities(id),
  action text not null,
  resource_type text not null,
  resource_id uuid,
  details jsonb,
  created_at timestamptz default now()
);

-- Row Level Security -------------------------------------------------

alter table facilities enable row level security;
alter table nurses enable row level security;
alter table patients enable row level security;
alter table tasks enable row level security;
alter table notes enable row level security;
alter table alerts enable row level security;
alter table audit_log enable row level security;

-- Any authenticated user can list/create facilities: needed for the
-- signup search-or-create flow. See scenarios.md SC-12, SC-13.
create policy "facilities_read_all" on facilities
  for select using (auth.role() = 'authenticated');

create policy "facilities_insert_authenticated" on facilities
  for insert with check (auth.role() = 'authenticated');

-- Looks up the current user's facility_id via a SECURITY DEFINER
-- function rather than a direct subquery on nurses. A policy on nurses
-- that queries nurses directly triggers infinite recursion (Postgres
-- re-applies the same policy to the inner query). This function runs
-- with the privileges of its owner, bypassing RLS for this one lookup.
create or replace function get_my_facility_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select facility_id from nurses where id = auth.uid()
$$;

-- Nurses can see themselves and colleagues at the same facility.
create policy "nurses_read_same_facility" on nurses
  for select using (
    facility_id = get_my_facility_id()
  );

create policy "nurses_insert_self" on nurses
  for insert with check (id = auth.uid());

-- Facility-scoped tables: every nurse sees everything at their own
-- facility, nothing at any other. This is the primary privacy boundary
-- for the beta (scenarios.md SC-11) -- treat as security-critical even
-- though the data is synthetic, per CLAUDE.md.
create policy "patients_facility_scope" on patients
  for all
  using (facility_id = get_my_facility_id())
  with check (facility_id = get_my_facility_id());

create policy "tasks_facility_scope" on tasks
  for all
  using (facility_id = get_my_facility_id())
  with check (facility_id = get_my_facility_id());

create policy "notes_facility_scope" on notes
  for all
  using (facility_id = get_my_facility_id())
  with check (facility_id = get_my_facility_id());

create policy "alerts_facility_scope" on alerts
  for all
  using (facility_id = get_my_facility_id())
  with check (facility_id = get_my_facility_id());

create policy "audit_log_insert_self" on audit_log
  for insert with check (nurse_id = auth.uid());

-- Realtime -------------------------------------------------------------

alter publication supabase_realtime add table tasks;
alter publication supabase_realtime add table alerts;
alter publication supabase_realtime add table notes;

-- Data API grants ---------------------------------------------------------
-- Required because "Automatically expose new tables" is disabled at the
-- project level (Supabase's own recommendation). RLS above is still the
-- real access control; these grants just turn the Data API on for
-- authenticated users. No grants to `anon`, no unauthenticated access
-- anywhere in this schema.

grant usage on schema public to authenticated;

grant select, insert on facilities to authenticated;
grant select, insert on nurses to authenticated;
grant select, insert, update, delete on patients to authenticated;
grant select, insert, update, delete on tasks to authenticated;
grant select, insert, update, delete on notes to authenticated;
grant select, insert, update, delete on alerts to authenticated;
grant insert on audit_log to authenticated;
