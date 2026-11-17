import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import i18n from "../i18n";
import VoiceCapture from "./VoiceCapture";
import { parseVoiceCommand, parseVoiceToTask } from "../utils/claudeAPI";

vi.mock("../utils/claudeAPI", () => ({
  parseVoiceCommand: vi.fn(),
  parseVoiceToTask: vi.fn(),
  parsePatientFromVoice: vi.fn(),
}));

// Synthetic fixtures only.
const PATIENTS = [
  { id: "p1", label: "Patient_Test_1", location_label: "Test Room A", diagnosis: "Pneumonia", notes: [{ id: "n1", content: "Refused breakfast" }], tasks: [{ id: "t1", patient_id: "p1", description: "Complete Blood Count", status: "Pending", priority: "Routine", department: "Lab", assigned_to: "nurse-1" }] },
  { id: "p2", label: "Patient_Test_2", location_label: null, tasks: [], notes: [] },
];
const NURSES = [{ id: "nurse-1", name: "Nurse Amara Test", email: "amara.test@example.invalid" }];

const action = (overrides) => ({ type: "create_note", words: "add a note for patient 2 that he refused breakfast", confidence: "high", patient: { spoken: "patient 2", label: "Patient_Test_2" }, task_id: null, task_spoken: null, fields: { text: "Patient refused breakfast." }, ...overrides });
const answer = (actions, extra = {}) => ({ ok: true, result: { ok: true, actions, dropped: [], unparsed: [], context_truncated: false, ...extra } });

function renderCommand(props = {}) {
  const handlers = { onClose: vi.fn(), onTaskCreated: vi.fn(async () => {}), onPatientParsed: vi.fn(), onCommandReady: vi.fn() };
  render(<VoiceCapture mode="command" allPatients={PATIENTS} nurses={NURSES} {...handlers} {...props} />);
  return handlers;
}

const type = (text) => fireEvent.change(screen.getByRole("textbox"), { target: { value: text } });
const click = (name) => fireEvent.click(screen.getByRole("button", { name }));

beforeEach(() => {
  parseVoiceCommand.mockReset();
  parseVoiceToTask.mockReset();
  vi.spyOn(window, "alert").mockImplementation(() => {});
});

