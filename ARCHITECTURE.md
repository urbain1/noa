# Noa: Architecture

## Stack
- **Frontend:** React 19 + Vite, Tailwind CSS. Deployed as a web app (Vercel). No native/Expo build for this phase. Testers use the Vercel preview of `build-mvp`, not production (see `decisions.md`, 2026-11-16).
- **Backend:** Supabase (Postgres, Auth, Realtime, Row Level Security). No custom Express/Prisma layer, `apps/api` is not used.
- **AI:** Claude API (Anthropic), called only from the `claude-proxy` Supabase Edge Function, which checks the caller's Supabase session. Never called from the client; no API key in the frontend bundle. The old `api/claude.js` Vercel function was removed (`decisions.md`, 2026-08-25). Prompts carried over from the demo, see `DEMO_TO_MVP_from_noa_demo.md`. The Edge Function reads the session only; it writes no rows.
- **AI model:** the nine older actions pin `claude-sonnet-4-5-20250929`, which Anthropic retires on 2026-11-30; they need migrating before then. `parseVoiceCommand` runs on `claude-sonnet-5-5` (`decisions.md`, 2026-11-16).
- **Voice capture:** Web Speech API, recognition language follows the nurse's UI language. Known limitation: unreliable on iOS Safari, and blocked entirely once the site is installed as a home-screen PWA. Keep the beta as a plain browser link on iOS testers' phones, don't prompt install. Revisit (Speechmatics, or native) only if this proves to be an actual blocker in testing.
- **Languages:** English and French via react-i18next (`apps/web/src/i18n`). The language is per nurse (`nurses.preferred_language`), applied on sign-in. Every user-facing string goes through `t()`; `translations_review.csv` mirrors the two locale files in `en.json` key order.
- **Region:** Supabase project in EU West (London, `eu-west-2`).

## Data model
The source of truth is `supabase/migrations/` (0001 to 0013), not `SCHEMA_noa_demo.md`, which describes the demo and includes tables that were never built (contacts, handoffs).

Tables: `facilities`, `nurses`, `patients`, `tasks`, `notes`, `alerts`, `audit_log`.

### Facilities: the tenant boundary
- `facilities` (id, name). A clinic, nursing home or ward, whatever the testing site is called informally.
- `nurses`, `patients`, `tasks`, `notes`, `alerts` and `audit_log` each carry their **own** `facility_id` (denormalised on tasks/notes/alerts to keep RLS simple), not one inherited through the patient.
- At signup a nurse creates a facility or picks one from a searchable list.
- RLS scopes every table by `facility_id = get_my_facility_id()` (a SECURITY DEFINER lookup, 0002). Every nurse at a facility sees the same shared test patients. CLAUDE.md also requires an explicit `facility_id` filter on every client query; new queries carry one, older ones in `lib/patients.js` rely on RLS alone (flagged for cleanup).

### Nurse self-service writes
`nurses` grants clients SELECT and INSERT only. A nurse changes their own language, notice acknowledgment and display name through narrow SECURITY DEFINER functions (`set_my_language` 0007, `acknowledge_notice` 0009, `set_my_name` 0011) rather than an UPDATE policy, which could not stop a nurse rewriting their own `facility_id`. `nurses.role` exists (nurse / charge_nurse / admin) but nothing reads it yet.

### Tasks: assignment and discharge planning (0011)
`tasks.assigned_to` and `tasks.completed_by` are data only: every nurse at the facility still sees every task. `tasks.task_type = 'discharge'` marks discharge-planning tasks, which are otherwise ordinary tasks. Nothing sets `patients.is_discharged` yet.

### Audit log (0012)
Every create, update and delete on `patients`, `tasks` and `notes` is written to `audit_log` by Postgres triggers (one SECURITY DEFINER function, `audit_row_change`). Each row holds who (`nurse_id`, NULL for system writes), action, resource type and id, `patient_id` (no foreign key, so history survives hard deletes), `facility_id`, time, and in `details` the names of the changed columns plus derived events (`completed`, `reopened`, `cancelled`, `discharged`, `assigned`, `unassigned`). Never field values. No-op updates are skipped. Clients cannot write to the table; nurses can read their own facility's rows (`audit_log_select_same_facility`). Read access to patient data is **not** logged yet.

Read side: `lib/auditLog.js`. The per-patient History dialog (patient card ⋯ menu, `PatientHistoryDialog`) lists the patient, its tasks and its notes, newest first, 50 at a time; `utils/historyFormat.js` turns rows into translated lines. If 0012 isn't applied the dialog says history isn't available yet.

Rollback: `supabase/rollback_0012.sql`. Verification: `supabase/verify_audit_log.sql` (paste into the SQL editor; changes nothing).

## Edit locking
Opening the edit dialog for a patient or task locks that single record for colleagues at the same facility (`decisions.md`, 2026-11-16; `scenarios.md` SC-16).

