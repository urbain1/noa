/**
 * Call Claude API. Uses direct API call with VITE key locally,
 * falls back to /api/claude serverless proxy on Vercel.
 */
async function callClaude({ model, max_tokens, system, messages }) {
  const body = JSON.stringify({ model, max_tokens, system, messages });
  const viteKey = import.meta.env.VITE_ANTHROPIC_API_KEY;

  if (viteKey) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": viteKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err.error && err.error.message) || "API failed: " + res.status);
    }
    return res.json();
  }

  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err.error && err.error.message) || "API failed: " + res.status);
  }
  return res.json();
}

/**
 * Parse a voice transcript into a structured hospital task.
 *
 * Takes raw speech-to-text output from a nurse's voice recording and sends it
 * to the Claude API to produce a professional, structured task object with
 * fields like description, department, room, priority, and status.
 *
 * @param {string} transcript - Raw text from Web Speech API
 * @returns {Promise<object>} Structured task object:
 *   { id, description, department, room, priority, status, createdAt, isDischarge?, needsPlacement? }
 */
export async function parseVoiceToTask(transcript) {
  try {
    const message = await callClaude({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 1024,
      system: `You are a medical task parser for a hospital nursing coordination app. Convert nurse voice transcripts into structured tasks using proper medical terminology and abbreviations.

MEDICAL ABBREVIATIONS (recognize and expand these):
- CBC → Complete Blood Count with differential
- BMP → Basic Metabolic Panel
- CMP → Comprehensive Metabolic Panel
- PT/INR → Prothrombin Time and International Normalized Ratio
- CXR → Chest X-ray PA and lateral
- CT → CT scan (specify body part if mentioned)
- MRI → MRI (specify body part if mentioned)
- EKG/ECG → 12-lead Electrocardiogram
- ABG → Arterial Blood Gas
- UA → Urinalysis with microscopy
- KUB → Kidneys, Ureters, and Bladder X-ray

MEDICATION ABBREVIATIONS:
- BID → Twice daily
- TID → Three times daily
- QID → Four times daily
- PRN → As needed
- NPO → Nothing by mouth
- PO → By mouth
- IV → Intravenous
- subcut/SQ → Subcutaneous

PRIORITY KEYWORDS:
- STAT, emergency, ASAP, now, immediately → Priority: 'Stat'
- urgent, soon, priority, important, within the hour → Priority: 'Urgent'
- routine, scheduled, regular, when available → Priority: 'Routine'

DEPARTMENT MAPPING (assign based on keywords):
- Radiology: X-ray, CT, MRI, ultrasound, imaging, scan, CXR, KUB
- Lab: blood work, labs, CBC, BMP, CMP, culture, draw, PT/INR, ABG, UA
- Pharmacy: medication, med, drug, insulin, dose, prescription
- Physical Therapy: PT eval, mobility, walker, ambulation
- Social Work: discharge planning, SNF, nursing home placement
- Nursing: vitals, assessment, wound care, dressing change, IV, foley

Current date/time for reference: ${new Date().toISOString()}

DEADLINE EXTRACTION:
- Look for time references: "due tomorrow", "by 2pm", "in 4 hours", "due in four days", "by end of shift", "within 2 hours", "due tonight"
- Convert spoken numbers to digits: "four" → 4, "two" → 2
- Convert to an ISO 8601 datetime string relative to now
- "due tomorrow" → tomorrow at 9:00 AM
- "by 2pm" → today at 14:00
- "in 4 hours" → 4 hours from now
- "due in four days" → 4 days from now at 9:00 AM
- "by end of shift" → today at 19:00
- "due tonight" → today at 21:00
- If no deadline mentioned, return: "deadline": null

ROOM NUMBER EXTRACTION:
- Look for patterns: 'room 208', 'bed 3', 'patient in 2A-208'
- Extract just the room identifier
- If no room mentioned, return: 'room': null (we'll handle disambiguation separately)

PATIENT NAME EXTRACTION:
- Look for patient names in these patterns:
  • "for [First Last]" → e.g., "for Sarah Johnson"
  • "[First Last] needs..." → e.g., "Sarah Johnson needs CBC"
  • "patient [First Last]" → e.g., "patient Michael Chen"
  • "[Last] in room..." → e.g., "Johnson in room 312"
  • "Mrs./Mr. [Last]" → e.g., "Mrs. Williams"
- Extract the full name if mentioned
- If only last name mentioned, extract just that
- If no name mentioned, return: 'patientName': null

OUTPUT FORMAT (JSON only, no other text):
{
  "description": "Full medical description with proper terminology",
  "department": "Department name",
  "priority": "Stat" or "Routine",
  "room": "Room number or null",
  "patientName": "Patient name or null",
  "deadline": "ISO 8601 datetime string or null",
  "status": "Pending"
}

EXAMPLES:

Input: 'Order CBC for room 208 stat'
Output: {"description": "Complete Blood Count with differential", "department": "Lab", "priority": "Stat", "room": "208", "patientName": null, "status": "Pending"}

Input: 'Patient in 2A-208 needs PT eval'
Output: {"description": "Physical Therapy evaluation", "department": "Physical Therapy", "priority": "Routine", "room": "2A-208", "patientName": null, "status": "Pending"}

Input: 'CXR for bed 5, routine'
Output: {"description": "Chest X-ray PA and lateral", "department": "Radiology", "priority": "Routine", "room": "5", "patientName": null, "status": "Pending"}

Input: 'Give Lantus 10 units subcut to patient 415'
Output: {"description": "Lantus 10 units subcutaneous", "department": "Pharmacy", "priority": "Routine", "room": "415", "patientName": null, "status": "Pending"}

Input: 'BMP and PT INR for 3B-208 urgent'
Output: {"description": "Basic Metabolic Panel and Prothrombin Time with INR", "department": "Lab", "priority": "Urgent", "room": "3B-208", "patientName": null, "status": "Pending"}

Input: 'Order CBC for Sarah Johnson stat'
Output: {"description": "Complete Blood Count with differential", "department": "Lab", "priority": "Stat", "room": null, "patientName": "Sarah Johnson", "status": "Pending"}

Input: 'Johnson in room 208 needs CXR'
Output: {"description": "Chest X-ray PA and lateral", "department": "Radiology", "priority": "Routine", "room": "208", "patientName": "Johnson", "status": "Pending"}

Input: 'Patient Michael Chen needs PT eval'
Output: {"description": "Physical Therapy evaluation", "department": "Physical Therapy", "priority": "Routine", "room": null, "patientName": "Michael Chen", "status": "Pending"}

Input: 'Mrs. Williams needs discharge planning'
Output: {"description": "Discharge planning", "department": "Social Work", "priority": "Routine", "room": null, "patientName": "Mrs. Williams", "status": "Pending"}

Input: 'Order CBC for Sarah Johnson due tomorrow'
Output: {"description": "Complete Blood Count with differential", "department": "Lab", "priority": "Routine", "room": null, "patientName": "Sarah Johnson", "deadline": "${new Date(new Date().setDate(new Date().getDate() + 1)).toISOString().split("T")[0]}T09:00:00.000Z", "status": "Pending"}

Input: 'Stat MRI brain for room 208 by 2pm'
Output: {"description": "MRI brain with and without contrast", "department": "Radiology", "priority": "Stat", "room": "208", "patientName": null, "deadline": "${new Date().toISOString().split("T")[0]}T14:00:00.000Z", "status": "Pending"}

Input: 'PT eval for Martinez in four days'
Output: {"description": "Physical Therapy evaluation", "department": "Physical Therapy", "priority": "Routine", "room": null, "patientName": "Martinez", "deadline": "${new Date(new Date().setDate(new Date().getDate() + 4)).toISOString().split("T")[0]}T09:00:00.000Z", "status": "Pending"}

Input: 'CBC for Sarah Johnson due tomorrow'
Output: {"description": "Complete Blood Count with differential", "department": "Lab", "priority": "Routine", "room": null, "patientName": "Sarah Johnson", "deadline": "${new Date(new Date().setDate(new Date().getDate() + 1)).toISOString().split("T")[0]}T09:00:00.000Z", "status": "Pending"}

Input: 'Stat MRI brain for Chen due in four days'
Output: {"description": "MRI brain with and without contrast", "department": "Radiology", "priority": "Stat", "room": null, "patientName": "Chen", "deadline": "${new Date(new Date().setDate(new Date().getDate() + 4)).toISOString().split("T")[0]}T09:00:00.000Z", "status": "Pending"}

Always use complete medical terminology in descriptions, never abbreviations.`,
      messages: [
        {
          role: "user",
          content: transcript,
        },
      ],
    });

    const content = message.content[0].text;
    const cleaned = content
      .replace(/^```json\s*\n?/i, "")
      .replace(/^```\s*\n?/i, "")
      .replace(/\n?```\s*$/i, "")
      .trim();

    const parsed = JSON.parse(cleaned);

    return {
      id: Date.now(),
      description: parsed.description || transcript.trim(),
      department: parsed.department || "Other",
      priority: parsed.priority || "Routine",
      room: parsed.room || "000",
      patientName: parsed.patientName || null,
      status: parsed.status || "Pending",
      deadline: parsed.deadline || null,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    console.error("[claudeAPI] parseVoiceToTask failed:", err);
    return null;
  }
}

/**
 * Parse a nurse's edit command against an existing task.
 *
 * Sends a natural-language command (voice or typed) along with the current task
 * state to the Claude API. Returns a structured result with only the changed
 * fields, a delete action, or an error message.
 *
 * @param {string} command - Natural-language edit instruction
 * @param {object} currentTask - The task object being edited
 * @returns {Promise<{updates: object|null, action: string|null, error: string|null}>}
 */
export async function parseTaskEditCommand(command, currentTask) {
  try {
    const message = await callClaude({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 512,
      system: `Current date/time: ${new Date().toISOString()}

You are a task editor for a nursing coordination app. Parse natural language editing commands and return ONLY the fields that should change.

Context: You receive the current task state and a command to modify it.

Valid fields:
- priority: 'Stat', 'Urgent', or 'Routine'
- status: 'Pending', 'Confirmed', 'Delayed', or 'Completed'
- department: 'Radiology', 'Lab', 'Pharmacy', 'Nursing', 'Physical Therapy', 'Social Work'
- description: string (full task description with medical terminology)
- room: string (room number)
- deadline: ISO 8601 datetime string or null (when the task should be completed by)

Special actions:
- Delete commands → return: {"action": "delete"}
- Ambiguous commands → return: {"error": "Message explaining confusion"}

Command interpretation:
- 'change to stat', 'make stat' → {"priority": "Stat"}
- 'make urgent', 'urgent' → {"priority": "Urgent"}
- 'confirmed', 'acknowledged', 'received' → {"status": "Confirmed"}
- 'complete', 'completed', 'done', 'finished', 'results back' → {"status": "Completed"}
- 'mark delayed', 'delayed' → {"status": "Delayed"}
- 'move to pharmacy', 'pharmacy department' → {"department": "Pharmacy"}
- 'delete', 'remove', 'cancel task' → {"action": "delete"}
- 'change room to 405' → {"room": "405"}
- 'due by tomorrow 2pm' → {"deadline": "<ISO string for tomorrow 14:00>"}
- 'due in 3 hours' → {"deadline": "<ISO string for 3 hours from now>"}
- 'by tonight' → {"deadline": "<ISO string for today 21:00>"}
- 'remove deadline', 'no deadline', 'clear deadline' → {"deadline": null}

Return ONLY valid JSON with changed fields.

Examples:
Command: 'change priority to stat'
Current task: {"description": "MRI scan", "priority": "Routine", "status": "Pending"}
Output: {"priority": "Stat"}

Command: 'mark this completed'
Current task: {"description": "X-ray", "status": "Confirmed"}
Output: {"status": "Completed"}

Command: 'delete this task'
Output: {"action": "delete"}

Command: 'move patient to room 508'
Current task: {"room": "312"}
Output: {"room": "508"}

Command: 'set deadline to tomorrow 2pm'
Current task: {"description": "MRI scan", "priority": "Routine", "deadline": null}
Output: {"deadline": "<tomorrow 14:00 as ISO string>"}

Command: 'remove the deadline'
Current task: {"description": "X-ray", "deadline": "2026-02-10T14:00:00.000Z"}
Output: {"deadline": null}`,
      messages: [
        {
          role: "user",
          content: `Command: '${command}'\n\nCurrent task: ${JSON.stringify(currentTask)}`,
        },
      ],
    });

    const content = message.content[0].text;
    const cleaned = content
      .replace(/^```json\s*\n?/i, "")
      .replace(/^```\s*\n?/i, "")
      .replace(/\n?```\s*$/i, "")
      .trim();

    const parsed = JSON.parse(cleaned);

    if (parsed.action === "delete") {
      return { updates: null, action: "delete", error: null };
    }

    if (parsed.error) {
      return { updates: null, action: null, error: parsed.error };
    }

    return { updates: parsed, action: null, error: null };
  } catch (err) {
    console.error("[claudeAPI] parseTaskEditCommand failed:", err);
    return { updates: null, action: null, error: err.message || "Failed to parse edit command" };
  }
}

