# FINAL_REVIEW.md

Session of 2026-08-27. Branch `build-mvp`, one commit (`fa333f4`). Nothing
pushed, nothing deployed, no Supabase CLI command was run against the remote
database.

---

## 1. What you need to run manually

### Migration 0011

Paste this into the Supabase SQL editor. It is additive and reversible: four
new nullable columns/functions, no RLS policy touched, no existing column
dropped or altered, no data rewritten.

```sql
-- 1 + 2. Assignment and completion attribution
alter table tasks
  add column if not exists assigned_to uuid references nurses(id),
  add column if not exists completed_by uuid references nurses(id);

-- 3. Discharge-planning marker
alter table tasks
  add column if not exists task_type text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tasks_task_type_check'
  ) then
    alter table tasks
      add constraint tasks_task_type_check
      check (task_type is null or task_type in ('discharge'));
  end if;
end $$;

-- 4. Nurse display name (profile screen)
create or replace function set_my_name(new_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if new_name is null or btrim(new_name) = '' then
    raise exception 'Name cannot be empty';
  end if;

  update nurses
     set name = btrim(new_name)
   where id = auth.uid();
end;
$$;

revoke all on function set_my_name(text) from public;
grant execute on function set_my_name(text) to authenticated;
```

The file with its full reasoning is
`supabase/migrations/0011_task_assignment_and_discharge.sql`. It was written
but **not applied** — same convention as 0001–0010.

**Rollback**, if you want it:

```sql
drop function if exists set_my_name(text);
alter table tasks drop constraint if exists tasks_task_type_check;
alter table tasks drop column if exists task_type;
alter table tasks drop column if exists completed_by;
alter table tasks drop column if exists assigned_to;
```

### Why `set_my_name` is a function and not an UPDATE policy

Same reason as `set_my_language` (0007) and `acknowledge_notice` (0009):
`nurses` grants clients select + insert only, and a row-level UPDATE policy
cannot restrict *which* columns are written — it would also let a nurse
rewrite their own `facility_id` and read another facility's patients. That is
the cross-facility leak `CLAUDE.md` rates at the same severity as a real PHI
leak. The function writes one column, for `auth.uid()`, and nothing else.

### The Edge Function is NOT deployed

`supabase/functions/claude-proxy/index.ts` gained one new action,
`parsePatientFromVoice`, for Phase 9. I did not deploy it, as instructed.

**Voice patient capture works anyway.** The client calls the new action,
gets `Unknown action: parsePatientFromVoice` back from the deployed function,
logs it, and falls back to a local regex parser
(`parsePatientTranscriptFallback` in `VoiceCapture.jsx`) — which is required
regardless by `CLAUDE.md`'s "fallback parser required for every prompt" rule.
The fallback extracts less (label, age, code status, an explicitly-stated
diagnosis, a synthetic location label) and leaves the rest blank for the
nurse to fill in on the review form.

Deploy when you're ready and the same flow starts using Claude, with no
frontend change. Nothing else in the Edge Function was modified.

---

## 2. Files changed

**New**

| File | What it is |
|---|---|
| `supabase/migrations/0011_task_assignment_and_discharge.sql` | The migration above |
| `apps/web/src/utils/taskSort.js` | The one shared task ordering (Phase 2) |
| `apps/web/src/lib/nurses.js` | Read colleagues at this facility; rename self |
| `apps/web/src/components/TasksScreen.jsx` | The all-tasks screen (Phase 5) |
| `apps/web/src/components/AssigneeSelect.jsx` | Assignee picker, used in two places |
| `apps/web/src/components/ViewSwitcher.jsx` | The three-way header nav, shared by all three screens |
| `apps/web/src/components/ProfileScreen.jsx` | Name, email, sign out |

**Modified**

