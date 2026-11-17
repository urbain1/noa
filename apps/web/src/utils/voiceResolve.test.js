import { describe, expect, it } from "vitest";
import { findDependencies, matchNurse, resolvePatient, resolveTask } from "./voiceResolve";

// Synthetic fixtures only.
const FACILITY = "facility-1";
const patient = (n, extra = {}) => ({ id: `p${n}`, label: `Patient_Test_${n}`, location_label: null, facility_id: FACILITY, tasks: [], ...extra });
const ROSTER = [patient(1, { location_label: "Test Room A" }), patient(2, { location_label: "Test Room B" }), patient(3), patient(12), patient(13)];
const ref = (label, spoken = null) => ({ patient: { label, spoken } });

describe("resolvePatient", () => {
  it("binds an exact label", () => {
    expect(resolvePatient(ref("Patient_Test_3"), ROSTER)).toEqual({ patientId: "p3", candidateIds: [] });
    expect(resolvePatient(ref("Patient_Test_12"), ROSTER)).toEqual({ patientId: "p12", candidateIds: [] });
  });

  it("never binds a label that does not exist, and suggests nobody", () => {
    expect(resolvePatient(ref("Patient_Test_9"), ROSTER)).toEqual({ patientId: null, candidateIds: [] });
    // 1 must not resolve to 12 or 13, nor 2 to 12.
    expect(resolvePatient(ref("Patient_Test_1"), [patient(12), patient(13)])).toEqual({ patientId: null, candidateIds: [] });
    expect(resolvePatient(ref("Patient_Test_2"), [patient(12)])).toEqual({ patientId: null, candidateIds: [] });
  });

  it("does not pre-select the only patient in the facility for another number", () => {
    // The old capture would have accepted this sole partial match.
    expect(resolvePatient(ref("Patient_Test_7"), [patient(1)])).toEqual({ patientId: null, candidateIds: [] });
    expect(resolvePatient(ref(null, "patient 7"), [patient(1)]).patientId).toBeNull();
  });

  it("does not bind when two records carry the same label", () => {
    const twins = [patient(3), { ...patient(3), id: "p3-bis" }];
    expect(resolvePatient(ref("Patient_Test_3"), twins)).toEqual({ patientId: null, candidateIds: ["p3", "p3-bis"] });
  });

  it("uses the spoken words only when no label was given", () => {
    expect(resolvePatient(ref(null, "patient test 2"), ROSTER).patientId).toBe("p2");
    expect(resolvePatient(ref(null, "patient 12"), ROSTER).patientId).toBe("p12");
  });

  it("never binds from a location alone or from nothing", () => {
    expect(resolvePatient(ref(null, "Test Room B"), ROSTER).patientId).toBeNull();
    expect(resolvePatient(ref(null, null), ROSTER)).toEqual({ patientId: null, candidateIds: [] });
    expect(resolvePatient({}, ROSTER)).toEqual({ patientId: null, candidateIds: [] });
    expect(resolvePatient(ref("Patient_Test_1"), [])).toEqual({ patientId: null, candidateIds: [] });
  });
});

describe("resolveTask", () => {
  const task = (id, extra = {}) => ({ id, patient_id: "p3", facility_id: FACILITY, description: "Complete Blood Count", ...extra });
  const p3 = patient(3, { tasks: [task("t1"), task("t2")] });

  it("accepts a task of the resolved patient at this facility", () => {
    expect(resolveTask({ task_id: "t1" }, p3, FACILITY)).toBe(p3.tasks[0]);
  });

  it("returns nothing for no id, an unknown id, or a task of another patient", () => {
    expect(resolveTask({ task_id: null }, p3, FACILITY)).toBeNull();
    expect(resolveTask({ task_id: "t9" }, p3, FACILITY)).toBeNull();
    expect(resolveTask({ task_id: "t1" }, patient(4), FACILITY)).toBeNull();
    const misfiled = patient(3, { tasks: [task("t1", { patient_id: "p4" })] });
    expect(resolveTask({ task_id: "t1" }, misfiled, FACILITY)).toBeNull();
  });

  it("returns nothing across facilities", () => {
    expect(resolveTask({ task_id: "t1" }, p3, "facility-2")).toBeNull();
    const foreignTask = patient(3, { tasks: [task("t1", { facility_id: "facility-2" })] });
    expect(resolveTask({ task_id: "t1" }, foreignTask, FACILITY)).toBeNull();
    expect(resolveTask({ task_id: "t1" }, p3, null)).toBeNull();
  });
});

describe("matchNurse", () => {
  const NURSES = [
    { id: "n1", name: "Amara Vale" },
    { id: "n2", name: "Dana Quill" },
    { id: "n3", name: "Dana Frost" },
    { id: "n4", name: "Élodie Fontaine" },
    { id: "n5", name: null, email: "nobody@example.invalid" },
  ];

  it("matches a full name or a unique name part, ignoring case and accents", () => {
    expect(matchNurse("Amara Vale", NURSES)).toEqual({ nurseId: "n1", matches: 1 });
    expect(matchNurse("amara", NURSES)).toEqual({ nurseId: "n1", matches: 1 });
    expect(matchNurse("Vale", NURSES).nurseId).toBe("n1");
    expect(matchNurse("elodie", NURSES).nurseId).toBe("n4");
    expect(matchNurse("ÉLODIE FONTAINE", NURSES).nurseId).toBe("n4");
    expect(matchNurse("Dana Frost", NURSES).nurseId).toBe("n3");
  });

  it("refuses a name two nurses share", () => {
    expect(matchNurse("Dana", NURSES)).toEqual({ nurseId: null, matches: 2 });
  });

  it("does no fuzzy matching", () => {
    expect(matchNurse("Amar", NURSES).nurseId).toBeNull();
    expect(matchNurse("Amira", NURSES).nurseId).toBeNull();
    expect(matchNurse("Emily Fontaine", NURSES).nurseId).toBeNull();
    expect(matchNurse("", NURSES)).toEqual({ nurseId: null, matches: 0 });
    expect(matchNurse("nobody", NURSES).nurseId).toBeNull();
  });
});

describe("findDependencies", () => {
  const act = (type, label) => ({ type, patient: { label, spoken: null } });

  it("links an action to the creation of its patient earlier in the same utterance", () => {
    const actions = [act("create_patient", "Patient_Test_6"), act("create_task", "Patient_Test_6"), act("create_note", "Patient_Test_2")];
    const resolved = [{ patientId: null }, { patientId: null }, { patientId: "p2" }];
    expect(findDependencies(actions, resolved)).toEqual([null, 0, null]);
  });

  it("does not link to a later creation, another label, or when the patient already exists", () => {
    expect(findDependencies([act("create_task", "Patient_Test_6"), act("create_patient", "Patient_Test_6")], [{ patientId: null }, { patientId: null }])).toEqual([null, null]);
    expect(findDependencies([act("create_patient", "Patient_Test_6"), act("create_task", "Patient_Test_7")], [{ patientId: null }, { patientId: null }])).toEqual([null, null]);
    expect(findDependencies([act("create_patient", "Patient_Test_2"), act("create_task", "Patient_Test_2")], [{ patientId: null }, { patientId: "p2" }])).toEqual([null, null]);
    expect(findDependencies([act("create_patient", null), act("create_task", null)], [{ patientId: null }, { patientId: null }])).toEqual([null, null]);
  });
});