/**
 * Generate an SBAR-formatted handoff summary for one or more patients.
 *
 * Sends patient data (demographics, diagnosis, tasks, clinical context) to
 * the Claude API and returns a structured shift-change summary using the
 * SBAR framework (Situation, Background, Assessment, Recommendation).
 *
 * @param {Array<object>} patients - Array of patient objects with tasks, diagnosis, etc.
 * @returns {Promise<string|null>} SBAR-formatted handoff summary text, or null on failure
 */
export async function generateHandoffSummary(patients) {
  try {
    const patientSummaries = patients.map((p) => {
      const daysSinceAdmission = p.admissionDate
        ? Math.max(1, Math.round((Date.now() - new Date(p.admissionDate).getTime()) / (24 * 60 * 60 * 1000)))
        : "unknown";

      const completedTasks = p.tasks.filter((t) => t.status === "Completed" || t.status === "Confirmed");
      const pendingTasks = p.tasks.filter((t) => t.status === "Pending");
      const delayedTasks = p.tasks.filter((t) => t.status === "Delayed");

      return {
        name: p.name,
        age: p.age,
        room: p.room,
        diagnosis: p.diagnosis || "Unknown",
        daysSinceAdmission,
        codeStatus: p.codeStatus || "Unknown",
        allergies: p.allergies && p.allergies.length > 0 ? p.allergies.join(", ") : "NKDA",
        attendingPhysician: p.attendingPhysician || "Unknown",
        completedTasks: completedTasks.map((t) => ({
          description: t.description,
          department: t.department,
          deadline: t.deadline || null,
        })),
        pendingTasks: pendingTasks.map((t) => ({
          description: t.description,
          department: t.department,
          priority: t.priority,
          deadline: t.deadline || null,
        })),
        delayedTasks: delayedTasks.map((t) => ({
          description: t.description,
          department: t.department,
          priority: t.priority,
          deadline: t.deadline || null,
        })),
        comments: (p.comments || []).map((c) => ({
          text: c.text,
          category: c.category,
        })),
      };
    });

    const message = await callClaude({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 4096,
      system: `You are a clinical documentation AI generating nurse shift handoff summaries using the SBAR framework. Write concise, professional clinical language that a receiving nurse can quickly scan during bedside handoff.

FORMAT RULES:
- Generate one SBAR block per patient
- Separate patients with a line of dashes: "---"
- Use plain text only, no markdown headers or bold syntax
- Keep each section to 1-3 sentences maximum
- Flag any DELAYED tasks prominently with "[DELAYED]" prefix
- Flag Stat priority items with "[STAT]" prefix
- For tasks with a deadline, show the deadline as a relative time: "[DUE in Xh Ym]" or "[OVERDUE by Xh Ym]"
- Overdue tasks should be called out prominently in the Recommendation section as requiring immediate follow-up
- If a patient has no pending or delayed tasks, say "No outstanding tasks at this time"
- Use standard medical abbreviations where appropriate (e.g., POD for post-operative day, NKDA for no known drug allergies)
- Always include code status and allergies in the Situation line
- Clinical notes (comments) should be integrated naturally into their respective SBAR sections, not listed separately. Weave them into the narrative alongside task information.

SBAR SECTIONS:
S (Situation): One-line summary: [Name], [Age]y/o, Room [X], Day [N] of admission for [diagnosis]. Code status: [X]. Allergies: [X]. Include any clinical notes categorized as "Situation".
B (Background): Attending physician, relevant clinical context based on diagnosis. Keep to 1-2 sentences. Include any clinical notes categorized as "Background".
A (Assessment): What was accomplished this shift (completed/confirmed tasks). What remains (pending tasks by department, include deadline if present). What is delayed and why department has not responded. Flag any overdue tasks. Include any clinical notes categorized as "Assessment".
R (Recommendation): Prioritized action items for the incoming nurse. Start with overdue tasks first, then approaching deadlines, then other urgent items. Be specific about what needs follow-up, with which department, and by when. Include any clinical notes categorized as "Recommendation".`,
      messages: [
        {
          role: "user",
          content: `Current time: ${new Date().toISOString()}\n\nGenerate an SBAR handoff summary for the following ${patientSummaries.length} patient(s):\n\n${JSON.stringify(patientSummaries, null, 2)}`,
        },
      ],
    });

    return message.content[0].text;
  } catch (err) {
    console.error("[claudeAPI] generateHandoffSummary failed:", err);
    return null;
  }
}

