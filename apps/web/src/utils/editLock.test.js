import { afterEach, describe, expect, it, vi } from "vitest";
import {
  collectLocks,
  createLockStore,
  editSessionReducer,
  findConflict,
  initialSessionState,
  isIdle,
  LOCK_IDLE_MS,
  lockKey,
  lockPayload,
  otherHolder,
  resolveHolder,
  sessionCanSave,
} from "./editLock";

// Synthetic ids only.
const ME = "tab-me";
const NURSE_ME = "nurse-me";
const NURSE_OTHER = "nurse-other";
const TASK = "task-1";

function entry(key, { gen = 0, since = 100, nurseId = NURSE_OTHER } = {}) {
  return { key, nurseId, recordType: "task", recordId: TASK, since, gen };
}

function snap(entries, status = "joined", now = 1000) {
  return { type: "SNAPSHOT", status, entries, selfKey: ME, now };
}

// Drive the reducer through a list of events.
function run(events, state = initialSessionState) {
  return events.reduce(editSessionReducer, state);
}

describe("presence payload and grouping", () => {
  it("the payload carries ids and ordering numbers only, no patient data", () => {
    const payload = lockPayload({ nurseId: NURSE_ME, recordType: "task", recordId: TASK, since: 5, gen: 0 });
    expect(Object.keys(payload).sort()).toEqual(["gen", "nurse_id", "record_id", "record_type", "since"]);
  });

  it("groups claims by record and ignores malformed metas", () => {
    const locks = collectLocks({
      "tab-a": [{ nurse_id: "n-a", record_type: "task", record_id: TASK, since: 10, gen: 0 }],
      "tab-b": [{ nurse_id: "n-b", record_type: "patient", record_id: "patient-1", since: 11, gen: 0 }],
      "tab-c": [{ nurse_id: "n-c", record_type: "task", record_id: TASK, since: "soon", gen: 0 }],
      "tab-d": [{ nurse_id: "n-d", record_type: "contact", record_id: "x", since: 12, gen: 0 }],
      "tab-e": [{ nurse_id: "n-e", record_type: "task", record_id: TASK, since: 13 }],
    });
    expect(locks.get(lockKey("task", TASK)).map((e) => e.key)).toEqual(["tab-a"]);
    expect(locks.get(lockKey("patient", "patient-1")).map((e) => e.key)).toEqual(["tab-b"]);
    expect(locks.size).toBe(2);
  });
});

describe("resolveHolder: the same answer on every device", () => {
  it("a take-over (higher gen) beats an earlier claim", () => {
    expect(resolveHolder([entry("a", { gen: 0, since: 1 }), entry("b", { gen: 1, since: 999 })]).key).toBe("b");
  });
  it("among equal gens the earliest claim wins", () => {
    expect(resolveHolder([entry("a", { since: 200 }), entry("b", { since: 100 })]).key).toBe("b");
  });
  it("an exact tie is broken by presence key", () => {
    expect(resolveHolder([entry("z"), entry("a")]).key).toBe("a");
  });
  it("no claims, no holder", () => {
    expect(resolveHolder([])).toBeNull();
  });
});

describe("otherHolder: what cards and one-tap actions see", () => {
  const locks = new Map([[lockKey("task", TASK), [entry("tab-other")]]]);

  it("reports a colleague's lock", () => {
    expect(otherHolder({ status: "joined", locks, selfKey: ME }, "task", TASK).nurseId).toBe(NURSE_OTHER);
  });
  it("never reports this tab's own lock", () => {
    const own = new Map([[lockKey("task", TASK), [entry(ME, { nurseId: NURSE_ME })]]]);
    expect(otherHolder({ status: "joined", locks: own, selfKey: ME }, "task", TASK)).toBeNull();
  });
  it("only locks the record itself, not other records", () => {
    expect(otherHolder({ status: "joined", locks, selfKey: ME }, "task", "task-2")).toBeNull();
    expect(otherHolder({ status: "joined", locks, selfKey: ME }, "patient", TASK)).toBeNull();
  });
  it("reports nothing unless the channel is joined (unavailable or disconnected disables nothing)", () => {
    for (const status of ["unavailable", "disconnected", "connecting"]) {
      expect(otherHolder({ status, locks, selfKey: ME }, "task", TASK)).toBeNull();
    }
  });
});

