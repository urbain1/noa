# Morning Review — overnight session, 2026-08-28

Four phases, four local commits on `build-mvp`, nothing pushed, nothing
deployed, no Supabase CLI command run at all. `npm run lint` and
`npm run build` are clean after every commit in the sense that matters:
**no new problems**. Lint went from 11 problems (7 errors, 4 warnings) at the
start to 10 (6 errors, 4 warnings) — one pre-existing error in
`ChargeNurseDashboard` fell out of the Phase 4 fix. Every remaining problem
was there before this session.

```
bcbf47b  Phase 4: un-freeze Unit View's clock, correct 0001's anon-grant comment
0d72ebc  Phase 3: structured outstanding-task list on the handover report
08dce4c  Phase 2 (FL6): show translated errors, log the raw ones
7e0b6a1  Phase 1: require an explicit confirmation before an AI-edit task delete
7d81de0  (your last commit)
```

**Database: no SQL to run.** No migration was written. The only file under
`supabase/` that changed is a comment inside `0001_init.sql`. See §4.2.

**Out of scope, not touched:** the ward manager screen, task visibility, RLS
policies, `nurses.role`, the signup flow's fields. No file under
`supabase/migrations/` other than the comment above, and no policy, grant or
column anywhere. The unwired demo-era components (`ContactsDialog`,
`ShareUpdateDialog`, `RoomSelector`, `DeleteConfirmModal`,
`NoteDeleteConfirmModal`, `EditNoteDialog`) are all exactly as you left them.

---

## 1. Phase 1 — delete confirmation for voice/AI task editing

**Commit `7e0b6a1`.** New file `apps/web/src/components/TaskDeleteConfirmDialog.jsx`,
plus wiring in `App.jsx` and six new i18n keys.

### What was wrong
The AI edit dialog showed a red banner reading *"Applying this will
permanently delete the task."* — but that is a warning, not a confirmation.
Pressing **Apply Changes** once destroyed the row. `deleteTask` is a hard
delete (`lib/patients.js:202`), so there was no undo and no tombstone.

### What it does now
Apply → the command is parsed as usual → if the result is a delete, a
separate dialog comes up naming the task, showing the command that was read
as a delete, and saying it cannot be undone. **Keep task** leaves everything
exactly as it was, edit dialog still open, command still in the box. **Delete
task** performs the delete.

### The one design decision worth checking
The gate sits in `App.handleAiUpdateTask`, on the **resolved** delete, not in
`TaskEditDialog` on `isDeleteCommand(finalCommand)`. That was deliberate:

- `isDeleteCommand` is the local regex. It drives the red banner. It is not
  the only thing that can produce a delete — Claude can return
  `{"action": "delete"}` for a phrasing the regex misses, and in that case the
  old code deleted the task having shown *no warning at all*. Gating on the
  regex would have left that hole open.
- Voice and typed commands both reach `handleAiUpdateTask` through one path,
  so both are gated identically with no per-input logic.
- `deleteTask` now has exactly one caller in the whole app, and that caller is
  behind the confirmation.

The red pre-Apply banner is unchanged and still fires on the regex. It warns;
the new dialog confirms. Two different jobs.

**I did not wire `DeleteConfirmModal.jsx`.** It is the closest existing thing
to this and it is a near-sibling of the new file — but it is unwired,
hardcoded English, and shaped around demo-era task objects. Using it would
have meant editing it, and you deferred that judgment. If you'd rather have
one component than two, that merge is a five-minute job whenever the deferred
call gets made; the new file is the one that is i18n'd and live.

### Test steps
1. Open any patient card → a task → **Edit** → **AI Edit** tab.
2. Type `delete` and press Apply. **Expect:** red banner appears as you type;
   after Apply, a confirmation dialog naming the task, showing your command,
   and saying it cannot be undone.
3. Press **Keep task**. **Expect:** nothing deleted, edit dialog still open,
   `delete` still in the input, task still on the card behind.
4. Press Apply again, then **Delete task**. **Expect:** task gone from the
   card, both dialogs closed. Reload — still gone.
5. Repeat step 2 by **voice**: hold the mic, say "delete this task". Same
   confirmation, and the transcript is what's shown as the command.
6. French: switch to French in the profile, repeat. Every string in the
   confirmation should be French.
7. Phrasings the regex catches beyond the bare word: `remove this task`,
   `supprimer cette tâche`, `cancel this task`.
