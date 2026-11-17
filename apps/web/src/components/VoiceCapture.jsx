import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { parseVoiceToTask, parsePatientFromVoice, parseVoiceCommand } from "../utils/claudeAPI";
import { buildVoiceContext } from "../utils/voiceContext";
import { VOICE_TRANSCRIPT_MAX, describeAction, sanitiseVoiceResult } from "../utils/voiceRegistry";
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

// Causes that mean the multi-action parser cannot run at all right now (the
// Edge Function is unreachable, predates the action, or errored). They put
// the screen in LIMITED MODE. `unreadable` is different: the parser ran and
// returned nothing usable, which is something to rephrase.
const LIMITED_MODE_CAUSES = ["unknown_action", "unreachable", "server_error"];

// `mode` selects what this capture produces: a task (default), a draft
// patient, or a universal voice command. Recording, transcription and
// editing the transcript are identical in all three -- only the parse target
// and what happens with the result differ, so there is one voice screen.
//
// mode="command" is the main-page button (decisions.md, 2026-11-16): free
// speech, several actions. The parser's answer is shown as "what Noa
// understood", the nurse can fix the text and run it again, and Start hands
// the actions to the review queue (`onCommandReady`). Nothing is written
// here. Typing works as well as speaking, since Web Speech is unreliable on
// iOS Safari.
//
// If the parser cannot run, the screen says so in a visible notice and
// offers the EXISTING single-task path on the same text ("Create one
// task"). It never falls back silently, and the real cause is in the
// console (utils/claudeAPI.js parseVoiceCommand).
//
// mode="task" with `knownPatient` (a patient card's "+ Add Task") is
// untouched by any of this.
export default function VoiceCapture({ onClose, onTaskCreated, onPatientParsed, onCommandReady, allPatients, nurses = [], knownPatient, mode = "task" }) {
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
  const isCommandMode = mode === "command";
  // Command mode: the parser's sanitised answer and the exact text it was
  // read from, so an edited transcript is recognisably out of date.
  const [command, setCommand] = useState(null); // { parsed, text } or null
  // null | "limited" (parser unavailable, one task only) | "unreadable"
  const [fallback, setFallback] = useState(null);
  const operationName = ["parseCommand", "extractPatient", "createTask"].find((name) => ops.isRunning(name))
    || (mode === "patient" ? "extractPatient" : isCommandMode ? "parseCommand" : "createTask");
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

  // Command mode: read the transcript into actions. Nothing is written.
  const handleParseCommand = async () => {
    stopRecording();

    const spoken = transcript.trim();
    if (!spoken) {
      alert(t("errors.recordFirst"));
      return;
    }
    if (spoken.length > VOICE_TRANSCRIPT_MAX) {
      setError(t("voiceCapture.tooLong", { max: VOICE_TRANSCRIPT_MAX }));
      return;
    }

    setError(null);
    setCommand(null);
    setFallback(null);

    try {
      await ops.run(
        "parseCommand",
        { messageKey: "status.readingCommand", errorKey: "status.failed", surface: "button" },
        async () => {
          const outcome = await parseVoiceCommand(spoken, buildVoiceContext(allPatients, nurses));
          if (outcome.ok) {
            setCommand({ parsed: sanitiseVoiceResult(outcome.result), text: spoken });
          } else if (outcome.cause === "too_long") {
            setError(t("voiceCapture.tooLong", { max: VOICE_TRANSCRIPT_MAX }));
          } else if (LIMITED_MODE_CAUSES.includes(outcome.cause)) {
            // Said on screen, not just logged: the nurse must know that
            // what follows is one task, not the several things they said.
            setFallback("limited");
          } else {
            setFallback("unreadable");
          }
        },
      );
    } catch (err) {
      // parseVoiceCommand never throws; this is for anything unexpected.
      console.error("[VoiceCapture] voice command failed:", err);
      setFallback("limited");
    }
  };

  const commandIsCurrent = Boolean(command) && command.text === transcript.trim();
  const commandActions = commandIsCurrent ? command.parsed.actions : [];
  const overLimit = isCommandMode && transcript.trim().length > VOICE_TRANSCRIPT_MAX;

  const handleStartCommand = () => {
    if (!commandIsCurrent || commandActions.length === 0) return;
    stopRecording();
    onCommandReady({ parsed: command.parsed, transcript: command.text });
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
            : isCommandMode
              ? t("voiceCapture.titleCommand")
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
                : isCommandMode
                  ? t("voiceCapture.tapToRecordCommand")
                  : t("voiceCapture.tapToRecord")}
          </p>
          {isCommandMode ? (
            // Two or three example commands, and the same reminder every
            // voice entry point carries: synthetic labels only (SECURITY.md).
            <div className="mt-2 w-full text-sm text-gray-500">
              <p className="text-center">{t("voiceCapture.commandExamplesTitle")}</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-6 italic text-gray-400">
                <li>{t("voiceCapture.commandExample1")}</li>
                <li>{t("voiceCapture.commandExample2")}</li>
                <li>{t("voiceCapture.commandExample3")}</li>
              </ul>
              <p className="mt-2 text-center text-xs text-gray-400">{t("voiceCapture.commandSyntheticHint")}</p>
            </div>
          ) : (
            <p className="text-sm text-gray-400 italic mt-2">
              {isPatientMode
                ? t("voiceCapture.examplePatient")
                : knownPatient
                  ? t("voiceCapture.exampleForPatient")
                  : t("voiceCapture.exampleGeneral")}
            </p>
          )}
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
            placeholder={isCommandMode ? t("voiceCapture.commandPlaceholder") : t("voiceCapture.transcriptPlaceholder")}
            disabled={isProcessing}
            className="w-full min-h-[120px] p-4 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none resize-none disabled:bg-gray-50 disabled:text-gray-500"
          />
          {isCommandMode && (
            <p className={`mt-1 text-right text-xs ${overLimit ? "font-semibold text-red-600" : "text-gray-400"}`}>
              {overLimit
                ? t("voiceCapture.tooLong", { max: VOICE_TRANSCRIPT_MAX })
                : t("voiceCapture.charCount", { count: transcript.trim().length, max: VOICE_TRANSCRIPT_MAX })}
            </p>
          )}
        </div>

        {/* Limited mode: the multi-action parser cannot run. Visible, and
            nothing happens until the nurse presses "Create one task". */}
        {isCommandMode && fallback === "limited" && (
          <div role="alert" className="w-full rounded-lg bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
            <p className="font-semibold">{t("voiceCapture.limitedTitle")}</p>
            <p className="mt-1">{t("voiceCapture.limitedBody")}</p>
            <button
              type="button"
              onClick={handleParseCommand}
              disabled={isProcessing || !transcript.trim() || overLimit}
              className="mt-2 text-xs font-semibold underline disabled:opacity-50"
            >
              {t("voiceCapture.runAgain")}
            </button>
          </div>
        )}

        {isCommandMode && fallback === "unreadable" && (
          <div role="alert" className="w-full rounded-lg bg-red-50 p-4 text-sm text-red-700">
            <p>{t("voiceCapture.unreadable")}</p>
            <button type="button" onClick={() => setFallback("limited")} className="mt-2 text-xs font-semibold underline">
              {t("voiceCapture.orCreateOneTask")}
            </button>
          </div>
        )}

        {/* What Noa understood. Read-only: the dialogs that follow are where
            each action is checked and confirmed. */}
        {isCommandMode && command && !fallback && (
          <div className="w-full rounded-xl bg-white p-4 shadow-md">
            <h2 className="text-sm font-semibold text-gray-700">{t("voiceCapture.understoodTitle")}</h2>
            {!commandIsCurrent ? (
              <p className="mt-2 text-sm text-amber-800">{t("voiceCapture.editedHint")}</p>
            ) : command.parsed.actions.length === 0 ? (
              <p className="mt-2 text-sm text-gray-600">{t("voiceCapture.nothingUnderstood")}</p>
            ) : (
              <>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-gray-900">
                  {command.parsed.actions.map((action, i) => (
                    <li key={i} className="break-words">
                      {describeAction(t, action)}
                      {action.confidence === "low" && (
                        <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                          {t("voiceCapture.lowConfidence")}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
                <p className="mt-2 text-xs text-gray-500">{t("voiceCapture.understoodHint")}</p>
              </>
            )}
            {commandIsCurrent && command.parsed.unparsed.length > 0 && (
              <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
                <p className="font-semibold">{t("voiceCapture.notUnderstoodTitle")}</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {command.parsed.unparsed.map((words, i) => (
                    <li key={i} className="break-words">{words}</li>
                  ))}
                </ul>
              </div>
            )}
            {commandIsCurrent && command.parsed.dropped.length > 0 && (
              <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
                <p className="font-semibold">{t("voiceCapture.droppedTitle")}</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {command.parsed.dropped.map((d, i) => (
                    <li key={i} className="break-words">{d.words}</li>
                  ))}
                </ul>
              </div>
            )}
            {commandIsCurrent && command.parsed.contextTruncated && (
              <p className="mt-3 text-xs text-gray-500">{t("voiceCapture.contextTruncated")}</p>
            )}
          </div>
        )}

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
            onClick={
              isPatientMode
                ? handleCapturePatient
                : !isCommandMode || fallback === "limited"
                  ? handleCreateTask
                  : commandIsCurrent && commandActions.length > 0
                    ? handleStartCommand
                    : handleParseCommand
            }
            disabled={!transcript.trim() || isProcessing || overLimit}
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
            ) : !isCommandMode ? (
              t("voiceCapture.createTask")
            ) : fallback === "limited" ? (
              t("voiceCapture.createOneTask")
            ) : commandIsCurrent && commandActions.length > 0 ? (
              t("voiceCapture.start")
            ) : command || fallback === "unreadable" ? (
              t("voiceCapture.runAgain")
            ) : (
              t("voiceCapture.reviewActions")
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
