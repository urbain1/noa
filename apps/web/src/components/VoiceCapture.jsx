import { useState, useRef, useCallback, useEffect } from "react";
import { parseVoiceToTask } from "../utils/claudeAPI";
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

export default function VoiceCapture({ onClose, onTaskCreated, allPatients }) {
  const [transcript, setTranscript] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [roomMatches, setRoomMatches] = useState(null);
  const [showRoomDisambiguation, setShowRoomDisambiguation] = useState(false);
  const [showManualRoomEntry, setShowManualRoomEntry] = useState(false);
  const [parsedTaskDraft, setParsedTaskDraft] = useState(null);
  const recognitionRef = useRef(null);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  const toggleRecording = useCallback(() => {
    if (!SpeechRecognition) {
      setError("Speech recognition is not supported in this browser.");
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
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      let text = "";
      for (let i = 0; i < event.results.length; i++) {
        text += event.results[i][0].transcript;
      }
      setTranscript(text);
    };

    recognition.onerror = (event) => {
      if (event.error === "not-allowed") {
        setError("Microphone access denied. Please allow microphone permissions.");
      } else if (event.error !== "aborted") {
        setError(`Speech recognition error: ${event.error}`);
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
      setError("Failed to start speech recognition.");
    }
  }, [isRecording]);

  const handleCreateTask = async () => {
    // Stop recording if active
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsRecording(false);

    if (!transcript.trim()) {
      alert("Please record something first");
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
        alert("Could not parse task. Please try again.");
        setIsProcessing(false);
        return;
      }

      // Step 2: Handle patient matching (by room OR name)
      const searchInput = parsedTask.patientName || (parsedTask.room && parsedTask.room !== "000" ? parsedTask.room : null);

      if (searchInput) {
        const matches = findMatchingPatients(searchInput, allPatients);

        if (matches.matchType === "exact") {
          onTaskCreated({
            ...parsedTask,
            room: matches.exactMatch.room,
            patientName: matches.exactMatch.name,
          });
          onClose();
        } else if (matches.matchType === "partial") {
          if (matches.partialMatches.length === 1) {
            onTaskCreated({
              ...parsedTask,
              room: matches.partialMatches[0].room,
              patientName: matches.partialMatches[0].name,
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
      alert("Error creating task. Please try again.");
      setIsProcessing(false);
    }
  };

  const handleRoomSelected = (patient) => {
    if (parsedTaskDraft) {
      onTaskCreated({ ...parsedTaskDraft, room: patient.room, patientName: patient.name });
      onClose();
    }
  };

  const handleManualRoomConfirm = (roomData) => {
    if (parsedTaskDraft) {
      // If user entered searchName or room, try to find matching patient
      if (!roomData.isNewPatient && (roomData.searchName || roomData.room)) {
        const searchInput = roomData.searchName || roomData.room;
        const matches = findMatchingPatients(searchInput, allPatients);

        if (matches.exactMatch) {
          onTaskCreated({
            ...parsedTaskDraft,
            room: matches.exactMatch.room,
            patientName: matches.exactMatch.name,
          });
          onClose();
          return;
        } else if (matches.partialMatches.length === 1) {
          onTaskCreated({
            ...parsedTaskDraft,
            room: matches.partialMatches[0].room,
            patientName: matches.partialMatches[0].name,
          });
          onClose();
          return;
        } else if (matches.partialMatches.length > 1) {
          setRoomMatches(matches);
          setShowManualRoomEntry(false);
          setShowRoomDisambiguation(true);
          return;
        }
      }

      // If new patient or no matches, create accordingly
      if (roomData.isNewPatient) {
        onTaskCreated({
          ...parsedTaskDraft,
          room: roomData.room,
          isNewPatient: true,
          patientName: roomData.patientName,
          patientAge: roomData.patientAge,
        });
      } else {
        onTaskCreated({
          ...parsedTaskDraft,
          room: roomData.room || "Unknown",
        });
      }
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
          aria-label="Go back"
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
        <h1 className="font-display text-xl font-bold tracking-tight text-gray-900">Voice Capture</h1>
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
            aria-label={isRecording ? "Stop recording" : "Start recording"}
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
            {isRecording ? "Listening..." : "Tap to record a new task"}
          </p>
          <p className="text-sm text-gray-400 italic mt-2">
            Try: &quot;Order a CBC stat for Maria Santos due tomorrow&quot;
          </p>
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
            Transcript (tap to edit):
          </label>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Your speech will appear here. Tap to write or edit before creating a task."
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
            Cancel
          </button>
          <button
            onClick={handleCreateTask}
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
                Processing...
              </>
            ) : (
              "Create Task"
            )}
          </button>
        </div>
      </main>

      {showRoomDisambiguation && roomMatches && (
        <RoomDisambiguationDialog
          spokenRoom={parsedTaskDraft?.patientName || parsedTaskDraft?.room || ""}
          matchingRooms={roomMatches.partialMatches}
          matchedBy={roomMatches.matchedBy}
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
          defaultRoom={parsedTaskDraft?.room || ""}
          onConfirm={handleManualRoomConfirm}
          onCancel={handleDisambiguationCancel}
          allPatients={allPatients}
        />
      )}
    </div>
  );
}
