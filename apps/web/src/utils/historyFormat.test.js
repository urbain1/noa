import { describe, expect, it } from "vitest";
import i18n from "../i18n";
import { actorName, columnLabels, formatHistoryEntry, formatHistoryTime } from "./historyFormat";

// Synthetic fixtures only: Patient_Test_N labels, invented nurse names,
// placeholder ids and emails.
const NURSES = [
  { id: "nurse-1", name: "Nurse Amara Test", email: "amara.test@example.invalid" },
  { id: "nurse-2", name: "", email: "bo.test@example.invalid" },
];
const NOW = new Date("2026-11-16T18:00:00Z");

function row(overrides) {
  return {
    id: "audit-1",
    nurse_id: "nurse-1",
    action: "update",
    resource_type: "task",
    resource_id: "task-1",
    patient_id: "patient-1",
    details: { columns: [], events: [] },
    created_at: "2026-11-16T14:02:00Z",
    ...overrides,
  };
}

function format(lang, r, ctx = {}) {
  return formatHistoryEntry(r, {
    t: i18n.getFixedT(lang),
    language: lang,
    nurses: NURSES,
    tasksById: new Map(),
    notesById: new Map(),
    now: NOW,
    ...ctx,
  });
}

describe("formatHistoryEntry: what happened, who, when", () => {
  const cases = [
    {
      name: "patient created",
      row: row({ action: "create", resource_type: "patient", resource_id: "patient-1" }),
      en: "Patient created by Nurse Amara Test",
      fr: "Patient créé par Nurse Amara Test",
    },
    {
      name: "task created",
      row: row({ action: "create" }),
      en: "Task created by Nurse Amara Test",
      fr: "Tâche créée par Nurse Amara Test",
    },
    {
      name: "task completed",
      row: row({ details: { columns: ["completed_at", "completed_by", "status"], events: ["completed"] } }),
      en: "Task completed by Nurse Amara Test",
      fr: "Tâche terminée par Nurse Amara Test",
    },
    {
      name: "task reopened",
      row: row({ details: { columns: ["completed_at", "completed_by", "status"], events: ["reopened"] } }),
      en: "Task reopened by Nurse Amara Test",
      fr: "Tâche rouverte par Nurse Amara Test",
    },
    {
      name: "task cancelled",
      row: row({ details: { columns: ["status"], events: ["cancelled"] } }),
      en: "Task cancelled by Nurse Amara Test",
      fr: "Tâche annulée par Nurse Amara Test",
    },
    {
      name: "task assigned",
      row: row({ details: { columns: ["assigned_to"], events: ["assigned"] } }),
      en: "Task assigned by Nurse Amara Test",
      fr: "Tâche attribuée par Nurse Amara Test",
    },
    {
      name: "task unassigned",
      row: row({ details: { columns: ["assigned_to"], events: ["unassigned"] } }),
      en: "Task unassigned by Nurse Amara Test",
      fr: "Attribution de la tâche retirée par Nurse Amara Test",
    },
    {
      name: "task modified, columns as readable labels",
      row: row({ details: { columns: ["deadline", "priority"], events: [] } }),
      en: "Task modified by Nurse Amara Test (deadline, priority)",
      fr: "Tâche modifiée par Nurse Amara Test (échéance, priorité)",
    },
    {
      name: "event plus other changed columns",
      row: row({
        details: { columns: ["assigned_to", "completed_at", "completed_by", "status"], events: ["completed", "assigned"] },
      }),
      en: "Task completed by Nurse Amara Test (also changed: assignee)",
      fr: "Tâche terminée par Nurse Amara Test (également modifié : attribution)",
    },
    {
      name: "task deleted",
      row: row({ action: "delete" }),
      en: "Task deleted by Nurse Amara Test",
      fr: "Tâche supprimée par Nurse Amara Test",
    },
    {
      name: "patient modified",
      row: row({ resource_type: "patient", resource_id: "patient-1", details: { columns: ["age", "code_status"], events: [] } }),
      en: "Patient modified by Nurse Amara Test (age, code status)",
      fr: "Patient modifié par Nurse Amara Test (âge, directives de réanimation)",
    },
    {
      name: "patient discharged",
      row: row({
        resource_type: "patient",
        resource_id: "patient-1",
        details: { columns: ["discharged_at", "is_discharged"], events: ["discharged"] },
      }),
      en: "Patient discharged by Nurse Amara Test",
      fr: "Sortie du patient enregistrée par Nurse Amara Test",
    },
    {
      name: "note added",
      row: row({ action: "create", resource_type: "note", resource_id: "note-1" }),
      en: "Note added by Nurse Amara Test",
      fr: "Note ajoutée par Nurse Amara Test",
    },
    {
      name: "note deleted",
      row: row({ action: "delete", resource_type: "note", resource_id: "note-1" }),
      en: "Note deleted by Nurse Amara Test",
      fr: "Note supprimée par Nurse Amara Test",
    },
  ];

  for (const c of cases) {
    it(`${c.name} (en)`, () => {
      expect(format("en", c.row).text).toBe(c.en);
    });
    it(`${c.name} (fr)`, () => {
      expect(format("fr", c.row).text).toBe(c.fr);
    });
  }
});

