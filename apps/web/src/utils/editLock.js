// Edit locking: the pure part (decisions.md, 2026-11-16; scenarios.md SC-16).
//
// A lock is a Supabase Realtime Presence entry on the facility's private
// channel ('edit-locks:<facility_id>', authorised by migration 0013). Each
// browser tab tracks at most one entry:
//
//   { nurse_id, record_type, record_id, since, gen }
//
// No patient data, ever. `since` (ms timestamp of the claim) and `gen` (a
// take-over counter) exist only to order competing claims the same way on
// every device. Presence drops an entry by itself when its tab closes or
// loses its connection, which is what makes the lock release on disconnect
// without a table, a heartbeat or a cleanup job.
//
// Everything in this file is deterministic and side-effect free, so the
// whole lock state machine is unit tested (editLock.test.js). The channel
// plumbing lives in hooks/useEditLocks.js, the per-dialog wiring in
// hooks/useEditSession.js.

export const LOCK_RECORD_TYPES = ["patient", "task", "note"];

// Released after this long without input in the edit dialog.
export const LOCK_IDLE_MS = 2 * 60 * 1000;

// How long to wait for the lock channel before deciding live locking is
// unavailable here (0013 not applied, Realtime unreachable) and carrying on
// without it. Saves are still protected by the stale-write check.
export const LOCK_JOIN_TIMEOUT_MS = 8000;

export function lockChannelName(facilityId) {
  return `edit-locks:${facilityId}`;
}

export function lockKey(recordType, recordId) {
  return `${recordType}:${recordId}`;
}

// The presence payload this tab tracks for a claim. Built in one place so
// nothing else can slip a field into it.
export function lockPayload({ nurseId, recordType, recordId, since, gen }) {
  return { nurse_id: nurseId, record_type: recordType, record_id: recordId, since, gen };
}

function isValidMeta(meta) {
  return (
    meta &&
    typeof meta.nurse_id === "string" &&
    LOCK_RECORD_TYPES.includes(meta.record_type) &&
    typeof meta.record_id === "string" &&
    Number.isFinite(meta.since) &&
    Number.isInteger(meta.gen) &&
    meta.gen >= 0
  );
}

/**
 * Groups a Realtime `presenceState()` by locked record.
 *
 * @param {Record<string, Array<object>>} presenceState - presence key (one per
 *   tab) -> that tab's metas
 * @returns {Map<string, Array<{key, nurseId, recordType, recordId, since, gen}>>}
 *   lockKey -> claims on that record. Malformed metas are ignored.
 */
export function collectLocks(presenceState) {
  const locks = new Map();
  for (const [key, metas] of Object.entries(presenceState || {})) {
    for (const meta of metas || []) {
      if (!isValidMeta(meta)) continue;
      const entry = {
        key,
        nurseId: meta.nurse_id,
        recordType: meta.record_type,
        recordId: meta.record_id,
        since: meta.since,
        gen: meta.gen,
      };
      const k = lockKey(entry.recordType, entry.recordId);
      if (!locks.has(k)) locks.set(k, []);
      locks.get(k).push(entry);
    }
  }
  return locks;
}

// Total order over claims, identical on every device: a take-over (higher
// gen) beats everything before it; among equal gens the earliest claim wins;
// the presence key breaks an exact tie.
function outranks(a, b) {
  if (a.gen !== b.gen) return a.gen > b.gen;
  if (a.since !== b.since) return a.since < b.since;
  return a.key < b.key;
}

export function resolveHolder(entries) {
  let best = null;
  for (const entry of entries || []) {
    if (!best || outranks(entry, best)) best = entry;
  }
  return best;
}

/**
 * Who holds a record's lock, from another tab's point of view. Returns the
 * holder entry when someone other than this tab holds it, otherwise null.
 * Only meaningful while the channel is joined: with the channel down the
 * presence data is stale, so nothing is reported as locked.
 */
