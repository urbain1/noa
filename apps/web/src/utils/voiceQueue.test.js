import { describe, expect, it } from "vitest";
import { ITEM_STATUS, countByStatus, createQueue, currentItem, isFinished, notDoneCount, queueReducer } from "./voiceQueue";

const entry = (type, extra = {}) => ({ action: { type, fields: {} }, ...extra });
const run = (queue, ...events) => events.reduce(queueReducer, queue);
const statuses = (queue) => queue.items.map((i) => i.status);

describe("voice queue", () => {
  it("starts on the first action and walks them in spoken order", () => {
    let q = createQueue([entry("create_note"), entry("edit_task"), entry("create_task")]);
    expect(currentItem(q).index).toBe(0);
    q = run(q, { type: "done", index: 0, applied: {} });
    expect(currentItem(q).index).toBe(1);
    q = run(q, { type: "skip", index: 1 });
    expect(currentItem(q).index).toBe(2);
    q = run(q, { type: "done", index: 2, applied: {} });
    expect(isFinished(q)).toBe(true);
    expect(statuses(q)).toEqual(["done", "skipped", "done"]);
  });

  it("skip moves to the next action and writes nothing", () => {
    const q = run(createQueue([entry("create_note"), entry("create_note")]), { type: "skip", index: 0 });
    expect(q.items[0]).toMatchObject({ status: ITEM_STATUS.SKIPPED, applied: null });
    expect(currentItem(q).index).toBe(1);
  });

  it("closing cancels everything not yet done and says how many", () => {
    let q = createQueue([entry("create_note"), entry("create_note"), entry("create_note"), entry("create_note")]);
    q = run(q, { type: "done", index: 0, applied: {} }, { type: "skip", index: 1 }, { type: "close" });
    expect(statuses(q)).toEqual(["done", "skipped", "cancelled", "cancelled"]);
    expect(isFinished(q)).toBe(true);
    expect(notDoneCount(q)).toBe(3);
    expect(countByStatus(q)).toMatchObject({ done: 1, skipped: 1, cancelled: 2 });
  });

  it("ignores events after closing", () => {
    const closed = run(createQueue([entry("create_note")]), { type: "close" });
    expect(run(closed, { type: "done", index: 0, applied: {} })).toBe(closed);
    expect(run(closed, { type: "close" })).toBe(closed);
  });

  it("binds a later action to the patient created earlier in the same utterance", () => {
    let q = createQueue([entry("create_patient"), entry("create_task", { dependsOn: 0 }), entry("create_note", { patientId: "existing" })]);
    expect(q.items[1].patientId).toBeNull();
    q = run(q, { type: "done", index: 0, applied: { patientId: "new-patient" } });
    expect(q.items[1].patientId).toBe("new-patient");
    expect(q.items[2].patientId).toBe("existing");
    expect(currentItem(q).index).toBe(1);
  });

  it("skips the dependent actions when the creation is skipped, and says why", () => {
    let q = createQueue([entry("create_patient"), entry("create_task", { dependsOn: 0 }), entry("create_note", { dependsOn: 0 }), entry("create_note", { patientId: "existing" })]);
    q = run(q, { type: "skip", index: 0 });
    expect(statuses(q)).toEqual(["skipped", "blocked", "blocked", "pending"]);
    expect(q.items[1].note).toBe("dependency");
    expect(currentItem(q).index).toBe(3);
  });

  it("blocks dependents when the queue reaches them after a failed creation", () => {
    let q = createQueue([entry("create_patient"), entry("create_task", { dependsOn: 0 })]);
    q = run(q, { type: "error", index: 0, message: "insert failed" });
    expect(currentItem(q).index).toBe(0); // the step stays open to retry
    q = run(q, { type: "skip", index: 0 });
    expect(statuses(q)).toEqual(["failed", "blocked"]);
  });

  it("keeps a failed write open, and clears the error if a retry succeeds", () => {
    let q = createQueue([entry("create_note")]);
    q = run(q, { type: "error", index: 0, message: "network" });
    expect(q.items[0]).toMatchObject({ status: "pending", error: "network" });
    q = run(q, { type: "done", index: 0, applied: { noteId: "n1" } });
    expect(q.items[0]).toMatchObject({ status: "done", error: null, applied: { noteId: "n1" } });
  });

  it("marks a read 'not available' step, without writing", () => {
    const q = run(createQueue([entry("unsupported"), entry("create_note")]), { type: "acknowledge", index: 0 });
    expect(statuses(q)).toEqual(["unavailable", "pending"]);
  });

  it("takes a picker choice, and drops a resolved task when the patient changes", () => {
    let q = createQueue([entry("edit_task", { patientId: "p1", taskId: "t1" })]);
    q = run(q, { type: "bind", index: 0, taskId: "t2" });
    expect(q.items[0]).toMatchObject({ patientId: "p1", taskId: "t2" });
    q = run(q, { type: "bind", index: 0, patientId: "p2" });
    expect(q.items[0]).toMatchObject({ patientId: "p2", taskId: null });
  });

  it("never changes an action that is already settled", () => {
    const q = run(createQueue([entry("create_note")]), { type: "done", index: 0, applied: { a: 1 } });
    expect(run(q, { type: "skip", index: 0 })).toBe(q);
    expect(run(q, { type: "done", index: 0, applied: { a: 2 } })).toBe(q);
    expect(run(q, { type: "bind", index: 0, patientId: "x" })).toBe(q);
  });

  it("is finished straight away when nothing was understood", () => {
    expect(isFinished(createQueue([]))).toBe(true);
  });
});