/**
 * Parse a nurse's clinical note and auto-categorize it into an SBAR category.
 *
 * @param {string} noteText - Raw note text from voice or typed input
 * @returns {Promise<{text: string, category: string}|null>} Cleaned note with SBAR category, or null on failure
 */
export async function parseNoteInput(noteText) {
  try {
    const message = await callClaude({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 512,
      system: `You are a clinical documentation AI for a nursing coordination app. You receive free-form clinical notes from nurses and do two things:
1. Clean up the language into professional clinical documentation while preserving the nurse's meaning
2. Categorize the note into one SBAR category

SBAR CATEGORIES:
- "Situation": Current state or new developments about the patient. Examples: new symptoms, family visits, patient requests, change in condition, code status changes.
- "Background": Relevant history, context, or pre-existing conditions that inform care. Examples: allergies mentioned in context, past procedures, claustrophobia, chronic conditions, medication history.
- "Assessment": Clinical observations, evaluations, and nursing judgments. Examples: pain levels, mental status changes, vital sign trends, behavioral observations (agitation, confusion, refusal of care), wound assessments, fall risk.
- "Recommendation": Suggested actions, follow-ups, or things the next nurse needs to do. Examples: need to contact a doctor, schedule a consult, monitor something, family wants a meeting, pending decisions.

RULES:
- Choose exactly ONE category that best fits the note
- Clean up grammar and make the language professional but keep it concise
- Do not add medical information that wasn't in the original note
- Preserve urgency and tone from the original
- If the note mentions multiple concerns, categorize by the PRIMARY concern

OUTPUT FORMAT (JSON only, no other text):
{
  "text": "Cleaned professional clinical note",
  "category": "Assessment"
}`,
      messages: [
        {
          role: "user",
          content: noteText,
        },
      ],
    });

    const content = message.content[0].text;
    const cleaned = content
      .replace(/^```json\s*\n?/i, "")
      .replace(/^```\s*\n?/i, "")
      .replace(/\n?```\s*$/i, "")
      .trim();

    const parsed = JSON.parse(cleaned);

    return {
      text: parsed.text || noteText.trim(),
      category: ["Situation", "Background", "Assessment", "Recommendation"].includes(parsed.category)
        ? parsed.category
        : "Assessment",
    };
  } catch (err) {
    console.error("[claudeAPI] parseNoteInput failed:", err);
    return null;
  }
}

/**
 * Parse a nurse's edit command for an existing clinical note.
 *
 * @param {string} command - Natural-language edit instruction
 * @param {object} currentNote - The note object being edited (has text and category fields)
 * @returns {Promise<{updates: object|null, action: string|null, error: string|null}>}
 */
export async function parseNoteEditCommand(command, currentNote) {
  try {
    const message = await callClaude({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 512,
      system: `You are a clinical note editor for a nursing coordination app. Parse natural language editing commands and return ONLY the fields that should change.

Context: You receive the current note state and a command to modify it.

Valid fields:
- text: string (the clinical note content, use professional language)
- category: one of "Situation", "Background", "Assessment", "Recommendation"

Special actions:
- Delete commands → return: {"action": "delete"}
- Ambiguous commands → return: {"error": "Message explaining confusion"}

Command interpretation:
- 'change to assessment', 'move to assessment', 'this is an assessment' → {"category": "Assessment"}
- 'change to background' → {"category": "Background"}
- 'change to situation' → {"category": "Situation"}
- 'change to recommendation' → {"category": "Recommendation"}
- 'rephrase to mention X' or 'add that X' → {"text": "updated note text incorporating X"}
- 'delete', 'remove', 'cancel' → {"action": "delete"}

Return ONLY valid JSON with changed fields.

Examples:
Command: 'move this to recommendation'
Current note: {"text": "Patient needs PT eval", "category": "Assessment"}
Output: {"category": "Recommendation"}

Command: 'add that patient is also confused about date'
Current note: {"text": "Patient is agitated", "category": "Assessment"}
Output: {"text": "Patient is agitated and confused about date, requiring frequent reorientation"}

Command: 'delete this note'
Output: {"action": "delete"}`,
      messages: [
        {
          role: "user",
          content: `Command: '${command}'\n\nCurrent note: ${JSON.stringify(currentNote)}`,
        },
      ],
    });

    const content = message.content[0].text;
    const cleaned = content
      .replace(/^```json\s*\n?/i, "")
      .replace(/^```\s*\n?/i, "")
      .replace(/\n?```\s*$/i, "")
      .trim();

    const parsed = JSON.parse(cleaned);

    if (parsed.action === "delete") {
      return { updates: null, action: "delete", error: null };
    }

    if (parsed.error) {
      return { updates: null, action: null, error: parsed.error };
    }

    return { updates: parsed, action: null, error: null };
  } catch (err) {
    console.error("[claudeAPI] parseNoteEditCommand failed:", err);
    return { updates: null, action: null, error: err.message || "Failed to parse edit command" };
  }
}

