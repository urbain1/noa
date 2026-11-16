import { createContext, useCallback, useContext, useSyncExternalStore } from "react";
import { otherHolder } from "../utils/editLock";

// Provided by App: { store, nurses, currentNurseId }. `store` comes from
// useEditLocks (one presence channel per tab, facility-scoped). With no
// provider (e.g. a component rendered on its own in a test), everything
// reads as "locking unavailable": nothing is shown as locked, nothing is
// disabled.
export const EditLockContext = createContext(null);

const INERT_SNAPSHOT = { status: "unavailable", locks: new Map(), selfKey: null };
const inertSubscribe = () => () => {};
const inertSnapshot = () => INERT_SNAPSHOT;

export function useEditLockContext() {
  return useContext(EditLockContext);
}

/**
 * Lock state for cards and one-tap actions.
 *
 * `holderOf(type, id)` is the holder when someone OTHER than this tab is
 * editing that record, else null. Use it to show the "is currently editing"
 * line and to disable one-tap actions on that record only.
 */
export function useEditLockView() {
  const ctx = useContext(EditLockContext);
  const store = ctx?.store;
  const snapshot = useSyncExternalStore(
    store ? store.subscribe : inertSubscribe,
    store ? store.getSnapshot : inertSnapshot
  );
  const holderOf = useCallback((type, id) => otherHolder(snapshot, type, id), [snapshot]);
  return {
    holderOf,
    status: snapshot.status,
    nurses: ctx?.nurses || [],
    currentNurseId: ctx?.currentNurseId || null,
  };
}
