import { useReducer, useState } from "react";
import { useTranslation } from "react-i18next";
import AddPatientDialog from "./AddPatientDialog";
import EditPatientDialog from "./EditPatientDialog";
import AddTaskDialog from "./AddTaskDialog";
import TaskEditDialog from "./TaskEditDialog";
import AddNoteDialog from "./AddNoteDialog";
import DischargeDialog from "./DischargeDialog";
import VoicePatientPicker from "./VoicePatientPicker";
import VoiceTaskPicker from "./VoiceTaskPicker";
import VoiceNoticeStep from "./VoiceNoticeStep";
import VoiceSummary from "./VoiceSummary";
import { createQueue, currentItem, queueReducer } from "../utils/voiceQueue";
import {
  VOICE_ACTIONS,
  buildQueueEntries,
  dischargeDraft,
  needsPatient,
  needsTask,
  patientDraft,
  patientProposal,
  taskDraft,
  taskProposal,
} from "../utils/voiceRegistry";
import { isDischargePlanned } from "../utils/discharge";

// The review queue of a universal voice command (decisions.md, 2026-11-16).
//
// The parser's actions are walked one at a time, in the order spoken. Each
// opens in its EXISTING dialog, pre-filled, with Confirm and Skip. Nothing
// is written without a Confirm: this component never writes by itself, it
// only hands the dialogs the same data-layer functions the rest of the app
// uses (`api`, from App).
//
// Before a step's dialog can open, what it targets must be certain:
//   - the patient: resolved by the existing matcher, exact match only.
//     Anything else shows the patient picker inside the step, with the
//     option to create the patient.
//   - the task: an id the server validated AND that belongs to the resolved
//     patient at this facility. Otherwise the task picker. Never a guess.
// Edits run inside the dialogs' own useEditSession (lock + stale-write
// check), so a record a colleague is editing shows the usual banner.
//
// `api`: { createPatient, updatePatient, createTask, updateTask, addNote,
//          startDischarge }  each resolves to the saved row(s), throws on failure
// `onFinished({ handoff })`: the summary was closed; `handoff` is the report
//   the nurse confirmed opening, if any.
// `renderSummaryExtra(item)`: per-line content for the summary (Undo).
export default function VoiceQueue({ parsed, patients, nurses, facilityId, currentNurseId, api, onRowRefreshed, onFinished, renderSummaryExtra }) {
  const { t } = useTranslation();
  const [queue, dispatch] = useReducer(queueReducer, undefined, () =>
    createQueue(buildQueueEntries(parsed.actions, patients, facilityId)),
  );
  // The item whose picker is currently showing the Add Patient form.
  const [creatingFor, setCreatingFor] = useState(null);
  const [createdPatients, setCreatedPatients] = useState([]);

  const item = currentItem(queue);

  if (!item) {
    const handoffItem = queue.items.find((i) => i.status === "done" && i.applied?.kind === "handoff");
    return (
      <VoiceSummary
        queue={queue}
        patients={patients}
        createdPatients={createdPatients}
        dropped={parsed.dropped}
        unparsed={parsed.unparsed}
        hasDeferredReport={Boolean(handoffItem)}
        renderExtra={renderSummaryExtra}
        onClose={() => onFinished({ handoff: handoffItem ? handoffItem.applied : null })}
      />
    );
  }

  const { action, index } = item;
  const spec = VOICE_ACTIONS[action.type];
  const step = {
    index: index + 1,
    total: queue.items.length,
    words: action.words,
    confidence: action.confidence,
    onSkip: (note) => dispatch({ type: "skip", index, note }),
    onClose: () => dispatch({ type: "close" }),
    onError: (err) => dispatch({ type: "error", index, message: String(err?.message || err) }),
  };
  const done = (applied) => dispatch({ type: "done", index, applied });
  const key = `voice-step-${index}`;

  const patient = item.patientId ? patients.find((p) => p.id === item.patientId) || null : null;

  // --- Resolve the patient first ------------------------------------------
  if (needsPatient(action) && !patient) {
    if (creatingFor === index) {
      return (
        <AddPatientDialog
          key={`${key}-create`}
          initialFields={{ label: action.patient?.label || "" }}
          existingLabels={patients.map((p) => p.label)}
          onCancel={() => setCreatingFor(null)}
          onSave={async (fields) => {
            const row = await api.createPatient(fields);
            setCreatedPatients((prev) => [...prev, row.label]);
            setCreatingFor(null);
            dispatch({ type: "bind", index, patientId: row.id });
          }}
        />
      );
    }
    return (
      <VoicePatientPicker
        key={`${key}-patient`}
        step={step}
        heard={action.patient?.spoken || action.patient?.label || null}
        label={action.patient?.label || null}
        patients={patients}
        candidateIds={item.candidateIds}
        onPick={(picked) => dispatch({ type: "bind", index, patientId: picked.id })}
        onCreate={() => setCreatingFor(index)}
        onSkip={step.onSkip}
      />
    );
  }

  // --- Then the task ------------------------------------------------------
  const task = item.taskId && patient ? (patient.tasks || []).find((tk) => tk.id === item.taskId) || null : null;
  if (needsTask(action) && !task) {
    return (
      <VoiceTaskPicker
        key={`${key}-task`}
        step={step}
        patient={patient}
        heard={action.task_spoken}
        onPick={(picked) => dispatch({ type: "bind", index, taskId: picked.id })}
        onSkip={step.onSkip}
      />
    );
  }

  // --- Then the step's own dialog -----------------------------------------
  switch (spec?.step) {
    case "addPatient":
      return (
        <AddPatientDialog
          key={key}
          initialFields={patientDraft(action)}
          existingLabels={patients.map((p) => p.label)}
          voiceStep={step}
          onCancel={step.onClose}
          onSave={async (fields) => {
            const row = await api.createPatient(fields);
            done({ kind: "createPatient", patientId: row.id, label: row.label });
          }}
        />
      );

    case "editPatient":
      return (
        <EditPatientDialog
          key={key}
          patient={patient}
          facilityId={facilityId}
          onRowRefreshed={onRowRefreshed}
          proposal={patientProposal(action)}
          voiceStep={{
            ...step,
            onConfirmed: ({ before, after, columns }) => done({ kind: "editPatient", patientId: patient.id, before, after, columns }),
          }}
          onCancel={step.onClose}
          onSave={(patientId, payload) => api.updatePatient(patientId, payload)}
        />
      );

    case "addTask":
      return (
        <AddTaskDialog
          key={key}
          patientLabel={patient.label}
          initial={taskDraft(action, nurses, currentNurseId)}
          nurses={nurses}
          currentNurseId={currentNurseId}
          voiceStep={step}
          onCancel={step.onClose}
          onSave={async (fields) => {
            const row = await api.createTask(patient.id, fields, action.words);
            done({ kind: "createTasks", patientId: patient.id, tasks: [row] });
          }}
        />
      );

    case "editTask": {
      const proposal = taskProposal(action, nurses, currentNurseId);
      return (
        <TaskEditDialog
          key={key}
          task={task}
          patientId={patient.id}
          patientLabel={patient.label}
          nurses={nurses}
          currentNurseId={currentNurseId}
          facilityId={facilityId}
          onRowRefreshed={onRowRefreshed}
          proposal={proposal.apply}
          voiceStep={{
            ...step,
            assigneeHeard: proposal.assigneeHeard,
            onConfirmed: ({ before, after, columns }) => done({ kind: "editTask", patientId: patient.id, taskId: task.id, before, after, columns }),
          }}
          // The assignee picker renders only when a handler is given. In
          // proposal mode it is never called: assignment is part of the one
          // confirmed update.
          onAssign={() => undefined}
          onCancel={step.onClose}
          onManualUpdate={(updates, editedTask) => api.updateTask(editedTask, updates)}
        />
      );
    }

    case "addNote":
      return (
        <AddNoteDialog
          key={key}
          patientName={patient.label}
          initialText={action.fields?.text || ""}
          voiceStep={step}
          onCancel={step.onClose}
          onSave={async ({ text }) => {
            const row = await api.addNote(patient.id, text);
            done({ kind: "createNote", patientId: patient.id, noteId: row.id });
          }}
        />
      );

    case "discharge":
      if (isDischargePlanned(patient)) {
        return (
          <VoiceNoticeStep
            key={key}
            step={step}
            title={t("discharge.title", { patient: patient.label })}
            message={t("voiceQueue.dischargeAlready", { patient: patient.label })}
            primaryLabel={t("voiceQueue.next")}
            onPrimary={() => step.onSkip("already_planned")}
          />
        );
      }
      return (
        <DischargeDialog
          key={key}
          patient={patient}
          initial={dischargeDraft(action)}
          voiceStep={step}
          onCancel={step.onClose}
          onConfirm={async (options) => {
            const tasks = await api.startDischarge(patient, options);
            done({ kind: "createTasks", patientId: patient.id, tasks });
          }}
        />
      );

    case "handoff": {
      const forPatient = action.fields?.scope === "patient";
      return (
        <VoiceNoticeStep
          key={key}
          step={step}
          title={t("voiceQueue.handoffTitle")}
          message={forPatient ? t("voiceQueue.handoffPatientBody", { patient: patient.label }) : t("voiceQueue.handoffUnitBody")}
          primaryLabel={t("voiceQueue.confirm")}
          onPrimary={() => done({ kind: "handoff", scope: forPatient ? "patient" : "unit", patientId: forPatient ? patient.id : null })}
          secondaryLabel={t("voiceQueue.skip")}
          onSecondary={() => step.onSkip()}
        />
      );
    }

    default:
      // Recognised, not allowed by voice. Nothing happens beyond saying so.
      return (
        <VoiceNoticeStep
          key={key}
          step={step}
          tone="warn"
          title={t("voiceQueue.unsupportedTitle")}
          message={t(`voiceQueue.unsupported.${action.reason || "other"}`)}
          primaryLabel={t("voiceQueue.next")}
          onPrimary={() => dispatch({ type: "acknowledge", index })}
        />
      );
  }
}
