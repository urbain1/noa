import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import TaskEditDialog from "./TaskEditDialog";
import { EditLockContext } from "../hooks/editLockContext";
import { createLockStore, lockKey } from "../utils/editLock";
import { fetchTaskRow } from "../lib/patients";
import { fetchLastChange } from "../lib/auditLog";

vi.mock("../lib/patients", () => ({ fetchTaskRow: vi.fn() }));
vi.mock("../lib/auditLog", () => ({ fetchLastChange: vi.fn() }));

// Synthetic fixtures only.
const FACILITY = "facility-1";
const ME = "nurse-me";
const NURSES = [
  { id: ME, name: "Nurse Me Test" },
  { id: "nurse-amara", name: "Nurse Amara Test" },
  { id: "nurse-bo", name: "Nurse Bo Test" },
];
const TASK = {
  id: "task-1",
  facility_id: FACILITY,
  patient_id: "patient-3",
  description: "Complete Blood Count",
  status: "Pending",
  priority: "Routine",
  department: "Lab",
  deadline: null,
  assigned_to: null,
};

function renderStep({ proposal = () => ({ priority: "Stat", assigned_to: "nurse-amara" }), storeStatus = "unavailable", locks, stepExtra = {} } = {}) {
  const store = createLockStore("tab-me");
  store.setTracker(vi.fn());
  store.set({ status: storeStatus, ...(locks ? { locks } : {}) });
  const onManualUpdate = vi.fn(async (updates) => ({ ...TASK, ...("priority" in updates ? { priority: updates.priority } : {}), ...("assignedTo" in updates ? { assigned_to: updates.assignedTo } : {}), ...("status" in updates ? { status: updates.status } : {}) }));
  const voiceStep = { index: 2, total: 3, words: "change the CBC for patient 3 to stat and assign it to Amara", confidence: "high", onSkip: vi.fn(), onClose: vi.fn(), onConfirmed: vi.fn(), onError: vi.fn(), ...stepExtra };
  render(
    <EditLockContext.Provider value={{ store, nurses: NURSES, currentNurseId: ME }}>
      <TaskEditDialog
        task={TASK}
        patientId={TASK.patient_id}
        patientLabel="Patient_Test_3"
        nurses={NURSES}
        currentNurseId={ME}
        facilityId={FACILITY}
        onAssign={() => undefined}
        onCancel={vi.fn()}
        onManualUpdate={onManualUpdate}
        proposal={proposal}
        voiceStep={voiceStep}
      />
    </EditLockContext.Provider>
  );
  return { onManualUpdate, voiceStep, store };
}

const confirmButton = () => screen.getByRole("button", { name: "Confirm" });

beforeEach(() => {
  fetchTaskRow.mockReset();
  fetchTaskRow.mockResolvedValue(TASK);
  fetchLastChange.mockReset();
  fetchLastChange.mockResolvedValue(null);
});

