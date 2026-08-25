import { useState, useEffect } from "react";
import TaskCard from "./TaskCard";
import NoteCard from "./NoteCard";
import { computeRiskScore, getRiskLevel } from "./ChargeNurseDashboard";

function showDischargeBadge(tasks) {
  return tasks.some((task) => {
    const desc = task.description.toLowerCase();
    return task.department === "Social Work" || desc.includes("discharge");
  });
}

function formatAdmissionDate(dateStr) {
  if (!dateStr) return null;
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function PatientCard({ patient, onEditPatient, onCompleteTask, onAddNote, onOpenVoiceCapture }) {
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [tasksExpanded, setTasksExpanded] = useState(false);

  const tasks = patient.tasks || [];
  const notes = patient.notes || [];

  const [prevTaskIds, setPrevTaskIds] = useState(() => new Set(tasks.map((t) => t.id)));
  const [newTaskCount, setNewTaskCount] = useState(0);
  const [newTaskIds, setNewTaskIds] = useState(new Set());

  const [prevNoteIds, setPrevNoteIds] = useState(() => new Set(notes.map((n) => n.id)));
  const [newNoteCount, setNewNoteCount] = useState(0);
  const [newNoteIds, setNewNoteIds] = useState(new Set());

  useEffect(() => {
    const addedIds = tasks.filter((t) => !prevTaskIds.has(t.id)).map((t) => t.id);

    if (addedIds.length > 0) {
      const updatedNewIds = new Set(newTaskIds);
      addedIds.forEach((id) => updatedNewIds.add(id));
      setNewTaskIds(updatedNewIds);

      if (!tasksExpanded) {
        setNewTaskCount((prev) => prev + addedIds.length);
      } else {
        setTimeout(() => {
          setNewTaskIds(new Set());
        }, 2000);
      }
    }
    setPrevTaskIds(new Set(tasks.map((t) => t.id)));
  }, [patient.tasks]);

  useEffect(() => {
    const addedIds = notes.filter((n) => !prevNoteIds.has(n.id)).map((n) => n.id);

    if (addedIds.length > 0) {
      const updatedNewIds = new Set(newNoteIds);
      addedIds.forEach((id) => updatedNewIds.add(id));
      setNewNoteIds(updatedNewIds);

      if (!notesExpanded) {
        setNewNoteCount((prev) => prev + addedIds.length);
      } else {
        setTimeout(() => {
          setNewNoteIds(new Set());
        }, 2000);
      }
    }
    setPrevNoteIds(new Set(notes.map((n) => n.id)));
  }, [patient.notes]);

  const handleToggleTasks = () => {
    const willOpen = !tasksExpanded;
    setTasksExpanded(willOpen);
    if (willOpen) {
      setTimeout(() => {
        setNewTaskCount(0);
        setNewTaskIds(new Set());
      }, 2000);
    }
  };

  const handleToggleNotes = () => {
    const willOpen = !notesExpanded;
    setNotesExpanded(willOpen);
    if (willOpen) {
      setTimeout(() => {
        setNewNoteCount(0);
        setNewNoteIds(new Set());
      }, 2000);
    }
  };

  const riskScore = computeRiskScore(patient);
  const riskLevel = getRiskLevel(riskScore);
  const admissionDisplay = formatAdmissionDate(patient.admission_date);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow duration-200 hover:shadow-md sm:p-5">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg font-bold tracking-tight text-gray-900">
              {patient.label}
              {riskLevel && (
                <span className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${riskLevel.bg} ${riskLevel.color}`}>
                  {riskLevel.label}
                </span>
              )}
            </h2>
            {showDischargeBadge(tasks) && (
              <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs font-semibold text-white">
                Discharge Planning
              </span>
            )}
          </div>
          <p className="text-sm text-gray-700 mt-0.5">{patient.diagnosis || "No diagnosis on file"}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
            <span className="font-semibold text-gray-600">{patient.code_status || "Full Code"}</span>
            {patient.location_label && (
              <>
                <span className="text-gray-300">|</span>
                <span>{patient.location_label}</span>
              </>
            )}
            {patient.attending_physician && (
              <>
                <span className="text-gray-300">|</span>
                <span>{patient.attending_physician}</span>
              </>
            )}
            {admissionDisplay && (
              <>
                <span className="text-gray-300">|</span>
                <span>Admitted {admissionDisplay}</span>
              </>
            )}
          </div>
          {patient.allergies && patient.allergies.length > 0 && (
            <p className="mt-1 text-xs font-medium text-red-600">
              Allergies: {patient.allergies.join(", ")}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-600 ring-1 ring-blue-200">
            {tasks.length}
          </span>
          <button
            type="button"
            onClick={() => onEditPatient(patient)}
            className="rounded p-1 text-gray-400 transition-colors duration-150 hover:text-blue-500"
            aria-label="Edit patient"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Tasks Section - collapsible */}
      <div className="mt-3">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={handleToggleTasks}
            className="flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors"
          >
            <svg
              className={`h-4 w-4 transition-transform duration-200 ${tasksExpanded ? "rotate-90" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            {newTaskCount > 0 ? (
              <span>
                Tasks ({tasks.length - newTaskCount} <span className="text-red-500 font-semibold">+ {newTaskCount} new</span>)
              </span>
            ) : (
              <span className="text-gray-600">Tasks ({tasks.length})</span>
            )}
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpenVoiceCapture(patient); }}
            className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-100 transition-colors"
          >
            + Add Task
          </button>
        </div>
        {tasksExpanded && (
          <div className="mt-2 flex flex-col gap-2">
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                isNew={newTaskIds.has(task.id)}
                onComplete={onCompleteTask}
              />
            ))}
          </div>
        )}
      </div>

      {/* Clinical Notes Section */}
      <div className="mt-3">
        {/* Section header - clickable to toggle */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={handleToggleNotes}
            className="flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors"
          >
            <svg
              className={`h-4 w-4 transition-transform duration-200 ${notesExpanded ? "rotate-90" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            {newNoteCount > 0 ? (
              <span>
                Clinical Notes ({notes.length - newNoteCount} <span className="text-red-500 font-semibold">+ {newNoteCount} new</span>)
              </span>
            ) : (
              <span className="text-gray-600">Clinical Notes ({notes.length})</span>
            )}
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onAddNote(patient.id); }}
            className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-100 transition-colors"
          >
            + Add Note
          </button>
        </div>

        {/* Collapsible notes list */}
        {notesExpanded && notes.length > 0 && (
          <div className="mt-2 flex flex-col gap-2">
            {notes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                isNew={newNoteIds.has(note.id)}
              />
            ))}
          </div>
        )}

        {notesExpanded && notes.length === 0 && (
          <p className="mt-2 text-xs text-gray-400 italic">No clinical notes yet</p>
        )}
      </div>
    </div>
  );
}
