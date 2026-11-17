import { describe, expect, it } from "vitest";
import i18n from "../i18n";
import * as server from "../../../../supabase/functions/claude-proxy/voiceCommand.mjs";
import {
  VOICE_ACTIONS,
  VOICE_CODE_STATUSES,
  VOICE_DEPARTMENTS,
  VOICE_MAX_ACTIONS,
  VOICE_PRIORITIES,
  VOICE_TASK_STATUSES,
  VOICE_TRANSCRIPT_MAX,
  VOICE_UNSUPPORTED_REASONS,
  describeAction,
  dischargeDraft,
  needsPatient,
  needsTask,
  patientDraft,
  patientProposal,
  resolveAssignee,
  sanitiseVoiceResult,
  taskDraft,
  taskProposal,
} from "./voiceRegistry";
import { toLocalDatetimeValue } from "./datetimeLocal";

const NURSES = [
  { id: "n1", name: "Amara Vale" },
  { id: "n2", name: "Dana Quill" },
  { id: "n3", name: "Dana Frost" },
];
const t = i18n.t.bind(i18n);

describe("client and server registries stay in step", () => {
  it("lists the same action types", () => {
    expect(Object.keys(VOICE_ACTIONS).sort()).toEqual([...server.ACTION_TYPES].sort());
  });

  it("uses the same allowed values and limits", () => {
    expect(VOICE_PRIORITIES).toEqual(server.PRIORITIES);
    expect(VOICE_TASK_STATUSES).toEqual(server.VOICE_TASK_STATUSES);
    expect(VOICE_DEPARTMENTS).toEqual(server.DEPARTMENTS);
    expect(VOICE_CODE_STATUSES).toEqual(server.CODE_STATUSES);
    expect(VOICE_UNSUPPORTED_REASONS).toEqual(server.UNSUPPORTED_REASONS);
    expect(VOICE_MAX_ACTIONS).toBe(server.MAX_ACTIONS);
    expect(VOICE_TRANSCRIPT_MAX).toBe(server.CAPS.transcriptChars);
  });

  it("agrees on which actions need a patient or a task", () => {
    for (const [type, spec] of Object.entries(server.ACTION_REGISTRY)) {
      expect(needsTask({ type })).toBe(spec.task);
      if (spec.patient === "ref") expect(needsPatient({ type, fields: {} })).toBe(true);
      if (spec.patient === "new" || spec.patient === "none") expect(needsPatient({ type, fields: {} })).toBe(false);
    }
    expect(needsPatient({ type: "open_handoff", fields: { scope: "patient" } })).toBe(true);
    expect(needsPatient({ type: "open_handoff", fields: { scope: "unit" } })).toBe(false);
  });

  it("offers undo only where a delete or restore path exists", () => {
    expect(VOICE_ACTIONS.create_note.undo).toBeNull();
    expect(VOICE_ACTIONS.create_patient.undo).toBeNull();
    expect(VOICE_ACTIONS.create_task.undo).toBe("deleteTasks");
    expect(VOICE_ACTIONS.edit_task.undo).toBe("restoreTask");
  });
});

describe("sanitiseVoiceResult", () => {
  const act = (overrides) => ({ type: "edit_task", words: "w", confidence: "high", patient: { spoken: "patient 3", label: "Patient_Test_3" }, task_id: "task-uuid", fields: { priority: "Stat" }, ...overrides });

  it("passes a valid answer through", () => {
    const out = sanitiseVoiceResult({ ok: true, actions: [act()], dropped: [], unparsed: [], context_truncated: false });
    expect(out.actions).toEqual([act({ task_spoken: null })]);
    expect(out).toMatchObject({ dropped: [], unparsed: [], contextTruncated: false });
  });

  it("turns a type this build does not know into 'not available'", () => {
    const out = sanitiseVoiceResult({ actions: [act({ type: "discharge_patient" })] });
    expect(out.actions[0]).toMatchObject({ type: "unsupported", reason: "other", task_id: null, fields: {} });
  });

  it("drops enum values outside the lists and labels that are not Patient_Test_N", () => {
    const out = sanitiseVoiceResult({ actions: [act({ patient: { spoken: "x", label: "Room 208" }, fields: { priority: "Urgent", status: "Completed", department: "Cardiology" } })] });
    expect(out.actions[0].patient.label).toBeNull();
    expect(out.actions[0].fields).toEqual({ status: "Completed" });
  });

  it("keeps a task id only on an action type that has a task", () => {
    expect(sanitiseVoiceResult({ actions: [act({ type: "create_note", fields: { text: "x" } })] }).actions[0].task_id).toBeNull();
  });

  it("never keeps more than five actions", () => {
    const seven = Array.from({ length: 7 }, (_, i) => act({ words: `w${i}` }));
    const out = sanitiseVoiceResult({ actions: seven, dropped: [{ type: "create_note", words: "earlier" }] });
    expect(out.actions).toHaveLength(5);
    expect(out.dropped.map((d) => d.words)).toEqual(["w5", "w6", "earlier"]);
  });

  it("survives garbage", () => {
    for (const raw of [null, undefined, "x", { actions: [null, 3] }]) {
      expect(sanitiseVoiceResult(raw)).toEqual({ actions: [], dropped: [], unparsed: [], contextTruncated: false });
    }
  });
});

