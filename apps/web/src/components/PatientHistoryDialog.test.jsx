import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import i18n from "../i18n";
import PatientHistoryDialog from "./PatientHistoryDialog";
import { fetchPatientHistory } from "../lib/auditLog";

vi.mock("../lib/auditLog", () => ({ fetchPatientHistory: vi.fn(), HISTORY_PAGE_SIZE: 50 }));

// Synthetic fixtures only: a Patient_Test_N label, invented nurse names.
const NURSES = [
  { id: "nurse-1", name: "Nurse Amara Test", email: "amara.test@example.invalid" },
  { id: "nurse-2", name: "Nurse Bo Test", email: "bo.test@example.invalid" },
];
const PATIENT = {
  id: "patient-1",
  label: "Patient_Test_1",
  tasks: [{ id: "task-1", description: "Draw blood cultures" }],
  notes: [{ id: "note-1", content: "Mobilised to chair, tolerated well" }],
};

function logRow(overrides) {
  return {
    id: overrides.id,
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

const PAGE_ONE = [
  logRow({ id: "a1", details: { columns: ["completed_at", "completed_by", "status"], events: ["completed"] } }),
  logRow({ id: "a2", action: "delete", resource_id: "task-deleted", nurse_id: "nurse-2", created_at: "2026-11-16T13:00:00Z" }),
  logRow({ id: "a3", action: "create", resource_type: "note", resource_id: "note-1", created_at: "2026-11-16T12:00:00Z" }),
  logRow({ id: "a4", action: "create", resource_type: "patient", resource_id: "patient-1", nurse_id: null, created_at: "2026-11-16T11:00:00Z" }),
];

function renderDialog(props = {}) {
  const onClose = vi.fn();
  render(<PatientHistoryDialog patient={PATIENT} nurses={NURSES} facilityId="facility-1" onClose={onClose} {...props} />);
  return { onClose };
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("PatientHistoryDialog", () => {
  it("renders the log newest first: what, who, when, scoped to the facility and patient", async () => {
    fetchPatientHistory.mockResolvedValue({ rows: PAGE_ONE, hasMore: false });
    renderDialog();

    expect(await screen.findByText("Task completed by Nurse Amara Test")).toBeInTheDocument();
    expect(fetchPatientHistory).toHaveBeenCalledWith("facility-1", "patient-1", 0);

    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items[0]).toContain("Task completed by Nurse Amara Test");
    expect(items[0]).toContain("Draw blood cultures"); // still exists: named by its current text
    expect(items[0]).toContain("Nov 16, 2:02 PM");
    expect(items[1]).toContain("Task deleted by Nurse Bo Test");
    expect(items[3]).toContain("Patient created by the system");
    expect(screen.getByText("Mobilised to chair, tolerated well")).toBeInTheDocument();
  });

  it("keeps a deleted task's line generic", async () => {
    fetchPatientHistory.mockResolvedValue({ rows: PAGE_ONE, hasMore: false });
    renderDialog();
    const deleted = (await screen.findByText("Task deleted by Nurse Bo Test")).closest("li");
    // Only the line and the time: no description to show for a row that's gone.
    expect(deleted.querySelectorAll("p")).toHaveLength(2);
  });

  it("loads the next 50 on demand", async () => {
    fetchPatientHistory
      .mockResolvedValueOnce({ rows: PAGE_ONE, hasMore: true })
      .mockResolvedValueOnce({
        rows: [logRow({ id: "b1", action: "create", created_at: "2026-11-15T09:00:00Z" })],
        hasMore: false,
      });
    renderDialog();
    fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Task created by Nurse Amara Test")).toBeInTheDocument();
    expect(fetchPatientHistory).toHaveBeenLastCalledWith("facility-1", "patient-1", PAGE_ONE.length);
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("shows the empty state", async () => {
    fetchPatientHistory.mockResolvedValue({ rows: [], hasMore: false });
    renderDialog();
    expect(await screen.findByText("No changes recorded yet.")).toBeInTheDocument();
  });

  it("degrades to a translated message when the audit migration isn't applied (en)", async () => {
    fetchPatientHistory.mockRejectedValue(Object.assign(new Error("AUDIT_UNAVAILABLE"), { code: "AUDIT_UNAVAILABLE" }));
    const { onClose } = renderDialog();
    expect(await screen.findByText(/History isn't available yet/)).toBeInTheDocument();
    // Still a working dialog: it closes normally.
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("degrades to a translated message when the audit migration isn't applied (fr)", async () => {
    await act(() => i18n.changeLanguage("fr"));
    fetchPatientHistory.mockRejectedValue(Object.assign(new Error("AUDIT_UNAVAILABLE"), { code: "AUDIT_UNAVAILABLE" }));
    renderDialog();
    expect(await screen.findByText(/L'historique n'est pas encore disponible/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Historique" })).toBeInTheDocument();
  });

  it("renders lines in French for a French-speaking nurse", async () => {
    await act(() => i18n.changeLanguage("fr"));
    fetchPatientHistory.mockResolvedValue({ rows: PAGE_ONE, hasMore: false });
    renderDialog();
    expect(await screen.findByText("Tâche terminée par Nurse Amara Test")).toBeInTheDocument();
    expect(screen.getByText("Patient créé par le système")).toBeInTheDocument();
  });

  it("offers a retry after an unexpected error", async () => {
    fetchPatientHistory
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce({ rows: PAGE_ONE, hasMore: false });
    renderDialog();
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Task completed by Nurse Amara Test")).toBeInTheDocument();
  });
});