- **Lock:** Supabase Realtime Presence on one **private** channel per facility, `edit-locks:<facility_id>`, authorised by two `realtime.messages` policies (0013) that match the topic to the caller's facility. Each browser tab tracks at most one entry `{ nurse_id, record_type, record_id, since, gen }`, no patient data. Claims are ordered by `gen` (take-overs), then `since`, then presence key, the same way on every device.
- **Code:** `utils/editLock.js` (pure: ordering, the per-dialog state machine, conflict detection, a small store), `hooks/useEditLocks.js` (the channel, called once in `App`), `hooks/editLockContext.js` (what cards read), `hooks/useEditSession.js` (one dialog's lock, idle timer and stale-write guard), `EditLockBanner`, `EditLockNotice`, `TakeOverConfirmDialog`.
- **Release:** dialog close, tab close or lost connection, 2 minutes without input. Take over needs confirmation; the previous holder is told at once.
- **Stale-write check:** every dialog save re-reads the row and refuses to overwrite a change made since the dialog opened. This is the only protection against clients that don't take part in locking (testers on older builds) and when locking is unavailable (0013 not applied, Realtime down), in which case nothing is disabled.
- **Pending edits** are never dropped silently: values stay in the fields and the dialog lists what wasn't saved.
- The `supabase_realtime` publication on tasks/alerts/notes (0001) is still unused: patient and task lists do not live-update.

## Universal voice command
The main-page mic (`decisions.md`, 2026-11-16; `scenarios.md` SC-18 to SC-22). One utterance, up to five actions, each confirmed in its existing dialog. The per-patient capture on a patient card is separate and unchanged.

- **Parser:** Edge Function action `parseVoiceCommand`, in `supabase/functions/claude-proxy/voiceCommand.mjs`. Plain JavaScript with no Deno or Node APIs, so the Edge Function, the eval runner and the unit tests load the same file. It holds the server action registry (`ACTION_REGISTRY`: which fields each action type may carry, each with a validator), the context caps, the prompt builder, the deadline resolver and the handler. Input: transcript, language, the device's time and timezone, and a minimal context built by `utils/voiceContext.js`. Output: validated actions in spoken order, plus what was dropped past five and what was not understood. The model never sees a database id (tasks are aliased) and never picks a patient.
- **Client:** `utils/claudeAPI.js` `parseVoiceCommand` (reports the cause of a failure), `utils/voiceRegistry.js` (client registry: which dialog a type opens, how it pre-fills, whether it can be undone; a test keeps its lists identical to the server's), `utils/voiceResolve.js` (patient through the unchanged `roomMatcher.js`, exact match only; task ownership; nurse name), `utils/voiceQueue.js` (a pure, type-agnostic reducer: pending, done, skipped, failed, not available, blocked by a skipped creation, cancelled).
- **Screens:** `VoiceCapture` in `mode="command"` (speak or type, "what Noa understood", run again, limited mode), then `VoiceQueue`, which renders each step: `VoicePatientPicker` or `VoiceTaskPicker` when something is unresolved, then `AddPatientDialog`, `EditPatientDialog`, `AddTaskDialog`, `TaskEditDialog` (proposal mode), `AddNoteDialog`, `DischargeDialog` or `VoiceNoticeStep`, and finally `VoiceSummary`. Each dialog takes an optional `voiceStep` prop and behaves as before without it. Writes are the existing `lib/patients.js` functions, passed in from `App` with an explicit facility filter.
- **Undo:** `utils/voiceUndo.js` plans it from the before and after rows the queue keeps in memory; `VoiceUndoSession` runs it inside `useEditSession`; `VoiceUndoControl` is the 60-second button on a summary line. `lib/taskRestore.js` (`restoreTaskSnapshot`) is the only new write and is imported by `utils/voiceUndo.js` alone.
- **Fallback:** if the parser cannot run, the capture screen says so and offers the existing single-task path. Never silent.
- **Eval:** `evals/voice/` (fixtures, 112 cases, `score.mjs`, `run.mjs`, `RESULTS.md`). `npm run eval:voice` from `apps/web` runs every case through the deployed handler against the real API, with `ANTHROPIC_API_KEY` from the shell environment only. `CLAUDE.md` requires a run after any change to the parser prompt.

## Tests
Vitest + React Testing Library in `apps/web` (`npm test`). jsdom environment, one setup file (`src/test/setup.js`: jest-dom matchers, `lib/supabase` mocked so no test reaches Supabase, language reset to English), TZ fixed to UTC, tests next to the code they cover (`*.test.js(x)`). Current suites: the history line formatter, the lock state machine and stale-write detection, the edit-session hook, the History dialog, and for the voice command: the parser module (validation, caps, deadlines across timezones), the eval scorer, the client call, the registry, resolver, queue and undo logic, `restoreTaskSnapshot`, the task dialog's proposal mode, the queue flow, the capture screen's limited mode, and the guarded undo. The parser's accuracy against the real model is measured separately by `npm run eval:voice`. SQL is verified with `supabase/verify_audit_log.sql` against the real project. Fixtures use `Patient_Test_N` labels and invented names only.

## Planned additions once roadmap features are designed
- A ward-manager layer for duties and per-nurse visibility. Note `tasks.assigned_to` (0011) already exists as data only; it changes nothing about who sees a task.
- A `task_transfers` table for direct nurse-to-nurse task handoff.

## What's explicitly not built yet
- Auth roles in use: `nurses.role` exists but no screen or policy reads it. Ward manager role not modeled.
- Logging of **read** access to patient data (write auditing exists, see above). Required before real data.
- Live updates of patient/task lists between nurses (only edit locks use Realtime).
- Any native mobile shell.
- Push notifications.
- Offline queue, revisit once real ward WiFi conditions are tested.

## Folder structure
```
noa/
  apps/web/              # React + Vite frontend
    src/components/      # one file per dialog/card
    src/hooks/           # shared hooks (operation status, edit locks)
    src/lib/             # Supabase data access (patients, nurses, audit log, undo's task restore)
    src/utils/           # pure logic (matching, sorting, history lines, locks, voice queue)
    src/i18n/            # en/fr locale files
    src/test/            # Vitest setup
  supabase/
    migrations/          # 0001 to 0013, applied by hand
    functions/           # Edge Functions: claude-proxy (index.ts + voiceCommand.mjs)
    rollback_NNNN.sql    # one per migration that needs it
    verify_audit_log.sql # SQL-editor check for 0012
  evals/voice/           # voice-command eval: fixtures, cases, scorer, runner, results
  project.md
  ARCHITECTURE.md
  decisions.md
  scenarios.md
  CLAUDE.md
  SECURITY.md
```
