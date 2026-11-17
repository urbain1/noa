import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import VoiceUndoControl from "./VoiceUndoControl";
import { EditLockContext } from "../hooks/editLockContext";
import { createLockStore } from "../utils/editLock";
import { stampApplied } from "../utils/voiceUndo";
import { deleteTask, fetchTaskRow, updateTask } from "../lib/patients";
import { fetchLastChange } from "../lib/auditLog";

vi.mock("../lib/patients", () => ({ deleteTask: vi.fn(), fetchPatientRow: vi.fn(), fetchTaskRow: vi.fn(), updatePatient: vi.fn(), updateTask: vi.fn() }));
vi.mock("../lib/auditLog", () => ({ fetchLastChange: vi.fn() }));
vi.mock("../lib/taskRestore", () => ({ restoreTaskSnapshot: vi.fn() }));

// Synthetic fixtures only.
const FACILITY = "facility-1";
const ME = "nurse-me";
const NURSES = [{ id: ME, name: "Nurse Me Test" }, { id: "nurse-bo", name: "Nurse Bo Test" }];
const BEFORE = { id: "task-1", facility_id: FACILITY, patient_id: "patient-3", description: "Complete Blood Count", status: "Pending", priority: "Routine", department: "Lab", deadline: null, assigned_to: null, completed_at: null, completed_by: null };
const AFTER = { ...BEFORE, priority: "Stat" };
const edit = () => stampApplied({ kind: "editTask", taskId: "task-1", before: BEFORE, after: AFTER, columns: ["priority"] });

function renderControl(applied, handlers = {}) {
  const store = createLockStore("tab-me");
  store.setTracker(vi.fn());
  store.set({ status: "unavailable" });
  const props = { onRowRestored: vi.fn(), onTaskDeleted: vi.fn(), onUndone: vi.fn(), ...handlers };
  render(
    <EditLockContext.Provider value={{ store, nurses: NURSES, currentNurseId: ME }}>
      <VoiceUndoControl applied={applied} facilityId={FACILITY} nurses={NURSES} currentNurseId={ME} {...props} />
    </EditLockContext.Provider>
  );
  return props;
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchLastChange.mockResolvedValue(null);
});
afterEach(() => vi.useRealTimers());

describe("VoiceUndoControl", () => {
  it("offers Undo with the seconds left, and restores the previous values", async () => {
    fetchTaskRow.mockResolvedValue(AFTER);
    updateTask.mockResolvedValue(BEFORE);
    const props = renderControl(edit());
    fireEvent.click(screen.getByRole("button", { name: /^Undo \(\d+ s\)$/ }));
    expect(await screen.findByText("Undone")).toBeInTheDocument();
    expect(updateTask).toHaveBeenCalledWith("task-1", { priority: "Routine" }, null, FACILITY);
    expect(props.onRowRestored).toHaveBeenCalledWith("task", BEFORE);
    expect(props.onUndone).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /Undo/ })).not.toBeInTheDocument();
  });

  it("deletes a created task and tells the app to drop it", async () => {
    fetchTaskRow.mockResolvedValue(BEFORE);
    const props = renderControl(stampApplied({ kind: "createTasks", patientId: "patient-3", tasks: [BEFORE] }));
    fireEvent.click(screen.getByRole("button", { name: /Undo/ }));
    expect(await screen.findByText("Undone")).toBeInTheDocument();
    expect(deleteTask).toHaveBeenCalledWith("task-1", FACILITY);
    expect(props.onTaskDeleted).toHaveBeenCalledWith(BEFORE);
  });

  it("refuses when the record changed again since, and says who", async () => {
    fetchTaskRow.mockResolvedValue({ ...AFTER, department: "Radiology" });
    fetchLastChange.mockResolvedValue({ nurse_id: "nurse-bo", created_at: "2026-11-16T14:40:00Z" });
    const props = renderControl(edit());
    fireEvent.click(screen.getByRole("button", { name: /Undo/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/^Not undone: Nurse Bo Test changed this since \(Nov 16, 2:40 PM\)\.$/);
    expect(updateTask).not.toHaveBeenCalled();
    expect(props.onUndone).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Undo/ })).not.toBeInTheDocument();
  });

  it("stops offering Undo after 60 seconds", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-16T14:30:00Z"));
    renderControl(edit());
    expect(screen.getByRole("button", { name: "Undo (60 s)" })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(30_000));
    expect(screen.getByRole("button", { name: "Undo (30 s)" })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(31_000));
    expect(screen.queryByRole("button", { name: /Undo/ })).not.toBeInTheDocument();
  });

  it("refuses a press that lands after the minute is over", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-16T14:30:00Z"));
    renderControl(edit());
    const button = screen.getByRole("button", { name: "Undo (60 s)" });
    // The clock passes the limit before the countdown has redrawn the button.
    vi.setSystemTime(new Date("2026-11-16T14:31:05Z"));
    fireEvent.click(button);
    expect(screen.getByRole("alert")).toHaveTextContent("The time to undo has passed.");
    expect(fetchTaskRow).not.toHaveBeenCalled();
    expect(updateTask).not.toHaveBeenCalled();
  });

  it("offers no Undo for a created note or patient, and says where to change it", () => {
    renderControl(stampApplied({ kind: "createNote", patientId: "patient-2", noteId: "note-1" }));
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Can't be undone here. Change it from the patient card.")).toBeInTheDocument();
  });

  it("renders nothing for a report or an edit that changed nothing", () => {
    renderControl(stampApplied({ kind: "handoff", scope: "unit" }));
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText(/undone/i)).not.toBeInTheDocument();
  });

  it("lets the nurse try again while a colleague's lock is the only obstacle", async () => {
    const { lockKey } = await import("../utils/editLock");
    const store = createLockStore("tab-me");
    store.setTracker(vi.fn());
    store.set({ status: "joined", locks: new Map([[lockKey("task", "task-1"), [{ key: "tab-other", nurseId: "nurse-bo", recordType: "task", recordId: "task-1", since: 1, gen: 0 }]]]) });
    fetchTaskRow.mockResolvedValue(AFTER);
    render(
      <EditLockContext.Provider value={{ store, nurses: NURSES, currentNurseId: ME }}>
        <VoiceUndoControl applied={edit()} facilityId={FACILITY} nurses={NURSES} currentNurseId={ME} />
      </EditLockContext.Provider>
    );
    fireEvent.click(screen.getByRole("button", { name: /Undo/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Not undone: Nurse Bo Test is editing this right now. Try again in a moment.");
    await waitFor(() => expect(screen.getByRole("button", { name: /Undo/ })).toBeInTheDocument());
    expect(updateTask).not.toHaveBeenCalled();
  });
});
