# REVIEW_FINDINGS.md

Review session of 2026-08-27, after migration 0011 was applied to the remote
database. Covers commits `fa333f4` and `868b860`. Separate from
`FINAL_REVIEW.md`, which describes what was built.

**Headline:** the schema work landed correctly and the load-bearing claims
hold up against the live database. Two clear bugs found and fixed. Nine
things flagged for you to decide on, none of them blocking. Nothing found
that would leak data across facilities or change who can see a task.

No remote writes were made. Verification was done with read-only PostgREST
requests using the publishable key, which is why some checks below say
"needs a SQL query you run" — see §4.

---

## 1. Task 1 — translations_review.csv is now complete

**Done.** The CSV is a complete mirror of `en.json` / `fr.json`.

| | before | after |
|---|---|---|
| Data rows | 323 | **337** |
| `en.json` keys | 337 | **337** |
| Match | no | **yes** |

Three things happened, all of them worth knowing about:

1. **The 20 missing keys were added** — `notice.*` (4), `patientUpdate.*` (3),
   `taskCard.repage*`/`escalate*` (6), `topMenu.repage`/`escalate` (2),
   `patientCard.familyUpdate`, and four `errors.*`. Their French is the
   already-approved text, copied verbatim from `fr.json`. Nothing was
   re-translated.

2. **Six dead rows were removed** — `topMenu.followUp` and five `alerts.*`
   keys that exist in neither locale file. They had to go for the row count
   to mean anything; a mirror with extra rows can't tell you whether a gap is
   real.

3. **Ordering was restored.** The file's convention is `en.json` order, and
   rows 1–259 followed it exactly. My append last night put all 59 new keys
   at the bottom, out of order. The file is now regenerated in `en.json`
   order throughout, so a future diff shows only genuine changes.

### Two things in the CSV you should look at

- **Three rows were showing superseded text.** `topMenu.delayedTasks`,
  `topMenu.delayedTasksHeading` and `topMenu.noDelayedTasks` still read
  "Delayed tasks" / "Tâches en retard" in the CSV, but the locale files were
  changed to "Needs attention" / "Nécessite attention" in an earlier session
  and the CSV was never updated. The CSV now carries the current text. **The
  app already said "Needs attention" — this only corrects the review sheet.**

- **`notice.paragraphs` is a JSON array, not a string.** It is one key holding
  seven paragraphs, so it is one CSV row, with the paragraphs separated by
  blank lines inside the quoted field. That keeps row count == key count as
  you asked. Consequence: `wc -l` reports 362 lines for 337 rows, because
  that one field spans multiple lines. Any real CSV parser (Excel, Sheets,
  Python) reads it correctly — I verified the round-trip. If you'd rather
  have seven single-line rows (`notice.paragraphs.0` … `.6`), say so and
  the count becomes 343; the trade is row-count-matches-key-count vs.
  one-line-per-row.

Encoding preserved: UTF-8, no BOM, LF endings, `Key,English,French`, three
columns on every row, no empty French cell.

---

## 2. Verified against the live database — no finding

These are the things you asked me to confirm rather than assume. Each was
checked with a read-only request against the real project, not by reading the
migration file.

**V1 — 0011's columns exist, with the right types.** `tasks.assigned_to` and
`tasks.completed_by` both reject a non-UUID filter with Postgres error
`22P02 invalid input syntax for type uuid`, exactly as the known-good
`created_by` does — so both are genuinely `uuid`, not text. `tasks.task_type`
accepts an arbitrary string filter, so it is a text type. A control probe for
a column that doesn't exist returns `42703`, which proves the probe actually
discriminates.

**V2 — `set_my_name` exists and is locked down correctly.** Calling it as the
anonymous role returns `42501 permission denied for function set_my_name` —
the same response as the known-good `set_my_language`. A non-existent
function name returns `PGRST202` instead, and so does `set_my_name` with a
wrong argument name. So the function is there, its signature is
`(new_name)`, and `revoke all … from public` took effect: only
`authenticated` can execute it. No function was executed during this check.

**V3 — no RLS or table-grant change anywhere in the diff.** The only `grant`
and `revoke` statements in either commit are the two on the new function.
There is no `create policy`, `drop policy`, `alter policy`, or
`enable/disable row level security` anywhere.

