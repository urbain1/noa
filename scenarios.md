# Noa — Scenarios

Real-world and edge-case scenarios the app needs to handle. Not optional polish, this is a clinical coordination tool, and these are the failure modes that matter most.

## Carried over from the demo (still valid, see TESTING_noa_demo.md for full detail)
- Voice task capture: fuzzy/ambiguous/partial patient name matching, stat priority, spoken-number deadlines, API-failure fallback (VT-1 to VT-10)
- Patient matching edge cases: accented names, name collisions, room-letter distinctions (PM-1 to PM-4)
- Task lifecycle, delay alerts, escalation (TL-1 to TL-6)
- Handoff summary generation and accuracy (HS-1 to HS-3)
- Offline/error handling: API timeout, API failure, no mic permission (OFF-1 to OFF-3)

These transfer directly, the underlying logic (roomMatcher.js, claudeAPI.js prompts) carries into the beta unchanged.

## New for the beta (real backend + informal, personal-device use)

**SC-1: Synthetic data enforcement**
A tester types what looks like a real patient's full name or NHS number into the app.
Expected: nothing currently blocks this. Interim mitigation is an in-app reminder on every entry screen. Flag as a known gap, not a solved problem.

**SC-2: Session persistence across shifts**
A nurse logs in Monday, closes the app, opens it again Wednesday.
Expected: session persists (Supabase Auth), no re-login friction that discourages casual use.

**SC-3: Two testers, overlapping synthetic patients**
Two nurse-testers both use "test patient" style data that happens to overlap, since casual testers may not coordinate on unique names.
Expected: one shared roster per facility. Decided 2026-08-21 (`decisions.md`): RLS is facility-scoped, so every nurse at a facility sees and works on the same synthetic patients. Overlap between testers at the same facility is expected; testers at different facilities never see each other's data (SC-11). Concurrent edits to the same record are covered by SC-16.

**SC-4: Auth session expires mid-task-entry**
Expected: no data loss, a clear re-login prompt, task draft preserved if possible.

**SC-5: Ward manager duty delegation** *(roadmap, not yet built)*
Placeholder: a manager assigns a duty to a specific nurse; that nurse, and only that nurse, sees it by default, and can share it onward to a named colleague.

**SC-6: Direct task handoff between nurses** *(roadmap, not yet built)*
Placeholder: nurse A sends a task with full context, not just a summary line, to nurse B's account at shift end; it appears as an actionable task in B's list.

**SC-7: Urgency-sorted task view** *(built: Tasks screen)*
Cross-patient list sorted by priority/deadline. Expected: the same ordering as each patient card (both use `utils/taskSort.js`), no drift between the two.

**SC-8: Incomplete tasks in handover report** *(built)*
Expected: the handover report shows an outstanding-task list above the narrative, overdue tasks highlighted, completed and cancelled tasks left out, read from task data rather than parsed from the AI text.

**SC-9: Language toggle mid-session** *(built)*
A French-speaking tester switches UI language mid-session. Expected: the choice is saved per nurse and applies everywhere at once; voice recognition follows the UI language from the next recording; no loss of in-progress drafts.

**SC-10: Persistent label pointing to a different real patient over time**
A tester keeps using `Patient_Test_1` across days, but the real patient they had in mind has since changed (discharge, shift change to a different patient).
Expected: currently unenforced, relies on the tester manually retiring the label per the `SECURITY.md` guardrail. Worth a lightweight in-app nudge later (e.g. "still the same patient?") once easy to add.

**SC-11: Cross-facility isolation, treat as high priority**
A nurse at facility XX must never see facility YY's patients, tasks, or notes, under any query path.
Expected: this is the primary privacy boundary for the beta. Test it deliberately, not as an afterthought, the same RLS code path handles real data later.

**SC-12: Duplicate facility names**
Two testers each create a facility, both typing something like "St Mary's" with slightly different spelling or punctuation, unaware the other already created one.
Expected: currently unhandled. Interim mitigation: a search-as-you-type list at signup so people notice and select the existing one rather than creating a duplicate. No merge tool yet if it happens anyway.

**SC-13: Open self-serve facility join**
Any signing-up nurse can create a new facility or join any existing one from the list, with no verification of actual affiliation.
Expected: acceptable at current scale (every tester personally known to the founder), not acceptable once testers extend beyond that circle. Flagged in `SECURITY.md` as a known gap, not solved here.

**SC-14: Numeric label collision in matching**
Since every synthetic label shares the words "Patient" and "Test", searching for a genuinely nonexistent patient number, or a bare location-label phrase, tends to surface as an ambiguous "pick from everyone" disambiguation rather than a true zero-match.
Expected: safe failure mode, requires explicit nurse selection, never auto-fires on the wrong patient. Not yet solved, would need to touch the "any shared word matches" fallback rule itself, its own discussion.

**SC-15: Mixed-language facility, task/note readability**
A facility has both English- and French-speaking nurses. A French nurse creates a task or note; the AI-generated description comes back in French. An English-only nurse reading it later may not understand it, or vice versa.
Expected: currently unsolved. Content is recorded in whatever language it was created in, not translated for other readers. Accepted for now given the beta's small, personally-known tester groups, worth revisiting if a real mixed-language facility pilot happens.

**SC-16: Two nurses edit the same record at the same time**
Nurse A opens the edit dialog for `Patient_Test_3`'s task; nurse B, at the same facility, opens the same task a moment later.
Expected: B sees "[A] is currently editing this. Wait, or ask them to finish.", cannot edit, and that task's one-tap actions (complete, repage, escalate, assign, cancel discharge planning) are disabled for B. Other tasks and the patient itself stay editable, and adding tasks or notes is never blocked. The lock releases when A closes the dialog, closes the tab or loses connection, and after 2 minutes without input. B can "Take over" after a confirmation; A is told at once and A's dialog stops saving. Whatever A had typed stays on A's screen and is listed as not saved; "Continue editing" re-acquires, re-checks for changes, then lets A save. If someone changed the record after A opened it (including a tester on an older build, which takes no part in locking), A's save is refused and A sees who changed what, with "Save mine anyway" or "Discard mine and reload". Nothing is overwritten or lost silently. If live locking is unavailable (migration 0013 not applied), nothing is disabled and the change check still applies. See `decisions.md`, 2026-11-16.

**SC-17: Patient history view**
A nurse opens a patient card's ⋯ menu, then History.
Expected: the patient's changes and those of its tasks and notes, newest first, 50 at a time, in the nurse's language: "Task completed by [nurse], 16 Nov 14:02", "Task modified by [nurse] (priority, deadline)". A task or note that still exists is named by its current text; a deleted one shows a generic line. No field value ever comes from the log itself. Only the nurse's own facility's history is visible. If migration 0012 isn't applied yet, the dialog says history isn't available and the card keeps working.
