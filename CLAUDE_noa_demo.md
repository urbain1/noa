# CLAUDE.md — Noa Health MVP

## What is Noa

Noa is an AI-powered ward coordination OS for hospital nurses. Nurses speak tasks, Noa structures them with AI, routes them to departments, tracks status in real-time, and alerts when things are delayed. At shift change, Noa generates SBAR handoff summaries.

## Repo context

This is the production MVP, not the demo. The demo lives at github.com/urbain1/noa-health-demo (React + Vite, client-side only, mock data). This repo is the real product with persistence, auth, and real-time sync.

## Tech stack

- **Mobile app:** React Native via Expo
- **Backend/DB:** Supabase (Postgres, Row Level Security, real-time subscriptions)
- **Auth:** Supabase Auth
- **Speech-to-text:** Speechmatics API (medical terminology, accent-independent)
- **AI reasoning:** Claude API via Anthropic (intent extraction, task structuring, handoff generation, clinical suggestions)
- **Workflow automation:** n8n (self-hosted, task routing, delay detection, alert triggers)
- **Push notifications:** Firebase Cloud Messaging
- **Error tracking:** Sentry
- **Analytics:** PostHog (self-hosted)

## Key architecture decisions

1. **Claude API for all AI**: single model for voice parsing, task structuring, handoff summaries, patient updates, clinical suggestions, and translations. Prompts are in src/utils/claudeAPI.js (or equivalent).
2. **Supabase real-time**: tasks update across devices via Supabase subscriptions. No polling.
3. **Offline queue**: voice recordings and task creation queue locally when offline, sync when connection returns. Nurses can't lose tasks because of bad WiFi.
4. **No audio retention**: recordings are transcribed and immediately deleted. Only the transcript is stored.
5. **Role-based access**: nurses see their patients. Charge nurses see the unit. Admins see everything. Enforced via Supabase RLS.

## File structure conventions

- src/components/ — React Native components
- src/screens/ — top-level screens (Dashboard, VoiceCapture, PatientDetail, etc.)
- src/utils/ — API helpers, matching logic, formatters
- src/data/ — types, constants, Supabase schema helpers
- supabase/ — migrations, RLS policies, edge functions

## AI prompt conventions

All Claude API calls go through a single callClaude() helper. Every prompt:
- Has a system prompt defining the role and output format
- Returns JSON only, no markdown wrapping
- Has a fallback parser if the API call fails
- Includes examples in the system prompt for structured output

## Testing approach

- Unit tests for: roomMatcher (fuzzy matching), task parsing fallback, date/deadline extraction
- Integration tests for: voice-to-task flow, handoff generation, patient update + translation
- E2E: voice command → task on patient card → delay alert → escalation → handoff summary

## What NOT to change without discussion

- Supabase RLS policies (security-critical)
- Claude API prompt structures (tuned from 25+ nurse interviews)
- Patient matching logic (fuzzy match + disambiguation flow)
- Offline queue sync logic

## Compliance notes

- UK GDPR + Data Protection Act 2018 applies
- No real patient data until DPIA is completed
- All beta testing uses simulated patient data
- BAAs needed before production: Speechmatics, Supabase, hosting provider
- Claude API for production must go through AWS Bedrock (BAA-covered)
