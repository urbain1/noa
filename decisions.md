# Noa — Decisions Log

Newest first. Superseded decisions are kept, marked, not deleted, so the reasoning stays visible.

## 2026-08-27 — Task assignment as data only, discharge tasks get their own marker, no router yet
**Decision:** `tasks.assigned_to` and `tasks.completed_by` added (`0011`) as data only. Task *visibility* is deliberately unchanged: `tasks_facility_scope` still shows every task at a facility to every nurse there. "Nurses see only their own tasks" stays with the ward-manager design session (`project.md`), and must not be inferred from these columns existing.
**Why `completed_by` rather than reusing `created_by`:** the nurse who raises a task is very often not the one who closes it, and Unit View's personnel overview reports created / assigned / completed as three separate figures. Tasks completed before `0011` are reported as "completed by unknown" and are never backfilled from `created_by` — that would assert something that was never recorded.
**Decision:** discharge-planning tasks are marked with a new `tasks.task_type` column rather than by overloading `department`. The workflow legitimately creates tasks in two different departments (Nursing for notifying the patient, Social Work for placement), so tagging either one would corrupt Unit View's department bottleneck counts. The previous approach — inferring "discharge" from the description text — over-matches any task that merely mentions discharge, and is kept only as a fallback for rows created before `0011`.
**Decision:** discharge *planning* does not set `is_discharged`. Flagging it would remove the patient from the roster the moment planning started, taking the new tasks with them. Actually discharging a patient remains unwired; see `FINAL_REVIEW.md`.
**Decision:** one shared sort function (`utils/taskSort.js`) for Patient View and the new Tasks screen, reusing `isTaskOverdue` rather than writing a second definition of "overdue" (`scenarios.md` SC-7). A task that is both Stat and overdue sorts in the Stat group only and appears once; Unit View's Attention Needed *counts* it under both figures, because "how much is urgent by order" and "how much has slipped" are two different questions and one merged number answers neither.
**Decision:** still no router. The three top-level screens became one `view` state value instead of several booleans, with overlays layered on top, which is what makes back navigation return to the previous context rather than the home screen. The cost (no deep links, browser back exits the app, reload returns to My Patients) is documented in `FINAL_REVIEW.md`; revisit if testers report the back button as broken.
**Also this session:** the Discharge Patient list and dialog were reading the demo-era `name`/`room` fields, which don't exist on Supabase rows — the cause of the blank list. Same bug was present in Unit View's safety flags and attention list. Both now read `label` / `location_label` / `diagnosis`. Voice patient creation was added, reusing the existing voice capture and the existing Add Patient form as its review step: a patient is never created straight from a transcript, and unextractable fields stay blank rather than being invented.

## 2026-08-26 — EHR integration and cross-role orchestration: considered, explicitly deferred
**Decision:** Hospital EHR integration (FHIR/SMART on FHIR, read or write-back) and expansion beyond nurse-to-nurse coordination (porters, pharmacy, transport, bed management) are not in scope for the current beta or the near-term roadmap. Noted here so a future session doesn't treat either as live scope by default.
**Why:** Both were raised via external research (EHR hosting/integration timelines, and a network-effects argument for cross-role orchestration), not by a tester or a confirmed next-phase plan. `project.md`'s next phase is a single small clinic or nursing home, not a hospital ward with EHR/porter/pharmacy systems, and `ARCHITECTURE.md` confirms no role beyond nurse/charge nurse is modeled yet. Acting on either now would be building ahead of validated demand.
**What doesn't change:** The existing architecture decisions stay as they are, direct Supabase/RLS access from the client, no backend-for-frontend layer, no Terraform/IaC. The 2026-08-21 "Supabase, not custom Node/Express/Prisma" decision was reasoned specifically to avoid this kind of premature infrastructure, and nothing here overrides that reasoning.
**Revisit when:** A real facility in a formal pilot specifically requests EHR read/write access (see `SECURITY.md` for what a real pilot requires first), or nurse-tester feedback surfaces genuine cross-role coordination pain that the current nurse-only model can't address.

