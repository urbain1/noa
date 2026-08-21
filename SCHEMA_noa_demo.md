# Noa Health — Supabase Schema

## Tables

### nurses
```sql
create table nurses (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  name text not null,
  role text not null check (role in ('nurse', 'charge_nurse', 'admin')),
  unit_id uuid references units(id),
  shift text check (shift in ('day', 'night', 'swing')),
  created_at timestamptz default now()
);
```

### units
```sql
create table units (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  hospital text not null,
  floor text,
  created_at timestamptz default now()
);
```

### patients
```sql
create table patients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  room text not null,
  unit_id uuid references units(id),
  admission_date date,
  diagnosis text,
  allergies text[],
  code_status text default 'Full Code',
  attending_physician text,
  is_discharged boolean default false,
  discharged_at timestamptz,
  created_at timestamptz default now()
);
```

### patient_assignments
```sql
create table patient_assignments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients(id) on delete cascade,
  nurse_id uuid references nurses(id) on delete cascade,
  shift text not null,
  assigned_date date not null default current_date,
  unique(patient_id, nurse_id, assigned_date, shift)
);
```

### tasks
```sql
create table tasks (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients(id) on delete cascade,
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
```

### notes
```sql
create table notes (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients(id) on delete cascade,
  nurse_id uuid references nurses(id),
  content text not null,
  type text default 'clinical' check (type in ('clinical', 'voice')),
  created_at timestamptz default now()
);
```

### suggestions
```sql
create table suggestions (
  id uuid primary key default gen_random_uuid(),
  note_id uuid references notes(id) on delete cascade,
  patient_id uuid references patients(id) on delete cascade,
  content text not null,
  accepted boolean default false,
  accepted_task_id uuid references tasks(id),
  created_at timestamptz default now()
);
```

### handoffs
```sql
create table handoffs (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid references units(id),
  patient_id uuid references patients(id),
  shift text not null,
  type text not null check (type in ('unit', 'patient')),
  content jsonb not null,
  generated_by uuid references nurses(id),
  generated_at timestamptz default now()
);
```

### alerts
```sql
create table alerts (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete cascade,
  type text not null check (type in ('delay', 'escalation')),
  triggered_at timestamptz default now(),
  resolved_at timestamptz,
  resolved_by uuid references nurses(id),
  resolution_note text
);
```

### audit_log
```sql
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  nurse_id uuid references nurses(id),
  action text not null,
  resource_type text not null,
  resource_id uuid,
  details jsonb,
  created_at timestamptz default now()
);
```

## Row Level Security Policies

```sql
-- Nurses see patients assigned to them
create policy "nurses_see_assigned_patients" on patients
  for select using (
    id in (
      select patient_id from patient_assignments
      where nurse_id = auth.uid()
      and assigned_date = current_date
    )
  );

-- Charge nurses see all patients in their unit
create policy "charge_nurses_see_unit" on patients
  for select using (
    unit_id in (
      select unit_id from nurses
      where id = auth.uid() and role in ('charge_nurse', 'admin')
    )
  );

-- Tasks readable by creating nurse + charge nurse of unit
create policy "tasks_read" on tasks
  for select using (
    created_by = auth.uid()
    or patient_id in (
      select p.id from patients p
      join nurses n on n.unit_id = p.unit_id
      where n.id = auth.uid() and n.role in ('charge_nurse', 'admin')
    )
  );

-- Nurses can create tasks for their assigned patients
create policy "tasks_insert" on tasks
  for insert with check (
    patient_id in (
      select patient_id from patient_assignments
      where nurse_id = auth.uid()
    )
  );

-- Notes readable by nurses assigned to the patient
create policy "notes_read" on notes
  for select using (
    patient_id in (
      select patient_id from patient_assignments
      where nurse_id = auth.uid()
    )
  );
```

## Real-time Subscriptions

Enable real-time on these tables:
- tasks (status changes push to dashboard)
- alerts (new alerts push to notification system)
- notes (new notes trigger suggestion generation)

```sql
alter publication supabase_realtime add table tasks;
alter publication supabase_realtime add table alerts;
alter publication supabase_realtime add table notes;
```