describe("VoiceCapture in command mode", () => {
  it("shows example commands and the reminder not to say real identifiers", () => {
    renderCommand();
    expect(screen.getByText("Voice Command")).toBeInTheDocument();
    expect(screen.getByText("Create patient test 6")).toBeInTheDocument();
    expect(screen.getByText("Change the CBC for patient test 3 to stat and assign it to me")).toBeInTheDocument();
    expect(screen.getByText("Add a note for patient test 2 that he refused breakfast")).toBeInTheDocument();
    expect(screen.getByText(/Never say a real name, room, bed or ID number/)).toBeInTheDocument();
  });

  it("lets the nurse type instead of speaking, and sends only the minimal context", async () => {
    parseVoiceCommand.mockResolvedValue(answer([action()]));
    renderCommand();
    type("add a note for patient 2 that he refused breakfast");
    click("Review actions");
    await waitFor(() => expect(parseVoiceCommand).toHaveBeenCalledTimes(1));
    const [transcript, context] = parseVoiceCommand.mock.calls[0];
    expect(transcript).toBe("add a note for patient 2 that he refused breakfast");
    expect(context.patients).toEqual([
      { id: "p1", label: "Patient_Test_1", location: "Test Room A" },
      { id: "p2", label: "Patient_Test_2", location: null },
    ]);
    expect(context.tasks).toEqual([{ id: "t1", patient_id: "p1", description: "Complete Blood Count", status: "Pending", priority: "Routine", department: "Lab", assignee: "Nurse Amara Test" }]);
    expect(context.nurses).toEqual(["Nurse Amara Test"]);
    // No note content, no diagnosis, no email.
    const sent = JSON.stringify(context);
    expect(sent).not.toContain("Refused breakfast");
    expect(sent).not.toContain("Pneumonia");
    expect(sent).not.toContain("example.invalid");
  });

  it("shows what was understood, then hands the actions to the queue on Start, writing nothing itself", async () => {
    parseVoiceCommand.mockResolvedValue(answer([action(), action({ type: "create_patient", patient: { spoken: "patient test 6", label: "Patient_Test_6" }, fields: {}, confidence: "low" })]));
    const handlers = renderCommand();
    type("add a note for patient 2 that he refused breakfast and create patient test 6");
    click("Review actions");
    expect(await screen.findByText("What Noa understood")).toBeInTheDocument();
    expect(screen.getByText("Add a note for Patient_Test_2")).toBeInTheDocument();
    expect(screen.getByText("Create patient Patient_Test_6")).toBeInTheDocument();
    expect(screen.getByText("check this")).toBeInTheDocument();
    expect(screen.getByText("Nothing is saved yet. You will confirm or skip each action.")).toBeInTheDocument();
    expect(handlers.onCommandReady).not.toHaveBeenCalled();

    click("Start");
    expect(handlers.onCommandReady).toHaveBeenCalledTimes(1);
    const run = handlers.onCommandReady.mock.calls[0][0];
    expect(run.parsed.actions).toHaveLength(2);
    expect(run.transcript).toBe("add a note for patient 2 that he refused breakfast and create patient test 6");
    expect(handlers.onTaskCreated).not.toHaveBeenCalled();
  });

  it("asks to run again when the text is edited after parsing", async () => {
    parseVoiceCommand.mockResolvedValue(answer([action()]));
    renderCommand();
    type("add a note for patient 2 that he refused breakfast");
    click("Review actions");
    expect(await screen.findByRole("button", { name: "Start" })).toBeInTheDocument();
    type("add a note for patient 1 that he refused breakfast");
    expect(screen.getByText("The text changed. Run it again to update the actions.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start" })).not.toBeInTheDocument();
    click("Run again");
    await waitFor(() => expect(parseVoiceCommand).toHaveBeenCalledTimes(2));
  });

  it("shows what was not understood and what was left out past five actions", async () => {
    parseVoiceCommand.mockResolvedValue(answer([action()], { unparsed: ["do the thing for the other one"], dropped: [{ type: "create_task", words: "order a chest x-ray for patient 2" }] }));
    renderCommand();
    type("anything");
    click("Review actions");
    expect(await screen.findByText("do the thing for the other one")).toBeInTheDocument();
    expect(screen.getByText("order a chest x-ray for patient 2")).toBeInTheDocument();
  });

  it("says so when no action was found, and offers nothing to start", async () => {
    parseVoiceCommand.mockResolvedValue(answer([]));
    renderCommand();
    type("um where was I");
    click("Review actions");
    expect(await screen.findByText("Noa did not find any action in this. Correct the text and run it again.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start" })).not.toBeInTheDocument();
  });

  it.each(["unknown_action", "unreachable", "server_error"])("falls back visibly, never silently, when the parser is unavailable (%s)", async (cause) => {
    parseVoiceCommand.mockResolvedValue({ ok: false, cause, detail: "Unknown action: parseVoiceCommand" });
    const handlers = renderCommand();
    type("order a CBC for patient 1 and add a note for patient 2");
    click("Review actions");

    const notice = await screen.findByRole("alert");
    expect(notice).toHaveTextContent("Limited mode");
    expect(notice).toHaveTextContent("Noa can't read several actions right now. It will create one task only from this text.");
    // Nothing has been created by falling back: the nurse has to press.
    expect(parseVoiceToTask).not.toHaveBeenCalled();
    expect(handlers.onTaskCreated).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Create one task" })).toBeInTheDocument();
  });

  it("runs the existing single-task path, unchanged, when the nurse presses Create one task", async () => {
    parseVoiceCommand.mockResolvedValue({ ok: false, cause: "unknown_action" });
    parseVoiceToTask.mockResolvedValue({ description: "Complete Blood Count", department: "Lab", priority: "Routine", room: "000", patientName: "Patient Test 1", status: "Pending", deadline: null });
    vi.spyOn(console, "log").mockImplementation(() => {});
    const handlers = renderCommand();
    type("order a CBC for patient test 1");
    click("Review actions");
    await screen.findByRole("alert");
    click("Create one task");
    await waitFor(() => expect(handlers.onTaskCreated).toHaveBeenCalledTimes(1));
    expect(parseVoiceToTask).toHaveBeenCalledWith("order a CBC for patient test 1");
    expect(handlers.onTaskCreated.mock.calls[0][0]).toMatchObject({ description: "Complete Blood Count", patientName: "Patient_Test_1", rawTranscript: "order a CBC for patient test 1" });
    expect(handlers.onCommandReady).not.toHaveBeenCalled();
  });

  it("treats an unusable answer as something to rephrase, with the one-task option still visible", async () => {
    parseVoiceCommand.mockResolvedValue({ ok: false, cause: "unreadable" });
    renderCommand();
    type("garbled");
    click("Review actions");
    expect(await screen.findByText("Noa couldn't understand that. Correct the text and try again.")).toBeInTheDocument();
    expect(parseVoiceToTask).not.toHaveBeenCalled();
    click("Create one task from this text instead");
    expect(screen.getByRole("alert")).toHaveTextContent("Limited mode");
    expect(screen.getByRole("button", { name: "Create one task" })).toBeInTheDocument();
  });

  it("refuses text over 1000 characters without calling the parser", () => {
    renderCommand();
    type("a".repeat(1001));
    expect(screen.getByText("This is longer than 1000 characters. Shorten it, or send it in two parts.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review actions" })).toBeDisabled();
    expect(parseVoiceCommand).not.toHaveBeenCalled();
  });

  it("shows the limited-mode notice in French", async () => {
    await i18n.changeLanguage("fr");
    parseVoiceCommand.mockResolvedValue({ ok: false, cause: "unknown_action" });
    renderCommand();
    type("demander une NFS pour le patient 1");
    click("Vérifier les actions");
    const notice = await screen.findByRole("alert");
    expect(notice).toHaveTextContent("Mode limité");
    expect(notice).toHaveTextContent("Une seule tâche sera créée à partir de ce texte.");
    expect(screen.getByRole("button", { name: "Créer une tâche" })).toBeInTheDocument();
  });
});