| File | What changed |
|---|---|
| `apps/web/src/App.jsx` | `view` state replaces the charge-view boolean; nurses loaded; discharge planning writes real tasks; completion records `completed_by`; assignment handler; voice-patient and profile wiring; sign-out clears session-scoped state |
| `apps/web/src/lib/patients.js` | `completeTask` takes a completer; `updateTask` accepts `assignedTo`; new `assignTask`, `createDischargeTasks`; missing-column detection |
| `apps/web/src/components/Dashboard.jsx` | ViewSwitcher, back-to-context bar, "Add by voice", empty state, focused-patient scroll |
| `apps/web/src/components/PatientCard.jsx` | Shared sort applied; three colour-differentiated action buttons on their own row; discharge badge prefers `task_type`; focus ring |
| `apps/web/src/components/ChargeNurseDashboard.jsx` | Section reorder; separate STAT/delayed figures; personnel overview; real patient columns; ViewSwitcher |
| `apps/web/src/components/DischargeDialog.jsx` | Real patient fields; async save with loading/error; "select at least one" |
| `apps/web/src/components/TopRightMenu.jsx` | Discharge list fixed; Profile entry; empty state; null-safe attention subtitle |
| `apps/web/src/components/TaskEditDialog.jsx` | Assignee picker in manual mode |
| `apps/web/src/components/VoiceCapture.jsx` | `mode="patient"` + local fallback parser |
| `apps/web/src/components/AddPatientDialog.jsx` | `initialFields` (the voice review step) + review warning |
| `apps/web/src/utils/claudeAPI.js` | `parsePatientFromVoice` wrapper |
| `supabase/functions/claude-proxy/index.ts` | `parsePatientFromVoice` handler (not deployed) |
| `apps/web/src/i18n/locales/{en,fr}.json` | 59 new keys, 1 changed (`discharge.title`) |
| `translations_review.csv` | Same, appended; `discharge.title` updated in place |

**Also in this commit, not written this session:** the Family Update wiring
(`PatientUpdateSummary.jsx` and its App/Dashboard/PatientCard/claudeAPI/Edge
Function hooks) was already uncommitted in the working tree when I started.
It looked complete, so I left it alone and it rode along in the commit rather
than being reverted or committed separately — the files had already been
edited further by this session's work by the time I could split them.

---

## 3. Per-phase manual test steps

Run these signed in as a nurse with at least two patients and a few tasks.
Where a step depends on 0011, it says so.

### Phase 1 — schema + completion attribution
1. Before applying 0011: complete a task. It should still complete normally
   (a warning appears in the console; no error dialog).
2. Apply 0011. Complete another task.
3. Unit View → Personnel: your row's **Completed** count includes the second
   task, not the first. The first appears in "completed by unknown".

### Phase 2 — shared sort
1. Give one patient: a Stat task due in 2h, a Routine task 1h overdue, a
   Routine task due tomorrow, and a Routine task with no deadline.
2. Expand that patient's task list: Stat first, overdue second, then the
   dated task, then the undated one.
3. Make the Stat task also overdue (set its deadline in the past). It stays
   at the top and appears **once**.
4. Open the Tasks screen: the same four tasks are in the same relative order.
5. Complete the Stat task: it drops out of the top group.

### Phase 3 — Discharge Patient (the bug fix)
1. Three-dot menu → "Discharge a patient".
2. The list shows each patient's `Patient_Test_N` label, with location label
   and diagnosis beneath. **Before this fix these lines were blank.**
3. Pick one: the dialog header shows the label, not an empty string.
4. With no patients, the list shows "No patients to discharge".

### Phase 4 — Discharge planning creates real tasks
1. From that dialog, tick both boxes, type a note, "Create Tasks".
2. The button shows "Saving...", then the dialog closes.
3. The patient card shows two new tasks (Nursing, Social Work) and the
   Discharge Planning badge. The note is appended to the first task only.
4. **Reload the page.** The tasks are still there — this is the real
   difference from the demo version, which lost them.
5. They appear in the Tasks screen and in Unit View's department counts.
6. Untick both boxes: the button is disabled with an explanatory line.

