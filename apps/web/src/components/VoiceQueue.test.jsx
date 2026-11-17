import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import VoiceQueue from "./VoiceQueue";
import { fetchPatientRow, fetchTaskRow } from "../lib/patients";

vi.mock("../lib/patients", () => ({ fetchTaskRow: vi.fn(), fetchPatientRow: vi.fn() }));
vi.mock("../lib/auditLog", () => ({ fetchLastChange: vi.fn(async () => null) }));
// The note dialog imports the Claude helper; a voice step must never call it.
vi.mock("../utils/claudeAPI", () => ({ parseNoteInput: vi.fn() }));
import { parseNoteInput } from "../utils/claudeAPI";

// Synthetic fixtures only.
const FACILITY = "facility-1";
const ME = "nurse-me";
const NURSES = [
  { id: ME, name: "Nurse Me Test" },
  { id: "nurse-amara", name: "Nurse Amara Test" },
];
const task = (id, patientId, extra = {}) => ({ id, facility_id: FACILITY, patient_id: patientId, description: "Complete Blood Count", status: "Pending", priority: "Routine", department: "Lab", deadline: null, assigned_to: null, ...extra });
const patient = (n, extra = {}) => ({ id: `patient-${n}`, facility_id: FACILITY, label: `Patient_Test_${n}`, location_label: null, tasks: [], notes: [], allergies: null, ...extra });
const ROSTER = [patient(2), patient(3, { tasks: [task("task-cbc", "patient-3")] })];

const act = (type, label, extra = {}) => ({
  type,
  words: `${type} words`,
  confidence: "high",
  patient: { spoken: label ? label.replace("Patient_Test_", "patient ") : null, label },
  task_id: null,
  task_spoken: null,
  fields: {},
  ...extra,
});

// The data-layer functions App hands to the queue, mocked. One set per test.
let api;
function makeApi() {
  return {
    createPatient: vi.fn(async (fields) => patient(fields.label.replace("Patient_Test_", ""))),
    updatePatient: vi.fn(),
    createTask: vi.fn(async (patientId, fields) => task("task-new", patientId, { description: fields.description })),
    updateTask: vi.fn(async (edited, updates) => ({ ...edited, ...updates })),
    addNote: vi.fn(async (patientId, text) => ({ id: "note-new", patient_id: patientId, content: text })),
    startDischarge: vi.fn(async (p) => [task("task-dc", p.id, { task_type: "discharge" })]),
  };
}

// App keeps the roster in state and the queue reads it live, so a patient
// created in one step exists for the next. The harness does the same.
function Harness({ actions, initialPatients = ROSTER, onFinished = () => {}, dropped = [], unparsed = [] }) {
  const [patients, setPatients] = useState(initialPatients);
  const liveApi = {
    ...api,
    createPatient: async (fields) => {
      const row = await api.createPatient(fields);
      setPatients((prev) => [row, ...prev]);
      return row;
    },
  };
  return (
    <VoiceQueue
      parsed={{ actions, dropped, unparsed, contextTruncated: false }}
      patients={patients}
      nurses={NURSES}
      facilityId={FACILITY}
      currentNurseId={ME}
      api={liveApi}
      onFinished={onFinished}
    />
  );
}

const click = (name) => fireEvent.click(screen.getByRole("button", { name }));
const summaryLine = (text) => screen.getByText(text).closest("[data-status]");

beforeEach(() => {
  api = makeApi();
  fetchTaskRow.mockReset();
  fetchTaskRow.mockImplementation(async (_facility, id) => ROSTER[1].tasks.find((tk) => tk.id === id) || null);
  fetchPatientRow.mockReset();
  fetchPatientRow.mockImplementation(async (_facility, id) => ROSTER.find((p) => p.id === id) || null);
  parseNoteInput.mockReset();
});