describe("VoiceCapture from a patient card is unchanged", () => {
  it("still creates one task for the known patient and never calls the command parser", async () => {
    parseVoiceToTask.mockResolvedValue({ description: "Complete Blood Count", department: "Lab", priority: "Stat", room: "000", patientName: null, status: "Pending", deadline: null });
    vi.spyOn(console, "log").mockImplementation(() => {});
    const handlers = { onClose: vi.fn(), onTaskCreated: vi.fn(async () => {}), onPatientParsed: vi.fn(), onCommandReady: vi.fn() };
    render(<VoiceCapture mode="task" allPatients={PATIENTS} knownPatient={PATIENTS[0]} {...handlers} />);
    expect(screen.getByText("Try: \"Order a CBC stat due tomorrow\"")).toBeInTheDocument();
    expect(screen.queryByText("Create patient test 6")).not.toBeInTheDocument();
    type("order a CBC stat");
    click("Create Task");
    await waitFor(() => expect(handlers.onTaskCreated).toHaveBeenCalledTimes(1));
    expect(handlers.onTaskCreated.mock.calls[0][0]).toMatchObject({ patientName: "Patient_Test_1", priority: "Stat" });
    expect(parseVoiceCommand).not.toHaveBeenCalled();
    expect(handlers.onClose).toHaveBeenCalled();
  });
});