### Phase 5 — Tasks screen
1. Header → "Tasks". Every task at the facility, in Phase 2's order.
2. Each row: description, patient label, assignee (or "Unassigned"),
   priority, status, deadline.
3. Click the chevron: the row expands to the full task card with Complete /
   Edit / Repage / Escalate, working the same as in Patient View.
4. Click the task description: the task detail/edit dialog opens. Close it —
   you are back on the Tasks screen, not the home screen.
5. Click the patient label: you land on that patient's card, scrolled to and
   ringed in blue, task list already open, with "← Back to Tasks" at the top.
   Click it: back to the Tasks screen.
6. Type in the filter: matches on task text, patient label, location label
   and assignee name. Clear it: everything returns.
7. With no tasks at all, an empty-state line shows instead of a blank page.

### Phase 6 — assignment (needs 0011)
1. Expand a row on the Tasks screen → "Assigned to" → pick a colleague.
2. The row's assignee updates immediately; reload to confirm it persisted.
3. Set it back to "Unassigned" — that is a valid state, not an error.
4. Same picker in the task edit dialog (manual mode).
5. **Visibility must not change:** sign in as a second nurse at the same
   facility. They still see every task, including ones assigned to someone
   else. If that is not true, stop — something changed that shouldn't have.
6. If you test *before* applying 0011, you get a clear message naming
   migration 0011 rather than a raw Postgres error.

### Phase 7 — Unit View
1. Section order top to bottom: summary tiles, Patient Safety Flags,
   Attention Needed, **Task Status**, Personnel, Department Bottlenecks.
2. Attention Needed's heading shows two separate figures, e.g. "1 STAT · 2
   delayed", STAT in the stronger red. Never one merged number.
3. Make a task both Stat and overdue: it increments **both** figures. This is
   intentional.
4. Safety Flags and Attention rows now show the patient label and
   location/diagnosis — previously blank (same demo-era field bug as Phase 3).
5. Personnel: one row per nurse at the facility with Created / Assigned /
   Completed as three separate columns, plus unassigned-task and
   completed-by-unknown counts below.

### Phase 8 — action colours
1. On a patient card: Discharge Planning (green), SBAR Summary (blue),
   Family Update (purple), on their own row below the patient details.
2. All three use a -700/-800 text on a -50 background (≥7:1 on white) — a
   step darker than the previous blue-600, for phone screens in ward light.
   Each is also labelled, so colour is never the only signal.
3. On a narrow phone, they wrap instead of overflowing; the header row is now
   just the task count and the edit pencil.

### Phase 9 — voice patient creation
1. Patient list → "Add by voice".
2. Say: *"Patient Test 7, 74 years old, admitted with congestive heart
   failure, Test Room C."*
3. "Review Patient" → the **existing Add Patient form** opens pre-filled,
   with a warning to check every field.
4. Anything not clearly said is blank — never guessed.
5. Edit anything, then "Add Patient". Only this confirms creation.
6. Say something with no test label ("the gentleman in bed four"): the label
   field stays **blank**. It must never become a bed number or a name.
7. Cancel from the review form: no patient is created.

### Phase 10 — navigation
1. My Patients → Tasks → Unit View → My Patients: the header switcher
   highlights the current screen everywhere.
2. Tasks → patient → back: returns to Tasks.
3. Unit View → attention item → patient → back: returns to Unit View.
4. Generate a handoff from Unit View, close it: you are back on Unit View.
5. Open the profile from any screen and close it: back to that same screen.

### Profile
1. Three-dot menu → Profile.
2. Change your name → "Save name" (needs 0011). Reload: it persisted. Unit
   View's personnel list shows the new name.
3. "Sign out" works — this button did not exist before; the handler was in
   `App.jsx` but was never bound to anything.
4. Sign back in: you land on My Patients, not the profile screen, and no data
   from the previous session is on screen.
5. Email change: see the known issue below.

### Bilingual
Switch to French and repeat any of the above. Existing terminology is
unchanged (Relancer, Escalader, Relancé, Escaladé). Timestamps stay 24-hour
in French, 12-hour with AM/PM in English — including the new deadline column
on the Tasks screen.