export function otherHolder(snapshot, recordType, recordId) {
  if (!snapshot || snapshot.status !== "joined" || !recordId) return null;
  const holder = resolveHolder(snapshot.locks?.get(lockKey(recordType, recordId)));
  if (!holder || holder.key === snapshot.selfKey) return null;
  return holder;
}

export function isIdle(lastInputAt, now, idleMs = LOCK_IDLE_MS) {
  return now - lastInputAt >= idleMs;
}

/**
 * Column names whose value differs between the row an edit dialog started
 * from and the row as it is now. Nested relations (a patient's tasks and
 * notes, as loaded by fetchPatients) are not columns and are ignored.
 *
 * @returns {string[]} sorted; empty when nothing changed
 */
export function findConflict(baseline, fresh) {
  const keys = new Set([...Object.keys(baseline || {}), ...Object.keys(fresh || {})]);
  const changed = [];
  for (const key of keys) {
    if (key === "tasks" || key === "notes") continue;
    const a = baseline?.[key] === undefined ? null : baseline[key];
    const b = fresh?.[key] === undefined ? null : fresh[key];
    if (JSON.stringify(a) !== JSON.stringify(b)) changed.push(key);
  }
  return changed.sort();
}

// --- The store the channel writes into and the UI reads from -------------
//
// A tiny external store (useSyncExternalStore-compatible) rather than React
// state, so cards can read lock state without re-rendering the whole app,
// and edit sessions can subscribe to changes the way they would to any
// outside system.
//
// snapshot: { status, locks, selfKey }
//   status: "connecting" | "joined" | "disconnected" | "unavailable"
export function createLockStore(selfKey) {
  let snapshot = { status: "connecting", locks: new Map(), selfKey };
  const listeners = new Set();
  let tracker = null;
  let tracked = { owner: null, payload: null };

  const store = {
    getSnapshot: () => snapshot,

    // For useSyncExternalStore.
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    // For edit sessions: like subscribe, but also delivers the current
    // snapshot once, asynchronously, so a subscriber never misses the state
    // it subscribed in.
    watch(listener) {
      let active = true;
      const wrapped = (s) => {
        if (active) listener(s);
      };
      listeners.add(wrapped);
      queueMicrotask(() => wrapped(snapshot));
      return () => {
        active = false;
        listeners.delete(wrapped);
      };
    },

    set(patch) {
      snapshot = { ...snapshot, ...patch };
      for (const listener of [...listeners]) listener(snapshot);
    },

    // Wired by useEditLocks to channel.track / channel.untrack.
    setTracker(fn) {
      tracker = fn;
    },

    // One claim per tab. `owner` identifies the edit session making it, so a
    // session that has closed can't untrack a newer session's claim.
    track(owner, payload) {
      const unchanged =
        tracked.owner === owner && JSON.stringify(tracked.payload) === JSON.stringify(payload);
      tracked = { owner, payload };
      if (!unchanged && tracker && snapshot.status === "joined") tracker(payload);
    },

    release(owner) {
      if (tracked.owner !== owner) return;
      tracked = { owner: null, payload: null };
      if (tracker && snapshot.status === "joined") tracker(null);
    },

    trackedPayload: () => tracked.payload,
  };
  return store;
}

// --- One edit dialog's lock state machine --------------------------------
//
// phase:
//   connecting   waiting for the channel (inputs disabled, briefly)
//   acquiring    claim sent, not yet confirmed
//   held         this dialog holds the lock and may save
//   locked       someone else holds it; waits, and takes it automatically
//                once free (nothing has been typed while locked)
//   lost         someone took over; stays lost until the nurse acts
//   paused       idle for 2 minutes or connection lost; stays paused until
//                the nurse acts
//   unavailable  no live locking here; saves go through the stale-write
//                check only
//
// `needsRecheck` is set every time the lock is (re)gained: before any save,
// the session compares the row with its baseline, because the record may
// have changed while this dialog didn't hold it.

export const initialSessionState = {
  phase: "connecting",
  holder: null,
  pauseReason: null,
  gen: 0,
  since: 0,
  needsRecheck: false,
};

