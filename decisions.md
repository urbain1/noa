# Noa — Decisions Log

Newest first. Superseded decisions are kept, marked, not deleted, so the reasoning stays visible.

## 2026-08-25 — Patient location: synthetic label, not real room/bed number
**Decision:** Added an optional `location_label` field to patients (e.g. "Test Room A"), instead of real room/bed number fields as originally considered.
**Why:** Real room/bed numbers are explicitly prohibited as patient identifiers in `SECURITY.md` and `CLAUDE.md`, they double as the hospital's own lookup key. A synthetic label gives the same organizational usability nurses actually want without the re-identification risk, following the same pattern as the `Patient_Test_N` label itself.
**Also this session:** `allergies` and `admission_date` restored to `patients`, present in the original demo schema, dropped when `0001_init.sql` was written, no identifier conflict since both are clinical context, not identifying.

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
