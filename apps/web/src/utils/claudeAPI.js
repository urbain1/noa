import { supabase } from "../lib/supabase";
import { currentLanguage } from "../i18n";

/**
 * Invoke the claude-proxy Supabase Edge Function. Requires an active
 * Supabase session; the function verifies it server-side and rejects
 * otherwise. All Claude prompt logic lives in the Edge Function, this
 * is just the transport.
 */
async function invokeClaude(action, payload) {
  const { data, error } = await supabase.functions.invoke("claude-proxy", {
    body: { action, payload },
  });
  if (error) throw error;
  if (data && data.error) throw new Error(data.error);
  return data.result;
}

/**
 * Parse a voice transcript into a structured hospital task.
 *
 * Takes raw speech-to-text output from a nurse's voice recording and sends it
 * to the Claude API to produce a professional, structured task object with
 * fields like description, department, room, priority, and status.
 *
 * Output language is read from `currentLanguage()` at call time, never passed
 * in: there is one live value and no caller can hand this a stale one. It
 * controls the free-text `description` only -- the department / priority /
 * status / deadline fields are structured values the app matches and stores
 * against, and stay in their canonical English form regardless of it.
 *
 * @param {string} transcript - Raw text from Web Speech API
 * @returns {Promise<object>} Structured task object:
 *   { id, description, department, room, priority, status, createdAt, isDischarge?, needsPlacement? }
 */
export async function parseVoiceToTask(transcript) {
  try {
    return await invokeClaude("parseVoiceToTask", {
      transcript,
      language: currentLanguage(),
    });
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
    return await invokeClaude("parseTaskEditCommand", { command, currentTask });
  } catch (err) {
    console.error("[claudeAPI] parseTaskEditCommand failed:", err);
    return { updates: null, action: null, error: err.message || "Failed to parse edit command" };
  }
}

/**
 * Map one patient onto the field names the deployed `claude-proxy` prompts
 * read. Shared by every Claude action that takes a full patient object
 * (`generateHandoffSummary`, `generateSuggestions`).
 *
 * Those Edge Function handlers were ported from the demo, where patients
 * were plain objects with `name`/`room`/`codeStatus`/`comments`. Supabase
 * rows use `label`/`location_label`/`code_status`/`notes` instead, so every
 * field the prompt looks up by its demo name arrives empty unless it is
 * mapped here. Demo-shaped objects still exist at runtime (the
 * unmatched-voice-task fallback in App.jsx creates local-only patients), so
 * both spellings are accepted.
 *
 * Nothing new is disclosed by this mapping: `label` is the synthetic
 * Patient_Test_N identifier and `location_label` the synthetic location
 * label, both already shown on the patient card, per SECURITY.md.
 */
function toPromptPatient(patient) {
  const notes = patient.notes || patient.comments || [];
  return {
    name: patient.label || patient.name || null,
    age: patient.age,
    room: patient.location_label || patient.room || null,
    diagnosis: patient.diagnosis,
    admissionDate: patient.admission_date || patient.admissionDate || null,
    codeStatus: patient.code_status || patient.codeStatus || null,
    allergies: patient.allergies,
    attendingPhysician:
      patient.attending_physician || patient.attendingPhysician || null,
    tasks: patient.tasks || [],
    comments: notes.map((note) => ({
      text: note.content || note.text || "",
      category: note.category,
    })),
  };
}

/**
 * Generate an SBAR-formatted handoff summary for one or more patients.
 *
 * Sends patient data (demographics, diagnosis, tasks, clinical context) to
 * the Claude API and returns a structured shift-change summary using the
 * SBAR framework (Situation, Background, Assessment, Recommendation).
 *
 * Scope is whatever is passed in: the whole facility roster for the shift
 * report, or a single-element array for one patient's SBAR. The Edge
 * Function emits one SBAR block per patient either way, no separate action.
 *
 * Output language is read from `currentLanguage()` at call time, never passed
 * in. It controls the narrative language only: section markers, status flags,
 * and the patient/location labels carried in the data are untouched by it.
 * Existing tasks and notes are read in whatever language they were written
 * in; they are not translated (see decisions.md, scenarios.md SC-15).
 *
 * @param {Array<object>} patients - Array of patient objects with tasks, diagnosis, etc.
 * @returns {Promise<string|null>} SBAR-formatted handoff summary text, or null on failure
 */
export async function generateHandoffSummary(patients) {
  try {
    return await invokeClaude("generateHandoffSummary", {
      patients: patients.map(toPromptPatient),
      language: currentLanguage(),
    });
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
    return await invokeClaude("parseNoteInput", { noteText });
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
    return await invokeClaude("parseNoteEditCommand", { command, currentNote });
  } catch (err) {
    console.error("[claudeAPI] parseNoteEditCommand failed:", err);
    return { updates: null, action: null, error: err.message || "Failed to parse edit command" };
  }
}

/**
 * Map a newly-created task or note onto the field names the suggestions
 * prompt reads. Task rows already match (`description`/`department`/
 * `priority`/`deadline`). Note rows don't: the persisted column is
 * `content`, not `text`, and `notes` has no `category` column at all -- the
 * category chosen in AddNoteDialog is UI-only and never reaches the DB row
 * `generateSuggestions` is triggered with. Same class of mismatch as
 * `toPromptPatient`, just on the triggering item instead of the patient.
 */
function toPromptItem(newItem) {
  if (newItem.type !== "note") return newItem;
  return {
    type: "note",
    data: {
      text: newItem.data.text || newItem.data.content,
      category: newItem.data.category,
    },
  };
}

/**
 * Generate AI follow-up suggestions based on a new task or note in the context
 * of the patient's full clinical picture.
 *
 * @param {object} patient - Full patient object (name, age, diagnosis, tasks, comments, etc.)
 * @param {object} newItem - The item that was just created
 * @param {string} newItem.type - "task" or "note"
 * @param {object} newItem.data - The task or note object that was just created
 *
 * Output language is read from `currentLanguage()` at call time, never passed
 * in. It controls the suggestion free text only; type/department/priority/
 * category/deadline stay canonical English so the app can act on them.
 *
 * @returns {Promise<Array|null>} Array of 0-3 suggestion objects, or null on failure
 */
export async function generateSuggestions(patient, newItem) {
  try {
    return await invokeClaude("generateSuggestions", {
      patient: toPromptPatient(patient),
      newItem: toPromptItem(newItem),
      language: currentLanguage(),
    });
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
    return await invokeClaude("generatePatientUpdate", { patient, language });
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
    return await invokeClaude("translateText", { text, targetLanguage });
  } catch (err) {
    console.error("[claudeAPI] translateText failed:", err);
    return null;
  }
}