function claim(state, { gen, since, holder = null }) {
  return { ...state, phase: "acquiring", gen, since, holder, pauseReason: null };
}

function gain(state) {
  return { ...state, phase: "held", holder: null, pauseReason: null, needsRecheck: true };
}

function sameEntry(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.key === b.key && a.gen === b.gen && a.since === b.since && a.nurseId === b.nurseId;
}

/**
 * Events:
 *   { type: "SNAPSHOT", status, entries, selfKey, now }
 *       status is the channel status; entries are the claims on THIS record
 *   { type: "TAKE_OVER", now }   after the nurse confirmed taking over
 *   { type: "RESUME", now }      "Continue editing" after lost / paused
 *   { type: "IDLE" }             2 minutes without input while held
 *   { type: "RECHECKED" }        the post-(re)gain stale check is done
 */
export function editSessionReducer(state, event) {
  switch (event.type) {
    case "SNAPSHOT": {
      const { status, entries = [], selfKey, now = 0 } = event;

      if (status === "unavailable") {
        return state.phase === "unavailable" ? state : { ...state, phase: "unavailable", holder: null, needsRecheck: false };
      }
      if (state.phase === "unavailable") return state;
      if (status === "connecting") return state;

      if (status === "disconnected") {
        if (["held", "acquiring", "locked", "connecting"].includes(state.phase)) {
          return { ...state, phase: "paused", pauseReason: "disconnected", holder: null };
        }
        return state;
      }

      // status === "joined"
      const others = entries.filter((e) => e.key !== selfKey);
      const claiming = state.phase === "acquiring" || state.phase === "held";
      // While claiming, count our own claim even before the server has echoed
      // it back, so a take-over isn't undone by the snapshot that still shows
      // the previous holder.
      const self = { key: selfKey, gen: state.gen, since: state.since };
      const holder = resolveHolder(claiming ? [...others, self] : others);
      const mine = claiming && holder?.key === selfKey;
      const other = mine ? null : holder;

      switch (state.phase) {
        case "connecting":
          return other ? { ...state, phase: "locked", holder: other } : claim(state, { gen: 0, since: now });
        case "acquiring":
          if (mine) return gain(state);
          return { ...state, phase: "locked", holder: other };
        case "held":
          if (mine) return state;
          // A higher gen is a deliberate take-over. Losing to an equal gen is
          // two claims that crossed in flight (or a holder whose presence
          // arrived late): that nurse was first, so this dialog waits. In
          // practice it happens right after gaining, while the recheck still
          // keeps inputs disabled; if anything was typed, it stays on screen
          // and is listed as not saved, like every other interruption.
          if (other.gen > state.gen) return { ...state, phase: "lost", holder: other };
          return { ...state, phase: "locked", holder: other, needsRecheck: false };
        case "locked":
          if (!other) return claim(state, { gen: 0, since: now });
          return sameEntry(other, state.holder) ? state : { ...state, holder: other };
        case "lost":
        case "paused":
          return sameEntry(other, state.holder) ? state : { ...state, holder: other };
        default:
          return state;
      }
    }

    case "TAKE_OVER":
      if (!["locked", "lost", "paused"].includes(state.phase)) return state;
      return claim(state, { gen: (state.holder?.gen ?? state.gen) + 1, since: event.now ?? 0 });

    case "RESUME":
      if (state.phase !== "lost" && state.phase !== "paused") return state;
      // Someone holds it now: show them, and offer Take over.
      if (state.holder) return { ...state, phase: "locked", pauseReason: null, needsRecheck: true };
      return { ...claim(state, { gen: 0, since: event.now ?? 0 }), needsRecheck: true };

    case "IDLE":
      if (state.phase !== "held") return state;
      return { ...state, phase: "paused", pauseReason: "idle" };

    case "RECHECKED":
      return state.needsRecheck ? { ...state, needsRecheck: false } : state;

    default:
      return state;
  }
}

// Whether this dialog may write right now.
export function sessionCanSave(state) {
  if (state.phase === "unavailable") return true;
  return state.phase === "held" && !state.needsRecheck;
}