## 2026-08-25 — Patient location: synthetic label, not real room/bed number
**Decision:** Added an optional `location_label` field to patients (e.g. "Test Room A"), instead of real room/bed number fields as originally considered.
**Why:** Real room/bed numbers are explicitly prohibited as patient identifiers in `SECURITY.md` and `CLAUDE.md`, they double as the hospital's own lookup key. A synthetic label gives the same organizational usability nurses actually want without the re-identification risk, following the same pattern as the `Patient_Test_N` label itself.
**Also this session:** `allergies` and `admission_date` restored to `patients`, present in the original demo schema, dropped when `0001_init.sql` was written, no identifier conflict since both are clinical context, not identifying.

## 2026-08-26 — Data-entry notice finalized and implemented, both languages
**Confirmed:** The consent notice flagged as missing a few sessions back is now finalized, English and French, drafted in its own dedicated session, adds an AI-mistakes warning and sharper direct/indirect identifiability language beyond the earlier working draft. Full text in `SECURITY.md`.
**Implemented:** `NoticeScreen` gates everything below it in `App.jsx`, facility selection and dashboard included, for every nurse whose `notice_acknowledged_at` is null, including pre-existing testers, nobody grandfathered out. `0008_notice_acknowledgment.sql` adds the tracking column; `0009_notice_acknowledgment_rpc.sql` adds `acknowledge_notice`, a SECURITY DEFINER function, same reasoning as `set_my_language` (`0007`): `nurses` grants clients no UPDATE, and a narrow one-column function avoids opening a row policy that could also let a nurse rewrite `facility_id`. Brand-new signups have no `nurses` row yet when the notice is shown, so `App.jsx` tracks that acknowledgment in local state only, and `FacilityScreen` stamps `notice_acknowledged_at` directly in the same insert that creates the row.

## 2026-08-26 — Reader-side translation: parked, not pursuing
**Decision:** The "translate content based on who's viewing it" idea, raised then quickly reconsidered, is parked, not being built. Nurses are expected to pick one language and stick with it; the mixed-language-facility scenario this would solve for is speculative, not a confirmed near-term testing reality, it mainly surfaced because the founder tests in both languages personally.
**Supersedes:** Nothing formally, `scenarios.md` SC-15 already documented the underlying limitation as accepted. This confirms it's a deliberate call, not just left unaddressed by default.

## 2026-08-26 — French localization: mixed-language records accepted, consent notice gap flagged separately
**Decision:** Task and note descriptions stay recorded in whatever language they were created in, no automatic translation for other readers. At a facility with both English- and French-speaking nurses, this means genuinely mixed-language records, a French-authored task description may not be readable to an English-only nurse on a later shift. Accepted as a known limitation for the beta, not solved now, see `scenarios.md` SC-15.
**Also discovered, not yet addressed:** `SECURITY.md`'s mandated data-entry consent notice, required acknowledgment before first use, does not appear to have ever been built as an actual in-app screen across any session so far, despite being fully specified in the doc. Separate gap from language work, explicitly excluded from this session's scope. Needs its own future session.

## 2026-08-26 — French localization: scope and per-nurse language preference
**Decision:** French localization covers UI chrome plus existing AI-generated content, SBAR summaries, follow-up suggestions, and voice-parsed medical term expansion. Does not include building the "patient update" family-facing feature, that stays deferred and unbuilt regardless of language.
**Decision:** Language preference is stored per-nurse (`nurses.preferred_language`, `0006_nurse_language_preference.sql`), not facility-level. Each nurse chooses independently, defaults to English for all existing and new accounts.
**Why:** Matches `project.md`'s roadmap note that scope should include AI-generated content, not just static chrome, now that a French tester is confirmed. Per-nurse avoids facility-default cascade logic and fits Switzerland's multilingual reality, where nurses at the same facility may not share a language preference.

