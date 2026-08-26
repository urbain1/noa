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
Expected: currently unhandled, RLS was designed around assigned patients, not overlapping test data. Needs a decision before multi-tester testing starts: separate synthetic rosters per tester, or one shared test roster.

**SC-4: Auth session expires mid-task-entry**
Expected: no data loss, a clear re-login prompt, task draft preserved if possible.

**SC-5: Ward manager duty delegation** *(roadmap, not yet built)*
Placeholder: a manager assigns a duty to a specific nurse; that nurse, and only that nurse, sees it by default, and can share it onward to a named colleague.

**SC-6: Direct task handoff between nurses** *(roadmap, not yet built)*
Placeholder: nurse A sends a task with full context, not just a summary line, to nurse B's account at shift end; it appears as an actionable task in B's list.

**SC-7: Urgency-sorted task view** *(roadmap, not yet built)*
Placeholder: cross-patient list sorted by priority/deadline; verify it stays in sync with per-patient views, no drift between the two.

**SC-8: Incomplete tasks in handover report** *(roadmap, not yet built)*
Placeholder: the handover report must visually distinguish incomplete/overdue tasks from completed ones, not just list them uniformly.

**SC-9: Language toggle mid-session** *(roadmap, not yet built)*
Placeholder: a French-speaking tester switches UI language mid-session. Expected: no loss of in-progress voice capture or drafts. Verify whether voice recognition language should follow the UI language choice.

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