---

## 4. Account deletion — proposal, no code

Not built, per instruction. Here is the decision it needs.

### Why it cannot work from client code today
Deleting an auth user requires the service-role key, which cannot go in the
frontend bundle (`CLAUDE.md`, hard rule). It needs a new Edge Function using
`SUPABASE_SERVICE_ROLE_KEY` as a secret, with `auth.getUser()` proving the
caller is deleting **their own** account and nothing else.

### Why it would fail even with that
`nurses(id)` is referenced by `tasks.created_by`, `tasks.escalated_to`,
`tasks.assigned_to` and `tasks.completed_by` (0011), `notes.nurse_id`,
`alerts.resolved_by`, and `audit_log.nurse_id`. **None of these declare an
`ON DELETE` behaviour**, so they default to `NO ACTION`: the delete is
rejected outright as long as any row points at the nurse. `nurses.id` itself
is `references auth.users(id) on delete cascade`, so deleting the auth user
would try to delete the nurses row and hit exactly that wall.

### The three options

**A. Anonymise (recommended).** Keep the `nurses` row, blank the identifying
fields (`name` → "Former colleague", `email` → a non-routable placeholder),
add a `deactivated_at` column, and delete the `auth.users` row so they can no
longer sign in.
- *Records:* every task, note and alert keeps its history and its links. A
  handoff written six months ago still says what happened.
- *RLS:* nothing changes. The row keeps its `facility_id`, so facility
  scoping is untouched. `nurses_read_same_facility` would want a
  `deactivated_at is null` filter so departed colleagues stop appearing in
  the assignee picker — that is a policy change and needs its own discussion.
- *Rollback:* trivial for the data (the row survives), impossible for the
  auth user (recreate and re-link by id).
- *Cost:* the unique constraint on `nurses.email` means the placeholder must
  be unique per nurse (e.g. `deleted+<uuid>@invalid`).

**B. Reassign.** Point every reference at a nominated colleague or a facility
"unattributed" pseudo-nurse, then delete the row.
- *Records:* survive, but the attribution becomes **false**. Unit View would
  report tasks as created or completed by someone who never touched them.
  For a clinical coordination tool that is worse than an honest gap. The same
  reasoning is why `completed_by` is never backfilled from `created_by`.
- Only defensible for `assigned_to` (a forward-looking field: someone does
  have to pick the work up), not for `created_by` or `completed_by`.

**C. Cascade.** Add `on delete cascade` to every reference and delete
everything the nurse touched.
- *Records:* destroys other people's context. A departing nurse's tasks are
  half a ward's shared work, not personal data they own outright.
- *Rollback:* none. This is the one genuinely irreversible option.
- Also the largest schema change: seven FK constraints altered, which is not
  additive.

**Recommendation: A, with the `assigned_to` handling from B** — on
deactivation, clear `assigned_to` back to NULL (an unassigned task is a valid
state, and someone still needs to do it) while leaving `created_by` and
`completed_by` pointing at the anonymised row.

### What would need to exist first
1. A decision on whether a deactivated nurse is hidden from the assignee
   picker (a policy change to `nurses_read_same_facility`, currently off
   limits without discussion).
2. `nurses.deactivated_at` (migration 0012).
3. The Edge Function, with its own auth check.
4. A confirmation flow in the UI that says plainly what is kept and what is
   erased — "your tasks stay, your name is removed" — before anything runs.
5. `SECURITY.md` updated: this is a data-subject-rights path, and the answer
   is currently "we anonymise rather than erase", which needs to be stated
   before real data is ever in scope.

---

## 5. Known issues and things flagged, not built

### Email change may be untestable right now
Supabase's built-in SMTP hit `over_email_send_rate_limit` in a previous
session. The profile screen uses `supabase.auth.updateUser({ email })` — the
built-in flow, never a custom one — and surfaces whatever Supabase returns,
so a rate-limit error will display as-is. That is the failure showing
honestly, not a bug in the screen. Retest once SMTP is sorted, or configure a
custom SMTP provider.