describe("TaskEditDialog as a voice step (proposal mode)", () => {
  it("shows the step, the words heard, and which fields will change, old to new", async () => {
    renderStep();
    expect(screen.getByText("Voice command, 2 of 3")).toBeInTheDocument();
    expect(screen.getByText(/Heard: “change the CBC for patient 3 to stat/)).toBeInTheDocument();
    expect(await screen.findByText("Will change")).toBeInTheDocument();
    expect(screen.getByText("priority: Routine → Stat")).toBeInTheDocument();
    expect(screen.getByText("assignee: Unassigned → Nurse Amara Test")).toBeInTheDocument();
    // A voice step is a proposal to confirm: no second command box.
    expect(screen.getByText("AI Edit").closest("div")).toHaveClass("hidden");
  });

  it("writes nothing when it opens and nothing when a field is changed", async () => {
    const { onManualUpdate } = renderStep();
    await waitFor(() => expect(confirmButton()).toBeEnabled());
    fireEvent.change(screen.getByDisplayValue("Lab"), { target: { value: "Radiology" } });
    fireEvent.change(screen.getByDisplayValue("Complete Blood Count"), { target: { value: "Complete Blood Count, repeat" } });
    // Longer than the auto-save debounce used outside proposal mode.
    await act(() => new Promise((resolve) => setTimeout(resolve, 900)));
    expect(onManualUpdate).not.toHaveBeenCalled();
    expect(screen.getByText("department: Lab → Radiology")).toBeInTheDocument();
  });

  it("writes every changed field in one guarded update on Confirm, and reports before and after", async () => {
    const { onManualUpdate, voiceStep } = renderStep();
    await waitFor(() => expect(confirmButton()).toBeEnabled());
    fireEvent.click(confirmButton());
    await waitFor(() => expect(voiceStep.onConfirmed).toHaveBeenCalledTimes(1));
    expect(onManualUpdate).toHaveBeenCalledTimes(1);
    expect(onManualUpdate.mock.calls[0][0]).toEqual({ priority: "Stat", assignedTo: "nurse-amara" });
    const { before, after, columns } = voiceStep.onConfirmed.mock.calls[0][0];
    expect(before).toMatchObject({ priority: "Routine", assigned_to: null });
    expect(after).toMatchObject({ priority: "Stat", assigned_to: "nurse-amara" });
    expect(columns.sort()).toEqual(["assigned_to", "priority"]);
    // The stale-write check ran: once on open, once before the write.
    expect(fetchTaskRow).toHaveBeenCalledTimes(2);
  });

  it("Skip writes nothing", async () => {
    const { onManualUpdate, voiceStep } = renderStep();
    await waitFor(() => expect(confirmButton()).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(voiceStep.onSkip).toHaveBeenCalledTimes(1);
    expect(onManualUpdate).not.toHaveBeenCalled();
  });

  it("closing ends the queue instead of saving anything", async () => {
    const { onManualUpdate, voiceStep } = renderStep();
    await waitFor(() => expect(confirmButton()).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Stop here and close the remaining actions" }));
    expect(voiceStep.onClose).toHaveBeenCalledTimes(1);
    expect(onManualUpdate).not.toHaveBeenCalled();
  });

  it("lays the proposal over the fresh row, not over the copy the app had loaded", async () => {
    // A colleague already made it Stat and reworded it since the roster loaded.
    fetchTaskRow.mockResolvedValue({ ...TASK, priority: "Stat", description: "Complete Blood Count with differential" });
    renderStep();
    expect(await screen.findByDisplayValue("Complete Blood Count with differential")).toBeInTheDocument();
    // Priority is already what was asked: only the assignee is left to change.
    expect(await screen.findByText("assignee: Unassigned → Nurse Amara Test")).toBeInTheDocument();
    expect(screen.queryByText(/priority:/)).not.toBeInTheDocument();
  });

  it("says so when there is nothing to change, and offers Next instead of Confirm", async () => {
    const { voiceStep } = renderStep({ proposal: () => ({ priority: "Routine" }) });
    expect(await screen.findByText("Already set this way. Nothing to change.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(voiceStep.onSkip).toHaveBeenCalledWith("nothing_to_change");
  });

  it("shows a name it could not match and applies nobody", async () => {
    renderStep({ proposal: () => ({ priority: "Stat" }), stepExtra: { assigneeHeard: "Dana" } });
    expect(await screen.findByText("Heard “Dana”. No single colleague matches, choose the assignee.")).toBeInTheDocument();
    expect(screen.queryByText(/assignee:/)).not.toBeInTheDocument();
  });

  it("shows the lock banner when a colleague is editing the task, and still lets the nurse skip", async () => {
    const locks = new Map([[lockKey("task", TASK.id), [{ key: "tab-other", nurseId: "nurse-bo", recordType: "task", recordId: TASK.id, since: 1, gen: 0 }]]]);
    const { onManualUpdate, voiceStep } = renderStep({ storeStatus: "joined", locks });
    expect(await screen.findByText("Nurse Bo Test is currently editing this. Wait, or ask them to finish.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Take over" })).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
    fireEvent.click(confirmButton());
    expect(onManualUpdate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(voiceStep.onSkip).toHaveBeenCalledTimes(1);
  });

  it("refuses to overwrite a change made after the step opened, and says who", async () => {
    fetchLastChange.mockResolvedValue({ nurse_id: "nurse-bo", created_at: "2026-11-16T14:02:00Z" });
    fetchTaskRow.mockResolvedValueOnce(TASK).mockResolvedValue({ ...TASK, department: "Radiology" });
    const { onManualUpdate, voiceStep } = renderStep();
    await waitFor(() => expect(confirmButton()).toBeEnabled());
    fireEvent.click(confirmButton());
    expect(await screen.findByText(/Nurse Bo Test changed this after you opened it: department/)).toBeInTheDocument();
    expect(onManualUpdate).not.toHaveBeenCalled();
    expect(voiceStep.onConfirmed).not.toHaveBeenCalled();
  });

  it("keeps the step open and reports a failed write", async () => {
    const { onManualUpdate, voiceStep } = renderStep();
    onManualUpdate.mockRejectedValueOnce(new Error("permission denied for table tasks"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await waitFor(() => expect(confirmButton()).toBeEnabled());
    fireEvent.click(confirmButton());
    expect(await screen.findByText(/Failed to update task/)).toBeInTheDocument();
    expect(screen.queryByText(/permission denied/)).not.toBeInTheDocument();
    expect(voiceStep.onError).toHaveBeenCalledTimes(1);
    expect(voiceStep.onConfirmed).not.toHaveBeenCalled();
  });
});

describe("TaskEditDialog outside a voice step is unchanged", () => {
  it("still saves a field the moment it changes", async () => {
    const store = createLockStore("tab-me");
    store.setTracker(vi.fn());
    store.set({ status: "unavailable" });
    const onManualUpdate = vi.fn(async () => ({ ...TASK, priority: "Stat" }));
    render(
      <EditLockContext.Provider value={{ store, nurses: NURSES, currentNurseId: ME }}>
        <TaskEditDialog task={TASK} patientId={TASK.patient_id} nurses={NURSES} currentNurseId={ME} facilityId={FACILITY} onAssign={vi.fn()} onCancel={vi.fn()} onManualUpdate={onManualUpdate} />
      </EditLockContext.Provider>
    );
    expect(screen.queryByText(/Voice command/)).not.toBeInTheDocument();
    expect(screen.getByText("AI Edit").closest("div")).not.toHaveClass("hidden");
    await waitFor(() => expect(screen.getByDisplayValue("Routine")).toBeEnabled());
    fireEvent.change(screen.getByDisplayValue("Routine"), { target: { value: "Stat" } });
    await waitFor(() => expect(onManualUpdate).toHaveBeenCalledWith({ priority: "Stat" }, TASK, TASK.patient_id));
  });
});
