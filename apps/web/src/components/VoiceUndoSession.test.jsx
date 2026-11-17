import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import VoiceUndoSession from "./VoiceUndoSession";
import { EditLockContext } from "../hooks/editLockContext";
import { createLockStore, lockKey } from "../utils/editLock";
import { planUndo } from "../utils/voiceUndo";
import { deleteTask, fetchPatientRow, fetchTaskRow, updatePatient, updateTask } from "../lib/patients";
import { fetchLastChange } from "../lib/auditLog";
import { restoreTaskSnapshot } from "../lib/taskRestore";

vi.mock("../lib/patients", () => ({ deleteTask: vi.fn(), fetchPatientRow: vi.fn(), fetchTaskRow: vi.fn(), updatePatient: vi.fn(), updateTask: vi.fn() }));
vi.mock("../lib/auditLog", () => ({ fetchLastChange: vi.fn() }));
vi.mock("../lib/taskRestore", () => ({ restoreTaskSnapshot: vi.fn() }));

// Synthetic fixtures only.
const FACILITY = "facility-1";
const ME = "nurse-me";
const BEFORE = { id: "task-1", facility_id: FACILITY, patient_id: "patient-3", description: "Complete Blood Count", status: "Completed", priority: "Routine", department: "Lab", deadline: null, assigned_to: null, completed_at: "2026-11-16T09:12:00Z", completed_by: "nurse-amara" };
// What a voice command left: the task reopened.
const AFTER = { ...BEFORE, status: "Pending", completed_at: null, completed_by: null };
const reopenPlan = () => planUndo({ kind: "editTask", taskId: "task-1", before: BEFORE, after: AFTER, columns: ["status"] })[0];
const priorityPlan = () => planUndo({ kind: "editTask", taskId: "task-1", before: AFTER, after: { ...AFTER, priority: "Stat" }, columns: ["priority"] })[0];

function runUndo(plan, { status = "unavailable", locks } = {}) {
  const store = createLockStore("tab-me");
  const tracker = vi.fn();
  store.setTracker(tracker);
  store.set({ status, ...(locks ? { locks } : {}) });
  const onResult = vi.fn();
  const view = render(
    <EditLockContext.Provider value={{ store, nurses: [], currentNurseId: ME }}>
      <VoiceUndoSession plan={plan} facilityId={FACILITY} onResult={onResult} />
    </EditLockContext.Provider>
  );
  return { onResult, store, tracker, ...view };
}

const result = async (onResult) => {
  await waitFor(() => expect(onResult).toHaveBeenCalledTimes(1));
  return onResult.mock.calls[0][0];
};

beforeEach(() => {
  vi.clearAllMocks();
  fetchLastChange.mockResolvedValue(null);
});

