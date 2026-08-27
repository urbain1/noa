import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import TaskCard from "./TaskCard";
import NoteCard from "./NoteCard";
import { computeRiskScore, getRiskLevel } from "./ChargeNurseDashboard";
import { localeTag } from "../i18n";
import { sortTasks } from "../utils/taskSort";
import { codeStatusLabel, departmentLabel } from "../i18n/enums";
import { getActiveDischargeTasks } from "../utils/discharge";
import OperationStatus from "./OperationStatus";
import { useOperationStatus } from "../hooks/useOperationStatus";

// Removed: a second, legacy discharge indicator -- a blue pill beside the
// patient label -- rendered from a `task_type`-or-heuristic test of its own,
// alongside the green Discharge Planning / Discharge Planned button below.
// Two consequences, both seen on real cards:
//
//   - Where planning genuinely was in progress, both fired, so the card
//     showed two different discharge indicators saying different things.
//   - The heuristic half (any Social Work task, or any task whose text
//     merely contains the word "discharge") fired for patients who had never
//     been through discharge planning at all, which is why some cards showed
//     the blue pill and no green "Discharge planned".
//
// `getActiveDischargeTasks` (utils/discharge.js) is now the only test, and
// the green button is the only indicator. It is strict on purpose: it reads
// `task_type` alone, so it can never claim a patient is being discharged
// because someone raised a Social Work task.

