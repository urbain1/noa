import { useState, useRef, useCallback, useEffect } from "react";
import RoomSelector from "./RoomSelector";

const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

const statusStyles = {
  Pending: "bg-yellow-100 text-yellow-800",
  Confirmed: "bg-green-100 text-green-800",
  Delayed: "bg-red-100 text-red-800",
  Completed: "bg-blue-100 text-blue-800",
};

export default function TaskEditDialog({ task, patientId, onCancel, onUpdate, onManualUpdate, allPatients }) {
  const [isRecording, setIsRecording] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [textCommand, setTextCommand] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const recognitionRef = useRef(null);
  const [editMode, setEditMode] = useState("manual"); // "manual" or "ai"
  const [manualFields, setManualFields] = useState({
    description: task?.description || "",
    status: task?.status || "Pending",
    department: task?.department || "Other",
    priority: task?.priority || "Routine",
    room: task?.room || "",
    deadline: task?.deadline ? new Date(new Date(task.deadline).getTime() - new Date(task.deadline).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "",
  });

  const roomOptions = (allPatients || []).map((p) => ({
    id: p.id,
    room: p.room,
    name: p.name,
  }));

  const originalDeadlineLocal = task?.deadline ? new Date(new Date(task.deadline).getTime() - new Date(task.deadline).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";

  const hasManualChanges =
    manualFields.description !== (task?.description || "") ||
    manualFields.status !== (task?.status || "Pending") ||
    manualFields.department !== (task?.department || "Other") ||
    manualFields.priority !== (task?.priority || "Routine") ||
    manualFields.room !== (task?.room || "") ||
    manualFields.deadline !== originalDeadlineLocal;

  const finalCommand = voiceTranscript.trim() || textCommand.trim();
  const isDelete = /\bdelete\b/i.test(finalCommand);
  const badgeClass = statusStyles[task?.status] || "bg-gray-100 text-gray-800";

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
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
      setVoiceTranscript(text);
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

  const handleApply = async () => {
    // Stop recording if active
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsRecording(false);

    if (!finalCommand) return;
    setIsProcessing(true);
    try {
      await onUpdate(finalCommand, task, patientId);
    } catch {
      setError("Failed to apply changes.");
      setIsProcessing(false);
    }
  };

  const handleManualApply = () => {
    if (!hasManualChanges) return;
    const updates = {};
    if (manualFields.description !== (task?.description || "")) updates.description = manualFields.description;
    if (manualFields.status !== (task?.status || "Pending")) updates.status = manualFields.status;
    if (manualFields.department !== (task?.department || "Other")) updates.department = manualFields.department;
    if (manualFields.priority !== (task?.priority || "Routine")) updates.priority = manualFields.priority;
    if (manualFields.room !== (task?.room || "")) updates.room = manualFields.room;
    if (manualFields.deadline !== originalDeadlineLocal) {
      updates.deadline = manualFields.deadline ? new Date(manualFields.deadline).toISOString() : null;
    }
    onManualUpdate(updates, task, patientId);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 px-4"
      onClick={onCancel}
    >
      <div
        className="relative flex w-full max-w-2xl flex-col rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <h2 className="text-2xl font-bold text-gray-900">Edit Task</h2>
          <button
            onClick={onCancel}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:text-gray-700"
            aria-label="Close"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-5 overflow-y-auto px-6 pb-2" style={{ maxHeight: "70vh" }}>
          {/* Mode toggle */}
          <div className="flex rounded-lg bg-gray-100 p-1">
            <button
              type="button"
              onClick={() => setEditMode("manual")}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                editMode === "manual"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Manual Edit
            </button>
            <button
              type="button"
              onClick={() => setEditMode("ai")}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                editMode === "ai"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              AI Edit
            </button>
          </div>

          {editMode === "manual" ? (
            <div className="flex flex-col gap-4">
              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={manualFields.description}
                  onChange={(e) => setManualFields((prev) => ({ ...prev, description: e.target.value }))}
                  rows={2}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                />
              </div>

              {/* Status dropdown */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={manualFields.status}
                  onChange={(e) => setManualFields((prev) => ({ ...prev, status: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="Pending">Pending</option>
                  <option value="Confirmed">Confirmed</option>
                  <option value="Delayed">Delayed</option>
                  <option value="Completed">Completed</option>
                </select>
              </div>

              {/* Department dropdown */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                <select
                  value={manualFields.department}
                  onChange={(e) => setManualFields((prev) => ({ ...prev, department: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="Radiology">Radiology</option>
                  <option value="Lab">Lab</option>
                  <option value="Pharmacy">Pharmacy</option>
                  <option value="Nursing">Nursing</option>
                  <option value="Physical Therapy">Physical Therapy</option>
                  <option value="Social Work">Social Work</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              {/* Priority dropdown */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                <select
                  value={manualFields.priority}
                  onChange={(e) => setManualFields((prev) => ({ ...prev, priority: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="Stat">Stat</option>
                  <option value="Urgent">Urgent</option>
                  <option value="Routine">Routine</option>
                </select>
              </div>

              {/* Room selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Room</label>
                <RoomSelector
                  value={manualFields.room}
                  onChange={(val) => setManualFields((prev) => ({ ...prev, room: val }))}
                  rooms={roomOptions}
                />
              </div>

              {/* Deadline */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Deadline</label>
                <input
                  type="datetime-local"
                  value={manualFields.deadline}
                  onChange={(e) => setManualFields((prev) => ({ ...prev, deadline: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-gray-400">Leave empty for no deadline</p>
              </div>
            </div>
          ) : (
            <>
              {/* Current task details - existing read-only block */}
              <div className="rounded-lg bg-gray-100 p-4">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Current Task
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex">
                    <span className="w-24 shrink-0 font-medium text-gray-500">Description</span>
                    <span className="text-gray-900">{task?.description}</span>
                  </div>
                  <div className="flex items-center">
                    <span className="w-24 shrink-0 font-medium text-gray-500">Status</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badgeClass}`}>
                      {task?.status}
                    </span>
                  </div>
                  <div className="flex">
                    <span className="w-24 shrink-0 font-medium text-gray-500">Department</span>
                    <span className="text-gray-900">{task?.department}</span>
                  </div>
                  <div className="flex">
                    <span className="w-24 shrink-0 font-medium text-gray-500">Priority</span>
                    <span className={`font-semibold ${task?.priority === "Stat" ? "text-red-600" : task?.priority === "Urgent" ? "text-orange-600" : "text-gray-900"}`}>
                      {task?.priority}
                    </span>
                  </div>
                  <div className="flex">
                    <span className="w-24 shrink-0 font-medium text-gray-500">Room</span>
                    <span className="text-gray-900">{task?.room || "—"}</span>
                  </div>
                  <div className="flex">
                    <span className="w-24 shrink-0 font-medium text-gray-500">Deadline</span>
                    <span className="text-gray-900">
                      {task?.deadline
                        ? new Date(task.deadline).toLocaleString("en-US", {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })
                        : "None"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Voice input - keep exactly as currently implemented */}
              <div className="flex flex-col items-center gap-2">
                <button
                  onClick={toggleRecording}
                  className={`flex h-24 w-24 items-center justify-center rounded-full border-none bg-blue-600 text-white shadow-lg ring-4 ring-blue-600/20 transition-all duration-200 hover:bg-blue-700 active:scale-95 ${
                    isRecording ? "animate-pulse" : ""
                  }`}
                  aria-label={isRecording ? "Stop recording" : "Start recording"}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-10 w-10">
                    <path d="M12 1a4 4 0 0 0-4 4v6a4 4 0 0 0 8 0V5a4 4 0 0 0-4-4Z" />
                    <path d="M19 11a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.93V21H8a1 1 0 1 0 0 2h8a1 1 0 1 0 0-2h-3v-3.07A7 7 0 0 0 19 11Z" />
                  </svg>
                </button>
                <p className="text-sm font-medium text-gray-500">
                  {isRecording ? "Listening..." : "Tap to speak"}
                </p>
                {voiceTranscript && (
                  <p className="mt-1 max-w-full text-center text-sm text-gray-700">
                    {voiceTranscript}
                  </p>
                )}
              </div>

              {/* OR divider - keep exactly as currently implemented */}
              <div className="flex items-center gap-4">
                <div className="h-px flex-1 bg-gray-200" />
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold uppercase text-gray-400">
                  or
                </span>
                <div className="h-px flex-1 bg-gray-200" />
              </div>

              {/* Text input - keep exactly as currently implemented */}
              <div>
                <input
                  type="text"
                  value={textCommand}
                  onChange={(e) => setTextCommand(e.target.value)}
                  placeholder="Type your command..."
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && finalCommand) handleApply();
                  }}
                />
                <p className="mt-2 text-xs text-gray-400">
                  Examples: &ldquo;change to stat&rdquo;, &ldquo;mark completed&rdquo;, &ldquo;move to room 405&rdquo;, &ldquo;delete&rdquo;
                </p>
              </div>

              {/* Command preview - keep exactly as currently implemented */}
              {finalCommand && (
                <div className="rounded-lg bg-blue-50 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-400">
                    Your command:
                  </p>
                  <p className="mt-1 text-sm text-blue-800">{finalCommand}</p>
                </div>
              )}

              {/* Error - keep exactly as currently implemented */}
              {error && (
                <div className="rounded-lg bg-red-50 p-3 text-center text-sm text-red-600">
                  {error}
                </div>
              )}

              {/* Delete warning - keep exactly as currently implemented */}
              {isDelete && (
                <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3">
                  <svg className="h-5 w-5 shrink-0 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <p className="text-sm font-medium text-red-600">
                    This will delete the task. Confirm in next step.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer buttons */}
        <div className="flex gap-3 border-t border-gray-200 px-6 py-4">
          <button
            onClick={onCancel}
            className="flex-1 rounded-lg bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-200 active:scale-[0.97]"
          >
            Cancel
          </button>
          {editMode === "manual" ? (
            <button
              onClick={handleManualApply}
              disabled={!hasManualChanges}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save Changes
            </button>
          ) : (
            <button
              onClick={handleApply}
              disabled={!finalCommand || isProcessing}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isProcessing ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Processing...
                </span>
              ) : (
                "Apply Changes"
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