describe("VoiceUndoSession: what it does when nothing is in the way", () => {
  it("undoes a reopen: the original completer and completion time come back", async () => {
    fetchTaskRow.mockResolvedValue(AFTER);
    restoreTaskSnapshot.mockResolvedValue(BEFORE);
    const { onResult } = runUndo(reopenPlan());
    expect(await result(onResult)).toEqual({ ok: true, row: BEFORE });
    expect(restoreTaskSnapshot).toHaveBeenCalledWith({
      facilityId: FACILITY,
      taskId: "task-1",
      expectedStatus: "Pending",
      restore: { status: "Completed", completed_at: "2026-11-16T09:12:00Z", completed_by: "nurse-amara" },
    });
    // The stale-write check ran: once when the session opened, once before the write.
    expect(fetchTaskRow.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("undoes a completion: the completion fields are cleared again", async () => {
    const completed = { ...AFTER, status: "Completed", completed_at: "2026-11-16T14:31:00Z", completed_by: ME };
    fetchTaskRow.mockResolvedValue(completed);
    restoreTaskSnapshot.mockResolvedValue(AFTER);
    const plan = planUndo({ kind: "editTask", before: AFTER, after: completed, columns: ["status"] })[0];
    const { onResult } = runUndo(plan);
    expect(await result(onResult)).toEqual({ ok: true, row: AFTER });
    expect(restoreTaskSnapshot.mock.calls[0][0]).toMatchObject({ expectedStatus: "Completed", restore: { status: "Pending", completed_at: null, completed_by: null } });
  });

  it("undoes an edit through the existing update, with the facility filter", async () => {
    const stat = { ...AFTER, priority: "Stat" };
    fetchTaskRow.mockResolvedValue(stat);
    updateTask.mockResolvedValue(AFTER);
    const { onResult } = runUndo(priorityPlan());
    expect(await result(onResult)).toEqual({ ok: true, row: AFTER });
    expect(updateTask).toHaveBeenCalledWith("task-1", { priority: "Routine" }, null, FACILITY);
    expect(restoreTaskSnapshot).not.toHaveBeenCalled();
  });

  it("undoes a created task by deleting it through the existing delete path", async () => {
    fetchTaskRow.mockResolvedValue(AFTER);
    const plan = planUndo({ kind: "createTasks", tasks: [AFTER] })[0];
    const { onResult } = runUndo(plan);
    expect(await result(onResult)).toEqual({ ok: true, row: null });
    expect(deleteTask).toHaveBeenCalledWith("task-1", FACILITY);
  });

  it("undoes a patient edit", async () => {
    const before = { id: "patient-2", facility_id: FACILITY, diagnosis: null, code_status: "Full Code", allergies: null, admission_date: null, location_label: null, age: null };
    const after = { ...before, code_status: "Comfort Care" };
    fetchPatientRow.mockResolvedValue(after);
    updatePatient.mockResolvedValue(before);
    const plan = planUndo({ kind: "editPatient", before, after, columns: ["code_status"] })[0];
    const { onResult } = runUndo(plan);
    expect(await result(onResult)).toEqual({ ok: true, row: before });
    expect(updatePatient).toHaveBeenCalledWith("patient-2", expect.objectContaining({ codeStatus: "Full Code" }), FACILITY);
  });

  it("claims the record's lock while it runs, and releases it afterwards", async () => {
    fetchTaskRow.mockResolvedValue(AFTER);
    restoreTaskSnapshot.mockResolvedValue(BEFORE);
    const { onResult, store, tracker, unmount } = runUndo(reopenPlan(), { status: "joined" });
    await waitFor(() => expect(tracker).toHaveBeenCalled());
    const claim = tracker.mock.calls.at(-1)[0];
    expect(claim).toMatchObject({ nurse_id: ME, record_type: "task", record_id: "task-1" });
    // Echo the claim back as the server would: the lock is now held.
    store.set({ locks: new Map([[lockKey("task", "task-1"), [{ key: "tab-me", nurseId: ME, recordType: "task", recordId: "task-1", since: claim.since, gen: claim.gen }]]]) });
    expect(await result(onResult)).toEqual({ ok: true, row: BEFORE });
    unmount();
    expect(tracker.mock.calls.at(-1)[0]).toBeNull();
  });
});

describe("VoiceUndoSession: every refusal writes nothing", () => {
  const nothingWritten = () => {
    expect(restoreTaskSnapshot).not.toHaveBeenCalled();
    expect(updateTask).not.toHaveBeenCalled();
    expect(deleteTask).not.toHaveBeenCalled();
    expect(updatePatient).not.toHaveBeenCalled();
  };

  it("refuses when the task changed since the voice command was applied, and says who", async () => {
    fetchTaskRow.mockResolvedValue({ ...AFTER, priority: "Stat" });
    fetchLastChange.mockResolvedValue({ nurse_id: "nurse-bo", created_at: "2026-11-16T14:40:00Z" });
    const { onResult } = runUndo(reopenPlan());
    expect(await result(onResult)).toEqual({ ok: false, reason: "changed", columns: ["priority"], byNurseId: "nurse-bo", at: "2026-11-16T14:40:00Z" });
    expect(fetchLastChange).toHaveBeenCalledWith(FACILITY, "task-1");
    nothingWritten();
  });

  it("refuses with 'someone else' when the audit log cannot say who", async () => {
    fetchTaskRow.mockResolvedValue({ ...AFTER, description: "Complete Blood Count, repeat" });
    const { onResult } = runUndo(reopenPlan());
    expect(await result(onResult)).toMatchObject({ ok: false, reason: "changed", byNurseId: null });
    nothingWritten();
  });

  it("refuses when the task was deleted", async () => {
    fetchTaskRow.mockResolvedValue(null);
    fetchLastChange.mockResolvedValue({ nurse_id: "nurse-bo", created_at: "2026-11-16T14:40:00Z" });
    const { onResult } = runUndo(reopenPlan());
    expect(await result(onResult)).toMatchObject({ ok: false, reason: "deleted", byNurseId: "nurse-bo" });
    nothingWritten();
  });

  it("refuses when a colleague holds the task's lock", async () => {
    fetchTaskRow.mockResolvedValue(AFTER);
    const locks = new Map([[lockKey("task", "task-1"), [{ key: "tab-other", nurseId: "nurse-bo", recordType: "task", recordId: "task-1", since: 1, gen: 0 }]]]);
    const { onResult } = runUndo(reopenPlan(), { status: "joined", locks });
    expect(await result(onResult)).toEqual({ ok: false, reason: "locked", byNurseId: "nurse-bo" });
    nothingWritten();
  });

  it("refuses when the lock is lost before the write", async () => {
    fetchTaskRow.mockResolvedValue(AFTER);
    // The connection drops while the session is still taking the lock.
    const { onResult, store } = runUndo(reopenPlan(), { status: "joined" });
    store.set({ status: "disconnected" });
    expect(await result(onResult)).toEqual({ ok: false, reason: "lockLost" });
    nothingWritten();
  });

  it("refuses when the task changes between the check and the write", async () => {
    // Unchanged when the session opens, changed by the time it writes.
    fetchTaskRow.mockResolvedValueOnce(AFTER).mockResolvedValue({ ...AFTER, department: "Radiology" });
    fetchLastChange.mockResolvedValue({ nurse_id: "nurse-bo", created_at: "2026-11-16T14:41:00Z" });
    const { onResult } = runUndo(reopenPlan());
    expect(await result(onResult)).toMatchObject({ ok: false, reason: "changed", byNurseId: "nurse-bo" });
    nothingWritten();
  });

  it("refuses when the status restore matches no row (status changed at the last moment)", async () => {
    fetchTaskRow.mockResolvedValue(AFTER);
    restoreTaskSnapshot.mockRejectedValue(Object.assign(new Error("RESTORE_STALE"), { code: "RESTORE_STALE" }));
    const { onResult } = runUndo(reopenPlan());
    expect(await result(onResult)).toMatchObject({ ok: false, reason: "changed", columns: ["status"] });
    expect(updateTask).not.toHaveBeenCalled();
  });

  it("reports a failed write as failed, and a half-finished undo as partial with the row as it now is", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchTaskRow.mockResolvedValue({ ...AFTER, priority: "Stat" });
    updateTask.mockRejectedValue(new Error("network"));
    const failed = runUndo(priorityPlan());
    expect(await result(failed.onResult)).toEqual({ ok: false, reason: "failed" });

    const both = { ...AFTER, status: "Completed", completed_at: "2026-11-16T14:31:00Z", completed_by: ME, priority: "Stat" };
    fetchTaskRow.mockResolvedValue(both);
    const afterStatus = { ...AFTER, priority: "Stat" };
    restoreTaskSnapshot.mockResolvedValue(afterStatus);
    const plan = planUndo({ kind: "editTask", before: AFTER, after: both, columns: ["priority", "status"] })[0];
    const partial = runUndo(plan);
    expect(await result(partial.onResult)).toEqual({ ok: false, reason: "partial", restored: ["status"], missing: ["priority"], row: afterStatus });
  });

  it("reports once, whatever happens afterwards", async () => {
    fetchTaskRow.mockResolvedValue({ ...AFTER, priority: "Stat" });
    const { onResult, store } = runUndo(reopenPlan());
    await result(onResult);
    store.set({ status: "disconnected" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onResult).toHaveBeenCalledTimes(1);
  });
});
