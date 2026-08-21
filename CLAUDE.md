# CLAUDE.md

Noa is a clinical coordination web app for nurses (voice task capture, AI structuring, department routing, SBAR handoffs). Currently an early beta: synthetic patient data only, informal testing with a handful of nurse testers.

See `project.md` for goals and scope, `ARCHITECTURE.md` for system design, `decisions.md` for why things are the way they are, `scenarios.md` for what must keep working.

## Stack
React 19 + Vite (web, not native) + Tailwind. Supabase for auth/db/realtime. Claude API called only from Supabase Edge Functions, never client-side.

## Hard rules
- Never call the Anthropic API from client-side code. No API keys in the frontend bundle.
- Treat all patient fields as sensitive even though the beta uses synthetic data. The code path will handle real data later, don't build shortcuts that only work because current data isn't real.
- Don't change RLS policies without discussion, security-critical.
- Don't change patient matching logic (fuzzy match + disambiguation) without discussion, tuned from real nurse feedback on the demo.
- No native/Expo code paths. Web only until `decisions.md` says otherwise.
- Patient identifiers must always use the `Patient_Test_N` convention (app-generated), never a real room, bed, or hospital ID number. See `SECURITY.md`.
- Every query touching patients, tasks, or notes must be scoped to the current user's `facility_id`. No exceptions, no debug/admin bypass. Treat a cross-facility leak the same severity as a real PHI leak.

## Conventions
- Components: one file per dialog/card, matching the existing structure under `apps/web/src/components/`.
- AI calls: one `callClaude()`-style helper, JSON-only responses, fallback parser required for every prompt.

For deeper architecture or decision history, read the relevant doc above rather than expecting it here.
