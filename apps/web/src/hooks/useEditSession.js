import { useCallback, useContext, useEffect, useReducer, useRef, useState } from "react";
import { EditLockContext } from "./editLockContext";
import { fetchLastChange } from "../lib/auditLog";
import {
  editSessionReducer,
  findConflict,
  initialSessionState,
  isIdle,
  lockKey,
  lockPayload,
  sessionCanSave,
} from "../utils/editLock";

const IDLE_CHECK_MS = 5000;

function codedError(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

/**
 * One edit dialog's lock + stale-write protection (scenarios.md SC-16).
 *
 * Lock: claims the record on the facility's presence channel while the dialog
 * is open, follows the state machine in utils/editLock.js, releases on close,
 * pauses after 2 minutes without input (`touch()` on every interaction).
 *
 * Stale-write check: `guard(write)` re-reads the row and compares it with the
 * row this dialog started from (its baseline). If someone else changed it, or
 * deleted it, nothing is written: `conflict` describes who, when and which
 * columns, and the dialog keeps the nurse's typed values on screen. This is
 * what protects saves when live locking is unavailable, and against testers
 * on the older build, who never take part in locking.
 *
 * Nothing the nurse typed is ever dropped here. The dialog owns its field
 * values; this hook only decides when they may be written.
 *
 * @param {object} opts
 * @param {"patient"|"task"} opts.recordType
 * @param {string} opts.recordId
 * @param {string} opts.facilityId - for the "who changed it" lookup
 * @param {object} opts.initialRow - the in-memory row, used until the fresh one arrives
 * @param {() => Promise<object|null>} opts.loadRow - fresh row, null if deleted
 * @param {(row) => void} [opts.onFreshRow] - lets App refresh its copy of the row
 * @param {(row) => void} [opts.onBaselineReplaced] - reset the form to `row`; only
 *   called when nothing is unsaved, or when the nurse chose to discard
 * @param {(baselineRow) => boolean} [opts.hasUnsaved] - whether the form holds
 *   edits not yet saved relative to the given baseline row
 */
export function useEditSession({
  recordType,
  recordId,
  facilityId,
  initialRow,
  loadRow,
  onFreshRow,
  onBaselineReplaced,
  hasUnsaved,
}) {
  const ctx = useContext(EditLockContext);
  const store = ctx?.store || null;
  const nurseId = ctx?.currentNurseId || null;

  const [state, dispatch] = useReducer(editSessionReducer, undefined, () =>
    store ? initialSessionState : { ...initialSessionState, phase: "unavailable" }
  );
  const [ready, setReady] = useState(false);
  const [baseline, setBaseline] = useState(initialRow);
  const [conflict, setConflictState] = useState(null);
  const [owner] = useState(() => ({ recordType, recordId }));

  const baselineRef = useRef(initialRow);
  const conflictRef = useRef(null);
  const stateRef = useRef(state);
  const readyRef = useRef(false);
  const lastInputRef = useRef(0);
  const queueRef = useRef(Promise.resolve());
  const callbacksRef = useRef({});

  // Latest callbacks and state for async code. Declared first so later
  // effects in this hook see them populated.
  useEffect(() => {
    callbacksRef.current = { loadRow, onFreshRow, onBaselineReplaced, hasUnsaved };
    stateRef.current = state;
    readyRef.current = ready;
  });

  const setConflict = useCallback((value) => {
    conflictRef.current = value;
    setConflictState(value);
  }, []);

  // Take `row` as the new baseline. `replaceForm` also resets the dialog's
  // fields to it, which is only done when nothing typed would be lost.
  const adoptBaseline = useCallback((row, { replaceForm }) => {
    baselineRef.current = row;
    setBaseline(row);
    callbacksRef.current.onFreshRow?.(row);
    if (replaceForm) callbacksRef.current.onBaselineReplaced?.(row);
  }, []);

  const describeConflict = useCallback(
    async (kind, columns, fresh) => {
      let last = null;
      try {
        last = await fetchLastChange(facilityId, recordId);
      } catch (err) {
        console.warn("[edit-session] could not read who changed the record", err);
      }
      return {
        kind, // "changed" | "deleted"
        columns,
        fresh,
        byNurseId: last?.nurse_id ?? null,
        at: last?.created_at ?? null,
      };
    },
    [facilityId, recordId]
  );

  // Fresh row on open: the in-memory copy can be stale (patients aren't
  // live-updated), and the baseline is what every later save compares with.
  useEffect(() => {
    let cancelled = false;
    lastInputRef.current = Date.now();
    Promise.resolve()
      .then(() => callbacksRef.current.loadRow())
      .then(
        async (row) => {
          if (cancelled) return;
          if (row) {
            adoptBaseline(row, { replaceForm: true });
          } else {
            setConflict(await describeConflict("deleted", [], null));
          }
          setReady(true);
        },
        (err) => {
          // Offline or similar: start from the in-memory row. Every save
          // still re-reads before writing.
          console.warn("[edit-session] fresh row unavailable, starting from the loaded copy", err);
          if (!cancelled) setReady(true);
        }
      );
    return () => {
      cancelled = true;
    };
  }, [recordType, recordId, adoptBaseline, describeConflict, setConflict]);

  // Follow the facility's lock channel.
  useEffect(() => {
    if (!store) return undefined;
    return store.watch((snap) => {
      dispatch({
        type: "SNAPSHOT",
        status: snap.status,
        entries: snap.locks.get(lockKey(recordType, recordId)) || [],
        selfKey: snap.selfKey,
        now: Date.now(),
      });
    });
  }, [store, recordType, recordId]);

  // Claim while acquiring/holding, release otherwise.
  useEffect(() => {
    if (!store) return;
    if (state.phase === "acquiring" || state.phase === "held") {
      store.track(owner, lockPayload({ nurseId, recordType, recordId, since: state.since, gen: state.gen }));
    } else {
      store.release(owner);
    }
  }, [store, owner, nurseId, recordType, recordId, state.phase, state.since, state.gen]);

  // Release on close.
  useEffect(() => () => store?.release(owner), [store, owner]);

  // Idle release: 2 minutes without input while holding the lock.
  useEffect(() => {
    if (state.phase !== "held") return undefined;
    lastInputRef.current = Date.now(); // gaining the lock counts as activity
    const timer = setInterval(() => {
      if (isIdle(lastInputRef.current, Date.now())) dispatch({ type: "IDLE" });
    }, IDLE_CHECK_MS);
    return () => clearInterval(timer);
  }, [state.phase]);

  // Every time the lock is (re)gained, check the row before allowing saves:
  // it may have changed while this dialog didn't hold it. Nothing typed ->
  // quietly take the new values. Something typed -> show the conflict and
  // let the nurse choose.
  useEffect(() => {
    if (state.phase !== "held" || !state.needsRecheck || !ready) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const fresh = await callbacksRef.current.loadRow();
        if (cancelled) return;
        if (!fresh) {
          setConflict(await describeConflict("deleted", [], null));
        } else {
          const changed = findConflict(baselineRef.current, fresh);
          if (changed.length > 0) {
            if (callbacksRef.current.hasUnsaved?.(baselineRef.current)) {
              const described = await describeConflict("changed", changed, fresh);
              if (!cancelled) setConflict(described);
            } else {
              adoptBaseline(fresh, { replaceForm: true });
            }
          }
        }
      } catch (err) {
        // Can't verify now; `guard` re-checks on every save regardless.
        console.warn("[edit-session] recheck failed", err);
      }
      if (!cancelled) dispatch({ type: "RECHECKED" });
    })();
    return () => {
      cancelled = true;
    };
  }, [state.phase, state.needsRecheck, ready, adoptBaseline, describeConflict, setConflict]);

  /**
   * Run `write` only if this dialog may save and the row hasn't changed
   * since its baseline. Calls are serialised. Rejects with code
   * EDIT_NOT_HELD or EDIT_CONFLICT when it refuses; the caller keeps the
   * typed value and the banner explains why.
   *
   * If `write` resolves to the updated row, that row becomes the baseline.
   */
  const guard = useCallback(
    (write) => {
      const run = async () => {
        if (!readyRef.current || !sessionCanSave(stateRef.current) || conflictRef.current) {
          throw codedError("EDIT_NOT_HELD");
        }
        const fresh = await callbacksRef.current.loadRow();
        if (!fresh) {
          setConflict(await describeConflict("deleted", [], null));
          throw codedError("EDIT_CONFLICT");
        }
        const changed = findConflict(baselineRef.current, fresh);
        if (changed.length > 0) {
          setConflict(await describeConflict("changed", changed, fresh));
          throw codedError("EDIT_CONFLICT");
        }
        const result = await write();
        if (result && typeof result === "object" && result.id === recordId) {
          baselineRef.current = result;
          setBaseline(result);
        }
        return result;
      };
      const next = queueRef.current.then(run, run);
      queueRef.current = next.catch(() => {});
      return next;
    },
    [recordId, describeConflict, setConflict]
  );

  const touch = useCallback(() => {
    lastInputRef.current = Date.now();
  }, []);

  const takeOver = useCallback(() => {
    lastInputRef.current = Date.now();
    dispatch({ type: "TAKE_OVER", now: Date.now() });
  }, []);

  const resume = useCallback(() => {
    lastInputRef.current = Date.now();
    dispatch({ type: "RESUME", now: Date.now() });
  }, []);

  // "Save mine anyway": accept the other change as the new baseline WITHOUT
  // touching the form, so the nurse's values are what the next save writes.
  // Only the fields the nurse changed are written, so the other nurse's
  // changes to other fields survive.
  const keepMine = useCallback(() => {
    const current = conflictRef.current;
    if (!current || current.kind !== "changed" || !current.fresh) return false;
    adoptBaseline(current.fresh, { replaceForm: false });
    setConflict(null);
    return true;
  }, [adoptBaseline, setConflict]);

  // "Discard mine and reload": the explicit choice to drop the typed values.
  const discardMine = useCallback(async () => {
    const current = conflictRef.current;
    let fresh = current?.fresh || null;
    if (!fresh) {
      try {
        fresh = await callbacksRef.current.loadRow();
      } catch (err) {
        console.warn("[edit-session] reload failed", err);
        return false;
      }
    }
    if (!fresh) return false;
    adoptBaseline(fresh, { replaceForm: true });
    setConflict(null);
    return true;
  }, [adoptBaseline, setConflict]);

  const canEdit = ready && !conflict && sessionCanSave(state);

  return {
    phase: state.phase,
    holder: state.holder,
    pauseReason: state.pauseReason,
    rechecking: state.phase === "held" && state.needsRecheck,
    ready,
    baseline,
    conflict,
    canEdit,
    guard,
    touch,
    takeOver,
    resume,
    keepMine,
    discardMine,
  };
}
