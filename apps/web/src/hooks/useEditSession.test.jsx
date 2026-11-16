import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { EditLockContext } from "./editLockContext";
import { useEditSession } from "./useEditSession";
import { createLockStore, LOCK_IDLE_MS, lockKey } from "../utils/editLock";
import { fetchLastChange } from "../lib/auditLog";

vi.mock("../lib/auditLog", () => ({ fetchLastChange: vi.fn() }));

// Synthetic fixtures only.
const FACILITY = "facility-1";
const ME = "nurse-me";
const OTHER = "nurse-other";
const BASE = { id: "task-1", facility_id: FACILITY, patient_id: "patient-1", description: "Draw blood cultures", priority: "Routine" };

function setup({ status = "unavailable", rows = [BASE] } = {}) {
  const store = createLockStore("tab-me");
  const tracker = vi.fn();
  store.setTracker(tracker);
  store.set({ status });
  // Each loadRow call returns the next row in `rows` (the last one repeats).
  const queue = [...rows];
  const loadRow = vi.fn(async () => (queue.length > 1 ? queue.shift() : queue[0]));
  const onBaselineReplaced = vi.fn();
  const onFreshRow = vi.fn();
  const hasUnsaved = vi.fn(() => false);
  const wrapper = ({ children }) => (
    <EditLockContext.Provider value={{ store, nurses: [], currentNurseId: ME }}>{children}</EditLockContext.Provider>
  );
  const hook = renderHook(
    () =>
      useEditSession({
        recordType: "task",
        recordId: BASE.id,
        facilityId: FACILITY,
        initialRow: BASE,
        loadRow,
        onFreshRow,
        onBaselineReplaced,
        hasUnsaved,
      }),
    { wrapper }
  );
  return { ...hook, store, tracker, loadRow, onBaselineReplaced, onFreshRow, hasUnsaved, queue };
}

// Echo this tab's claim back as the server would.
function echoClaim(store, tracker) {
  const payload = tracker.mock.calls.at(-1)[0];
  store.set({
    locks: new Map([
      [lockKey("task", BASE.id), [{ key: "tab-me", nurseId: ME, recordType: "task", recordId: BASE.id, since: payload.since, gen: payload.gen }]],
    ]),
  });
}

