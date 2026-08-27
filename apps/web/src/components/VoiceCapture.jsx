import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { parseVoiceToTask, parsePatientFromVoice } from "../utils/claudeAPI";
import { localeTag } from "../i18n";
import { findMatchingPatients } from "../utils/roomMatcher";
import RoomDisambiguationDialog from "./RoomDisambiguationDialog";
import ManualRoomEntry from "./ManualRoomEntry";

const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

function parseTranscriptFallback(text) {
  const lower = text.toLowerCase();

  const roomMatch = lower.match(/room\s+([\w-]+)/);
  const room = roomMatch ? roomMatch[1].toUpperCase() : "000";

  const isDischarge = /\b(discharge|ready for discharge)\b/.test(lower);
  const needsPlacement = /\b(nursing home|snf|skilled nursing facility)\b/.test(lower);

  let department = "Other";
  if (isDischarge || needsPlacement) {
    department = "Social Work";
  } else if (/\b(mri|ct|x[\s-]?ray|radiology|ultrasound|imaging)\b/.test(lower)) {
    department = "Radiology";
  } else if (/\b(blood|lab|panel|cbc|metabolic|lipid)\b/.test(lower)) {
    department = "Lab";
  } else if (/\b(medication|drug|pharmacy|administer|dispense|dose|mg)\b/.test(lower)) {
    department = "Pharmacy";
  } else if (/\b(transport|wheelchair|stretcher|transfer|move)\b/.test(lower)) {
    department = "Transport";
  }

  const priority = /\b(stat|emergency|asap|immediately)\b/.test(lower)
    ? "Stat"
    : /\b(urgent|priority|soon|important)\b/.test(lower)
      ? "Urgent"
      : "Routine";

  // Try to extract patient name (basic patterns)
  let patientName = null;
  const namePatterns = [
    /\bfor\s+(?:patient\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/,
    /\bpatient\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/,
  ];
  // Try on original text (not lowercased) to catch capitalized names
  for (const pattern of namePatterns) {
    const nameMatch = text.match(pattern);
    if (nameMatch) {
      patientName = nameMatch[1].trim();
      break;
    }
  }

  // Deadline extraction (basic patterns)
  let deadline = null;
  const inHoursMatch = lower.match(/\bin\s+(\d+)\s+hours?\b/);
  const inMinutesMatch = lower.match(/\bin\s+(\d+)\s+minutes?\b/);
  const byTomorrowMatch = lower.match(/\bby\s+tomorrow\b/);
  const byTonightMatch = lower.match(/\bby\s+tonight\b/);

  if (inHoursMatch) {
    deadline = new Date(Date.now() + parseInt(inHoursMatch[1]) * 60 * 60 * 1000).toISOString();
  } else if (inMinutesMatch) {
    deadline = new Date(Date.now() + parseInt(inMinutesMatch[1]) * 60 * 1000).toISOString();
  } else if (byTomorrowMatch) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(17, 0, 0, 0);
    deadline = tomorrow.toISOString();
  } else if (byTonightMatch) {
    const tonight = new Date();
    tonight.setHours(21, 0, 0, 0);
    deadline = tonight.toISOString();
  }

  return {
    id: Date.now(),
    description: text.trim(),
    department,
    status: "Pending",
    timestamp: new Date().toISOString(),
    priority,
    patientName,
    deadline,
    room,
    ...(isDischarge && { isDischarge: true }),
    ...(needsPlacement && { needsPlacement: true }),
  };
}