describe("edit session: acquire and release", () => {
  it("acquires a free record, then may save once the recheck is done", () => {
    let s = run([snap([])]);
    expect(s.phase).toBe("acquiring");
    expect(sessionCanSave(s)).toBe(false);

    s = run([snap([entry(ME, { nurseId: NURSE_ME, since: 1000 })])], s);
    expect(s.phase).toBe("held");
    expect(s.needsRecheck).toBe(true);
    expect(sessionCanSave(s)).toBe(false);

    s = run([{ type: "RECHECKED" }], s);
    expect(sessionCanSave(s)).toBe(true);
  });

  it("is locked when a colleague already holds the record", () => {
    const s = run([snap([entry("tab-other")])]);
    expect(s.phase).toBe("locked");
    expect(s.holder.nurseId).toBe(NURSE_OTHER);
    expect(sessionCanSave(s)).toBe(false);
  });

  it("takes the lock automatically once the colleague releases it", () => {
    let s = run([snap([entry("tab-other")])]);
    s = run([snap([], "joined", 5000)], s);
    expect(s.phase).toBe("acquiring");
    s = run([snap([entry(ME, { nurseId: NURSE_ME, since: 5000 })], "joined", 5000)], s);
    expect(s.phase).toBe("held");
    expect(s.needsRecheck).toBe(true);
  });

  it("two simultaneous claims: the later one waits, it isn't told it was taken over", () => {
    let s = run([snap([], "joined", 200)]); // my claim: since 200
    expect(s.phase).toBe("acquiring");
    s = run([snap([entry("tab-other", { since: 100 })], "joined", 210)], s);
    expect(s.phase).toBe("locked");
  });

  it("a late-arriving earlier claim after gaining also means wait, not lost", () => {
    let s = run([snap([], "joined", 200), snap([entry(ME, { nurseId: NURSE_ME, since: 200 })])]);
    expect(s.phase).toBe("held");
    s = run([snap([entry(ME, { nurseId: NURSE_ME, since: 200 }), entry("tab-other", { since: 100 })])], s);
    expect(s.phase).toBe("locked");
  });
});

describe("edit session: take over", () => {
  it("the taker outranks the holder straight away, before the server echoes the claim", () => {
    let s = run([snap([entry("tab-other", { gen: 0 })])]);
    s = run([{ type: "TAKE_OVER", now: 2000 }], s);
    expect(s.phase).toBe("acquiring");
    expect(s.gen).toBe(1);
    // Snapshot still shows only the old holder: the take-over must not bounce back to "locked".
    s = run([snap([entry("tab-other", { gen: 0 })], "joined", 2001)], s);
    expect(s.phase).toBe("held");
  });

  it("the previous holder is told immediately and can no longer save", () => {
    let s = run([snap([]), snap([entry(ME, { nurseId: NURSE_ME, since: 1000 })]), { type: "RECHECKED" }]);
    expect(sessionCanSave(s)).toBe(true);
    s = run([snap([entry(ME, { nurseId: NURSE_ME, since: 1000 }), entry("tab-other", { gen: 1, since: 3000 })])], s);
    expect(s.phase).toBe("lost");
    expect(s.holder.nurseId).toBe(NURSE_OTHER);
    expect(sessionCanSave(s)).toBe(false);
  });

  it("a lost session never re-takes the lock on its own, even once free", () => {
    let s = { ...initialSessionState, phase: "lost", holder: entry("tab-other", { gen: 1 }) };
    s = run([snap([])], s);
    expect(s.phase).toBe("lost");
  });

  it("Continue editing re-acquires and forces a stale-write recheck", () => {
    let s = { ...initialSessionState, phase: "lost", holder: null };
    s = run([{ type: "RESUME", now: 9000 }], s);
    expect(s.phase).toBe("acquiring");
    expect(s.needsRecheck).toBe(true);
  });

  it("Continue editing while someone still holds it shows them (and Take over)", () => {
    let s = { ...initialSessionState, phase: "lost", holder: entry("tab-other", { gen: 1 }) };
    s = run([{ type: "RESUME", now: 9000 }], s);
    expect(s.phase).toBe("locked");
  });
});

