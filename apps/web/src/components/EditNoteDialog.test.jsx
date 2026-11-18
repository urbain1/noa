import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import EditNoteDialog from "./EditNoteDialog";
import { EditLockContext } from "../hooks/editLockContext";
import { createLockStore, lockKey } from "../utils/editLock";
import { fetchNoteRow } from "../lib/patients";
import { fetchLastChange } from "../lib/auditLog";

vi.mock("../lib/patients", () => ({ fetchNoteRow: vi.fn() }));
vi.mock("../lib/auditLog", () => ({ fetchLastChange: vi.fn() }));

// Synthetic fixtures only.
const FACILITY = "facility-1";
const ME = "nurse-me";
const NURSES = [
  { id: ME, name: "Nurse Me Test" },
  { id: "nurse-amara", name: "Nurse Amara Test" },
];
const NOTE = { id: "note-1", facility_id: FACILITY, patient_id: "patient-2", nurse_id: ME, content: "Patient refused breakfast.", type: "clinical", created_at: "2026-11-18T08:00:00Z" };

function renderDialog(props = {}) {
  const store = createLockStore("tab-me");
  store.setTracker(vi.fn());
  store.set({ status: "unavailable" });
  const onSave = props.onSave || vi.fn(async (id, content) => ({ ...NOTE, content: content.trim() }));
  const onCancel = vi.fn();
  render(
    <EditLockContext.Provider value={{ store, nurses: NURSES, currentNurseId: ME }}>
      <EditNoteDialog note={NOTE} patientLabel="Patient_Test_2" facilityId={FACILITY} onCancel={onCancel} onSave={onSave} {...props} />
    </EditLockContext.Provider>
  );
  return { onSave, onCancel };
}

const textbox = () => screen.getByLabelText("Note");
const saveButton = () => screen.getByRole("button", { name: "Save Changes" });

beforeEach(() => {
  vi.clearAllMocks();
  fetchNoteRow.mockResolvedValue(NOTE);
  fetchLastChange.mockResolvedValue(null);
});

describe("EditNoteDialog", () => {
  it("saves the edited text through the guard, checked against the note as it is now", async () => {
    const { onSave } = renderDialog();
    expect(await screen.findByDisplayValue("Patient refused breakfast.")).toBeInTheDocument();
    expect(saveButton()).toBeDisabled(); // nothing changed yet
    fireEvent.change(textbox(), { target: { value: "Patient refused lunch." } });
    await waitFor(() => expect(saveButton()).toBeEnabled());
    fireEvent.click(saveButton());
    await waitFor(() => expect(onSave).toHaveBeenCalledWith("note-1", "Patient refused lunch."));
    // Read once on open and once more right before the write.
    expect(fetchNoteRow.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(fetchNoteRow).toHaveBeenCalledWith(FACILITY, "note-1");
  });

  it("refuses to save over a change made since it opened, says who, and keeps the typed text", async () => {
    const { onSave } = renderDialog();
    await screen.findByDisplayValue("Patient refused breakfast.");
    fireEvent.change(textbox(), { target: { value: "Patient refused lunch." } });
    // A colleague changes the note before the save.
    fetchNoteRow.mockResolvedValue({ ...NOTE, content: "Patient refused breakfast and lunch." });
    fetchLastChange.mockResolvedValue({ nurse_id: "nurse-amara", created_at: "2026-11-18T08:05:00Z" });
    fireEvent.click(saveButton());
    expect(await screen.findByText(/Nurse Amara Test changed this after you opened it: text/)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    expect(textbox()).toHaveValue("Patient refused lunch.");
    expect(screen.getByText("Not saved: text")).toBeInTheDocument();
  });

  it("refuses when the note was deleted in the meantime", async () => {
    const { onSave } = renderDialog();
    await screen.findByDisplayValue("Patient refused breakfast.");
    fireEvent.change(textbox(), { target: { value: "Patient refused lunch." } });
    fetchNoteRow.mockResolvedValue(null);
    fireEvent.click(saveButton());
    expect(await screen.findByText(/deleted by someone else/)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("will not save an empty note", async () => {
    const { onSave } = renderDialog();
    await screen.findByDisplayValue("Patient refused breakfast.");
    fireEvent.change(textbox(), { target: { value: "   " } });
    expect(screen.getByText("A note can't be empty.")).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("disables editing while a colleague holds the note's lock", async () => {
    const store = createLockStore("tab-me");
    store.setTracker(vi.fn());
    store.set({
      status: "joined",
      locks: new Map([[lockKey("note", "note-1"), [{ key: "tab-amara", nurseId: "nurse-amara", recordType: "note", recordId: "note-1", since: 1, gen: 0 }]]]),
    });
    render(
      <EditLockContext.Provider value={{ store, nurses: NURSES, currentNurseId: ME }}>
        <EditNoteDialog note={NOTE} patientLabel="Patient_Test_2" facilityId={FACILITY} onCancel={vi.fn()} onSave={vi.fn()} />
      </EditLockContext.Provider>
    );
    expect(await screen.findByText(/Nurse Amara Test is currently editing this/)).toBeInTheDocument();
    expect(textbox()).toBeDisabled();
  });

  it("as a voice step, lays an addition over the current text and writes nothing until Confirm", async () => {
    const onConfirmed = vi.fn();
    const onSave = vi.fn(async (id, content) => ({ ...NOTE, content }));
    // The note changed since the roster was loaded: the addition goes on the fresh text.
    fetchNoteRow.mockResolvedValue({ ...NOTE, content: "Patient refused breakfast. Ate lunch." });
    renderDialog({
      onSave,
      proposal: (row) => `${row.content} Family called.`,
      voiceStep: { index: 1, total: 1, words: "add to my note that the family was called", confidence: "high", onSkip: vi.fn(), onClose: vi.fn(), onError: vi.fn(), onConfirmed },
    });
    expect(await screen.findByDisplayValue("Patient refused breakfast. Ate lunch. Family called.")).toBeInTheDocument();
    expect(screen.getByText("text: Patient refused breakfast. Ate lunch. → Patient refused breakfast. Ate lunch. Family called.")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith("note-1", "Patient refused breakfast. Ate lunch. Family called."));
    expect(onConfirmed).toHaveBeenCalledWith({
      before: expect.objectContaining({ content: "Patient refused breakfast. Ate lunch." }),
      after: expect.objectContaining({ content: "Patient refused breakfast. Ate lunch. Family called." }),
      columns: ["content"],
    });
  });
});