### Pre-existing, found but deliberately not fixed
- **The AI mode of the task edit dialog does nothing.** `TaskEditDialog`
  calls `onUpdate(...)`, but `App.jsx` only ever passes `onManualUpdate`, so
  Apply throws and lands in the catch, showing "Failed to apply changes".
  Manual edit works. Fixing it means wiring `parseTaskEditCommand` through to
  a real update, including its delete action — a feature, not a UX polish, so
  I left it. It predates this session.
- **20 translation keys from previous sessions were never added to
  `translations_review.csv`**: the `notice.*` block, `patientUpdate.*`,
  `taskCard.repage*`/`escalate*`, `topMenu.repage`/`escalate`,
  `patientCard.familyUpdate`, and four `errors.*`. I did not add them,
  because their French was reviewed and approved in the sessions that wrote
  them and re-listing them would ask you to review them again. Say the word
  and I'll add them.
  The CSV also still contains six keys that no longer exist in the locale
  files (`topMenu.followUp`, `alerts.*`).
- **Unwired demo components** still in the tree, imported by nothing:
  `ContactsDialog`, `ShareUpdateDialog`, `EditNoteDialog`, `RoomSelector`,
  `DeleteConfirmModal`, `NoteDeleteConfirmModal`. `RoomSelector` is the
  source of one of the pre-existing lint errors. Deleting them is a
  judgement call about whether those features are coming back, so I left
  them.
- **`handleSuggestionAddAsTask`** still creates local-only tasks that vanish
  on reload (`id: Date.now()`), unlike every other task path. Pre-existing;
  fixing it means routing suggestions through `createTask`, which touches the
  suggestion flow's contract. Flagged, not built.

### Deliberately not built, per instruction
Account deletion (proposal above), SBAR/Family Update sharing (Family Update
stays copy-only; `PatientUpdateSummary` takes `summaryText` and renders it,
so a share action is an added button, not a rewrite), any RLS or
task-visibility change, and a test suite.

### On a router
Not needed yet, and I did not add one. The three top-level screens are now a
single `view` value rather than a set of booleans, and overlays layer on top
of it, which is what makes back navigation land in the previous context.
Where it starts to hurt: no deep links (a nurse cannot bookmark or share "the
Tasks screen"), the browser back button still exits the app rather than
stepping back a screen, and a reload always returns to My Patients. If
testers start reporting the back button as broken, that is the signal — and
it would be a contained change now that navigation is one value, not
scattered flags.

### Discharge planning does not mark the patient discharged
Initiating discharge *planning* creates the tasks and leaves
`is_discharged` alone. Flagging it would drop the patient off the roster the
moment planning began, taking the new tasks with them. Actually discharging a
patient (setting `is_discharged`) is still not wired to anything — the field
exists and `fetchPatients` filters on it, but nothing sets it. Worth its own
decision: does "discharge" mean archiving the patient, and what happens to
their outstanding tasks?

---

## 6. State at the end

- `npm run build`: clean.
- `npm run lint`: 11 errors, 4 warnings — **down from 13 errors, 4 warnings**
  at the start of the session. Everything remaining is pre-existing
  (`setState` in effects in `PatientCard`/`RoomSelector`, impure calls during
  render, the unused `nameSimilarity` in `roomMatcher`, react-refresh export
  warnings). Two pre-existing errors were resolved as a side effect: the
  unused `handleSignOut` (now bound to a button) and an unused parameter in
  the old charge-view patient handler.
- `en.json` and `fr.json` key sets verified identical (337 keys each).
- No `git push`, no Edge Function deploy, no Supabase CLI write.
- One local commit on `build-mvp`.

Note: I ran the Vite dev server briefly to verify the new modules transform,
and stopping it also stopped a dev server that was already running on port
5173. Restart with `npm run dev` from `apps/web` if you had one open.

All eleven phases plus the profile screen were completed. Nothing was left
half-finished.