describe("edit session: idle, disconnect, unavailable", () => {
  afterEach(() => vi.useRealTimers());

  it("2 minutes without input counts as idle, not before", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-16T10:00:00Z"));
    const lastInput = Date.now();
    vi.advanceTimersByTime(LOCK_IDLE_MS - 1000);
    expect(isIdle(lastInput, Date.now())).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(isIdle(lastInput, Date.now())).toBe(true);
  });

  it("idle pauses a held lock (released) and requires Continue editing", () => {
    let s = run([snap([]), snap([entry(ME, { nurseId: NURSE_ME, since: 1000 })]), { type: "RECHECKED" }, { type: "IDLE" }]);
    expect(s.phase).toBe("paused");
    expect(s.pauseReason).toBe("idle");
    expect(sessionCanSave(s)).toBe(false);
    s = run([snap([])], s);
    expect(s.phase).toBe("paused");
    s = run([{ type: "RESUME", now: 9000 }], s);
    expect(s.phase).toBe("acquiring");
  });

  it("IDLE does nothing unless the lock is held", () => {
    const locked = run([snap([entry("tab-other")])]);
    expect(run([{ type: "IDLE" }], locked)).toBe(locked);
  });

  it("a dropped connection pauses the holder, and reconnecting doesn't silently resume", () => {
    let s = run([snap([]), snap([entry(ME, { nurseId: NURSE_ME, since: 1000 })]), { type: "RECHECKED" }]);
    s = run([snap([], "disconnected")], s);
    expect(s.phase).toBe("paused");
    expect(s.pauseReason).toBe("disconnected");
    s = run([snap([])], s);
    expect(s.phase).toBe("paused");
  });

  it("locking unavailable (0013 not applied): saving is allowed, stale-write check only", () => {
    let s = run([snap([], "unavailable")]);
    expect(s.phase).toBe("unavailable");
    expect(sessionCanSave(s)).toBe(true);
    s = run([snap([entry("tab-other")])], s);
    expect(s.phase).toBe("unavailable");
  });
});

describe("findConflict: stale-write detection", () => {
  const base = {
    id: TASK,
    description: "Draw blood cultures",
    priority: "Routine",
    deadline: "2026-11-16T15:00:00+00:00",
    allergies: ["Penicillin"],
  };

  it("nothing changed", () => {
    expect(findConflict(base, { ...base, allergies: ["Penicillin"] })).toEqual([]);
  });
  it("names the columns that changed", () => {
    expect(findConflict(base, { ...base, priority: "Stat", deadline: null })).toEqual(["deadline", "priority"]);
  });
  it("compares arrays by value", () => {
    expect(findConflict(base, { ...base, allergies: ["Penicillin", "Latex"] })).toEqual(["allergies"]);
  });
  it("ignores nested tasks/notes and treats missing as null", () => {
    expect(findConflict({ ...base, tasks: [1], notes: [], age: undefined }, { ...base, age: null })).toEqual([]);
  });
});

describe("lock store", () => {
  it("watch delivers the current snapshot once, asynchronously, then every change", async () => {
    const store = createLockStore(ME);
    const seen = [];
    const stop = store.watch((s) => seen.push(s.status));
    expect(seen).toEqual([]);
    await Promise.resolve();
    expect(seen).toEqual(["connecting"]);
    store.set({ status: "joined" });
    expect(seen).toEqual(["connecting", "joined"]);
    stop();
    store.set({ status: "disconnected" });
    expect(seen).toEqual(["connecting", "joined"]);
  });

  it("sends a claim only while joined, once, and only its owner can release it", () => {
    const store = createLockStore(ME);
    const tracker = vi.fn();
    store.setTracker(tracker);
    const owner = {};
    const payload = lockPayload({ nurseId: NURSE_ME, recordType: "task", recordId: TASK, since: 1, gen: 0 });

    store.track(owner, payload); // still connecting: remembered, not sent
    expect(tracker).not.toHaveBeenCalled();
    expect(store.trackedPayload()).toEqual(payload);

    store.set({ status: "joined" });
    store.track(owner, { ...payload, since: 2 });
    store.track(owner, { ...payload, since: 2 }); // identical: not re-sent
    expect(tracker).toHaveBeenCalledTimes(1);

    store.release({}); // someone else's session
    expect(tracker).toHaveBeenCalledTimes(1);
    store.release(owner);
    expect(tracker).toHaveBeenLastCalledWith(null);
  });
});
