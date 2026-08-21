# Noa Health — Architecture Decisions

## Overview

This documents key technical decisions for the Noa MVP, the reasoning behind each, and what to revisit later.

---

## 1. Mobile framework: Expo (React Native)

**Decision:** Use Expo, not Rork or Flutter.

**Why:** The demo was built in React. React Native lets us reuse component logic directly. Expo handles builds, OTA updates, and device APIs (mic, camera, notifications) without native code. Large community, battle-tested in production apps.

**Rejected:** Rork (AI app builder — too limiting for custom voice UIs and real-time features). Flutter (good but requires learning Dart, no code reuse from demo).

**Revisit when:** Never. This is a long-term choice.

---

## 2. Backend: Supabase

**Decision:** Supabase for database, auth, real-time subscriptions, and file storage.

**Why:** Postgres under the hood (proper relational model for patients/tasks/nurses). Built-in real-time via WebSocket subscriptions (task status changes push to all connected devices instantly). Row Level Security for access control. Auth included (one less vendor). HIPAA-ready add-on available for US expansion.

**Rejected:** Firebase (NoSQL is a poor fit for relational patient/task data). Custom backend (too slow to build for one founder).

**Revisit when:** If real-time subscription performance degrades at scale (100+ concurrent ward users). Unlikely before Series A.

---

## 3. Speech-to-text: Speechmatics

**Decision:** Speechmatics API for voice transcription.

**Why:** 93% accuracy on medical terminology out of the box. Accent-independent (critical for UK/international nursing workforce). 55+ languages. On-device model available for offline support later.

**Rejected:** Whisper (free but no medical-tuned model, requires self-hosting). Deepgram (cheaper but worse on medical terms in testing). Google Speech (good but weaker on medical vocabulary).

**Cost:** ~$0.60/hour of audio. Average nurse task is 5-10 seconds. Cost per task: ~$0.002.

**Revisit when:** If Whisper releases a medical-tuned model, or if costs need to drop below $0.001/task.

---

## 4. AI reasoning: Claude API (Anthropic)

**Decision:** Claude (Sonnet) for all AI functions: voice intent parsing, task structuring, handoff summaries, patient updates, clinical suggestions, translations.

**Why:** Best instruction-following for structured JSON output. Strong medical knowledge for terminology expansion ("CBC" → "Complete Blood Count with differential"). Reliable at multi-step reasoning (parsing voice → extracting patient name + department + priority + deadline simultaneously).

**Architecture:** Single callClaude() helper with environment-aware routing:
- Local dev: direct API call with VITE_ANTHROPIC_API_KEY
- Vercel/production: /api/claude serverless proxy (key hidden server-side)
- Future production: AWS Bedrock (BAA-covered for HIPAA)

**Cost:** ~$0.01-0.03 per voice task parse. ~$0.05-0.10 per handoff summary. $20-30/month handles a full ward pilot.

**Rejected:** GPT-4 (comparable quality, higher cost). Gemini (cheaper but less reliable on structured output).

**Revisit when:** Need BAA for US hospitals (switch to AWS Bedrock for Claude access). Or if costs need to drop significantly (use Claude Haiku for simple tasks, Sonnet for summaries).

---

## 5. Workflow automation: n8n (self-hosted)

**Decision:** n8n for task routing, delay detection, and alert triggers.

**Why:** Visual workflow builder — routing rules can be changed without code. Self-hosted means full data control (critical for compliance). Handles the "if Lab doesn't confirm in 15 minutes, alert the nurse" logic without custom cron jobs.

**Constraint:** Must be self-hosted. n8n Cloud is not HIPAA/GDPR compliant for health data. Budget for an AWS/Azure VM (~$20-40/month).

**Rejected:** Make/Zapier (not self-hostable, can't control data residency). Custom code (would work but slower to iterate on routing rules during pilots).

**Revisit when:** Routing rules become complex enough that a visual builder adds more overhead than code. Likely after 5-10 pilot hospitals when patterns stabilize.

---

## 6. Offline support strategy

**Decision:** Local queue for offline task creation, sync on reconnect.

**Why:** Hospital WiFi is unreliable (basements, elevators, thick walls, interference from medical equipment). Nurses can't lose tasks because they walked into a dead zone.

**Implementation:**
- Voice recordings transcribed on-device if possible (Speechmatics on-device model), or queued
- Task creation saved to local SQLite/AsyncStorage with "pending_sync" flag
- On reconnect: sync queue to Supabase, resolve conflicts (last-write-wins for most fields)
- UI shows sync status indicator

**Revisit when:** Speechmatics on-device model is evaluated. If latency is acceptable, all transcription goes local and only structured tasks sync to server.

---

## 7. Patient matching: fuzzy match + disambiguation

**Decision:** Multi-layer matching carried over from demo.

**Layers:**
1. Exact name match
2. Fuzzy match (Levenshtein distance, threshold 1-2 edits depending on word length)
3. Partial match (last name only, first name only)
4. Room number match
5. If multiple matches: disambiguation dialog (nurse picks)
6. If zero matches: manual search with searchable patient dropdown

**Why:** Voice transcription introduces errors ("Mariah" for "Maria", "Sara" for "Sarah"). Single-name references are common in wards ("get Santos his meds"). Room numbers are sometimes shared. Each layer catches a different failure mode.

**Revisit when:** Matching accuracy data from pilots shows which layers trigger most. May need hospital-specific tuning.

---

## 8. Data model (Supabase schema)

**Core tables:**
- **patients**: id, name, room, unit, admission_date, diagnosis, allergies, code_status, attending_physician
- **tasks**: id, patient_id, nurse_id, description, department, status (Pending/Confirmed/Delayed/Completed), priority (Routine/Stat), deadline, timestamp, created_by
- **notes**: id, patient_id, nurse_id, content, type (clinical/voice), timestamp
- **handoffs**: id, unit_id, shift, generated_at, content (SBAR JSON), generated_by
- **nurses**: id, name, role (nurse/charge_nurse/admin), unit_id, shift
- **alerts**: id, task_id, type (delay/escalation), triggered_at, resolved_at, resolved_by

**RLS policies:**
- Nurses see patients assigned to them
- Charge nurses see all patients in their unit
- Tasks are readable by the creating nurse + charge nurse
- Notes are readable by all nurses assigned to the patient

**Revisit when:** First pilot — hospital will have opinions on data model based on their workflows.

---

## 9. Compliance architecture

**Current (beta with simulated data):**
- Standard encryption (TLS in transit, AES-256 at rest via Supabase)
- No real patient data
- User consent for data collection
- Privacy policy

**Required before real patient data:**
- UK GDPR: Data Protection Impact Assessment (DPIA)
- Supabase: enable HIPAA add-on (covers encryption, audit logging, BAA)
- Claude API: route through AWS Bedrock (provides BAA)
- Speechmatics: confirm DPA (Data Processing Agreement) covers health data
- ICO registration
- NHS DTAC assessment (if targeting NHS trusts)
- Audit logging: every patient data access logged with nurse ID + timestamp
- Zero audio retention: delete recordings immediately after transcription

**Revisit when:** Approaching first hospital pilot with real patients. Budget 4-8 weeks for compliance setup.