describe("pre-fill", () => {
  it("drafts a patient from only what was said", () => {
    expect(patientDraft({ patient: { label: "Patient_Test_6" }, fields: { age: 68, allergies: ["latex"] } })).toEqual({
      label: "Patient_Test_6",
      age: 68,
      diagnosis: "",
      codeStatus: undefined,
      attendingPhysician: "",
      allergies: ["latex"],
      admissionDate: "",
      locationLabel: "",
    });
    expect(patientDraft({ patient: { label: null }, fields: {} }).label).toBe("");
  });

  it("lays an allergy change over the patient's current list", () => {
    const propose = patientProposal({ fields: { allergies_add: ["Latex", "iodine"], allergies_remove: ["penicillin"] } });
    expect(propose({ allergies: ["Penicillin", "latex"] })).toEqual({ allergiesInput: "latex, iodine" });
    expect(propose({ allergies: null })).toEqual({ allergiesInput: "Latex, iodine" });
  });

  it("proposes only the patient fields that were said", () => {
    expect(patientProposal({ fields: { code_status: "Comfort Care", age: 71 } })({})).toEqual({ codeStatus: "Comfort Care", age: "71" });
    expect(patientProposal({ fields: {} })({ allergies: ["latex"] })).toEqual({});
  });

  it("resolves an assignee only on a unique match", () => {
    expect(resolveAssignee({ assignee: "Amara" }, NURSES, "me")).toEqual({ set: true, nurseId: "n1", heard: null });
    expect(resolveAssignee({ assignee: "Dana" }, NURSES, "me")).toEqual({ set: false, nurseId: null, heard: "Dana" });
    expect(resolveAssignee({ assignee: "Nobody Known" }, NURSES, "me")).toEqual({ set: false, nurseId: null, heard: "Nobody Known" });
    expect(resolveAssignee({ assign_to_self: true }, NURSES, "me")).toEqual({ set: true, nurseId: "me", heard: null });
    expect(resolveAssignee({ unassign: true }, NURSES, "me")).toEqual({ set: true, nurseId: null, heard: null });
    expect(resolveAssignee({}, NURSES, "me")).toEqual({ set: false, nurseId: null, heard: null });
  });

  it("proposes task changes in the shape the edit dialog holds", () => {
    const deadline = "2026-11-17T09:00:00.000Z";
    const { apply, assigneeHeard } = taskProposal({ fields: { priority: "Stat", deadline, assignee: "Amara" } }, NURSES, "me");
    expect(apply({})).toEqual({ priority: "Stat", deadline: toLocalDatetimeValue(deadline), assigned_to: "n1" });
    expect(assigneeHeard).toBeNull();
  });

  it("clears a deadline, unassigns, and leaves an unmatched name for the nurse", () => {
    expect(taskProposal({ fields: { deadline: null, unassign: true } }, NURSES, "me").apply({})).toEqual({ deadline: "", assigned_to: null });
    const unmatched = taskProposal({ fields: { status: "Completed", assignee: "Dana" } }, NURSES, "me");
    expect(unmatched.apply({})).toEqual({ status: "Completed" });
    expect(unmatched.assigneeHeard).toBe("Dana");
  });

  it("drafts a new task with the app's defaults for what was not said", () => {
    expect(taskDraft({ fields: { description: "Chest X-ray" } }, NURSES, "me")).toEqual({
      description: "Chest X-ray",
      department: "Other",
      priority: "Routine",
      deadline: null,
      assigneeId: null,
      assigneeHeard: null,
    });
    expect(taskDraft({ fields: { description: "x", assign_to_self: true, priority: "Stat" } }, NURSES, "me")).toMatchObject({ assigneeId: "me", priority: "Stat" });
  });

  it("drafts discharge planning", () => {
    expect(dischargeDraft({ fields: { needs_nursing_home: true, notes: "Daughter informed" } })).toEqual({ needsNursingHome: true, notes: "Daughter informed" });
    expect(dischargeDraft({ fields: {} })).toEqual({ needsNursingHome: false, notes: "" });
  });
});

describe("describeAction", () => {
  const types = ["create_patient", "edit_patient", "create_task", "edit_task", "create_note", "start_discharge_planning", "open_handoff"];

  it.each(["en", "fr"])("has a translated line for every action type and reason (%s)", async (lang) => {
    await i18n.changeLanguage(lang);
    for (const type of types) {
      const line = describeAction(t, { type, patient: { label: "Patient_Test_3", spoken: "patient 3" }, task_spoken: "the CBC", fields: { priority: "Stat", scope: "unit", description: "Chest X-ray" } });
      expect(line).not.toMatch(/voiceQueue\./);
      expect(line.length).toBeGreaterThan(3);
    }
    for (const reason of VOICE_UNSUPPORTED_REASONS) {
      expect(describeAction(t, { type: "unsupported", reason, patient: {}, fields: {} })).not.toMatch(/voiceQueue\./);
    }
  });

  it("names the patient and the changed fields, once each", () => {
    const line = describeAction(t, { type: "edit_task", patient: { label: "Patient_Test_3" }, task_spoken: "the CBC", fields: { priority: "Stat", assignee: "Amara", unassign: true } });
    expect(line).toContain("Patient_Test_3");
    expect(line).toContain("the CBC");
    expect(line.match(/assignee/gi)).toHaveLength(1);
  });

  it("prefers the bound patient's label over what was heard", () => {
    const line = describeAction(t, { type: "create_note", patient: { label: null, spoken: "test room B" }, fields: {} }, { patientLabel: "Patient_Test_2" });
    expect(line).toContain("Patient_Test_2");
  });
});