// Fallback for `parsePatientFromVoice`, used when the Edge Function call
// fails (including when the deployed function predates that action).
// CLAUDE.md requires a fallback parser for every prompt.
//
// Deliberately conservative: it only picks up things stated in a form it can
// recognise with certainty, and leaves everything else null for the nurse to
// fill in on the review form. Guessing a diagnosis or an age onto a clinical
// record is worse than leaving the field empty.
// Web Speech API commonly transcribes small spoken numbers as words ("four")
// while multi-digit numbers usually come through as numerals ("12", "35").
// The label rule (SECURITY.md) is understood to cover both -- the server
// prompt spells out "patient test three" -> "Patient_Test_3" -- but the
// digit-only regex below missed the word form entirely, silently failing
// label extraction for any single-digit Patient_Test_N spoken naturally.
const NUMBER_WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90,
};

function wordsToNumber(phrase) {
  const parts = phrase.toLowerCase().split(/[\s-]+/).filter(Boolean);
  if (parts.length === 0 || parts.length > 2 || !parts.every((p) => p in NUMBER_WORDS)) return null;
  if (parts.length === 1) return NUMBER_WORDS[parts[0]];
  const [tens, ones] = parts.map((p) => NUMBER_WORDS[p]);
  return tens >= 20 && tens % 10 === 0 && ones < 10 ? tens + ones : null;
}

function parsePatientTranscriptFallback(text) {
  const lower = text.toLowerCase();

  // Patient_Test_N only. Never a name, a real room/bed number, or an ID --
  // see SECURITY.md. Anything else leaves the label blank.
  let label = null;
  const labelDigitMatch = lower.match(/\b(?:patient|test)[\s_-]*(?:test|patient)?[\s_-]*(\d{1,4})\b/);
  if (labelDigitMatch) {
    label = `Patient_Test_${labelDigitMatch[1]}`;
  } else {
    const labelWordMatch = lower.match(
      /\b(?:patient|test)[\s_-]*(?:test|patient)?[\s_-]*((?:[a-z]+[\s-])?[a-z]+)\b/
    );
    if (labelWordMatch) {
      const n = wordsToNumber(labelWordMatch[1]);
      if (n !== null) label = `Patient_Test_${n}`;
    }
  }

  // "68 year old" / "68 ans" / "aged 68"
  let age = null;
  const ageMatch =
    lower.match(/\b(\d{1,3})[\s-]*(?:years?[\s-]*old|y\/?o\b|ans\b)/) ||
    lower.match(/\b(?:aged|âgé[e]?\s+de)\s+(\d{1,3})\b/);
  if (ageMatch) {
    const value = parseInt(ageMatch[1], 10);
    if (value >= 0 && value <= 130) age = value;
  }

  // Only an explicit statement sets code status.
  let codeStatus = null;
  if (/\bdnr\s*\/?\s*dni\b|\bne pas réanimer\s*\/?\s*ne pas intuber\b/.test(lower)) codeStatus = "DNR/DNI";
  else if (/\bdnr\b|\bdo not resuscitate\b|\bne pas réanimer\b/.test(lower)) codeStatus = "DNR";
  else if (/\bcomfort care\b|\bsoins de confort\b/.test(lower)) codeStatus = "Comfort Care";
  else if (/\bfull code\b|\bréanimation complète\b/.test(lower)) codeStatus = "Full Code";

  // Diagnosis only from an explicit lead-in, never inferred from symptoms
  // or medications.
  let diagnosis = null;
  const diagnosisMatch = text.match(
    /\b(?:admitted (?:with|for)|diagnosis(?: of| is)?|diagnosed with|presenting with|admis(?:e)? pour|diagnostic(?: de)?)\s+([^.,;]{3,80})/i
  );
  if (diagnosisMatch) diagnosis = diagnosisMatch[1].trim();

  // Attending physician, either "attending (physician) is/: Dr X" or
  // "Dr X is the attending (physician)".
  let attendingPhysician = null;
  const physicianLeadInMatch = text.match(
    /\b(?:attending physician|attending doctor|attending|médecin traitant)\s*(?:is|:)?\s+(Dr\.?\s*[A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+)?|[A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+)?)/
  );
  const physicianTrailingMatch = text.match(
    /\b(Dr\.?\s*[A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+)?)\s+is\s+(?:the\s+)?attending/i
  );
  if (physicianLeadInMatch) attendingPhysician = physicianLeadInMatch[1].trim();
  else if (physicianTrailingMatch) attendingPhysician = physicianTrailingMatch[1].trim();

  // Synthetic location labels only ("Test Room A", "Bay 2").
  let locationLabel = null;
  const locationMatch = text.match(/\b(?:test room|bay|chambre test)\s+([A-Za-z0-9]{1,4})\b/i);
  if (locationMatch) locationLabel = `${locationMatch[0].trim()}`;

  return {
    label,
    age,
    diagnosis,
    codeStatus,
    attendingPhysician,
    allergies: [],
    admissionDate: null,
    locationLabel,
  };
}