8. **Negative test, important:** `remove the deadline` and `supprimer
   l'échéance` must *not* raise the confirmation — they are deadline edits,
   and `parseTaskEditFallback` deliberately reads the deadline first. Expect
   the deadline to clear, no dialog.
9. Click the dark backdrop while the confirmation is up. **Expect:** it
   cancels (nothing deleted). Backdrop-cancel on a destructive dialog defaults
   to the safe side on purpose.

---

## 2. Phase 2 (FL6) — consistent error message handling

**Commit `08dce4c`.** New file `apps/web/src/utils/errors.js`; changes in
`DischargeDialog`, `AddPatientDialog`, `EditPatientDialog`, `TaskEditDialog`
and two throw sites in `App.jsx`. **No new strings** — every message used
already existed in `errors.*`.

### What was wrong
All four dialogs did `setError(err.message || t("errors.something"))`. A
thrown `Error` essentially always has a `message`, so the translated branch
was close to unreachable and a French nurse got raw English Postgres,
Supabase or network text.

### What it does now
Each dialog `console.error`s the original and renders the translated message.
Nothing is lost for diagnosis; it moved to the console.

Two messages the app itself had already translated are more useful than the
generic fallback and are kept:

- `errors.dischargeAlreadyPlanned` — "this patient already has discharge
  planning tasks"
- `errors.editNotUnderstood` — "Couldn't understand that change. Try naming
  the field…"

They are thrown through a new `translatedError()` helper that flags them, and
`errorText(err, fallback)` is what the dialogs render. The distinction is a
flag, not a guess about what the text looks like.

### One thing this changed that you should know about
The AI-edit failure used to be a single message. It is now two, because the
nurse's next move differs:

- Neither Claude nor the local parser could read the command →
  *"Couldn't understand that change…"* → rephrase it.
- The action itself failed, or the Edge Function was unreachable →
  *"Failed to apply changes."* → nothing to rephrase.

Previously a transport failure surfaced as Claude's or the network's own raw
English string; before that it read as a comprehension failure. Telling a
nurse "I didn't understand you" when the Edge Function is down is precisely
the misdiagnosis `CLAUDE.md`'s standing lesson (decisions.md, 2026-08-27) is
about, so I split it. Both strings already existed.

### Deliberately untouched
`ProfileScreen`'s email-change error still shows Supabase's own message, as
you specified. `AuthScreen`, `FacilityScreen` and `NoticeScreen` were not in
scope and were not touched — they show provider messages too, and if you ever
want them aligned, the helper is there. `git diff` confirms `ProfileScreen.jsx`
is byte-identical.

### Test steps
For each of the four dialogs, the quickest reliable failure is offline mode
(DevTools → Network → Offline), which produces a raw English `TypeError:
Failed to fetch`-class message.

1. **AddPatientDialog** — go offline, add a patient. **Expect:** *"Failed to
   create patient."* on screen; `Create patient error: …` with the raw error
   in the console.
2. **EditPatientDialog** — go offline, edit a patient, Save. **Expect:**
   *"Failed to update patient."* + `Update patient error: …` in console.
3. **DischargeDialog** — go offline, start discharge planning. **Expect:**
   *"Failed to create discharge planning tasks. Please try again."* +
   `Discharge planning error: …`.
