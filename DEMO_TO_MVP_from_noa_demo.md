# Noa Health — Demo to MVP Feature Map

## What the demo has (and what carries over)

| Feature | Demo status | MVP action |
|---|---|---|
| Voice task capture (Speech API) | Working | Replace browser Speech API with Speechmatics |
| AI task parsing (Claude) | Working | Keep prompts, route through Bedrock for production |
| Fuzzy patient matching | Working | Keep logic in roomMatcher.js, port to MVP |
| Task lifecycle (Pending/Confirmed/Delayed) | Simulated timers | Replace with real department confirmation + n8n delay detection |
| Delay alerts + escalation | Working UI | Wire to Firebase push notifications |
| SBAR handoff summaries | Working (Claude) | Keep prompts, add persistence to Supabase |
| Patient updates + 10 languages | Working (Claude) | Keep prompts, add PDF export |
| Clinical notes + AI suggestions | Working | Keep prompts, persist to Supabase |
| Charge nurse dashboard | Working UI | Add real aggregation queries from Supabase |
| Contact management | Working UI | Persist to Supabase |
| Discharge planning | Working UI | Add discharge checklist customization per hospital |
| Task edit (manual + AI) | Working | Keep both modes |
| Patient search dropdown | Working | Keep pattern |

## What the demo doesn't have (MVP must add)

| Feature | Why it matters | Priority |
|---|---|---|
| Authentication | Nurses must log in. Role-based access. | Week 1 |
| Data persistence | Tasks/notes survive page refresh | Week 1 |
| Real-time sync | Two nurses see same patient's tasks | Week 2 |
| Offline queue | Hospital WiFi is unreliable | Week 5 |
| Push notifications | Alerts on lock screen when task delayed | Week 5 |
| Audit logging | Required for compliance | Week 6 |
| Error tracking (Sentry) | Know when things break in pilots | Week 7 |
| Usage analytics (PostHog) | Know what nurses actually use | Week 7 |

## AI prompts to preserve

These prompts are tuned and working. Port them directly:

1. **parseVoiceToTask** — extracts description, department, priority, patient name, room, deadline from natural speech
2. **parseTaskEditCommand** — modifies existing task fields from voice/text commands
3. **generateHandoffSummary** — creates SBAR format summary from patient data
4. **generatePatientUpdate** — creates plain-language family-facing update
5. **translateText** — translates edited text to target language
6. **parseNoteInput** — structures clinical notes
7. **parseNoteEditCommand** — modifies notes via voice/text
8. **generateSuggestions** — proposes clinical follow-ups after notes

## Key files from demo to reference

- src/utils/claudeAPI.js — all AI prompts and API call patterns
- src/utils/roomMatcher.js — fuzzy matching + disambiguation logic
- src/components/VoiceCapture.jsx — voice recording + task creation flow
- src/components/PatientCard.jsx — patient card layout, toggles, task/note display
- src/data/mockData.js — realistic patient/task data structure
- api/claude.js — serverless proxy pattern (reusable for Supabase Edge Functions)
