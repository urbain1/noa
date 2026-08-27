import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { parseVoiceToTask, parsePatientFromVoice } from "../utils/claudeAPI";
import { localeTag } from "../i18n";
import { findMatchingPatients } from "../utils/roomMatcher";
import { parsePatientTranscriptFallback } from "../utils/patientVoiceParse";
import RoomDisambiguationDialog from "./RoomDisambiguationDialog";
import ManualRoomEntry from "./ManualRoomEntry";
import OperationStatus from "./OperationStatus";
import { useOperationStatus } from "../hooks/useOperationStatus";

const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

// True when a parsed patient draft carries at least one extracted value.
// `allergies` is a list, and every other field is null when unextracted.
function hasAnyField(fields) {
  return Object.entries(fields).some(([key, value]) =>
    key === "allergies" ? Array.isArray(value) && value.length > 0 : value !== null && value !== undefined && value !== "",
  );
}

// Concatenate two stretches of speech with exactly one space between them.
function joinSpeech(a, b) {
  const left = a.replace(/\s+$/, "");
  const right = b.replace(/^\s+/, "");
  if (!left) return right;
  if (!right) return left;
  return `${left} ${right}`;
}

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

// `mode` selects what this capture produces: a task (default) or a draft
// patient. Recording, transcription, editing the transcript and the Claude
// round-trip are identical either way -- only the parse target and what
// happens with the result differ, so there is one voice screen, not two.
export default function VoiceCapture({ onClose, onTaskCreated, onPatientParsed, allPatients, knownPatient, mode = "task" }) {
  const { t, i18n } = useTranslation();
  const [transcript, setTranscript] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState(null);
  const [roomMatches, setRoomMatches] = useState(null);
  const [showRoomDisambiguation, setShowRoomDisambiguation] = useState(false);
  const [showManualRoomEntry, setShowManualRoomEntry] = useState(false);
  const [parsedTaskDraft, setParsedTaskDraft] = useState(null);
  // One operation per mode, named for what the nurse asked for, so the
  // button says "Creating task..." / "Reading patient details..." rather
  // than a generic spinner. Nothing else on this screen may change the
  // transcript while it runs, so the mic and the textarea are disabled for
  // its duration -- that is the whole block, no overlay needed.
  const ops = useOperationStatus();
  const operationName = mode === "patient" ? "extractPatient" : "createTask";
  const isProcessing = ops.isRunning(operationName);
  const recognitionRef = useRef(null);
  // Speech already committed to the transcript, across every recognition
  // session and any hand edit. See `startRecognition` for why there is more
  // than one session per recording.
  const committedRef = useRef("");
  // Final text the *current* session has produced, and how much of it is
  // already folded into `committedRef` (which a hand edit does). Final
  // results only ever grow by appending, so a length is enough to tell the
  // two apart.
  const sessionFinalRef = useRef("");
  const absorbedRef = useRef(0);
  // Whether the nurse still intends to be recording. The browser ending a
  // session is not the nurse stopping one.
  const keepRecordingRef = useRef(false);
  const restartsRef = useRef({ count: 0, at: 0 });
  // A session restarts itself from its own `onend`, so it needs a stable
  // handle on the current starter rather than the one captured when it began.
  const startRecognitionRef = useRef(null);
  const isPatientMode = mode === "patient";

  useEffect(() => {
    return () => {
      keepRecordingRef.current = false;
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  // The nurse is done speaking on purpose: stop, and don't auto-resume.
  const stopRecording = useCallback(() => {
    keepRecordingRef.current = false;
    recognitionRef.current?.stop();
    setIsRecording(false);
  }, []);

  // One recording, however many recognition sessions it takes.
  //
  // Chrome ends a Web Speech session on its own after a short silence, even
  // with `continuous = true`. The nurse hears nothing and sees no change --
  // they carry on dictating into a microphone that stopped listening, and
  // everything after the pause is lost. That is what made a spoken diagnosis
  // and attending physician "not appear": they were never transcribed. So a
  // session ending while the nurse still intends to record starts a new one,
  // and text already captured carries across rather than being rebuilt from
  // the new (empty) result list, which used to wipe it.
  const startRecognition = useCallback(() => {
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    // fr-FR when the nurse's current language is French, en-US otherwise.
    // Read at press time from the one live value, so a language changed mid
    // session applies to the very next recording.
    recognition.lang = localeTag(i18n.language);

    sessionFinalRef.current = "";
    absorbedRef.current = 0;

    recognition.onresult = (event) => {
      restartsRef.current.count = 0;
      let final = "";
      let interim = "";
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        // Chrome does not put a separator between results, so two of them
        // can fuse into one word ("test 12diagnosis") and take the field
        // either side of the join with them.
        if (result.isFinal) final = joinSpeech(final, result[0].transcript);
        else interim = joinSpeech(interim, result[0].transcript);
      }
      sessionFinalRef.current = final;
      const pending = final.slice(absorbedRef.current);
      setTranscript(joinSpeech(committedRef.current, joinSpeech(pending, interim)));
    };

    recognition.onerror = (event) => {
      // Exactly the silence case above: let `onend` resume.
      if (event.error === "no-speech") return;

      keepRecordingRef.current = false;
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setError(t("errors.micDenied"));
      } else if (event.error !== "aborted") {
        setError(t("errors.speechError", { error: event.error }));
      }
      setIsRecording(false);
    };

    recognition.onend = () => {
      committedRef.current = joinSpeech(
        committedRef.current,
        sessionFinalRef.current.slice(absorbedRef.current),
      );
      sessionFinalRef.current = "";
      absorbedRef.current = 0;
      setTranscript(committedRef.current);

      if (!keepRecordingRef.current) {
        setIsRecording(false);
        return;
      }

      // A session that ends immediately and repeatedly isn't a pause, it's
      // a microphone that can't run. Give up rather than spin.
      const now = Date.now();
      restartsRef.current.count = now - restartsRef.current.at < 1000 ? restartsRef.current.count + 1 : 1;
      restartsRef.current.at = now;
      if (restartsRef.current.count > 5) {
        keepRecordingRef.current = false;
        setIsRecording(false);
        return;
      }

      startRecognitionRef.current?.();
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
      setIsRecording(true);
    } catch {
      keepRecordingRef.current = false;
      setIsRecording(false);
      setError(t("errors.speechStartFailed"));
    }
  }, [i18n.language, t]);

  useEffect(() => {
    startRecognitionRef.current = startRecognition;
  }, [startRecognition]);

  const toggleRecording = useCallback(() => {
    if (!SpeechRecognition) {
      setError(t("errors.speechUnsupported"));
      return;
    }

    if (isRecording) {
      stopRecording();
      return;
    }

    setError(null);
    restartsRef.current = { count: 0, at: 0 };
    keepRecordingRef.current = true;
    startRecognition();
  }, [isRecording, startRecognition, stopRecording, t]);

  // Patient mode: parse the transcript into draft fields and hand them to
  // the review step. Nothing is written here -- the Add Patient form opens
  // pre-filled, and the nurse's confirmation there is what creates the
  // patient. Fields the parser couldn't extract stay blank.
  const handleCapturePatient = async () => {
    stopRecording();

    const spoken = transcript.trim();
    if (!spoken) {
      alert(t("errors.recordFirst"));
      return;
    }

    setError(null);

    try {
      await ops.run(
        "extractPatient",
        { messageKey: "status.extractingPatient", errorKey: "status.extractFailed", surface: "button" },
        async () => {
          let fields = await parsePatientFromVoice(spoken);
          if (!fields) {
            console.warn("[VoiceCapture] parsePatientFromVoice unavailable, falling back");
            fields = parsePatientTranscriptFallback(spoken);
          } else if (!hasAnyField(fields)) {
            // The action answered, but with nothing in it. On a transcript
            // the nurse actually spoke that is a failed extraction, not an
            // empty description, and handing back a blank review form
            // silently loses everything they said. The offline parser reads
            // the same transcript under the same never-invent rule, so try
            // it before giving up on the fields entirely.
            console.warn("[VoiceCapture] parsePatientFromVoice returned no fields, falling back");
            fields = parsePatientTranscriptFallback(spoken);
          }
          console.log("[VoiceCapture] patient fields extracted:", { transcript: spoken, fields });
          onPatientParsed(fields);
        },
      );
    } catch (err) {
      // Neither path is expected to throw (both catch internally), but a
      // throw here used to leave the button spinning and disabled forever.
      // The review step still opens, on whatever the offline parser can
      // read, rather than stranding the nurse on this screen.
      console.error("[VoiceCapture] patient extraction failed:", err);
      onPatientParsed(parsePatientTranscriptFallback(spoken));
    }
  };

  const handleCreateTask = async () => {
    stopRecording();

    const spoken = transcript.trim();
    if (!spoken) {
      alert(t("errors.recordFirst"));
      return;
    }

    setError(null);

    // The whole operation, not just the parse: the task doesn't exist until
    // `onTaskCreated` has written it, so the button keeps saying "Creating
    // task..." until it has. Previously the screen closed the moment the
    // parse returned and the write happened with nothing on screen at all.
    try {
      await ops.run(
        "createTask",
        { messageKey: "status.creatingTask", errorKey: "errors.createTask", surface: "button" },
        async () => {
          let parsedTask;
          try {
            parsedTask = await parseVoiceToTask(spoken);
            if (parsedTask) {
              console.log("[VoiceCapture] Claude API succeeded:", parsedTask);
            } else {
              console.warn("[VoiceCapture] Claude API returned null, falling back");
              parsedTask = parseTranscriptFallback(spoken);
            }
          } catch (err) {
            console.error("[VoiceCapture] Claude API failed, falling back:", err);
            parsedTask = parseTranscriptFallback(spoken);
          }

          if (!parsedTask) {
            alert(t("errors.parseTask"));
            return;
          }

          // Carried through to onTaskCreated so the caller can persist the
          // original transcript alongside the parsed fields.
          parsedTask.rawTranscript = spoken;

          // Opened from a specific patient's card ("+ Add Task") -- the patient
          // is already known, so skip matching entirely rather than re-resolving
          // it against every patient in the facility.
          if (knownPatient) {
            await onTaskCreated({
              ...parsedTask,
              room: knownPatient.location_label,
              patientName: knownPatient.label,
            });
            onClose();
            return;
          }

          // Step 2: Handle patient matching (by location label OR patient label)
          const searchInput = parsedTask.patientName || (parsedTask.room && parsedTask.room !== "000" ? parsedTask.room : null);
          const matches = searchInput ? findMatchingPatients(searchInput, allPatients) : null;

          if (matches && matches.matchType === "exact") {
            await onTaskCreated({
              ...parsedTask,
              room: matches.exactMatch.location_label,
              patientName: matches.exactMatch.label,
            });
            onClose();
          } else if (matches && matches.matchType === "partial" && matches.partialMatches.length === 1) {
            await onTaskCreated({
              ...parsedTask,
              room: matches.partialMatches[0].location_label,
              patientName: matches.partialMatches[0].label,
            });
            onClose();
          } else if (matches && matches.matchType === "partial") {
            // Handing off to a dialog: the operation is over, the nurse's
            // choice is what continues it.
            setParsedTaskDraft(parsedTask);
            setRoomMatches(matches);
            setShowRoomDisambiguation(true);
          } else {
            // No patient identifier, or no match found -- manual entry.
            setParsedTaskDraft(parsedTask);
            setShowManualRoomEntry(true);
          }
        },
      );
    } catch (error) {
      console.error("Task creation error:", error);
      alert(t("errors.createTask"));
    }
  };

  const commitDraftTask = async (patient) => {
    if (!parsedTaskDraft) return;
    try {
      await ops.run(
        "createTask",
        { messageKey: "status.creatingTask", errorKey: "errors.createTask", surface: "toast" },
        () => onTaskCreated({ ...parsedTaskDraft, room: patient.location_label, patientName: patient.label }),
      );
      onClose();
    } catch (err) {
      console.error("Task creation error:", err);
      alert(t("errors.createTask"));
    }
  };

  const handleRoomSelected = commitDraftTask;

  // Manual entry always resolves to a real, already-selected patient (or is
  // cancelled) -- no re-matching needed, and no local-only "new patient"
  // path since patient creation must go through the Add Patient dialog to
  // keep the Patient_Test_N labeling convention.
  const handleManualRoomConfirm = commitDraftTask;

  const handleDisambiguationCancel = () => {
    setShowRoomDisambiguation(false);
    setShowManualRoomEntry(false);
    setParsedTaskDraft(null);
    setRoomMatches(null);
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
            disabled={isProcessing}
            className={`flex h-28 w-28 items-center justify-center rounded-full border-none bg-blue-600 text-white shadow-lg ring-4 ring-blue-600/20 transition-all duration-200 hover:bg-blue-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${
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
            onChange={(e) => {
              // Editing by hand replaces everything captured so far, and
              // anything the current session has already finalised is
              // folded in with it, so resuming appends instead of
              // re-adding what the nurse just deleted.
              committedRef.current = e.target.value;
              absorbedRef.current = sessionFinalRef.current.length;
              setTranscript(e.target.value);
            }}
            placeholder={t("voiceCapture.transcriptPlaceholder")}
            disabled={isProcessing}
            className="w-full min-h-[120px] p-4 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none resize-none disabled:bg-gray-50 disabled:text-gray-500"
          />
        </div>

        {/* Create Task + Cancel buttons */}
        <div className="flex w-full gap-2">
          <button
            onClick={() => {
              stopRecording();
              committedRef.current = "";
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
              <OperationStatus operations={ops.operations} name={operationName} variant="button" />
            ) : isPatientMode ? (
              t("voiceCapture.reviewPatient")
            ) : (
              t("voiceCapture.createTask")
            )}
          </button>
        </div>
      </main>

      <OperationStatus operations={ops.operations} variant="toast" />

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
