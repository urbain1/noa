import { beforeEach, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { UNDO_WINDOW_MS, canUndo, changeSince, executeUndoSteps, planUndo, stampApplied, undoSecondsLeft } from "./voiceUndo";
import { deleteTask, updateNote, updatePatient, updateTask } from "../lib/patients";
import { restoreTaskSnapshot } from "../lib/taskRestore";

vi.mock("../lib/patients", () => ({ deleteTask: vi.fn(), updateNote: vi.fn(), updatePatient: vi.fn(), updateTask: vi.fn() }));
vi.mock("../lib/taskRestore", () => ({ restoreTaskSnapshot: vi.fn() }));

// Synthetic fixtures only.
const FACILITY = "facility-1";
const TASK = { id: "task-1", facility_id: FACILITY, patient_id: "patient-3", description: "Complete Blood Count", status: "Pending", priority: "Routine", department: "Lab", deadline: null, assigned_to: null, completed_at: null, completed_by: null };
const editTask = (beforePatch, afterPatch, columns) => ({ kind: "editTask", taskId: TASK.id, before: { ...TASK, ...beforePatch }, after: { ...TASK, ...afterPatch }, columns });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("planUndo", () => {
  it("puts back only the columns the action changed", () => {
    const [plan] = planUndo(editTask({}, { priority: "Stat", assigned_to: "nurse-amara" }, ["priority", "assigned_to"]));
    expect(plan).toMatchObject({ recordType: "task", recordId: "task-1" });
    expect(plan.expected).toMatchObject({ priority: "Stat", assigned_to: "nurse-amara" });
    expect(plan.steps).toEqual([{ type: "updateTask", columns: ["priority", "assigned_to"], updates: { priority: "Routine", assignedTo: null } }]);
  });

  it("undoes a completion through the status restore, with the previous completion fields", () => {
    const [plan] = planUndo(editTask({}, { status: "Completed", completed_at: "2026-11-16T14:31:00Z", completed_by: "nurse-me" }, ["status"]));
    expect(plan.steps).toEqual([
      { type: "restoreTaskStatus", columns: ["status"], expectedStatus: "Completed", restore: { status: "Pending", completed_at: null, completed_by: null } },
    ]);
  });

  it("undoes a reopen by restoring who completed the task and when", () => {
    const completion = { status: "Completed", completed_at: "2026-11-16T09:12:00Z", completed_by: "nurse-amara" };
    const [plan] = planUndo(editTask(completion, { status: "Pending", completed_at: null, completed_by: null }, ["status"]));
    expect(plan.steps).toEqual([{ type: "restoreTaskStatus", columns: ["status"], expectedStatus: "Pending", restore: completion }]);
  });

  it("restores status first, then the other fields, when an action changed both", () => {
    const [plan] = planUndo(editTask({}, { status: "Completed", priority: "Stat" }, ["priority", "status"]));
    expect(plan.steps.map((s) => s.type)).toEqual(["restoreTaskStatus", "updateTask"]);
    expect(plan.steps[1].updates).toEqual({ priority: "Routine" });
  });

  it("restores a cleared deadline and a previous assignee", () => {
    const [plan] = planUndo(editTask({ deadline: "2026-11-17T09:00:00Z", assigned_to: "nurse-bo" }, { deadline: null, assigned_to: null }, ["deadline", "assigned_to"]));
    expect(plan.steps[0].updates).toEqual({ deadline: "2026-11-17T09:00:00Z", assignedTo: "nurse-bo" });
  });

  it("puts a patient's previous values back", () => {
    const before = { id: "patient-2", diagnosis: "Pneumonia", code_status: "Full Code", allergies: ["latex"], admission_date: null, location_label: "Test Room B", age: 70 };
    const after = { ...before, code_status: "Comfort Care" };
    const [plan] = planUndo({ kind: "editPatient", patientId: "patient-2", before, after, columns: ["code_status"] });
    expect(plan).toMatchObject({ recordType: "patient", recordId: "patient-2", expected: after });
    expect(plan.steps).toEqual([
      { type: "updatePatient", columns: ["code_status"], payload: { diagnosis: "Pneumonia", codeStatus: "Full Code", allergies: ["latex"], admissionDate: null, locationLabel: "Test Room B", age: 70 } },
    ]);
  });

  it("deletes each task an action created", () => {
    const tasks = [{ ...TASK, id: "task-a" }, { ...TASK, id: "task-b" }];
    const plans = planUndo({ kind: "createTasks", patientId: "patient-3", tasks });
    expect(plans.map((p) => [p.recordId, p.steps[0].type])).toEqual([["task-a", "deleteTask"], ["task-b", "deleteTask"]]);
    expect(plans[0].expected).toBe(tasks[0]);
  });

  it("offers nothing for a created note or patient, a report, or an edit that changed nothing", () => {
    expect(planUndo({ kind: "createNote", patientId: "patient-2", noteId: "note-1" })).toEqual([]);
    expect(planUndo({ kind: "createPatient", patientId: "patient-6", label: "Patient_Test_6" })).toEqual([]);
    expect(planUndo({ kind: "handoff", scope: "unit" })).toEqual([]);
    expect(planUndo(editTask({}, {}, []))).toEqual([]);
    expect(planUndo(null)).toEqual([]);
    expect(canUndo({ kind: "createNote" })).toBe(false);
    expect(canUndo(editTask({}, { priority: "Stat" }, ["priority"]))).toBe(true);
  });
});

describe("the undo window", () => {
  it("lasts 60 seconds from when the action was applied", () => {
    const applied = stampApplied({ kind: "createNote" }, 1_000_000);
    expect(applied.at).toBe(1_000_000);
    expect(UNDO_WINDOW_MS).toBe(60_000);
    expect(undoSecondsLeft(applied, 1_000_000)).toBe(60);
    expect(undoSecondsLeft(applied, 1_000_000 + 59_001)).toBe(1);
    expect(undoSecondsLeft(applied, 1_000_000 + 60_000)).toBe(0);
    expect(undoSecondsLeft(applied, 1_000_000 + 600_000)).toBe(0);
    expect(undoSecondsLeft({ kind: "createNote" }, 5)).toBe(0);
  });
});

describe("changeSince", () => {
  it("is null when the record is exactly what the voice command left", () => {
    expect(changeSince(TASK, { ...TASK })).toBeNull();
  });

  it("names the columns that changed, and recognises a deleted record", () => {
    expect(changeSince(TASK, { ...TASK, priority: "Stat", department: "Radiology" })).toEqual({ reason: "changed", columns: ["department", "priority"] });
    expect(changeSince(TASK, null)).toEqual({ reason: "deleted" });
  });
});

describe("executeUndoSteps", () => {
  it("restores a status through restoreTaskSnapshot, scoped to the facility", async () => {
    const restored = { ...TASK, status: "Pending" };
    restoreTaskSnapshot.mockResolvedValue(restored);
    const [plan] = planUndo(editTask({}, { status: "Completed", completed_at: "2026-11-16T14:31:00Z", completed_by: "nurse-me" }, ["status"]));
    await expect(executeUndoSteps(plan, FACILITY)).resolves.toBe(restored);
    expect(restoreTaskSnapshot).toHaveBeenCalledWith({ facilityId: FACILITY, taskId: "task-1", expectedStatus: "Completed", restore: { status: "Pending", completed_at: null, completed_by: null } });
    expect(updateTask).not.toHaveBeenCalled();
  });

  it("restores other fields through the existing updateTask, never the status restore", async () => {
    updateTask.mockResolvedValue(TASK);
    const [plan] = planUndo(editTask({}, { priority: "Stat" }, ["priority"]));
    await executeUndoSteps(plan, FACILITY);
    expect(updateTask).toHaveBeenCalledWith("task-1", { priority: "Routine" }, null, FACILITY);
    expect(restoreTaskSnapshot).not.toHaveBeenCalled();
  });

  it("deletes a created task through the existing delete path, scoped to the facility", async () => {
    const [plan] = planUndo({ kind: "createTasks", tasks: [TASK] });
    await expect(executeUndoSteps(plan, FACILITY)).resolves.toBeNull();
    expect(deleteTask).toHaveBeenCalledWith("task-1", FACILITY);
  });

  it("restores a patient through the existing updatePatient, scoped to the facility", async () => {
    const before = { id: "patient-2", diagnosis: null, code_status: "Full Code", allergies: null, admission_date: null, location_label: null, age: null };
    updatePatient.mockResolvedValue(before);
    const [plan] = planUndo({ kind: "editPatient", before, after: { ...before, code_status: "DNR" }, columns: ["code_status"] });
    await executeUndoSteps(plan, FACILITY);
    expect(updatePatient).toHaveBeenCalledWith("patient-2", expect.objectContaining({ codeStatus: "Full Code" }), FACILITY);
  });

  it("passes a first-step failure through untouched: nothing was restored", async () => {
    const stale = Object.assign(new Error("RESTORE_STALE"), { code: "RESTORE_STALE" });
    restoreTaskSnapshot.mockRejectedValue(stale);
    const [plan] = planUndo(editTask({}, { status: "Completed", priority: "Stat" }, ["priority", "status"]));
    await expect(executeUndoSteps(plan, FACILITY)).rejects.toBe(stale);
    expect(updateTask).not.toHaveBeenCalled();
  });

  it("says exactly what was and was not restored when the second step fails", async () => {
    const afterStatus = { ...TASK, priority: "Stat" };
    restoreTaskSnapshot.mockResolvedValue(afterStatus);
    updateTask.mockRejectedValue(new Error("network"));
    const [plan] = planUndo(editTask({}, { status: "Completed", priority: "Stat" }, ["priority", "status"]));
    await expect(executeUndoSteps(plan, FACILITY)).rejects.toMatchObject({ code: "UNDO_PARTIAL", restored: ["status"], missing: ["priority"], row: afterStatus });
  });
});

describe("restoreTaskSnapshot is reachable from the undo path only", () => {
  function sourceFiles(dir) {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return sourceFiles(path);
      return /\.(js|jsx)$/.test(name) ? [path] : [];
    });
  }

  it("is named in its own file and in utils/voiceUndo.js, and in no other source file", () => {
    // apps/web/src, from this file's own location (src/utils).
    const src = join(dirname(fileURLToPath(import.meta.url)), "..");
    const mentions = sourceFiles(src)
      .filter((file) => !/\.test\.jsx?$/.test(file))
      .filter((file) => /taskRestore|restoreTaskSnapshot/.test(readFileSync(file, "utf8")))
      .map((file) => file.slice(join(src, "x").length - 1));
    expect(mentions.sort()).toEqual(["lib/taskRestore.js", "utils/voiceUndo.js"]);
  });
});

describe("undoing a note edit", () => {
  const before = { id: "note-1", facility_id: FACILITY, patient_id: "patient-2", nurse_id: "nurse-me", content: "Patient refused breakfast." };
  const after = { ...before, content: "Patient refused breakfast. Family called." };

  it("puts the previous text back, and nothing else", () => {
    const [plan] = planUndo({ kind: "editNote", noteId: "note-1", before, after, columns: ["content"] });
    expect(plan).toEqual({ recordType: "note", recordId: "note-1", expected: after, steps: [{ type: "updateNote", columns: ["content"], content: "Patient refused breakfast." }] });
    expect(canUndo({ kind: "editNote", before, after })).toBe(true);
    expect(canUndo({ kind: "editNote", before: null, after })).toBe(false);
  });

  it("writes through updateNote, scoped to the facility", async () => {
    updateNote.mockResolvedValue(before);
    const [plan] = planUndo({ kind: "editNote", before, after, columns: ["content"] });
    await expect(executeUndoSteps(plan, FACILITY)).resolves.toEqual(before);
    expect(updateNote).toHaveBeenCalledWith("note-1", "Patient refused breakfast.", FACILITY);
  });
});