describe("VoiceQueue", () => {
  it("walks the actions in order, each in its dialog with a progress marker, then summarises", async () => {
    const finished = vi.fn();
    render(
      <Harness
        onFinished={finished}
        actions={[
          act("create_note", "Patient_Test_2", { fields: { text: "Patient refused breakfast." } }),
          act("edit_task", "Patient_Test_3", { task_id: "task-cbc", task_spoken: "the CBC", fields: { priority: "Stat" } }),
        ]}
      />
    );

    // Step 1: the existing note dialog, pre-filled.
    expect(screen.getByText("Voice command, 1 of 2")).toBeInTheDocument();
    expect(screen.getByText("Add Clinical Note")).toBeInTheDocument();
    expect(screen.getByText("Patient_Test_2")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Patient refused breakfast.")).toBeInTheDocument();
    expect(api.addNote).not.toHaveBeenCalled();
    click("Confirm");
    await waitFor(() => expect(api.addNote).toHaveBeenCalledWith("patient-2", "Patient refused breakfast."));
    // Saved exactly as confirmed: no second AI rewrite.
    expect(parseNoteInput).not.toHaveBeenCalled();

    // Step 2: the existing task dialog in proposal mode.
    expect(await screen.findByText("Voice command, 2 of 2")).toBeInTheDocument();
    expect(await screen.findByText("priority: Routine → Stat")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirm" })).toBeEnabled());
    click("Confirm");
    await waitFor(() => expect(api.updateTask).toHaveBeenCalledTimes(1));
    expect(api.updateTask.mock.calls[0][1]).toEqual({ priority: "Stat" });

    // Summary.
    expect(await screen.findByText("Voice command summary")).toBeInTheDocument();
    expect(screen.getByText("All actions were done.")).toBeInTheDocument();
    expect(screen.getAllByText("Done")).toHaveLength(2);
    click("Close");
    expect(finished).toHaveBeenCalledWith({ handoff: null });
  });

  it("Skip moves on without writing, and the summary says what was skipped", async () => {
    render(
      <Harness
        actions={[
          act("create_note", "Patient_Test_2", { fields: { text: "First note." } }),
          act("create_note", "Patient_Test_3", { fields: { text: "Second note." } }),
        ]}
      />
    );
    click("Skip");
    expect(await screen.findByDisplayValue("Second note.")).toBeInTheDocument();
    click("Confirm");
    expect(await screen.findByText("Voice command summary")).toBeInTheDocument();
    expect(api.addNote).toHaveBeenCalledTimes(1);
    expect(api.addNote).toHaveBeenCalledWith("patient-3", "Second note.");
    expect(summaryLine("Add a note for Patient_Test_2")).toHaveAttribute("data-status", "skipped");
    expect(screen.getByText("1 action was not done.")).toBeInTheDocument();
  });

  it("closing cancels the rest and says how many were not done", async () => {
    render(
      <Harness
        actions={[
          act("create_note", "Patient_Test_2", { fields: { text: "One." } }),
          act("create_note", "Patient_Test_3", { fields: { text: "Two." } }),
          act("create_note", "Patient_Test_2", { fields: { text: "Three." } }),
        ]}
      />
    );
    click("Confirm");
    expect(await screen.findByDisplayValue("Two.")).toBeInTheDocument();
    click("Stop here and close the remaining actions");
    expect(await screen.findByText("2 actions were not done.")).toBeInTheDocument();
    expect(api.addNote).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText("Not done")).toHaveLength(2);
  });

  it("binds a later action to the patient created earlier in the same command", async () => {
    render(
      <Harness
        actions={[
          act("create_patient", "Patient_Test_6", { fields: { age: 80 } }),
          act("create_task", "Patient_Test_6", { fields: { description: "Basic Metabolic Panel", department: "Lab" } }),
        ]}
      />
    );
    expect(screen.getByText("Add Patient")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Patient_Test_6")).toBeInTheDocument();
    expect(screen.getByDisplayValue("80")).toBeInTheDocument();
    click("Confirm");
    await waitFor(() => expect(api.createPatient).toHaveBeenCalledTimes(1));

    // The new task's step is bound to the record that was just created.
    expect(await screen.findByText("New Task")).toBeInTheDocument();
    expect(screen.getByText("Patient_Test_6")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Basic Metabolic Panel")).toBeInTheDocument();
    click("Confirm");
    await waitFor(() => expect(api.createTask).toHaveBeenCalledTimes(1));
    expect(api.createTask.mock.calls[0][0]).toBe("patient-6");
    expect(api.createTask.mock.calls[0][1]).toMatchObject({ description: "Basic Metabolic Panel", department: "Lab", priority: "Routine", assignedTo: null });
  });

  it("skips the dependent actions when the creation is skipped, and says so", async () => {
    render(
      <Harness
        actions={[
          act("create_patient", "Patient_Test_6"),
          act("create_task", "Patient_Test_6", { fields: { description: "Basic Metabolic Panel" } }),
          act("create_note", "Patient_Test_6", { fields: { text: "Admitted." } }),
          act("create_note", "Patient_Test_2", { fields: { text: "Unrelated." } }),
        ]}
      />
    );
    click("Skip");
    // Straight to the action that did not depend on the creation.
    expect(await screen.findByText("Voice command, 4 of 4")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Unrelated.")).toBeInTheDocument();
    click("Confirm");
    expect(await screen.findByText("Voice command summary")).toBeInTheDocument();
    expect(api.createPatient).not.toHaveBeenCalled();
    expect(api.createTask).not.toHaveBeenCalled();
    expect(screen.getAllByText("Not done: the patient was not created")).toHaveLength(2);
    expect(screen.getByText("3 actions were not done.")).toBeInTheDocument();
  });

  it("shows the patient picker and selects nobody when the patient does not exist", async () => {
    render(<Harness actions={[act("create_note", "Patient_Test_9", { fields: { text: "Slept well." } })]} />);
    expect(screen.getByText("Which patient?")).toBeInTheDocument();
    expect(screen.getByText("Noa heard “patient 9” and could not match exactly one patient.")).toBeInTheDocument();
    // No dialog for the action yet, and nothing written.
    expect(screen.queryByText("Add Clinical Note")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create Patient_Test_9" })).toBeInTheDocument();

    click("Patient_Test_3");
    expect(await screen.findByText("Add Clinical Note")).toBeInTheDocument();
    click("Confirm");
    await waitFor(() => expect(api.addNote).toHaveBeenCalledWith("patient-3", "Slept well."));
  });

  it("lets the nurse create the missing patient from the picker, then continues with it", async () => {
    render(<Harness actions={[act("create_note", "Patient_Test_9", { fields: { text: "Slept well." } })]} />);
    click("Create Patient_Test_9");
    expect(screen.getByDisplayValue("Patient_Test_9")).toBeInTheDocument();
    click("Add Patient");
    await waitFor(() => expect(api.createPatient).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Add Clinical Note")).toBeInTheDocument();
    click("Confirm");
    await waitFor(() => expect(api.addNote).toHaveBeenCalledWith("patient-9", "Slept well."));
    expect(await screen.findByText("Create patient Patient_Test_9")).toBeInTheDocument();
  });

  it("shows the task picker instead of guessing when the task was not resolved", async () => {
    const twoTasks = [patient(2), patient(3, { tasks: [task("task-a", "patient-3", { description: "Basic Metabolic Panel" }), task("task-b", "patient-3", { description: "Basic Metabolic Panel", status: "Delayed" })] })];
    fetchTaskRow.mockImplementation(async (_f, id) => twoTasks[1].tasks.find((tk) => tk.id === id) || null);
    render(<Harness initialPatients={twoTasks} actions={[act("edit_task", "Patient_Test_3", { task_spoken: "the BMP", fields: { status: "Completed" } })]} />);
    expect(screen.getByText("Which task?")).toBeInTheDocument();
    expect(screen.getByText("Noa heard “the BMP” for Patient_Test_3 and could not match exactly one task.")).toBeInTheDocument();
    expect(api.updateTask).not.toHaveBeenCalled();
    // The delayed one sorts first, as on the patient card.
    fireEvent.click(screen.getAllByText("Basic Metabolic Panel")[0].closest("button"));
    expect(await screen.findByText("status: Delayed → Completed")).toBeInTheDocument();
  });

  it("does not trust a task id that belongs to another patient", async () => {
    // The parser named a real task, but it is Patient_Test_3's and the command was about Patient_Test_2.
    render(<Harness actions={[act("edit_task", "Patient_Test_2", { task_id: "task-cbc", task_spoken: "the CBC", fields: { priority: "Stat" } })]} />);
    expect(screen.getByText("Which task?")).toBeInTheDocument();
    expect(screen.getByText("Patient_Test_2 has no tasks.")).toBeInTheDocument();
  });

  it("does nothing for a delete, and says exactly why", async () => {
    render(
      <Harness
        actions={[
          { ...act("unsupported", "Patient_Test_3"), reason: "delete" },
          act("create_note", "Patient_Test_2", { fields: { text: "After." } }),
        ]}
      />
    );
    expect(screen.getByText("Not available by voice")).toBeInTheDocument();
    expect(screen.getByText("Deleting isn't available by voice. Open the item to delete it.")).toBeInTheDocument();
    click("Next");
    expect(await screen.findByDisplayValue("After.")).toBeInTheDocument();
    click("Skip");
    expect(await screen.findByText("Voice command summary")).toBeInTheDocument();
    expect(summaryLine("Delete: not available by voice")).toHaveAttribute("data-status", "unavailable");
    for (const fn of Object.values(api)) expect(fn).not.toHaveBeenCalled();
  });

  it("opens a report only after the summary is closed", async () => {
    const finished = vi.fn();
    render(<Harness onFinished={finished} actions={[act("open_handoff", null, { fields: { scope: "unit" } })]} />);
    expect(screen.getByText("Open the shift handoff report. It opens when you close the summary.")).toBeInTheDocument();
    click("Confirm");
    expect(await screen.findByText("Opens when you close")).toBeInTheDocument();
    expect(finished).not.toHaveBeenCalled();
    click("Close and open the report");
    expect(finished).toHaveBeenCalledWith({ handoff: expect.objectContaining({ kind: "handoff", scope: "unit", patientId: null }) });
  });

  it("keeps a step open when its write fails, and reports it as failed if the nurse then skips", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    api.addNote.mockRejectedValue(new Error("insert failed"));
    render(<Harness actions={[act("create_note", "Patient_Test_2", { fields: { text: "Will fail." } })]} />);
    click("Confirm");
    expect(await screen.findByText(/Failed to save note/)).toBeInTheDocument();
    expect(screen.queryByText(/insert failed/)).not.toBeInTheDocument();
    expect(screen.getByText("Voice command, 1 of 1")).toBeInTheDocument();
    click("Skip");
    expect(await screen.findByText("Voice command summary")).toBeInTheDocument();
    expect(summaryLine("Add a note for Patient_Test_2")).toHaveAttribute("data-status", "failed");
  });

  it("lists what was not understood and what was left out past five actions", async () => {
    render(
      <Harness
        actions={[{ ...act("unsupported", null), reason: "other" }]}
        unparsed={["do the thing for the other one"]}
        dropped={[{ type: "create_task", words: "order a chest x-ray for patient 2" }]}
      />
    );
    click("Next");
    expect(await screen.findByText("Voice command summary")).toBeInTheDocument();
    expect(screen.getByText("do the thing for the other one")).toBeInTheDocument();
    expect(within(screen.getByText(/Too many actions at once/).parentElement).getByText("order a chest x-ray for patient 2")).toBeInTheDocument();
  });

  it("goes straight to the summary when there is no action", () => {
    render(<Harness actions={[]} unparsed={["mumble"]} />);
    expect(screen.getByText("Voice command summary")).toBeInTheDocument();
    expect(screen.getByText("mumble")).toBeInTheDocument();
  });
});