beforeEach(() => {
  fetchLastChange.mockResolvedValue(null);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useEditSession with live locking unavailable (0013 not applied)", () => {
  it("lets the nurse save, nothing disabled, and writes after a clean stale-write check", async () => {
    const { result, loadRow } = setup({ status: "unavailable" });
    await waitFor(() => expect(result.current.canEdit).toBe(true));
    expect(result.current.phase).toBe("unavailable");

    const saved = { ...BASE, priority: "Stat" };
    const write = vi.fn(async () => saved);
    await act(() => result.current.guard(write));
    expect(write).toHaveBeenCalledTimes(1);
    expect(loadRow).toHaveBeenCalledTimes(2); // on open + before the write
    expect(result.current.baseline).toEqual(saved);
  });

  it("refuses to overwrite a change made by someone else, and says who", async () => {
    fetchLastChange.mockResolvedValue({ nurse_id: OTHER, created_at: "2026-11-16T14:02:00Z" });
    const { result } = setup({ rows: [BASE, { ...BASE, priority: "Stat" }] });
    await waitFor(() => expect(result.current.canEdit).toBe(true));

    const write = vi.fn();
    await act(async () => {
      await expect(result.current.guard(write)).rejects.toMatchObject({ code: "EDIT_CONFLICT" });
    });
    expect(write).not.toHaveBeenCalled();
    expect(result.current.conflict).toMatchObject({ kind: "changed", columns: ["priority"], byNurseId: OTHER });
    expect(result.current.canEdit).toBe(false);
    expect(fetchLastChange).toHaveBeenCalledWith(FACILITY, BASE.id);
  });

  it("without the audit log (0012 not applied) the conflict still fires, naming nobody", async () => {
    fetchLastChange.mockResolvedValue(null);
    const { result } = setup({ rows: [BASE, { ...BASE, description: "Changed elsewhere" }] });
    await waitFor(() => expect(result.current.canEdit).toBe(true));
    await act(async () => {
      await expect(result.current.guard(vi.fn())).rejects.toMatchObject({ code: "EDIT_CONFLICT" });
    });
    expect(result.current.conflict.byNurseId).toBeNull();
    expect(result.current.conflict.columns).toEqual(["description"]);
  });

  it("reports a record deleted elsewhere", async () => {
    const { result } = setup({ rows: [BASE, null] });
    await waitFor(() => expect(result.current.canEdit).toBe(true));
    await act(async () => {
      await expect(result.current.guard(vi.fn())).rejects.toMatchObject({ code: "EDIT_CONFLICT" });
    });
    expect(result.current.conflict.kind).toBe("deleted");
  });

  it("'Save mine anyway' adopts their version as the baseline without touching the form", async () => {
    const theirs = { ...BASE, priority: "Stat" };
    const { result, onBaselineReplaced } = setup({ rows: [BASE, theirs] });
    await waitFor(() => expect(result.current.canEdit).toBe(true));
    onBaselineReplaced.mockClear();
    await act(async () => {
      await expect(result.current.guard(vi.fn())).rejects.toMatchObject({ code: "EDIT_CONFLICT" });
    });
    act(() => {
      expect(result.current.keepMine()).toBe(true);
    });
    expect(result.current.conflict).toBeNull();
    expect(result.current.baseline).toEqual(theirs);
    expect(onBaselineReplaced).not.toHaveBeenCalled();

    const write = vi.fn(async () => ({ ...theirs, description: "Mine" }));
    await act(() => result.current.guard(write));
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("'Discard mine and reload' resets the form to their version", async () => {
    const theirs = { ...BASE, priority: "Stat" };
    const { result, onBaselineReplaced } = setup({ rows: [BASE, theirs] });
    await waitFor(() => expect(result.current.canEdit).toBe(true));
    await act(async () => {
      await expect(result.current.guard(vi.fn())).rejects.toMatchObject({ code: "EDIT_CONFLICT" });
    });
    await act(() => result.current.discardMine());
    expect(onBaselineReplaced).toHaveBeenLastCalledWith(theirs);
    expect(result.current.conflict).toBeNull();
  });
});

describe("useEditSession with live locking", () => {
  it("acquires, then a colleague's take-over stops this dialog's saves at once", async () => {
    const { result, store, tracker } = setup({ status: "connecting" });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.canEdit).toBe(false);

    act(() => store.set({ status: "joined", locks: new Map() }));
    await waitFor(() => expect(result.current.phase).toBe("acquiring"));
    expect(tracker).toHaveBeenCalled();
    expect(Object.keys(tracker.mock.calls.at(-1)[0]).sort()).toEqual(["gen", "nurse_id", "record_id", "record_type", "since"]);

    act(() => echoClaim(store, tracker));
    await waitFor(() => expect(result.current.canEdit).toBe(true));
    expect(result.current.phase).toBe("held");

    // A colleague takes over (higher gen).
    const mine = store.getSnapshot().locks.get(lockKey("task", BASE.id))[0];
    act(() =>
      store.set({
        locks: new Map([
          [lockKey("task", BASE.id), [mine, { key: "tab-other", nurseId: OTHER, recordType: "task", recordId: BASE.id, since: mine.since + 1, gen: 1 }]],
        ]),
      })
    );
    await waitFor(() => expect(result.current.phase).toBe("lost"));
    expect(result.current.canEdit).toBe(false);
    expect(result.current.holder.nurseId).toBe(OTHER);
    await act(async () => {
      await expect(result.current.guard(vi.fn())).rejects.toMatchObject({ code: "EDIT_NOT_HELD" });
    });
    // The lost dialog releases its claim.
    expect(tracker).toHaveBeenLastCalledWith(null);
  });

  it("re-acquiring with something typed and a changed row surfaces a conflict instead of saving", async () => {
    const theirs = { ...BASE, priority: "Stat" };
    const { result, store, tracker, hasUnsaved, queue } = setup({ status: "joined" });
    act(() => store.set({ locks: new Map() }));
    await waitFor(() => expect(result.current.phase).toBe("acquiring"));
    act(() => echoClaim(store, tracker));
    await waitFor(() => expect(result.current.canEdit).toBe(true));

    // Paused (e.g. idle), meanwhile the row changes and the nurse has typed.
    hasUnsaved.mockReturnValue(true);
    queue.splice(0, queue.length, theirs);
    act(() => store.set({ status: "disconnected" }));
    await waitFor(() => expect(result.current.phase).toBe("paused"));
    act(() => store.set({ status: "joined", locks: new Map() }));
    act(() => result.current.resume());
    await waitFor(() => expect(result.current.phase).toBe("acquiring"));
    act(() => echoClaim(store, tracker));
    await waitFor(() => expect(result.current.conflict).not.toBeNull());
    expect(result.current.conflict.columns).toEqual(["priority"]);
    expect(result.current.canEdit).toBe(false);
  });

  it("releases after 2 minutes without input", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result, store, tracker } = setup({ status: "joined" });
    act(() => store.set({ locks: new Map() }));
    await waitFor(() => expect(result.current.phase).toBe("acquiring"));
    act(() => echoClaim(store, tracker));
    await waitFor(() => expect(result.current.canEdit).toBe(true));

    act(() => {
      vi.advanceTimersByTime(LOCK_IDLE_MS - 10000);
    });
    expect(result.current.phase).toBe("held");
    act(() => result.current.touch()); // input keeps it alive
    act(() => {
      vi.advanceTimersByTime(LOCK_IDLE_MS - 10000);
    });
    expect(result.current.phase).toBe("held");

    act(() => {
      vi.advanceTimersByTime(20000);
    });
    expect(result.current.phase).toBe("paused");
    expect(result.current.pauseReason).toBe("idle");
    expect(tracker).toHaveBeenLastCalledWith(null);
  });

  it("releases its claim when the dialog closes", async () => {
    const { result, store, tracker, unmount } = setup({ status: "joined" });
    act(() => store.set({ locks: new Map() }));
    await waitFor(() => expect(result.current.phase).toBe("acquiring"));
    tracker.mockClear();
    unmount();
    expect(tracker).toHaveBeenCalledWith(null);
  });
});