**V4 — assignment cannot have changed task visibility.** Every use of
`assigned_to` in the frontend is a display, a count, or a write. There is no
`.eq('assigned_to', …)`, no filter, and no list built from it.
`fetchPatients` still selects `*, tasks(*), notes(*)` with `is_discharged`
as its only filter. Facility scoping is still done entirely by RLS, and every
insert still carries the signed-in nurse's own `facility_id`.

**V5 — the shared sort is genuinely shared, and STAT+overdue appears once.**
`sortTasks` has exactly two callers: `PatientCard` (Patient View) and
`TasksScreen`. I ran the utility against a ten-task fixture: a task that is
both Stat and overdue lands in the urgent group, appears exactly once, and
sorts first; groups come out monotonically ordered; earliest-deadline-first
holds inside every group; nothing is dropped, duplicated, or mutated in
place; and the output is identical regardless of input order.

**V6 — `task_type` does not leak into department counts.** Unit View's
department breakdown keys off `t.department` alone. `task_type` is read in
exactly one place in the UI (the discharge badge on the patient card) and
written in one place (the discharge insert). Discharge tasks land in Nursing
and Social Work and are counted there like any other task.

**V7 — created / assigned / completed are never conflated.** Three
independent filters over three different columns (`created_by`,
`assigned_to`, `completed_by`), never summed, never merged, rendered as three
separate table columns. Historical completions with no `completed_by` are
reported as their own "completed by unknown" figure rather than being
attributed to the creator.

**V8 — voice patient creation holds the `Patient_Test_N` line.** I ran the
client-side fallback parser against deliberately hostile transcripts. A real
name plus a real room ("Mrs Sarah Thompson in room 412"), a bare bed number,
a bare room/bed pair, an NHS number, and a spoken date of birth **all produce
`label: null`** — the field stays blank for the nurse to fill in. The parser
cannot construct a label from anything except a spoken `Patient Test N`, and
it builds it by template, so a non-conforming label is structurally
impossible. It also refuses to infer a diagnosis from a symptom or a
medication ("with a fever and on metformin" → `diagnosis: null`), and rejects
an out-of-range age. The server-side prompt additionally validates Claude's
returned label against `/^Patient_Test_\d+$/` and drops anything else. The
on-screen hint tells the nurse not to speak a real name, room, bed or ID
number, in both languages, and the example transcript uses only synthetic
values.

**V9 — no hardcoded English in the new UI.** Every user-visible string in
`TasksScreen`, `ProfileScreen`, `ViewSwitcher`, `AssigneeSelect` and the
changed parts of `Dashboard`, `DischargeDialog`, `TopRightMenu`,
`PatientCard`, `ChargeNurseDashboard`, `VoiceCapture` and `AddPatientDialog`
goes through `t()`. Both `alert()` branches for assignment failures are
translated. The two `throw new Error("Cannot repage…")` strings in
`lib/patients.js` are caught in `App.jsx` and replaced with a translated
message before any nurse sees them. (One real gap remains — see FL6.)

**V10 — PostgREST's schema cache is current, and the app's real queries
parse.** You asked about stale caches. The exact query `fetchPatients()`
issues (`patients?select=*,tasks(*),notes(*)&is_discharged=eq.false&order=…`)
and the exact query `fetchFacilityNurses()` issues both return HTTP 200
against the live project, as do all five `nurses` columns the profile screen
reads. PostgREST has picked up 0011; there is no cache-staleness problem to
work around.

**V11 — the currently-deployed frontend is safe against the new schema.**
Nothing was pushed or deployed, so your testers are running last week's
bundle against a database that now has 0011. That combination is fine: the
old `completeTask(taskId)` writes status and `completed_at` and simply leaves
`completed_by` NULL, the old code never writes `task_type`, the check
constraint only fires on a non-null `task_type`, and `select('*')` returning
three extra columns is ignored. No action needed.

**V12 — anonymous callers still see nothing.** Every table
(`facilities`, `nurses`, `patients`, `tasks`, `notes`, `alerts`,
`audit_log`) returns `[]` with an exact count of 0 to an unauthenticated
request. RLS is on and denying. See FL8 for a related documentation
discrepancy that is not a leak.

---

## 3. Findings

### Fixed

**F1 — `isMissingColumnError` was broad enough to mislabel unrelated errors.
Severity: Medium. Fixed.**

