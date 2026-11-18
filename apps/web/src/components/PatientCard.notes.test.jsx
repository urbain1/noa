import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import PatientCard from "./PatientCard";
import { EditLockContext } from "../hooks/editLockContext";
import { createLockStore, lockKey } from "../utils/editLock";

// Synthetic fixtures only.
const ME = "nurse-me";
const NURSES = [
  { id: ME, name: "Nurse Me Test" },
  { id: "nurse-amara", name: "Nurse Amara Test" },
];
const NOTES = [
  { id: "note-mine", patient_id: "patient-2", nurse_id: ME, content: "Patient refused breakfast.", created_at: "2026-11-18T08:00:00Z" },
  { id: "note-amara", patient_id: "patient-2", nurse_id: "nurse-amara", content: "Daughter visited.", created_at: "2026-11-18T09:00:00Z" },
];
const PATIENT = { id: "patient-2", facility_id: "facility-1", label: "Patient_Test_2", tasks: [], notes: NOTES, allergies: [], code_status: "Full Code" };

function renderCard(locks) {
  const store = createLockStore("tab-me");
  store.setTracker(vi.fn());
  store.set({ status: locks ? "joined" : "unavailable", ...(locks ? { locks } : {}) });
  const onEditNote = vi.fn();
  render(
    <EditLockContext.Provider value={{ store, nurses: NURSES, currentNurseId: ME }}>
      <PatientCard patient={PATIENT} onAddNote={vi.fn()} onEditNote={onEditNote} />
    </EditLockContext.Provider>
  );
  fireEvent.click(screen.getByRole("button", { name: /Notes \(2\)/ }));
  return { onEditNote };
}

const noteCardOf = (text) => screen.getByText(text).closest(".rounded-lg");

describe("PatientCard notes", () => {
  it("offers Edit on the nurse's own notes only", () => {
    const { onEditNote } = renderCard();
    expect(within(noteCardOf("Daughter visited.")).queryByRole("button", { name: "Edit this note" })).not.toBeInTheDocument();
    fireEvent.click(within(noteCardOf("Patient refused breakfast.")).getByRole("button", { name: "Edit this note" }));
    expect(onEditNote).toHaveBeenCalledWith(PATIENT, NOTES[0]);
  });

  it("says when a colleague is editing a note", () => {
    const locks = new Map([[lockKey("note", "note-mine"), [{ key: "tab-amara", nurseId: "nurse-amara", recordType: "note", recordId: "note-mine", since: 1, gen: 0 }]]]);
    renderCard(locks);
    expect(within(noteCardOf("Patient refused breakfast.")).getByText(/Nurse Amara Test is currently editing this/)).toBeInTheDocument();
  });
});