function formatAdmissionDate(dateStr, locale) {
  if (!dateStr) return null;
  return new Date(dateStr + "T00:00:00").toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function PatientCard({ patient, isFocused, onEditPatient, onCompleteTask, onEditTask, onRepageTask, onEscalateTask, onAddNote, onOpenVoiceCapture, onGenerateSbar, onGeneratePatientUpdate, onDischargePatient, onCancelDischargePlanning }) {
  const { t, i18n } = useTranslation();
  const [notesExpanded, setNotesExpanded] = useState(false);
  // Opened from the Tasks screen or Unit View: show the task list straight
  // away rather than making the nurse expand it again after the jump.
  const [tasksExpanded, setTasksExpanded] = useState(Boolean(isFocused));
  // Both generations run in App (it owns the resulting view), but the
  // pending state stays here so only this card's button reports it, and
  // says which of the two is running rather than a shared "Generating...".
  const ops = useOperationStatus();
  const sbarLoading = ops.isRunning("sbar");
  const patientUpdateLoading = ops.isRunning("patientUpdate");
  const [dischargeDetailOpen, setDischargeDetailOpen] = useState(false);
  const [cancellingDischarge, setCancellingDischarge] = useState(false);

  const tasks = patient.tasks || [];
  const notes = patient.notes || [];

  // Same ordering the Tasks screen uses -- one shared function so the two
  // can't disagree about what's most urgent (scenarios.md SC-7). The
  // unsorted `tasks` stays as-is for counts and new-task detection, which
  // care about membership, not order.
  const sortedTasks = useMemo(() => sortTasks(patient.tasks || []), [patient.tasks]);

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

  const handleGenerateSbar = () => {
    if (!onGenerateSbar || sbarLoading) return;
    ops.run(
      "sbar",
      { messageKey: "status.generatingSbar", errorKey: "status.handoffFailed", surface: "button" },
      () => Promise.resolve(onGenerateSbar(patient)),
    ).catch((err) => console.error("SBAR generation failed:", err));
  };

  const handleGeneratePatientUpdate = () => {
    if (!onGeneratePatientUpdate || patientUpdateLoading) return;
    ops.run(
      "patientUpdate",
      { messageKey: "status.generatingPatientUpdate", errorKey: "status.handoffFailed", surface: "button" },
      () => Promise.resolve(onGeneratePatientUpdate(patient)),
    ).catch((err) => console.error("Patient update generation failed:", err));
  };

  const riskScore = computeRiskScore(patient);
  const riskLevel = getRiskLevel(riskScore);
  const admissionDisplay = formatAdmissionDate(patient.admission_date, localeTag(i18n.language));

  const activeDischargeTasks = useMemo(() => getActiveDischargeTasks(patient.tasks), [patient.tasks]);
  const dischargePlanned = activeDischargeTasks.length > 0;
  const dischargePlannedAt = dischargePlanned
    ? activeDischargeTasks.reduce(
        (earliest, task) => (task.created_at < earliest ? task.created_at : earliest),
        activeDischargeTasks[0].created_at
      )
    : null;
  const dischargePlannedAtDisplay = dischargePlannedAt
    ? new Date(dischargePlannedAt).toLocaleString(localeTag(i18n.language), {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  const handleCancelDischargePlanning = () => {
    if (!onCancelDischargePlanning || cancellingDischarge) return;
    setCancellingDischarge(true);
    Promise.resolve(onCancelDischargePlanning(patient, activeDischargeTasks.map((t) => t.id))).finally(() => {
      setCancellingDischarge(false);
      setDischargeDetailOpen(false);
    });
  };

  return (
    <div
      className={`rounded-xl border bg-white p-4 shadow-sm transition-shadow duration-200 hover:shadow-md sm:p-5 ${
        isFocused ? "border-blue-400 ring-2 ring-blue-200" : "border-gray-200"
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display break-words text-lg font-bold tracking-tight text-gray-900">
              {patient.label}
              {riskLevel && (
                <span className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${riskLevel.bg} ${riskLevel.color}`}>
                  {t(riskLevel.labelKey)}
                </span>
              )}
            </h2>
          </div>
          <p className="mt-0.5 break-words text-sm text-gray-700">{patient.diagnosis || t("patientCard.noDiagnosis")}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
            <span className="font-semibold text-gray-600">{codeStatusLabel(t, patient.code_status || "Full Code")}</span>
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
                <span>{t("patientCard.admitted", { date: admissionDisplay })}</span>
              </>
            )}
          </div>
          {patient.allergies && patient.allergies.length > 0 && (
            <p className="mt-1 text-xs font-medium text-red-600">
              {t("patientCard.allergies", { list: patient.allergies.join(", ") })}
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
            aria-label={t("patientCard.editPatientAria")}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Patient actions. Three different actions producing three different
          things, so each carries its own hue instead of all reading as one
          undifferentiated blue: discharge planning green, SBAR blue
          (unchanged), family update purple. Every pairing is a -700 text on
          a -50 background (>= 7:1 on white), chosen over the previous
          blue-600 for legibility on a phone in ward lighting; colour is
          never the only signal, each button is also labelled. */}
      <div className="mt-3 flex flex-wrap gap-2">
        {dischargePlanned ? (
          // Solid/darker green reads as confirmed rather than actionable,
          // distinct from the other two buttons' light -50 fills. Click
          // toggles the detail panel below in place -- no dialog, no screen
          // change -- and title gives the same summary on hover.
          <button
            type="button"
            onClick={() => setDischargeDetailOpen((open) => !open)}
            title={
              dischargePlannedAtDisplay
                ? t("patientCard.dischargePlannedHint", { date: dischargePlannedAtDisplay, count: activeDischargeTasks.length })
                : undefined
            }
            className="whitespace-nowrap rounded-md bg-green-700 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-green-800"
          >
            {t("patientCard.dischargePlanned")}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onDischargePatient?.(patient)}
            className="whitespace-nowrap rounded-md bg-green-50 px-2.5 py-1.5 text-xs font-semibold text-green-800 ring-1 ring-green-200 transition-colors hover:bg-green-600 hover:text-white"
          >
            {t("patientCard.dischargePlanning")}
          </button>
        )}
        <button
          type="button"
          onClick={handleGenerateSbar}
          disabled={sbarLoading}
          className="whitespace-nowrap rounded-md bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 ring-1 ring-blue-200 transition-colors hover:bg-blue-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {ops.operations.sbar ? (
            <OperationStatus operations={ops.operations} name="sbar" variant="button" />
          ) : (
            t("patientCard.sbarSummary")
          )}
        </button>
        <button
          type="button"
          onClick={handleGeneratePatientUpdate}
          disabled={patientUpdateLoading}
          className="whitespace-nowrap rounded-md bg-purple-50 px-2.5 py-1.5 text-xs font-semibold text-purple-800 ring-1 ring-purple-200 transition-colors hover:bg-purple-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {ops.operations.patientUpdate ? (
            <OperationStatus operations={ops.operations} name="patientUpdate" variant="button" />
          ) : (
            t("patientCard.familyUpdate")
          )}
        </button>
      </div>

      {/* Discharge planning detail -- inline, same screen, toggled by the
          "Discharge planned" button above. Shows when planning started and
          which tasks resulted, plus the way back out if it was a mistake. */}
      {dischargePlanned && dischargeDetailOpen && (
        <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3">
          <p className="text-xs font-semibold text-green-900">
            {dischargePlannedAtDisplay
              ? t("patientCard.dischargePlannedAt", { date: dischargePlannedAtDisplay })
              : t("patientCard.dischargePlanned")}
          </p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {activeDischargeTasks.map((task) => (
              <li key={task.id} className="text-xs text-green-800">
                {task.description} <span className="text-green-600">({departmentLabel(t, task.department)})</span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={handleCancelDischargePlanning}
            disabled={cancellingDischarge}
            className="mt-2.5 rounded-md bg-white px-2.5 py-1.5 text-xs font-semibold text-red-700 ring-1 ring-red-200 transition-colors hover:bg-red-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {cancellingDischarge ? t("common.saving") : t("patientCard.cancelDischargePlanning")}
          </button>
        </div>
      )}

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
                {t("patientCard.tasksLabel")} ({tasks.length - newTaskCount} <span className="text-red-500 font-semibold">{t("patientCard.newCount", { count: newTaskCount })}</span>)
              </span>
            ) : (
              <span className="text-gray-600">{t("patientCard.tasksLabel")} ({tasks.length})</span>
            )}
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpenVoiceCapture(patient); }}
            className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-600 hover:text-white transition-colors"
          >
            {t("patientCard.addTask")}
          </button>
        </div>
        {tasksExpanded && (
          <div className="mt-2 flex flex-col gap-2">
            {sortedTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                isNew={newTaskIds.has(task.id)}
                onComplete={onCompleteTask}
                onEdit={onEditTask}
                onRepage={onRepageTask}
                onEscalate={onEscalateTask}
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
                {t("patientCard.notesLabel")} ({notes.length - newNoteCount} <span className="text-red-500 font-semibold">{t("patientCard.newCount", { count: newNoteCount })}</span>)
              </span>
            ) : (
              <span className="text-gray-600">{t("patientCard.notesLabel")} ({notes.length})</span>
            )}
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onAddNote(patient.id); }}
            className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-600 hover:text-white transition-colors"
          >
            {t("patientCard.addNote")}
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
          <p className="mt-2 text-xs text-gray-400 italic">{t("patientCard.noNotes")}</p>
        )}
      </div>
    </div>
  );
}
