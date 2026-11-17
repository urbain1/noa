import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ calls: [], response: { data: [], error: null } }));
vi.mock("./supabase", () => {
  const builder = {
    update(values) {
      db.calls.push(["update", values]);
      return builder;
    },
    eq(column, value) {
      db.calls.push(["eq", column, value]);
      return builder;
    },
    select: async () => db.response,
  };
  return {
    supabase: {
      from(table) {
        db.calls.push(["from", table]);
        return builder;
      },
    },
  };
});

import { restoreTaskSnapshot } from "./taskRestore";

const RESTORE = { status: "Completed", completed_at: "2026-11-16T09:12:00.000Z", completed_by: "nurse-amara" };
const ARGS = { facilityId: "facility-1", taskId: "task-1", expectedStatus: "Pending", restore: RESTORE };
const ROW = { id: "task-1", facility_id: "facility-1", ...RESTORE };

beforeEach(() => {
  db.calls.length = 0;
  db.response = { data: [ROW], error: null };
});

describe("restoreTaskSnapshot", () => {
  it("writes exactly status, completed_at and completed_by", async () => {
    await expect(restoreTaskSnapshot(ARGS)).resolves.toEqual(ROW);
    expect(db.calls[0]).toEqual(["from", "tasks"]);
    expect(db.calls[1]).toEqual(["update", RESTORE]);
  });

  it("filters by task id, by facility, and by the status the voice command left", async () => {
    await restoreTaskSnapshot(ARGS);
    const filters = db.calls.filter((c) => c[0] === "eq").map(([, column, value]) => [column, value]);
    expect(filters).toEqual([
      ["id", "task-1"],
      ["facility_id", "facility-1"],
      ["status", "Pending"],
    ]);
  });

  it("restores an un-completion with empty completion fields", async () => {
    await restoreTaskSnapshot({ ...ARGS, expectedStatus: "Completed", restore: { status: "Pending", completed_at: null, completed_by: null } });
    expect(db.calls[1]).toEqual(["update", { status: "Pending", completed_at: null, completed_by: null }]);
  });

  it.each([
    ["an extra column", { ...RESTORE, priority: "Stat" }],
    ["another column instead", { status: "Completed", completed_at: null, assigned_to: "nurse-bo" }],
    ["a missing column", { status: "Completed", completed_at: null }],
    ["only a status", { status: "Completed" }],
    ["no status value", { status: "", completed_at: null, completed_by: null }],
    ["nothing", {}],
    ["not an object", null],
  ])("refuses %s, and writes nothing", async (_name, restore) => {
    await expect(restoreTaskSnapshot({ ...ARGS, restore })).rejects.toMatchObject({ code: "RESTORE_BAD_COLUMNS" });
    expect(db.calls).toEqual([]);
  });

  it.each([
    ["no facility id", { facilityId: null }],
    ["no task id", { taskId: "" }],
    ["no expected status", { expectedStatus: undefined }],
  ])("refuses %s, and writes nothing", async (_name, override) => {
    await expect(restoreTaskSnapshot({ ...ARGS, ...override })).rejects.toMatchObject({ code: "RESTORE_BAD_ARGS" });
    expect(db.calls).toEqual([]);
  });

  it("refuses with no arguments at all", async () => {
    await expect(restoreTaskSnapshot()).rejects.toMatchObject({ code: "RESTORE_BAD_ARGS" });
  });

  it("reports a task whose status changed in the meantime, or that is gone, as stale", async () => {
    db.response = { data: [], error: null };
    await expect(restoreTaskSnapshot(ARGS)).rejects.toMatchObject({ code: "RESTORE_STALE" });
    db.response = { data: null, error: null };
    await expect(restoreTaskSnapshot(ARGS)).rejects.toMatchObject({ code: "RESTORE_STALE" });
  });

  it("passes a database error through", async () => {
    const error = { code: "42501", message: "permission denied for table tasks" };
    db.response = { data: null, error };
    await expect(restoreTaskSnapshot(ARGS)).rejects.toBe(error);
  });
});