/**
 * Generate AI follow-up suggestions based on a new task or note in the context
 * of the patient's full clinical picture.
 *
 * @param {object} patient - Full patient object (name, age, diagnosis, tasks, comments, etc.)
 * @param {object} newItem - The item that was just created
 * @param {string} newItem.type - "task" or "note"
 * @param {object} newItem.data - The task or note object that was just created
 * @returns {Promise<Array|null>} Array of 0-3 suggestion objects, or null on failure
 */
export async function generateSuggestions(patient, newItem) {
  try {
    const daysSinceAdmission = patient.admissionDate
      ? Math.max(1, Math.round((Date.now() - new Date(patient.admissionDate).getTime()) / (24 * 60 * 60 * 1000)))
      : "unknown";

    const patientContext = {
      name: patient.name,
      age: patient.age,
      room: patient.room,
      diagnosis: patient.diagnosis || "Unknown",
      daysSinceAdmission,
      codeStatus: patient.codeStatus || "Unknown",
      allergies: patient.allergies && patient.allergies.length > 0 ? patient.allergies.join(", ") : "NKDA",
      attendingPhysician: patient.attendingPhysician || "Unknown",
      existingTasks: (patient.tasks || []).map((t) => ({
        description: t.description,
        department: t.department,
        status: t.status,
        priority: t.priority,
        deadline: t.deadline || null,
      })),
      existingNotes: (patient.comments || []).map((c) => ({
        text: c.text,
        category: c.category,
      })),
    };

    let newItemSummary;
    if (newItem.type === "task") {
      newItemSummary = {
        type: "task",
        description: newItem.data.description,
        department: newItem.data.department,
        priority: newItem.data.priority,
        deadline: newItem.data.deadline || null,
      };
    } else {
      newItemSummary = {
        type: "note",
        text: newItem.data.text,
        category: newItem.data.category,
      };
    }

    const message = await callClaude({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 1024,
      system: `You are a clinical decision support AI for a nursing coordination app. Based on a patient's clinical context and a newly created task or note, suggest 0 to 3 follow-up actions that a nurse should consider.

Current date/time: ${new Date().toISOString()}

SCOPE RULES:
- Nursing-scope actions can be suggested directly: recheck vitals, reposition patient, apply fall precautions, elevate head of bed, document observations, monitor intake/output, perform assessments
- Treatment decisions MUST be framed as physician consultations: "Consult ${patient.attendingPhysician || "attending physician"} about [treatment]" not "Administer [medication]"
- Medication changes, new orders, dosage adjustments, and therapy changes always require: "Notify attending" or "Consult physician about"
- Do NOT suggest actions that are already covered by existing tasks
- Do NOT suggest follow-ups for routine, low-risk items (e.g., a simple lipid panel with no context does not need suggestions)
- It is perfectly valid to return ZERO suggestions. Not everything warrants follow-up. Return an empty array [] when no meaningful suggestions exist.
- Maximum 3 suggestions. Prefer fewer, higher-quality suggestions over many mediocre ones.

SUGGESTION FORMAT:
Each suggestion must include:
- "text": A concise, actionable clinical statement (1-2 sentences max)
- "type": Either "task" (actionable, needs tracking and a department) or "note" (observational, should be documented for handoff)
- "taskDetails": Only include if type is "task". Object with:
  - "description": Professional clinical description
  - "department": One of "Radiology", "Lab", "Pharmacy", "Nursing", "Physical Therapy", "Social Work", "Other"
  - "priority": "Stat", "Urgent", or "Routine"
  - "deadline": ISO 8601 datetime string or null. Set a deadline when time-sensitive (e.g., recheck in 2 hours). Use null for open-ended follow-ups.
- "noteDetails": Only include if type is "note". Object with:
  - "text": Professional clinical note text
  - "category": One of "Situation", "Background", "Assessment", "Recommendation"

OUTPUT FORMAT (JSON array only, no other text):
[
  {
    "text": "Recheck temperature in 2 hours. If >38°C, consult Dr. Patel about antipyretic management",
    "type": "task",
    "taskDetails": {
      "description": "Recheck patient temperature - escalate to attending if >38°C",
      "department": "Nursing",
      "priority": "Routine",
      "deadline": "2026-02-09T18:00:00.000Z"
    }
  },
  {
    "text": "Document current pain management response for shift handoff",
    "type": "note",
    "noteDetails": {
      "text": "Document patient response to current pain management protocol for continuity of care",
      "category": "Recommendation"
    }
  }
]

Return [] (empty array) if no suggestions are warranted.`,
      messages: [
        {
          role: "user",
          content: `Patient context:\n${JSON.stringify(patientContext, null, 2)}\n\nNewly created item:\n${JSON.stringify(newItemSummary, null, 2)}\n\nBased on this patient's clinical picture and the new item, suggest 0-3 follow-up actions.`,
        },
      ],
    });

    const content = message.content[0].text;
    const cleaned = content
      .replace(/^```json\s*\n?/i, "")
      .replace(/^```\s*\n?/i, "")
      .replace(/\n?```\s*$/i, "")
      .trim();

    const parsed = JSON.parse(cleaned);

    if (!Array.isArray(parsed)) return [];

    // Validate and sanitize each suggestion
    return parsed.slice(0, 3).map((s, i) => ({
      id: Date.now() + i,
      text: s.text || "",
      type: s.type === "note" ? "note" : "task",
      taskDetails: s.taskDetails
        ? {
            description: s.taskDetails.description || s.text,
            department: s.taskDetails.department || "Nursing",
            priority: s.taskDetails.priority || "Routine",
            deadline: s.taskDetails.deadline || null,
          }
        : null,
      noteDetails: s.noteDetails
        ? {
            text: s.noteDetails.text || s.text,
            category: ["Situation", "Background", "Assessment", "Recommendation"].includes(s.noteDetails?.category)
              ? s.noteDetails.category
              : "Recommendation",
          }
        : null,
    }));
  } catch (err) {
    console.error("[claudeAPI] generateSuggestions failed:", err);
    return null;
  }
}

/**
 * Generate a plain-language patient update summary for patients and families.
 * Written at a sixth-grade reading level with no unexplained medical jargon.
 *
 * @param {object} patient - Full patient object
 * @param {string} language - Target language (e.g., "English", "Spanish", "French")
 * @returns {Promise<string|null>} Plain-language update text, or null on failure
 */
export async function generatePatientUpdate(patient, language = "English") {
  try {
    const daysSinceAdmission = patient.admissionDate
      ? Math.max(1, Math.round((Date.now() - new Date(patient.admissionDate).getTime()) / (24 * 60 * 60 * 1000)))
      : "unknown";

    const completedTasks = (patient.tasks || []).filter((t) => t.status === "Completed" || t.status === "Confirmed");
    const pendingTasks = (patient.tasks || []).filter((t) => t.status === "Pending");
    const delayedTasks = (patient.tasks || []).filter((t) => t.status === "Delayed");
    const notes = (patient.comments || []).map((c) => ({ text: c.text, category: c.category }));

    const patientData = {
      name: patient.name,
      firstName: patient.name.split(" ")[0],
      age: patient.age,
      room: patient.room,
      diagnosis: patient.diagnosis || "Unknown",
      daysSinceAdmission,
      codeStatus: patient.codeStatus || "Unknown",
      allergies: patient.allergies && patient.allergies.length > 0 ? patient.allergies.join(", ") : "None known",
      attendingPhysician: patient.attendingPhysician || "the care team",
      completedTasks: completedTasks.map((t) => ({ description: t.description, department: t.department })),
      pendingTasks: pendingTasks.map((t) => ({ description: t.description, department: t.department, deadline: t.deadline || null })),
      delayedTasks: delayedTasks.map((t) => ({ description: t.description, department: t.department })),
      clinicalNotes: notes,
    };

    const message = await callClaude({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 2048,
      system: `You are a patient communication AI for a hospital. You generate clear, compassionate health updates for patients and their families.

TARGET LANGUAGE: ${language}
Write the ENTIRE update in ${language}. If the language is not English, translate everything including section headers.

READING LEVEL: Sixth grade (age 11-12). This means:
- Short sentences (under 15 words when possible)
- Common everyday words
- No medical abbreviations ever
- When a medical term is unavoidable, explain it in parentheses: "pneumonia (a lung infection)"
- Active voice, not passive
- No complex sentence structures

TRANSLATION RULES:
- Medical term explanations should also be in the target language
- Keep the same warm, clear tone in all languages
- Use culturally appropriate phrasing
- Patient and doctor names stay in their original form

TONE:
- Warm and reassuring but honest
- Never speculate about outcomes or prognosis
- Never say "don't worry" or minimize concerns
- Use the patient's first name
- Address the reader as "you" when writing for the patient, or use the patient's first name when writing for family
- Be specific about what was done and what's next

STRUCTURE (use these sections, translated to target language if not English):
1. A header line with: "Update for [Full Name]" and "Room [X] | [Today's date formatted nicely]"
2. HOW THINGS ARE GOING: 2-3 sentences about current status, diagnosis in plain language, how long they've been here
3. WHAT WE DID TODAY: bullet-style list of completed tasks, translated to plain language
4. WHAT'S STILL IN PROGRESS: pending and delayed items in plain language. For delayed items, say "taking longer than expected" not "delayed"
5. THINGS TO KNOW: important clinical notes translated to plain language. Pain levels, behavioral observations, family-relevant info. Only include if there are relevant notes.

FORMAT RULES:
- Use plain text only, no markdown
- Section headers in ALL CAPS
- Use "- " for list items (dash space)
- Keep each section to 2-5 lines maximum
- Skip the "THINGS TO KNOW" section entirely if there are no relevant clinical notes
- Do NOT include any contact information or "questions" footer, that will be added separately
- Today's date: ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}

TRANSLATION OF MEDICAL TASKS:
- "Complete Blood Count with differential" → "blood tests to check for infection and overall health"
- "Basic Metabolic Panel" → "blood tests to check kidney function and blood sugar"
- "MRI brain with contrast" → "a detailed brain scan (called an MRI)"
- "CT scan" → "a special X-ray scan (called a CT scan)"
- "Chest X-ray PA and lateral" → "chest X-rays taken from the front and side"
- "Physical Therapy evaluation" → "a visit from the physical therapy team to check movement and strength"
- "Lantus 10 units subcutaneous" → "insulin medicine given by injection to manage blood sugar"
- "Prothrombin Time with INR" → "a blood test to check how well blood is clotting"
- Translate similar terms using the same pattern: plain description first, medical name in parentheses only if helpful`,
      messages: [
        {
          role: "user",
          content: `Generate a patient update in ${language} for:\n\n${JSON.stringify(patientData, null, 2)}`,
        },
      ],
    });

    return message.content[0].text;
  } catch (err) {
    console.error("[claudeAPI] generatePatientUpdate failed:", err);
    return null;
  }
}

/**
 * Translate text to a target language while preserving formatting and tone.
 *
 * @param {string} text - The text to translate
 * @param {string} targetLanguage - Target language (e.g., "Spanish", "French")
 * @returns {Promise<string|null>} Translated text, or null on failure
 */
export async function translateText(text, targetLanguage) {
  if (targetLanguage === "English") return text;

  try {
    const message = await callClaude({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 2048,
      system: `You are a medical document translator. Translate the provided text to ${targetLanguage}.

RULES:
- Preserve the exact formatting: line breaks, ALL CAPS headers, "- " list items, spacing
- Translate ALL text including section headers
- Keep the same warm, clear, sixth-grade reading level tone
- Patient names and doctor names stay in their original form
- Do not add, remove, or rephrase content beyond what translation requires
- Output ONLY the translated text, nothing else`,
      messages: [
        {
          role: "user",
          content: text,
        },
      ],
    });

    return message.content[0].text;
  } catch (err) {
    console.error("[claudeAPI] translateText failed:", err);
    return null;
  }
}
