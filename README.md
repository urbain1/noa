# Noa Health

**The AI teammate for nursing coordination.**

Noa captures verbal orders via voice, structures them with AI, routes tasks to hospital departments, tracks progress in real-time, and generates clinical handoff summaries at shift change.

## Demo Features

### Voice Task Capture
- Speak orders naturally (e.g., "Order CBC stat for Sarah Johnson by tomorrow 2pm")
- Claude AI expands abbreviations into full medical terminology
- Automatically routes to the correct department (Radiology, Lab, Pharmacy, Nursing, Physical Therapy, Social Work)
- Detects priority (Stat, Urgent, Routine) and deadlines from natural language

### Patient Matching
- Match by room number, patient name, or both
- Disambiguation dialog when multiple patients match
- Manual entry fallback with option to create new patients

### Task Management
- Edit tasks via voice commands, text commands, or manual field editing
- Status tracking: Pending → Confirmed → Completed (or Delayed)
- Color-coded deadline indicators: green (plenty of time), orange (approaching), red (overdue)
- Delete tasks with confirmation

### Real-Time Alerts & Escalation
- Proactive delay notifications when departments haven't responded
- Repage Department: re-sends the request, resets task to Pending
- Escalate to Charge: upgrades priority to Stat, flags for charge nurse attention

### SBAR Handoff Summaries
- Auto-generated shift handoff reports in standard clinical SBAR format
- Available per-patient or for all patients at once
- Includes clinical notes in their respective SBAR categories
- Includes deadline and overdue task flagging
- Copy, edit, or send to incoming nurse via simulated messaging

### Clinical Notes
- Add observations via voice or text
- AI auto-categorizes into SBAR sections (Situation, Background, Assessment, Recommendation)
- Override category manually if needed
- Edit via manual fields or AI voice/text commands

### Patient Updates
- Plain-language summaries for patients and families at sixth-grade reading level
- Multilingual support: English, Spanish, French, Chinese, Arabic, Vietnamese, Korean, Russian, Portuguese, Haitian Creole
- Edit the summary, then translate edits to any language
- Optional "Questions? Contact your nurse" footer (translated per language)
- Share with patient contacts via simulated email/text

### AI Suggested Follow-ups
- After creating a task or clinical note, AI analyzes the clinical context and suggests 0-3 follow-up actions
- Suggestions respect scope: nursing actions are direct, treatment decisions are framed as physician consultations
- Accept as a task (with auto-set deadline) or as a clinical note, or dismiss

### Charge Nurse Dashboard
- Unit-level overview: patient count, task count, overdue deadlines
- Department bottleneck visualization with pending/delayed/confirmed bars
- Patient safety flags based on risk scoring (delayed tasks, overdue deadlines, stat orders, recent admissions)
- Attention-needed list with clickable items
- Risk badges visible on individual patient cards

### Contact Management
- Add, edit, and delete patient contacts (family, caregivers)
- Set preferred contact method per person (email, text, or both)
- Manage contacts from the patient card or from the share flow
- HIPAA consent reminder when sharing

### Discharge Planning
- Mark patients for discharge
- Options: notify patient, request nursing home/SNF placement, add notes
- Creates Social Work department tasks automatically

## Tech Stack

- React 19 + Vite
- Tailwind CSS
- Claude API via Anthropic SDK (`@anthropic-ai/sdk`)
- Web Speech API for voice capture
- DM Sans + Space Grotesk typography

## File Structure
```
src/
├── main.jsx
├── App.jsx
├── index.css
├── mockData.js
│
├── components/
│   ├── WelcomeScreen.jsx
│   ├── Dashboard.jsx
│   ├── ChargeNurseDashboard.jsx
│   ├── PatientCard.jsx
│   ├── TaskCard.jsx
│   ├── NoteCard.jsx
│   ├── VoiceCapture.jsx
│   ├── TaskEditDialog.jsx
│   ├── RoomSelector.jsx
│   ├── HandoffSummary.jsx
│   ├── SendHandoffDialog.jsx
│   ├── PatientUpdateSummary.jsx
│   ├── ShareUpdateDialog.jsx
│   ├── ContactsDialog.jsx
│   ├── AddContactForm.jsx
│   ├── AddNoteDialog.jsx
│   ├── EditNoteDialog.jsx
│   ├── NoteDeleteConfirmModal.jsx
│   ├── SuggestionModal.jsx
│   ├── Alert.jsx
│   ├── DischargeDialog.jsx
│   ├── DeleteConfirmModal.jsx
│   ├── RoomDisambiguationDialog.jsx
│   └── ManualRoomEntry.jsx
│
└── utils/
    ├── claudeAPI.js
    ├── claudeTaskParser.js
    ├── medicalTerms.js
    └── roomMatcher.js
```

## Running Locally
```bash
npm install
```

Claude API calls go through a Supabase Edge Function (`supabase/functions/claude-proxy`), not a client-side key. See `apps/web/.env` for the required `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`, and set `ANTHROPIC_API_KEY` as a Supabase secret on the Edge Function (never a `VITE_`-prefixed var).

Then:
```bash
npm run dev
```

## Mock Data

The app ships with 5 sample patients, each with clinical context (diagnosis, admission date, code status, allergies, attending physician), pre-populated tasks, clinical notes, and family contacts.

| Patient | Room | Diagnosis | Notes |
|---------|------|-----------|-------|
| Sarah Johnson | 2A-312 | Community-acquired pneumonia | 3 tasks, 2 clinical notes, 2 contacts |
| Maria Santos | 2B-415 | Acute cholecystitis | 2 tasks, 1 contact |
| Robert Chen | 3A-208 | Lumbar radiculopathy | 3 tasks, 1 clinical note, 2 contacts |
| Robert Martinez | 3B-208 | Hip fracture POD2, DNR/DNI | 1 task, 2 clinical notes, 1 contact |
| Jennifer Johnson | 4A-101 | New-onset atrial fibrillation | 1 task, no contacts (tests empty states) |

## Security Note

Claude API calls run only from a Supabase Edge Function, authenticated by the caller's Supabase session. The Anthropic API key is never present in client-side code.

## About

Built by **Urbain Kwizera** · Founder & CEO, Noa Health, Inc.

Demo uses simulated patient data. No real health information is stored or transmitted.
