# Noa — Architecture

## Stack
- **Frontend:** React 19 + Vite, Tailwind CSS. Deployed as a web app (Vercel). No native/Expo build for this phase.
- **Backend:** Supabase (Postgres, Auth, Realtime, Row Level Security). No custom Express/Prisma layer, `apps/api` is not used.
- **AI:** Claude API (Anthropic), called only from a Supabase Edge Function, never from the client. Prompts carried over from the demo, see `DEMO_TO_MVP_from_noa_demo.md` for the full list.
- **Voice capture:** Web Speech API. Known limitation: unreliable on iOS Safari, and blocked entirely once the site is installed as a home-screen PWA. Keep the beta as a plain browser link on iOS testers' phones, don't prompt install. Revisit (Speechmatics, or native) only if this proves to be an actual blocker in testing.
- **Region:** Supabase project set to an EU region (London or Frankfurt) from creation.

## Data model
See `SCHEMA_noa_demo.md` for the base Postgres schema (patients, tasks, notes, contacts, handoffs, alerts, audit_log) and RLS policies. Written for Supabase already, reusable close to as-is, with one structural change needed now, below.

### Facilities: new top-level tenant boundary, needed now
- New `facilities` table (id, name, created_at). Represents a clinic, nursing home, or ward, whatever the testing site is called informally.
- `nurses` and `patients` (and by extension tasks/notes) get an `facility_id` foreign key.
- At signup, a nurse creates a new facility or selects an existing one from a searchable list.
- RLS scoped by `facility_id`: every nurse at the same facility sees the same shared test patients. This relaxes the demo-era `patient_assignments` per-nurse model to facility-wide visibility. See `decisions.md`.

### Planned additions once roadmap features are designed
- A `duties`/assignment layer for the ward manager screen, distinct from `tasks`.
- A `task_transfers` table for direct nurse-to-nurse task handoff.

## What's explicitly not built yet
- Auth roles beyond nurse / charge nurse. Ward manager role not yet modeled.
- Any native mobile shell.
- Push notifications.
- Offline queue, revisit once real ward WiFi conditions are tested.
- Audit logging wiring (`audit_log` table exists in the schema, nothing writes to it yet).

## Folder structure
```
noa/
  apps/web/        # React + Vite frontend, moved from the demo via git mv
  project.md
  ARCHITECTURE.md
  decisions.md
  scenarios.md
  CLAUDE.md
  SECURITY.md
  supabase/
    migrations/
    functions/      # Edge Functions, includes the Claude proxy
```
