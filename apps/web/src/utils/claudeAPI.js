import { supabase } from "../lib/supabase";

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
 * @param {string} transcript - Raw text from Web Speech API
 * @returns {Promise<object>} Structured task object:
 *   { id, description, department, room, priority, status, createdAt, isDischarge?, needsPlacement? }
 */
export async function parseVoiceToTask(transcript) {
  try {
    return await invokeClaude("parseVoiceToTask", { transcript });
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
    return await invokeClaude("generateHandoffSummary", { patients });
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
    return await invokeClaude("generateSuggestions", { patient, newItem });
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