4. **DischargeDialog, the kept message** — back online, plan a discharge for a
   patient who already has an active discharge set (get there via the
   three-dot menu's "Discharge a patient" list). **Expect:** the *specific*
   message about existing discharge tasks, not the generic one. This is the
   `translatedError` path; if it shows the generic message, the flag isn't
   surviving.
5. **TaskEditDialog, manual mode** — go offline, change Status. **Expect:**
   *"Failed to update task."* + `Task field save error: status …`.
6. **TaskEditDialog, AI mode, unreadable** — online, type `blorp florp` and
   Apply. **Expect:** *"Couldn't understand that change…"*.
7. **TaskEditDialog, AI mode, transport** — offline, type `mark completed` and
   Apply. **Expect:** *"Failed to apply changes."* + `Apply task edit error:`
   in the console. (Note the local fallback parser handles `mark completed`
   without the network, so this may well *succeed* offline — that is correct
   behaviour, not a failed test. To force the failure, use a command only
   Claude can read, e.g. `reword this so the pharmacy understands it`.)
8. Do 1–3 and 5–7 again in French and confirm every visible message is French.

---

## 3. Phase 3 — handover report highlights incomplete/overdue tasks

**Commit `0d72ebc`.** New `HandoffOutstandingTasks.jsx`, new
`utils/taskDeadline.js`, changes to `HandoffSummary.jsx`, `TaskCard.jsx` and
`App.jsx`, nine new i18n keys under `handoff.outstanding.*`.

### What it does
Above the AI narrative, on **both** entry points (three-dot → Generate handoff
report, and a patient card's SBAR), there is now a bordered panel:

```
OUTSTANDING TASKS                        [3 overdue]  7 incomplete
─────────────────────────────────────────────────────────────────
Patient_Test_1 · Test Room A
  • Chest X-ray with contrast              [OVERDUE] [Stat]
      Radiology · Overdue by 2h 10m
  • Group and save                          Lab · Due in 45m · Pending
Patient_Test_3
  • Physio assessment                       Physical Therapy · No deadline · Confirmed
─────────────────────────────────────────────────────────────────
Read from current task data, not from the summary below.
```

Overdue rows: red background, red bold text, red **Overdue** badge. Stat rows:
orange background and badge. Delayed: yellow badge. Everything else plain.
Grouped by patient, ordered by the app's existing sort.

### What it reuses rather than restates
- `isTaskOverdue` from `utils/taskOverdue.js` — the same function behind Unit
  View's overdue count and the attention list.
- `sortTasks` from `utils/taskSort.js` — the same ordering as the Tasks
  screen (urgent → overdue → rest, earliest deadline first).
- `getDeadlineDisplay` / `formatDuration`, **moved** out of `TaskCard.jsx`
  into `utils/taskDeadline.js` verbatim, so a deadline is phrased identically
  on a task card and in the report. `TaskCard`'s behaviour is unchanged — it
  now imports what it used to define. This was the one refactor of working
  code in the session; the functions were copied across without edits.

Nothing parses the generated narrative. The list is read off the task rows,
so no prompt and no AI output was touched.

### Definition used
"Outstanding" = not `Completed` and not `Cancelled`. **`Confirmed` tasks stay
on the list.** That is a judgement call worth your eye: the department has
acknowledged the task but nobody has done it, and those are exactly the ones
an incoming nurse is most likely to assume are handled. If you'd rather
`Confirmed` dropped off, it's one line in `isOutstanding`.

### Flagged, deliberately not done: Copy and Send still send the narrative only
**Copy** and **Send to Nurse** put `editedText` — the narrative alone — on the
clipboard, byte for byte as before. The outstanding list is on screen but not
in the copy.

I left it that way on purpose. Changing what Copy produces alters existing,
working behaviour that you didn't ask me to touch, and it is a real question
rather than an obvious improvement: a nurse who pastes the handoff into a
message would probably want the overdue list to travel with it, but the
narrative is also an editable block a nurse can amend before sending, and a
derived list appended after their edits behaves differently from the text
above it. Appending a plain-text version of the list at copy time is maybe
fifteen lines if you want it — say the word.

### Test steps
1. Set up a patient with: one task whose deadline is in the past and status
   Pending; one Stat task; one task due in ~30 minutes; one Completed task;
   one Confirmed task with no deadline.
2. Three-dot menu → **Generate handoff report**. **Expect:** the panel above
   the narrative. The overdue task is red with an **Overdue** badge and
   "Overdue by …". The Stat task is orange. The Completed task is **absent**.
   The Confirmed task is **present**. The header shows the overdue count and
   the total.
3. Confirm the narrative below is unchanged from what you're used to — same
   SBAR text, same section markers.
4. Open a patient card → **SBAR Summary**. **Expect:** the same panel, scoped
   to that one patient only.
5. Press **Edit**. **Expect:** the panel stays visible above the textarea and
   is not editable. Type into the narrative, press **Done Editing** — your
   edits are in the narrative, the panel is untouched.
6. Press **Copy**, paste somewhere. **Expect:** the narrative only. This is
   the flagged behaviour in §3 above, not a bug.
7. A patient with no outstanding tasks at all: **expect** *"Nothing
   outstanding — every task is complete."* rather than an empty box.
8. French: every label, badge, count and the caption in French. Check the
   plurals: 1 vs several overdue.
9. Phone width: the row badges should wrap, not overflow. Long task
   descriptions should wrap rather than push the badges off-screen.

---

## 4. Phase 4 — the bounded list

### 4.1 Unit View's overdue figures no longer go stale
**Commit `bcbf47b`**, `ChargeNurseDashboard.jsx`.

The `stats` memo was keyed on `[patients, nurses]` and read `Date.now()`
inside itself. Between two data changes every clock-dependent figure was
frozen at whatever the clock read when it last ran — the overdue tile, the
"Overdue by …" attention rows, the risk scores, and the "pending > 1 hour"
term inside `computeRiskScore`. A task could sail past its deadline and Unit
View would keep reporting zero overdue until something unrelated re-fetched.

A `now` value now ticks into state once a minute and is in the memo's
dependency list, so a tick is a render and a render is a recompute. One
minute matches the display granularity — nothing on that screen is finer than
"3h 20m". `computeRiskScore(patient, now)` takes the instant as an argument
instead of reading the clock itself, so every figure in a given render is
measured against the same moment. That also cleared the pre-existing
`Cannot call impure function during render` lint error at line 56.

The interval is cleaned up on unmount, and the component only mounts on the
Unit view, so there is no timer running while you're on another screen.

**Test steps**
1. Create a task with a deadline ~2 minutes out. Go to Unit View. **Expect:**
   the Overdue tile shows 0.
2. Leave Unit View open and do nothing at all. Within about a minute of the
   deadline passing, **expect** the tile to go to 1 and turn red, an
   *Attention Needed* row to appear, and — if the patient crosses the
   threshold — a Patient Safety Flag. No reload, no click.
3. Watch an "Overdue by …" row for three minutes: **expect** it to count up
   roughly each minute rather than sitting still.
4. Switch to another view and back a few times, then check DevTools for
   runaway timers. **Expect** one interval while Unit View is mounted, none
   after leaving.

### 4.2 `0001_init.sql`'s "No grants to `anon`" comment — corrected, comment only

**No SQL to run. No migration was written. Not one grant changed.**

The old comment read *"No grants to `anon`, no unauthenticated access
anywhere in this schema."* True of the file — it grants `anon` nothing — but
not of the deployed database, where `anon` holds table-level `SELECT` on all
seven tables from Supabase's own project-level default grants. Nothing is
exposed: RLS returns zero rows on every table including `audit_log`, which
has no SELECT policy at all. The boundary holds; the comment just described a
defence-in-depth layer that isn't deployed, which a future session could
relax an RLS policy in reliance on.

I corrected the comment **in place in `0001_init.sql`**, marked with a dated
`[Comment corrected 2026-08-28]` note that says explicitly that no grant
changed. My reasoning for editing an already-applied migration rather than
adding `0012`: a new migration file would have to be a no-op to satisfy "do
not touch the grants themselves", and recording a no-op in the migration
lineage says a schema change happened when none did. Editing a SQL comment
changes nothing the CLI executes or compares — `db push` tracks versions, not
checksums — and the person the correction is for is whoever next reads 0001.

**If you'd rather it went the other way**, `git show bcbf47b -- supabase/migrations/0001_init.sql`
is the whole change and reverting that hunk restores the original wording;
the same text then drops straight into a `0012_*.sql` header comment.

**Test steps:** none in the app — it is a comment. If you want to re-verify
the underlying fact, the unauthenticated probe is: an anon-key `select` against
any table returns HTTP 200 with `[]`, while an anon-key RPC call returns
`42501 permission denied`. The difference between those two responses is what
distinguishes "grant exists, RLS blocked it" from "no grant".

### 4.3 FL9 — voice hint copy. **Drafted, not applied.** See §5.

---

## 5. FL9 copy draft — for your review, NOT applied

Nothing about this is in the code. The current strings are untouched.

**Where:** the voice patient-creation screen, under the example line.
Currently:

> *Try: "Patient Test 4, 72 years old, admitted with pneumonia, Test Room B"*
> Use a synthetic label such as Patient_Test_4. Never say a real name, room,
> bed or ID number.

**The gap** (`REVIEW_FINDINGS.md` FL9): the example models speaking age and
diagnosis together, and the hint below it covers **direct** identifiers only.
`SECURITY.md` and the notice screen both single out indirect identification —
*"a specific diagnosis, age, and admission date together, even with no name
attached, can be enough for someone who knows the patient to work out who you
mean."* The hint at the point of speaking doesn't say that.

**Proposed replacement for `voiceCapture.patientSyntheticHint`:**

> **EN:** Use a synthetic label such as Patient_Test_4. Never say a real name,
> room, bed or ID number. A real age, diagnosis and admission date together can
> identify someone on their own — change any detail you don't need for testing.

> **FR :** Utilisez une étiquette fictive telle que Patient_Test_4. Ne dites
> jamais de nom, de chambre, de lit ou de numéro d'identification réels. Un âge,
> un diagnostic et une date d'admission réels peuvent à eux seuls identifier une
> personne — modifiez tout détail dont vous n'avez pas besoin pour vos tests.

Notes on the wording, since this is your copy and it is safety copy:

- It echoes `SECURITY.md`'s existing phrasing ("together", "even with no name
  attached") rather than introducing a new formulation, so the notice screen
  and the hint say the same thing in the same terms.
- "change any detail you don't need" rather than "leave it out": the fields
  are useful for testing the app, and the notice already says *"leave it out
  or use a synthetic placeholder instead"*. Nudging toward a changed value
  keeps the test data realistic.
- It roughly doubles the hint's length, on a screen where it renders as small
  grey text under the mic. If that's too much, the second sentence alone
  ("A real age, diagnosis and admission date together can identify someone on
  their own") carries most of the value.

**A second, optional change I did not draft into the string above:** the
example itself (`voiceCapture.examplePatient`) is what actually demonstrates
the pattern — *"72 years old, admitted with pneumonia"*. Every value in it is
synthetic, so it exposes nothing, but it is the thing a nurse copies the shape
of. Softening the example is a bigger call than adding a sentence to the hint
and I've left it entirely alone.

**To apply the draft**, if you approve it: it is one key in `en.json`, the
same key in `fr.json`, and the matching row in `translations_review.csv`
(which is generated in exact `en.json` key order — keep it that way).

---

## 6. Everything I stopped short of or flagged rather than changed

1. **Copy/Send on the handover report** still carry the narrative only, not
   the new outstanding-task list. §3.
2. **FL9 hint copy** drafted, not applied. §5.
3. **The voice example itself** (`voiceCapture.examplePatient`) untouched. §5.
4. **`DeleteConfirmModal.jsx` not wired.** A new component was written
   instead, so the deferred call about the demo-era components stays deferred.
   §1.
5. **`0001_init.sql` comment corrected in place** rather than via a no-op
   `0012`. Reversible in one hunk if you disagree. §4.2.
6. **`Confirmed` tasks count as outstanding** in the handover list. A
   judgement call, one line to change. §3.
7. **`AuthScreen`, `FacilityScreen`, `NoticeScreen`** still show raw provider
   errors. They were outside Phase 2's named four and I didn't extend the
   change to them. The helper in `utils/errors.js` is there if you want them
   aligned later.
8. **Remaining lint problems (10) are all pre-existing**: `setState` inside
   an effect in `PatientCard` (×2) and `RoomSelector`, the two
   `react-refresh/only-export-components` errors in `ChargeNurseDashboard`,
   the unused `nameSimilarity` in `roomMatcher.js`, and four
   `exhaustive-deps` warnings (`App.jsx`, `FacilityScreen`, `PatientCard` ×2).
   Six errors, four warnings — the same set as before this session minus the
   one Phase 4 cleared. None sit in code this session changed in a way that
   affects them, and `roomMatcher.js` is under the "don't change patient
   matching without discussion" rule anyway.
9. **No test suite was built**, per your instruction. What I *did* verify
   mechanically: every `t("…")` key used anywhere in `apps/web/src` resolves
   in both locales (280 keys checked, none missing), `en.json` and `fr.json`
   have identical key sets (386 each), and `translations_review.csv`
   regenerates byte-for-byte from the two JSON files in `en.json` order — the
   check was run against your existing CSV first and reproduced it exactly
   before any key was added, so the file's structure is preserved rather than
   reformatted.
10. **Nothing was deployed.** The `claude-proxy` Edge Function is untouched
    and undeployed, no `supabase` command was run, nothing was pushed. Worth
    remembering for Phase 3 testing that per `decisions.md` 2026-08-27, if
    anything AI-shaped behaves oddly, check the deployment before the code.
