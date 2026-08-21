# Noa Health — Testing Scenarios

## Voice Task Creation

### VT-1: Basic task with patient name
**Input:** "Order CBC for Sarah Johnson"
**Expected:** Task created — description: "Complete Blood Count with differential", department: Lab, priority: Routine, matched to Sarah Johnson's card.

### VT-2: Task with deadline
**Input:** "Order CBC for Sarah Johnson due tomorrow"
**Expected:** Same as VT-1 + deadline badge showing ~24h from now.

### VT-3: Stat priority
**Input:** "Stat MRI brain for Robert Chen"
**Expected:** Task created with priority: Stat, department: Radiology, matched to Robert Chen.

### VT-4: Fuzzy name matching
**Input:** "Add CBC for Mariah Santos due in four days"
**Expected:** Fuzzy matches "Mariah" to "Maria Santos". Task created with deadline 4 days out.

### VT-5: Partial name (single word, unique)
**Input:** "Task for Santos"
**Expected:** Auto-matches Maria Santos (only one Santos). No disambiguation dialog.

### VT-6: Partial name (ambiguous)
**Input:** "Order for Johnson"
**Expected:** Disambiguation dialog showing Sarah Johnson and Jennifer Johnson. Nurse picks one.

### VT-7: Room number reference
**Input:** "Vitals for room 208"
**Expected:** Matches patient(s) in room 208. If multiple, disambiguation dialog.

### VT-8: No patient identifier
**Input:** "Order CBC stat"
**Expected:** Manual entry dialog with searchable patient dropdown.

### VT-9: Spoken number conversion
**Input:** "PT eval for Martinez in four days"
**Expected:** Deadline set to 4 days from now (not the word "four").

### VT-10: Fallback when API fails
**Input:** Any command (disconnect API key to test)
**Expected:** Fallback parser extracts what it can (patient name via regex, department guess from keywords). Task created with raw transcript as description. No crash.

---

## Task Lifecycle

### TL-1: New task status flow (Routine)
**Action:** Create a Routine task via voice.
**Expected:** Status: Pending → Confirmed (after 15s simulation). Stays Confirmed.

### TL-2: New task status flow (Stat)
**Action:** Create a Stat task via voice.
**Expected:** Status: Pending → Confirmed (15s) → Delayed (45s). Alert badge appears on menu.

### TL-3: Delay alert actions — Follow Up
**Action:** Open delayed tasks bottom sheet → click "Follow Up".
**Expected:** Task status changes (repage or escalation). Alert count decreases.

### TL-4: Delay alert actions — Close
**Action:** Open delayed tasks bottom sheet → click "Close".
**Expected:** Bottom sheet closes. Task stays Delayed. Reopening bottom sheet shows same tasks.

### TL-5: Task edit via AI
**Action:** Open task → Edit → AI Edit → say "change to stat".
**Expected:** Priority changes to Stat. Processing completes (no infinite spinner).

### TL-6: Task edit manual
**Action:** Open task → Edit → manually change description/priority/department.
**Expected:** Changes saved, reflected on patient card.

---

## Patient Matching Edge Cases

### PM-1: Name with accent transcription error
**Input:** "Task for Hernandez" (patient is "Hernández")
**Expected:** Fuzzy match succeeds. No manual entry needed.

### PM-2: Common name collision
**Input:** "Task for Smith" with two Smiths in the ward.
**Expected:** Disambiguation dialog with both options.

### PM-3: Name not in system
**Input:** "Task for completely unknown name"
**Expected:** No match found → manual entry with searchable dropdown of all patients.

### PM-4: Room number with bed letter
**Input:** "Room 208A"
**Expected:** Matches patient in room 208A specifically, not 208B.

---

## Handoff Summary

### HS-1: Generate from menu
**Action:** Three-dot menu → "Generate handoff report".
**Expected:** SBAR summary generated for all patients. Title: "Shift Handoff Report". Subtitle: "SBAR summary for shift change".

### HS-2: Content accuracy
**Verify:** Summary includes all patients with their pending tasks, completed tasks, clinical notes, and any alerts.

### HS-3: Per-patient SBAR
**Action:** Open patient card → "SBAR Summary".
**Expected:** SBAR generated for that single patient only.

---

## Patient Updates

### PU-1: Generate patient update
**Action:** Open patient card → "Patient View".
**Expected:** Plain-language patient update generated.

### PU-2: Language switch
**Action:** Generate update → switch to Spanish/French/etc.
**Expected:** Update translates to selected language. Footer text also translates.

### PU-3: Edit and translate
**Action:** Generate update → edit text → switch language.
**Expected:** Edited text is translated (not regenerated from patient data).

---

## Clinical Notes

### CN-1: Add note via dialog
**Action:** "+ Add Note" → enter clinical note text → save.
**Expected:** Note saved, appears in Clinical Notes section. "+1 new" badge if toggle collapsed.

### CN-2: AI suggestions after note
**Action:** Add a note about patient symptoms.
**Expected:** AI generates follow-up suggestions (e.g., "Recheck vitals in 2 hours", "Consult physician about pain management"). Each suggestion can be accepted as a task with one tap.

---

## UI Indicators

### UI-1: New task badge (toggle collapsed)
**Action:** Collapse Tasks toggle → add task for that patient.
**Expected:** Toggle label shows "Tasks (X + 1 new)" with red text.

### UI-2: New task badge (toggle opened)
**Action:** Open Tasks toggle after seeing "+1 new" badge.
**Expected:** New task has blue background. After 2 seconds, badge clears and background returns to normal.

### UI-3: New note badge
**Same as UI-1 and UI-2 but for Clinical Notes.**

### UI-4: Delayed task badge on menu
**Action:** Wait 30 seconds after app load.
**Expected:** Red badge with count appears on three-dot menu icon. "Delayed tasks" menu item turns red with count.

---

## Navigation

### NAV-1: Tab switching
**Action:** Click "My Patients" and "Unit View" tabs.
**Expected:** Active tab is dark blue/white. Inactive tab is light blue with border. View switches correctly.

### NAV-2: Voice capture access
**Action:** Click voice capture button in header OR "+Add Task" on patient card.
**Expected:** Voice capture panel opens.

### NAV-3: Menu discharge flow
**Action:** Three-dot menu → "Discharge a patient" → select patient.
**Expected:** Discharge dialog opens for selected patient with checklist.

---

## Offline / Error Handling (MVP only)

### OFF-1: API timeout
**Action:** Add task while API is slow (>5s).
**Expected:** Loading spinner shown. Task eventually created or fallback triggers.

### OFF-2: API failure
**Action:** Add task with invalid API key.
**Expected:** Fallback parser creates task from raw transcript. No crash. Error logged.

### OFF-3: No microphone permission
**Action:** Deny mic permission when prompted.
**Expected:** Graceful error message: "Microphone access needed for voice tasks." Option to type task manually via transcript box.