`lib/patients.js` decided "this column doesn't exist, so 0011 hasn't been
applied" if the error code matched **or** the error message merely mentioned
the column name:

```js
error.code === '42703' || error.code === 'PGRST204' ||
  (typeof error.message === 'string' && error.message.includes(column))
```

That third clause is the problem, and it matters more now that 0011 *is*
applied. A foreign-key violation on `tasks_assigned_to_fkey` puts the string
`assigned_to` in its message, so assigning a task to a nurse id that fails
the FK would have told you **"Task assignment isn't available yet: migration
0011 hasn't been applied"** — sending you to check a migration that is
perfectly fine. On the completion path the same misread would silently retry
without attribution and quietly lose the `completed_by` value.

Now the error code must match (`42703` or `PGRST204` — both mean "column does
not exist" and nothing else), and the column name is checked as a
confirmation rather than as an alternative. Genuine missing-column errors
still take the degradation path; everything else surfaces as itself.

**F2 — the fourth demo-era field site: `task.room` in the task detail panel.
Severity: Low-Medium. Fixed.**

You were right that there was another one. `TaskEditDialog`'s "Current Task"
panel (the AI Edit tab) rendered:

```jsx
<span>{t("taskEdit.room")}</span>
<span>{task?.room || "—"}</span>
```

Real task rows have no `room` column — that was a demo-era field; tasks
reference a patient. So this line read **"Room —" for every task, always**.
It fails safe (it never showed wrong data), which is why it survived, but it
is exactly the class of bug you asked me to hunt.

It now shows the patient: `App.jsx` passes the label down, the dialog renders
it, and a new `taskEdit.patient` key was added in both languages ("Patient" in
both). The now-unreferenced `taskEdit.room` key was removed from both locale
files and the CSV, for the same reason the six dead `alerts.*` rows went.

For completeness, the other `patient.name`/`patient.room` reads still in the
tree are all in code nothing imports (`ContactsDialog`, `ShareUpdateDialog`,
`RoomSelector`) or are deliberate dual-shape mappings (`claudeAPI.js`'s
`toPromptPatient`, which accepts both spellings on purpose). See FL7 for one
unreachable branch in `App.jsx`.

### Flagged — your call, not touched

**FL1 — completing a task through the edit dialog records no completer.
Severity: Medium.**

There are two ways to complete a task, and they behave differently:

| route | `status` | `completed_at` | `completed_by` |
|---|---|---|---|
| "Complete" button (`completeTask`) | ✓ | ✓ | ✓ |
| Edit dialog → Status → Completed (`updateTask`) | ✓ | ✗ | ✗ |

So a task you complete *tomorrow* through the edit dialog will show up in
Unit View's **"completed by unknown"** figure, which `FINAL_REVIEW.md`
describes as meaning "historical, from before 0011". That claim is wrong for
this path. The missing `completed_at` is pre-existing; the missing
`completed_by` is a gap against Phase 1's "set `completed_by` when a task is
marked complete going forward".

I did not fix it because it carries a real design question: if the nurse
later switches that same task from Completed back to Pending, should
`completed_by` and `completed_at` be cleared? Leaving them set would assert a
completion that was undone. Deciding that is yours, and it is not something
to change the night before you test.

The shape of the fix, when you want it: thread the nurse id into
`handleManualUpdateTask`, and in `updateTask` set `completed_at`/`completed_by`
when `fields.status === 'Completed'`, clearing both when status moves away
from Completed.

**FL2 — the unassigned count includes completed and cancelled tasks.
Severity: Medium.**

```js
const unassignedCount = allTasks.filter((t) => !t.assigned_to).length;
```

`allTasks` is every task at the facility, including Completed and Cancelled
ones. Mid-shift, "unassigned tasks" reads as "work nobody has picked up", but
this figure counts a task completed three weeks ago that never had an
assignee. It will only drift further from the useful meaning as the beta
accumulates completed tasks. The same applies to each nurse's **Assigned**
column, which counts tasks assigned to them regardless of whether they are
still open — "currently assigned" arguably shouldn't include finished work.

Not fixed because it changes numbers you will be looking at in the morning,
and because the right definition is a product decision, not a bug fix. If you
want the open-work reading, both are one-line changes filtering on
`t.status !== 'Completed' && t.status !== 'Cancelled'`. The **Created** and
**Completed** columns are historical by nature and should stay as they are.

**FL3 — three definitions of "urgent STAT", and one of them disagrees.
Severity: Low-Medium.**

| where | Stat task with status `Confirmed` |
|---|---|
| `needsAttention` (three-dot badge) | not urgent — excluded |
| Unit View `statCount` | not urgent — excluded |
| `taskSortGroup` (the shared sort) | **urgent — sorts top** |

Two agree, one differs. The divergence is defensible — sorting answers "what
should I look at first" and a confirmed-but-unfinished Stat order is still
outstanding urgent work, while the attention badge answers "what needs
chasing" and a confirmed task doesn't. But Phase 2 existed specifically so
these couldn't drift, and this is undocumented drift.

Flagged rather than changed because it is a semantics decision about clinical
priority, and either answer is arguable. If you want them aligned, add
`&& task.status !== "Confirmed"` to the urgent branch of `taskSortGroup`.

**FL4 — the fallback diagnosis parser over-captures unpunctuated speech.
Severity: Low.**

This is the parser that runs *today*, since the Edge Function isn't deployed.
Speech-to-text often returns no punctuation, and the diagnosis regex reads to
the next comma or full stop:

> "patient test 7 diagnosis of COPD comfort care Test Room A"
> → `diagnosis: "COPD comfort care Test Room A"`

The code status and location are swallowed into the diagnosis field. It never
*invents* anything and the nurse sees and edits it on the review form, so it
fails visibly rather than silently — but it looks sloppy. Not fixed: regex
tuning has an ambiguous "correct" boundary in unpunctuated speech and I can't
test it against real transcripts. It becomes moot when you deploy the Edge
Function, which gets this right. If you want a cheap improvement, cap the
capture at roughly six words or stop it at the known trailing keywords
("comfort care", "DNR", "test room", "bay").

**FL5 — `assigned_to` has no facility constraint.
Severity: Low. No leak.**

Nothing at the database level ties a task's `assigned_to` to the task's own
facility. The picker only ever lists RLS-visible colleagues, so this can't
happen through the UI, but a crafted request could set `assigned_to` to a
nurse id at another facility. **This is not a cross-facility leak:** task
visibility keys off `tasks.facility_id`, so the other nurse still cannot see
the task, and no data crosses the boundary either way. It is a data-integrity
hole, not a privacy one — the assignee simply wouldn't render. Fixing it
means a database constraint or trigger, which is structural and needs its own
migration, so I left it alone.

**FL6 — the French error message is effectively dead in four dialogs.
Severity: Low.**

`DischargeDialog` (new) follows the pattern already used by
`AddPatientDialog`, `EditPatientDialog` and `TaskEditDialog`:

```js
setError(err.message || t("errors.createDischargeTasks"));
```

A thrown `Error` almost always has a `message`, so the translated string is
nearly unreachable and a French nurse sees raw English Postgres or network
text. `ProfileScreen`'s email error does the same, deliberately — surfacing
Supabase's own message is the honest thing for the email-change flow, and
`AuthScreen`, `FacilityScreen` and `NoticeScreen` have always done it.

Flagged as one systemic decision rather than four small bugs: do you want raw
provider errors shown (diagnosable, English-only) or translated ones
(bilingual, less specific)? A middle path is to show the translated message
and `console.error` the raw one. I didn't pick for you.

**FL7 — an unreachable local-only patient branch in `App.jsx`.
Severity: Low. Pre-existing.**

`handleTaskCreated` still has the demo-era fallback that builds local
patients shaped `{ name, room }` and looks them up by `p.room`. Two of the
remaining `p.room` reads live there. It is unreachable in the current wiring:
every `onTaskCreated` call in `VoiceCapture` passes a real patient's `label`,
and nothing anywhere sets `isNewPatient`. If it ever *were* reached, those
patients would render with a blank heading, since `PatientCard` reads
`patient.label`. Deleting dead code is a structural change, so I flagged it
instead.

**FL8 — `0001_init.sql`'s "No grants to `anon`" comment no longer matches
reality. Severity: Low. Not a leak.**

The anon role does have table-level `SELECT` on all seven tables — an
unauthenticated request gets HTTP 200 with `[]`, not `42501 permission
denied` (which is what the anon role *does* get for the RPCs, so the probe
discriminates). RLS is doing the work and doing it correctly: zero rows, zero
count, on every table including `audit_log`, which has no SELECT policy at
all. So the boundary holds and nothing is exposed — but the migration comment
claims a defence-in-depth layer that isn't actually deployed, probably from
Supabase's project-level default grants. Worth correcting the comment so a
future session doesn't rely on a grant that isn't there. I didn't edit a
migration file that has already been applied.

**FL9 — the voice example demonstrates age + diagnosis together.
Severity: Low. Content judgement.**

`SECURITY.md` singles out indirect identification: "a specific diagnosis,
age, and admission date together… can be enough for someone who knows the
patient to work out who you mean." The example prompt is *"Patient Test 4, 72
years old, admitted with pneumonia, Test Room B"* — synthetic throughout, but
it does model speaking age and diagnosis together, and the hint immediately
below covers direct identifiers only ("never say a real name, room, bed or ID
number"). The notice gate already covers indirect identification before any
nurse reaches this screen, and these fields have existed on the form since
0003/0005, so this isn't new exposure. But the safety copy is yours and
approved, so I won't rewrite it: if you want, the hint could add that the
combination of a real age, diagnosis and admission date is itself
identifying.

Related and already known: nothing validates the label field on the Add
Patient form — a nurse can still type anything. That is `scenarios.md` SC-1,
documented as an accepted gap with an in-app reminder as the mitigation.
Voice doesn't make it worse; the voice path is stricter than the form.

**FL10 — pre-existing, one line each.** Unit View computes `now` once inside
its `useMemo`, so overdue figures freeze until the patient data changes
(pre-existing, unchanged by this work). The AI mode of the task edit dialog
still throws on Apply because `App.jsx` only passes `onManualUpdate` — already
in `FINAL_REVIEW.md`, unchanged.

---

## 4. What I could not verify, and the SQL that would

The publishable key can prove a column exists and what type it is, but it
cannot read `pg_catalog`. These four are the remainder of your first two
bullets. Run this in the SQL editor if you want them confirmed — all four are
read-only `select`s:

```sql
-- 1. Column types, nullability and defaults on the three new columns.
--    Expect: uuid / uuid / text, all is_nullable = YES, all defaults NULL.
select column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_name = 'tasks'
   and column_name in ('assigned_to', 'completed_by', 'task_type')
 order by column_name;

-- 2. Foreign keys and the check constraint actually landed.
--    Expect: tasks_assigned_to_fkey and tasks_completed_by_fkey -> nurses(id),
--    plus tasks_task_type_check.
select conname, pg_get_constraintdef(oid)
  from pg_constraint
 where conrelid = 'tasks'::regclass
   and conname in ('tasks_assigned_to_fkey','tasks_completed_by_fkey','tasks_task_type_check');

-- 3. Nothing was backfilled. Adding a nullable column with no DEFAULT cannot
--    populate rows, and 0011 contains no UPDATE, so this is belt-and-braces.
--    Expect: total = your task count, the three "set" counts all 0 except any
--    task you have completed through the Complete button since applying 0011.
select count(*) as total,
       count(assigned_to)  as assigned_set,
       count(completed_by) as completed_by_set,
       count(task_type)    as task_type_set,
       count(*) filter (where status = 'Completed') as completed_status
  from tasks;

-- 4. tasks_facility_scope is untouched. Expect exactly the 0002 definition:
--    cmd ALL, using and with_check both (facility_id = get_my_facility_id()).
select policyname, cmd, qual, with_check
  from pg_policies
 where tablename = 'tasks';
```

I have high confidence in all four regardless — 0011 contains no `update`,
no `default`, and no policy statement, and I confirmed the columns and the
function exist live — but you asked for verification against real state, and
this is the part I genuinely couldn't reach.

---

## 5. State

- `npm run build`: clean.
- `npm run lint`: 11 errors, 4 warnings — unchanged by this session, still
  below the 13/4 baseline from before the build session. All pre-existing.
- `en.json` / `fr.json`: 337 keys each, identical key sets, no empty French
  value. `translations_review.csv`: 337 rows, same keys in the same order.
- Two source fixes (`lib/patients.js`, `TaskEditDialog.jsx` + `App.jsx`), one
  new translation key, one dead key removed.
- No remote writes, no migration, no deploy, no push. The dev server was not
  running when this session started and was not started.