## 2026-08-26 — Per-patient SBAR confirmed working, age field added
**Confirmed:** Per-patient SBAR summary works end to end, tested on a real patient with tasks and clinical notes, note content correctly woven into the generated report. Corrects the "unconfirmed" status in the Day 5 entry below.
**Decision:** Added an optional `age` field to patients (`0005_patient_age.sql`), a plain integer rather than a real date of birth, these are synthetic test patients, a birth date would encode more fake-personal detail than needed, an age is enough for clinical context and satisfies the SBAR prompt's `[Age]y/o` line. Resolves the "age has no home in the schema" gap the previous session correctly flagged rather than worked around.
**Known follow-up, being fixed alongside the age wiring:** unit-wide SBAR generation (three-dot menu, and Unit View's copy of it) lacks the loading state the per-patient version has, and has a separate bug where the result doesn't render when triggered from Unit View specifically, it does generate, just doesn't display until navigating elsewhere.

## 2026-08-26 — Day 5 scope correction: SBAR handoff summaries already work
**Correction:** The original week plan assumed SBAR handoff generation would be cut from week one as too heavy for early days. Confirmed on Day 4's phone testing that the all-patients version (three-dot menu → "Generate handoff report") already works end to end, real patient data, real Edge Function, correct output, with no dedicated wiring needed.
**Correction to the correction:** that only confirms the all-patients entry point. The demo's per-patient SBAR option (open a patient card, generate SBAR for that patient only, see `TESTING_noa_demo.md` HS-3) is not currently exposed anywhere in the rebuilt UI. Not confirmed broken, just not there to test. Added to Day 5.
**What's actually still deferred:** Charge nurse dashboard, discharge planning, and multilingual patient updates remain genuinely unbuilt. Task editing and per-patient SBAR are the two real items left from Day 5.

## 2026-08-25 — Patient matching: numeric labels require exact match, not fuzzy
**Decision:** Approved Claude Code's fix to `roomMatcher.js`'s typo-tolerance: purely-numeric label words (the "1" in `Patient_Test_1`) now require exact equality, no longer subject to the 1-edit-distance tolerance originally built for name typos.
**Why:** The fuzzy matcher was tuned for real names ("Sara"/"Sarah"), where a 1-character tolerance catches genuine transcription errors. Applied to `Patient_Test_N` labels, it meant any two single-digit numbers were treated as interchangeable, so `Patient_Test_1`, `_2`, `_3` could silently fuzzy-match each other and return the wrong patient with no disambiguation shown. A real patient-safety-relevant bug: silent misroute, not a visible failure.
**Scope:** Exempted numeric tokens only, alphabetic typo-tolerance is untouched, per `CLAUDE.md`'s rule not to change patient matching without discussion, this was flagged and approved before implementation.
**Also this session:** `roomMatcher.js` now matches against real patient fields (`label`, `location_label`) instead of a mock name/room shim. "+Add Task" from a known patient's card now skips matching entirely rather than running the full facility-wide match.

## 2026-08-25 — Day 3 complete: Claude API fully behind the Supabase Edge Function
**Confirmed:** `api/claude.js` and its `vercel.json` routing removed entirely. `claudeAPI.js` now calls the `claude-proxy` Edge Function exclusively, no direct-to-Anthropic path remains anywhere in client code. Verified end-to-end: a task created through the app came back with AI-expanded medical terminology and a computed deadline, confirmed via browser Network tab (`claude-proxy` 200, no requests to `api.anthropic.com`) and console output.

## 2026-08-25 — Supabase region: actually London (eu-west-2), correcting the record
**Correction:** The prior entry below said the project was created in Ireland (`eu-west-1`). Checked directly with `npx supabase projects list`: the project is actually in **West Europe (London), `eu-west-2`**. The Ireland entry was based on which region was selected as "recommended" in the dashboard at creation time, not what was actually provisioned, an assumption that turned out wrong.
**Why this doesn't need fixing:** London was one of the two regions `SECURITY.md` named from the start ("London or Frankfurt"), before Ireland was substituted in. Same adequacy reasoning applies identically, UK, France, and Switzerland are all still covered.
**Also confirmed:** Supabase projects cannot be moved between regions after creation, only by creating an entirely new project and migrating everything over. Since London already satisfies the requirement, no migration is warranted here.
**Supersedes:** The 2026-08-24 entry below, which incorrectly stated the project was in Ireland. `SECURITY.md` and `ARCHITECTURE.md` have been corrected to name London.

## 2026-08-24 — Supabase region: Ireland (eu-west-1), not London/Frankfurt as originally planned
**Decision:** Supabase project created in EU West (Ireland, `eu-west-1`), not London or Frankfurt as originally specified in `SECURITY.md`.
**Why:** Ireland was Supabase's own recommended region at project creation, likely reflecting AWS region maturity and/or proximity, not a compliance factor. No compliance difference either way, Ireland is EU/EEA the same as Frankfurt or London, covers UK, France, and Switzerland identically per the adequacy reasoning already documented.
**Supersedes:** The "London or Frankfurt" wording in the 2026-08-21 compliance-scope entry below. `SECURITY.md` and `ARCHITECTURE.md` have been updated to name Ireland as what was actually built.
**[Corrected 2026-08-25]:** This entry was itself wrong, see the entry above. The project was never actually in Ireland.

## 2026-08-21 — Testing scope: US added concurrently, not phased
**Decision:** Beta testing now includes nurses in the US alongside the UK, France, and Switzerland, all concurrently, rather than the originally planned sequencing of US testing 3-6 months after the others.
**Why:** Founder already has US nurse contacts available now. No reason to delay given the beta stays synthetic-data-only regardless of tester location.
**What doesn't change:** The synthetic-data-only rule applies identically across all four regions (see `SECURITY.md`). Concurrent testing does not mean concurrent compliance readiness for real patient data, the US path (signed BAA, HIPAA-ready API configuration) is exactly as deferred as the UK/France/Switzerland paths, it's simply no longer sequenced after them.
**Supersedes:** `project.md`'s earlier framing of US expansion as a distinct "later" phase, now folded into the same concurrent beta as the other three regions.

## 2026-08-21 — Multi-tenancy: facility-scoped data, relaxed RLS for beta
**Decision:** Add an `facilities` table as the top-level tenant boundary. At signup, a nurse creates a new facility or selects an existing one from a list. Patients, tasks, and notes are scoped to `facility_id`, so every nurse at the same facility sees the same shared test patients.
**Why:** Testers are grouped by clinic/nursing home, and testing needs shared visibility within that group, nurse A and B at clinic XX see the same `Patient_Test` records, not just individually-assigned ones.
**Departure from `SCHEMA_noa_demo.md`:** the demo-era `patient_assignments` model (per-nurse assignment) is relaxed to facility-wide visibility for the beta. Re-tighten to per-nurse assignment when moving to a real pilot with actual patient-load boundaries.
**Known gap:** no verification that a nurse selecting or creating a facility actually belongs to it, fully self-serve. Acceptable only because every current tester is personally known to the founder. Needs an invite-code or approval step before any less-trusted rollout.
**Future direction (not yet implemented):** at signup, selecting a facility could require a clinician-specific code generated by that facility's own IT team, or another verification method to be worked out later. Revisit once testing moves beyond personally-known testers to a full ward or clinic.

## 2026-08-21 — UI: English/French toggle added to roadmap
**Decision:** Add a language switch (English/French) to the roadmap.
**Why:** Beta testers span the UK, France, and Switzerland. French-speaking testers need the interface itself in French, not just the AI-generated patient-update translations the demo already handled separately.
**Status:** Roadmap, not yet designed or built. See `project.md`.

## 2026-08-21 — Consent/notice language: jurisdiction-generic, not region-specific
**Decision:** The in-app data-entry notice avoids naming a specific regulation (UK GDPR, HIPAA, etc.) and instead refers generally to "your local data protection laws and professional obligations," so the same notice works unmodified for testers in the UK, EU, and eventual US testing.
**Why:** Testers span multiple jurisdictions from the start of this beta. Full text in `SECURITY.md`.

## 2026-08-21 — Patient identifier convention: persistent test labels, not session-scoped
**Decision:** Test patients are labeled `Patient_Test_1`, `Patient_Test_2`, etc., app-generated, never a real room, bed, or hospital ID number. These labels persist across sessions and days for the life of one ongoing test case, since usage is meant to span multiple shifts and handoffs between nurses.
**Why:** Real hospital room/bed/patient numbers double as the hospital's own lookup key and aren't meaningfully de-identified. A persistent-but-disconnected label preserves testing continuity across handoffs without that link.
**Guardrail:** If the real patient a tester has in mind changes, retire the label and start a new one. Reusing a label across different real patients recreates the same problem as a real room number, a stable identifier that silently points to different people over time.

## 2026-08-21 — Platform: stay web, not native/Expo
**Decision:** Build the beta as a web app (React + Vite + Vercel), not React Native/Expo.
**Why:** Fastest path to nurse testing. No App Store/Play Store review, no Apple Developer enrollment, one codebase works on iOS and Android via a shared link.
**Supersedes:** The demo-era `ARCHITECTURE_noa_demo.md` called Expo a permanent, non-negotiable choice. Reversed because fast validation currently outweighs long-term platform purity.
**Revisit when:** Browser limitations (push notifications, offline reliability) become an actual blocker from real nurse feedback, not before.

## 2026-08-21 — Backend: Supabase, not custom Node/Express/Prisma
**Decision:** Use Supabase directly for auth, database, and realtime. `apps/api` is dropped.
**Why:** Removes weeks of auth/DB/realtime plumbing. `SCHEMA_noa_demo.md` was already written for Supabase (RLS using `auth.uid()`) and is reusable as-is.
**Supersedes:** An earlier plan, from a prior session in this project, to build a custom Node/TypeScript/Express/Prisma backend.
**Revisit when:** Supabase's realtime performance degrades at real scale (100+ concurrent ward users), unlikely before a real pilot.

## 2026-08-21 — No real patient data in the beta, at any point
**Decision:** Synthetic/made-up patient data only, even though testers are personal contacts using their own phones informally.
**Why:** Informal, personal-device use of real patient data is a documented confidentiality risk, and isn't covered by any exemption under UK GDPR for health data. Protects the testing nurses professionally and avoids unlicensed processing of special-category data.
**Status:** Hard rule. See `SECURITY.md`.

## 2026-08-21 — Compliance scope: minimum viable for pre-pilot testing
**Decision:** No BAA, no DPIA, no ICO registration yet. Only requirement enforced now: Supabase project region set to EU (London or Frankfurt).
**Why:** These processes are triggered by real patient data, which the beta doesn't touch.
**Revisit when:** Approaching a formal pilot with a real clinic, nursing home, or hospital ward (targeted 3-6 months out), or before any US expansion (requires a signed BAA with Anthropic, since standard API access without the HIPAA-ready configuration is not eligible for PHI).

## 2026-08-21 — Claude API data residency: known gap, deferred
**Fact, not yet a decision:** Anthropic's direct API stores data in the US by default regardless of processing region, unless a custom agreement says otherwise. EU-resident processing/storage for Claude models is available via Google Cloud Vertex AI's EU regions, not the direct Anthropic API.
**Why this doesn't block the beta:** No real PHI is in scope yet.
**Revisit when:** Real patient data is introduced and UK/EU residency for AI processing becomes a hard requirement.

## [demo-era, superseded] Speech-to-text: Speechmatics
Originally planned for medical-term accuracy and accent independence. Deferred: Web Speech API is free and already integrated. Only worth the swap if testing shows it's an actual accuracy problem.

## [demo-era, superseded] Workflow automation: n8n
Originally planned for task routing and delay detection. Deferred: not needed at beta scale. Revisit if routing rules get complex enough to need a visual builder.
