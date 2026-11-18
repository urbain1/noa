import { beforeEach, describe, expect, it, vi } from "vitest";

// The note writes and reads in lib/patients.js, against a recording
// Supabase stand-in. Synthetic values only.
const db = vi.hoisted(() => ({ calls: [], response: { data: null, error: null } }));
vi.mock("./supabase", () => {
  const builder = {
    update(values) {
      db.calls.push(["update", values]);
      return builder;
    },
    select(columns) {
      db.calls.push(["select", columns]);
      return builder;
    },
    eq(column, value) {
      db.calls.push(["eq", column, value]);
      return builder;
    },
    single: async () => db.response,
    maybeSingle: async () => db.response,
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

import { fetchNoteRow, updateNote } from "./patients";

const ROW = { id: "note-1", facility_id: "facility-1", patient_id: "patient-2", nurse_id: "nurse-me", content: "Patient refused lunch.", type: "clinical" };
const filters = () => db.calls.filter((c) => c[0] === "eq").map(([, column, value]) => [column, value]);

beforeEach(() => {
  db.calls.length = 0;
  db.response = { data: ROW, error: null };
});

describe("updateNote", () => {
  it("writes the text and nothing else, filtered by note id and facility", async () => {
    await expect(updateNote("note-1", "  Patient refused lunch.  ", "facility-1")).resolves.toEqual(ROW);
    expect(db.calls[0]).toEqual(["from", "notes"]);
    expect(db.calls[1]).toEqual(["update", { content: "Patient refused lunch." }]);
    expect(filters()).toEqual([
      ["id", "note-1"],
      ["facility_id", "facility-1"],
    ]);
  });

  it("refuses without a facility id or a note id, before touching the database", async () => {
    await expect(updateNote("note-1", "text", null)).rejects.toThrow(/facility/);
    await expect(updateNote(null, "text", "facility-1")).rejects.toThrow(/note id/);
    expect(db.calls).toEqual([]);
  });

  it("refuses an empty note", async () => {
    await expect(updateNote("note-1", "   ", "facility-1")).rejects.toThrow(/empty/);
    expect(db.calls).toEqual([]);
  });

  it("passes a database error through", async () => {
    db.response = { data: null, error: new Error("denied") };
    await expect(updateNote("note-1", "text", "facility-1")).rejects.toThrow("denied");
  });
});

describe("fetchNoteRow", () => {
  it("reads one note, filtered by facility", async () => {
    await expect(fetchNoteRow("facility-1", "note-1")).resolves.toEqual(ROW);
    expect(db.calls[0]).toEqual(["from", "notes"]);
    expect(filters()).toEqual([
      ["id", "note-1"],
      ["facility_id", "facility-1"],
    ]);
  });
});