describe("actors", () => {
  it("a null nurse_id is a system write", () => {
    expect(format("en", row({ nurse_id: null, action: "create" })).text).toBe("Task created by the system");
    expect(format("fr", row({ nurse_id: null, action: "create" })).text).toBe("Tâche créée par le système");
  });

  it("a flagged unresolved actor is an unknown user, not the system", () => {
    const r = row({ nurse_id: null, action: "create", details: { columns: [], events: [], actor_unresolved: true } });
    expect(format("en", r).text).toBe("Task created by an unknown user");
    expect(format("fr", r).text).toBe("Tâche créée par un utilisateur inconnu");
  });

  it("a nurse id that isn't in the facility list is unknown, never shown as an id", () => {
    const r = row({ nurse_id: "nurse-from-elsewhere", action: "create" });
    expect(format("en", r).text).toBe("Task created by an unknown user");
    expect(format("en", r).text).not.toContain("nurse-from-elsewhere");
  });

  it("falls back to email when a nurse has no display name", () => {
    expect(actorName(i18n.getFixedT("en"), row({ nurse_id: "nurse-2" }), NURSES)).toBe("bo.test@example.invalid");
  });
});

describe("subject: current text of records that still exist, generic otherwise", () => {
  it("names a task that still exists by its current description", () => {
    const tasksById = new Map([["task-1", { id: "task-1", description: "Draw blood cultures before antibiotics" }]]);
    const entry = format("en", row({ details: { columns: ["priority"], events: [] } }), { tasksById });
    expect(entry.subject).toBe("Draw blood cultures before antibiotics");
  });

  it("leaves a deleted task generic (no subject)", () => {
    const entry = format("en", row({ action: "delete", resource_id: "task-gone" }));
    expect(entry.text).toBe("Task deleted by Nurse Amara Test");
    expect(entry.subject).toBeNull();
  });

  it("truncates a long note", () => {
    const content = "Mobilised to chair with assistance of one, tolerated well, no dizziness reported, plan to repeat after lunch.";
    const notesById = new Map([["note-1", { id: "note-1", content }]]);
    const entry = format("en", row({ action: "create", resource_type: "note", resource_id: "note-1" }), { notesById });
    expect(entry.subject.endsWith("...")).toBe(true);
    expect(entry.subject.length).toBeLessThanOrEqual(83);
  });

  it("never reads text out of the log row itself", () => {
    // Even if a log row somehow carried a value, it is not shown.
    const r = row({ details: { columns: ["description"], events: [], description: "SHOULD_NOT_APPEAR" } });
    const entry = format("en", r);
    expect(entry.text).not.toContain("SHOULD_NOT_APPEAR");
    expect(entry.subject).toBeNull();
  });
});

describe("column labels", () => {
  it("dedupes columns that share a label", () => {
    expect(columnLabels(i18n.getFixedT("en"), "task", ["completed_at", "completed_by"])).toEqual(["completion"]);
  });

  it("shows an unknown column as a generic label, never its raw name", () => {
    const labels = columnLabels(i18n.getFixedT("fr"), "task", ["some_future_column"]);
    expect(labels).toEqual(["un autre champ"]);
  });

  it("an update with no named columns still reads as modified", () => {
    expect(format("en", row({ details: { columns: [], events: [] } })).text).toBe("Task modified by Nurse Amara Test");
  });

  it("an unknown resource type gets a generic line", () => {
    expect(format("en", row({ resource_type: "alert" })).text).toBe("Record changed by Nurse Amara Test");
  });

  it("no combination renders a raw translation key, in either language", () => {
    const types = ["patient", "task", "note"];
    const actions = ["create", "update", "delete"];
    const events = [[], ["completed"], ["reopened"], ["cancelled"], ["assigned"], ["unassigned"], ["discharged"]];
    const columns = ["status", "label", "diagnosis", "content", "deadline", "unknown_col"];
    for (const lang of ["en", "fr"]) {
      for (const resource_type of types) {
        for (const action of actions) {
          for (const ev of events) {
            const entry = format(lang, row({ resource_type, action, details: { columns, events: ev } }));
            expect(entry.text).not.toMatch(/history\./);
          }
        }
      }
    }
  });
});

describe("time", () => {
  it("formats in the nurse's language", () => {
    expect(formatHistoryTime("2026-11-16T14:02:00Z", "en", NOW)).toBe("Nov 16, 2:02 PM");
    expect(formatHistoryTime("2026-11-16T14:02:00Z", "fr", NOW)).toBe("16 nov., 14:02");
  });

  it("adds the year when it isn't the current one", () => {
    expect(formatHistoryTime("2025-03-02T09:05:00Z", "en", NOW)).toContain("2025");
  });
});
