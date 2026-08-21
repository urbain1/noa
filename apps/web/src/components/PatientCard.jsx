import { useState, useEffect } from "react";
import TaskCard from "./TaskCard";
import NoteCard from "./NoteCard";
import { computeRiskScore, getRiskLevel } from "./ChargeNurseDashboard";

function hasDischargeTask(tasks) {
  return tasks.some((task) => {
    const desc = task.description.toLowerCase();
    return task.type === "discharge" || desc.includes("discharge") || desc.includes("nursing home");
  });
}

function showDischargeBadge(tasks) {
  return tasks.some((task) => {
    const desc = task.description.toLowerCase();
    return task.department === "Social Work" || desc.includes("discharge");
  });
}

export default function PatientCard({ patient, patientId, onDischargeClick, onDeleteTask, onEditTask, onPatientHandoff, handoffLoading, onAddNote, onEditNote, onDeleteNote, onGeneratePatientUpdate, onShowContacts, patientUpdateLoading, onOpenVoiceCapture }) {
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [tasksExpanded, setTasksExpanded] = useState(false);

  const [prevTaskIds, setPrevTaskIds] = useState(() => new Set(patient.tasks ? patient.tasks.map(t => t.id) : []));
  const [newTaskCount, setNewTaskCount] = useState(0);
  const [newTaskIds, setNewTaskIds] = useState(new Set());

  const [prevNoteIds, setPrevNoteIds] = useState(() => new Set(patient.comments ? patient.comments.map(n => n.id) : []));
  const [newNoteCount, setNewNoteCount] = useState(0);
  const [newNoteIds, setNewNoteIds] = useState(new Set());

  useEffect(() => {
    if (!patient.tasks) return;
    const addedIds = patient.tasks.filter(t => !prevTaskIds.has(t.id)).map(t => t.id);

    if (addedIds.length > 0) {
      const updatedNewIds = new Set(newTaskIds);
      addedIds.forEach(id => updatedNewIds.add(id));
      setNewTaskIds(updatedNewIds);

      if (!tasksExpanded) {
        setNewTaskCount(prev => prev + addedIds.length);
      } else {
        setTimeout(() => {
          setNewTaskIds(new Set());
        }, 2000);
      }
    }
    setPrevTaskIds(new Set(patient.tasks.map(t => t.id)));
  }, [patient.tasks]);

  useEffect(() => {
    if (!patient.comments) return;
    const addedIds = patient.comments.filter(n => !prevNoteIds.has(n.id)).map(n => n.id);

    if (addedIds.length > 0) {
      const updatedNewIds = new Set(newNoteIds);
      addedIds.forEach(id => updatedNewIds.add(id));
      setNewNoteIds(updatedNewIds);

      if (!notesExpanded) {
        setNewNoteCount(prev => prev + addedIds.length);
      } else {
        setTimeout(() => {
          setNewNoteIds(new Set());
        }, 2000);
      }
    }
    setPrevNoteIds(new Set(patient.comments.map(n => n.id)));
  }, [patient.comments]);

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

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow duration-200 hover:shadow-md sm:p-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg font-bold tracking-tight text-gray-900">{patient.name}{riskLevel && (
                <span className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${riskLevel.bg} ${riskLevel.color}`}>
                  {riskLevel.label}
                </span>
              )}</h2>
            {showDischargeBadge(patient.tasks) && (
              <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs font-semibold text-white">
                Discharge Planning
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500">
            Room {patient.room} &middot; Age {patient.age}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <button
              type="button"
              onClick={() => onShowContacts(patient.id)}
              className="text-xs text-blue-600 hover:text-blue-800 hover:underline transition-colors"
            >
              Contacts ({(patient.contacts || []).length})
            </button>
          </div>
        </div>
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-600 ring-1 ring-blue-200">
          {patient.tasks.length}
        </span>
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
                Tasks ({patient.tasks.length - newTaskCount} <span className="text-red-500 font-semibold">+ {newTaskCount} new</span>)
              </span>
            ) : (
              <span className="text-gray-600">Tasks ({patient.tasks.length})</span>
            )}
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpenVoiceCapture(); }}
            className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-100 transition-colors"
          >
            + Add Task
          </button>
        </div>
        {tasksExpanded && (
          <div className="mt-2 flex flex-col gap-2">
            {patient.tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                isNew={newTaskIds.has(task.id)}
                onEdit={() => onEditTask(task, patientId)}
                onDelete={() => onDeleteTask(task, patientId)}
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
                Clinical Notes ({(patient.comments || []).length - newNoteCount} <span className="text-red-500 font-semibold">+ {newNoteCount} new</span>)
              </span>
            ) : (
              <span className="text-gray-600">Clinical Notes ({(patient.comments || []).length})</span>
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
        {notesExpanded && (patient.comments || []).length > 0 && (
          <div className="mt-2 flex flex-col gap-2">
            {(patient.comments || []).map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                isNew={newNoteIds.has(note.id)}
                onEdit={() => onEditNote(note, patient.id)}
                onDelete={() => onDeleteNote(note, patient.id)}
              />
            ))}
          </div>
        )}

        {notesExpanded && (patient.comments || []).length === 0 && (
          <p className="mt-2 text-xs text-gray-400 italic">No clinical notes yet</p>
        )}
      </div>

      <div className="mt-3 flex flex-row gap-2">
        <button
          onClick={() => onPatientHandoff(patient.id)}
          disabled={handoffLoading}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
            <path fillRule="evenodd" d="M8 11a.5.5 0 01.5-.5h3a.5.5 0 010 1h-3A.5.5 0 018 11zm0 2a.5.5 0 01.5-.5h3a.5.5 0 010 1h-3A.5.5 0 018 13zm-1-5a.5.5 0 01.5-.5h5a.5.5 0 010 1h-5A.5.5 0 017 8z" clipRule="evenodd" />
          </svg>
          {handoffLoading ? "Generating..." : "SBAR Summary"}
        </button>

        <button
          onClick={() => onGeneratePatientUpdate(patient.id)}
          disabled={patientUpdateLoading}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-purple-500" viewBox="0 0 20 20" fill="currentColor">
            <path d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" />
          </svg>
          {patientUpdateLoading ? "Generating..." : "Patient View"}
        </button>
      </div>

    </div>
  );
}