// `mode` selects what this capture produces: a task (default) or a draft
// patient. Recording, transcription, editing the transcript and the Claude
// round-trip are identical either way -- only the parse target and what
// happens with the result differ, so there is one voice screen, not two.
export default function VoiceCapture({ onClose, onTaskCreated, onPatientParsed, allPatients, knownPatient, mode = "task" }) {
  const { t, i18n } = useTranslation();
  const [transcript, setTranscript] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [roomMatches, setRoomMatches] = useState(null);
  const [showRoomDisambiguation, setShowRoomDisambiguation] = useState(false);
  const [showManualRoomEntry, setShowManualRoomEntry] = useState(false);
  const [parsedTaskDraft, setParsedTaskDraft] = useState(null);
  const recognitionRef = useRef(null);
  const isPatientMode = mode === "patient";

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  const toggleRecording = useCallback(() => {
    if (!SpeechRecognition) {
      setError(t("errors.speechUnsupported"));
      return;
    }

    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    // fr-FR when the nurse's current language is French, en-US otherwise.
    // Read at press time from the one live value, so a language changed mid
    // session applies to the very next recording.
    recognition.lang = localeTag(i18n.language);

    recognition.onresult = (event) => {
      let text = "";
      for (let i = 0; i < event.results.length; i++) {
        text += event.results[i][0].transcript;
      }
      setTranscript(text);
    };

    recognition.onerror = (event) => {
      if (event.error === "not-allowed") {
        setError(t("errors.micDenied"));
      } else if (event.error !== "aborted") {
        setError(t("errors.speechError", { error: event.error }));
      }
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    setError(null);

    try {
      recognition.start();
      setIsRecording(true);
    } catch {
      setError(t("errors.speechStartFailed"));
    }
  }, [isRecording, i18n.language, t]);

  // Patient mode: parse the transcript into draft fields and hand them to
  // the review step. Nothing is written here -- the Add Patient form opens
  // pre-filled, and the nurse's confirmation there is what creates the
  // patient. Fields the parser couldn't extract stay blank.
  const handleCapturePatient = async () => {
    recognitionRef.current?.stop();
    setIsRecording(false);

    if (!transcript.trim()) {
      alert(t("errors.recordFirst"));
      return;
    }

    setIsProcessing(true);
    setError(null);

    let fields = await parsePatientFromVoice(transcript.trim());
    if (!fields) {
      console.warn("[VoiceCapture] parsePatientFromVoice unavailable, falling back");
      fields = parsePatientTranscriptFallback(transcript.trim());
    }

    setIsProcessing(false);
    onPatientParsed(fields);
  };

  const handleCreateTask = async () => {
    // Stop recording if active
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsRecording(false);

    if (!transcript.trim()) {
      alert(t("errors.recordFirst"));
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      let parsedTask;
      try {
        parsedTask = await parseVoiceToTask(transcript.trim());
        if (parsedTask) {
          console.log("[VoiceCapture] Claude API succeeded:", parsedTask);
        } else {
          console.warn("[VoiceCapture] Claude API returned null, falling back");
          parsedTask = parseTranscriptFallback(transcript.trim());
        }
      } catch (err) {
        console.error("[VoiceCapture] Claude API failed, falling back:", err);
        parsedTask = parseTranscriptFallback(transcript.trim());
      }

      if (!parsedTask) {
        alert(t("errors.parseTask"));
        setIsProcessing(false);
        return;
      }

      // Carried through to onTaskCreated so the caller can persist the
      // original transcript alongside the parsed fields.
      parsedTask.rawTranscript = transcript.trim();

      // Opened from a specific patient's card ("+ Add Task") -- the patient
      // is already known, so skip matching entirely rather than re-resolving
      // it against every patient in the facility.
      if (knownPatient) {
        onTaskCreated({
          ...parsedTask,
          room: knownPatient.location_label,
          patientName: knownPatient.label,
        });
        onClose();
        return;
      }

      // Step 2: Handle patient matching (by location label OR patient label)
      const searchInput = parsedTask.patientName || (parsedTask.room && parsedTask.room !== "000" ? parsedTask.room : null);

      if (searchInput) {
        const matches = findMatchingPatients(searchInput, allPatients);

        if (matches.matchType === "exact") {
          onTaskCreated({
            ...parsedTask,
            room: matches.exactMatch.location_label,
            patientName: matches.exactMatch.label,
          });
          onClose();
        } else if (matches.matchType === "partial") {
          if (matches.partialMatches.length === 1) {
            onTaskCreated({
              ...parsedTask,
              room: matches.partialMatches[0].location_label,
              patientName: matches.partialMatches[0].label,
            });
            onClose();
          } else {
            setParsedTaskDraft(parsedTask);
            setRoomMatches(matches);
            setShowRoomDisambiguation(true);
            setIsProcessing(false);
          }
        } else {
          setParsedTaskDraft(parsedTask);
          setShowManualRoomEntry(true);
          setIsProcessing(false);
        }
      } else {
        // No patient identifier (room or name) - show manual entry
        setParsedTaskDraft(parsedTask);
        setShowManualRoomEntry(true);
        setIsProcessing(false);
      }
    } catch (error) {
      console.error("Task creation error:", error);
      alert(t("errors.createTask"));
      setIsProcessing(false);
    }
  };

  const handleRoomSelected = (patient) => {
    if (parsedTaskDraft) {
      onTaskCreated({ ...parsedTaskDraft, room: patient.location_label, patientName: patient.label });
      onClose();
    }
  };

  // Manual entry always resolves to a real, already-selected patient (or is
  // cancelled) -- no re-matching needed, and no local-only "new patient"
  // path since patient creation must go through the Add Patient dialog to
  // keep the Patient_Test_N labeling convention.
  const handleManualRoomConfirm = (patient) => {
    if (parsedTaskDraft) {
      onTaskCreated({ ...parsedTaskDraft, room: patient.location_label, patientName: patient.label });
      onClose();
    }
  };

  const handleDisambiguationCancel = () => {
    setShowRoomDisambiguation(false);
    setShowManualRoomEntry(false);
    setParsedTaskDraft(null);
    setRoomMatches(null);
    setIsProcessing(false);
  };

  return (
    <div className="flex min-h-screen flex-col bg-gray-100">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center border-b border-gray-200 bg-white px-4 py-3 shadow-sm">
        <button
          onClick={onClose}
          className="mr-3 flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-900"
          aria-label={t("voiceCapture.goBackAria")}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-6 w-6"
          >
            <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
          </svg>
        </button>
        <h1 className="font-display text-xl font-bold tracking-tight text-gray-900">
          {isPatientMode
            ? t("voiceCapture.titlePatient")
            : knownPatient
              ? t("voiceCapture.titleForPatient", { patient: knownPatient.label })
              : t("voiceCapture.title")}
        </h1>
      </header>

      {/* Content */}
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center gap-6 px-5 py-6 sm:px-6">
        {/* Mic button */}
        <div className="flex flex-col items-center gap-3 pt-8">
          <button
            onClick={toggleRecording}
            className={`flex h-28 w-28 items-center justify-center rounded-full border-none bg-blue-600 text-white shadow-lg ring-4 ring-blue-600/20 transition-all duration-200 hover:bg-blue-700 active:scale-95 ${
              isRecording ? "animate-pulse" : ""
            }`}
            aria-label={isRecording ? t("voiceCapture.stopRecordingAria") : t("voiceCapture.startRecordingAria")}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-14 w-14"
            >
              <path d="M12 1a4 4 0 0 0-4 4v6a4 4 0 0 0 8 0V5a4 4 0 0 0-4-4Z" />
              <path d="M19 11a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.93V21H8a1 1 0 1 0 0 2h8a1 1 0 1 0 0-2h-3v-3.07A7 7 0 0 0 19 11Z" />
            </svg>
          </button>
          <p className="text-sm font-medium text-gray-500">
            {isRecording
              ? t("common.listening")
              : isPatientMode
                ? t("voiceCapture.tapToRecordPatient")
                : t("voiceCapture.tapToRecord")}
          </p>
          <p className="text-sm text-gray-400 italic mt-2">
            {isPatientMode
              ? t("voiceCapture.examplePatient")
              : knownPatient
                ? t("voiceCapture.exampleForPatient")
                : t("voiceCapture.exampleGeneral")}
          </p>
          {isPatientMode && (
            // The same rule the Add Patient form states, at the point the
            // nurse is about to speak: synthetic labels only, never a real
            // identifier (SECURITY.md).
            <p className="mt-1 text-center text-xs text-gray-400">
              {t("voiceCapture.patientSyntheticHint")}
            </p>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="w-full rounded-lg bg-red-50 p-3 text-center text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Transcript */}
        <div className="w-full rounded-xl bg-white p-4 shadow-md">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t("voiceCapture.transcriptLabel")}
          </label>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder={t("voiceCapture.transcriptPlaceholder")}
            className="w-full min-h-[120px] p-4 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none resize-none"
          />
        </div>

        {/* Create Task + Cancel buttons */}
        <div className="flex w-full gap-2">
          <button
            onClick={() => {
              if (recognitionRef.current) {
                recognitionRef.current.stop();
              }
              setIsRecording(false);
              setTranscript("");
              onClose();
            }}
            className="bg-gray-100 text-gray-600 hover:bg-gray-200 px-4 py-2 rounded-lg"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={isPatientMode ? handleCapturePatient : handleCreateTask}
            disabled={!transcript.trim() || isProcessing}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl border-none px-6 py-3.5 text-base font-semibold shadow-md transition-all duration-200 active:scale-[0.98] ${
              transcript.trim()
                ? "bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"
                : "bg-blue-200 text-blue-400 cursor-not-allowed"
            } disabled:opacity-60`}
          >
            {isProcessing ? (
              <>
                <svg
                  className="h-5 w-5 animate-spin"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                {t("common.processing")}
              </>
            ) : isPatientMode ? (
              t("voiceCapture.reviewPatient")
            ) : (
              t("voiceCapture.createTask")
            )}
          </button>
        </div>
      </main>

      {showRoomDisambiguation && roomMatches && (
        <RoomDisambiguationDialog
          spokenRoom={parsedTaskDraft?.patientName || parsedTaskDraft?.room || ""}
          matchingRooms={roomMatches.partialMatches}
          onSelect={handleRoomSelected}
          onManualEntry={() => {
            setShowRoomDisambiguation(false);
            setShowManualRoomEntry(true);
          }}
          onCancel={handleDisambiguationCancel}
        />
      )}

      {showManualRoomEntry && (
        <ManualRoomEntry
          onConfirm={handleManualRoomConfirm}
          onCancel={handleDisambiguationCancel}
          allPatients={allPatients}
        />
      )}
    </div>
  );
}
