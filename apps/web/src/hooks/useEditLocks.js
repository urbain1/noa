import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { collectLocks, createLockStore, lockChannelName, LOCK_JOIN_TIMEOUT_MS } from "../utils/editLock";

// If the channel is joined but no presence sync arrives, consider it joined
// with an empty lock list after this long.
const FIRST_SYNC_FALLBACK_MS = 1500;

function newTabKey() {
  try {
    return crypto.randomUUID();
  } catch {
    return `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

/**
 * The tab's connection to its facility's edit-lock channel. Called once, in
 * App, and handed down through EditLockContext.
 *
 * - One PRIVATE Realtime channel per facility, 'edit-locks:<facility_id>'.
 *   Private means Realtime checks the two realtime.messages policies from
 *   migration 0013 before this tab may see or send presence on it, so no
 *   other facility can read or spoof these locks.
 * - The presence key is a random id per tab, so two tabs of the same nurse
 *   are two separate claimants.
 * - If the channel can't be joined (0013 not applied, Realtime down) within
 *   LOCK_JOIN_TIMEOUT_MS, status becomes "unavailable" for the rest of the
 *   session: nothing is shown as locked or disabled, and saves rely on the
 *   stale-write check alone. The channel is removed so it stops retrying.
 * - A drop after joining is "disconnected": every dialog holding a lock
 *   pauses. Realtime rejoins by itself; dialogs don't silently re-take
 *   their lock, the nurse chooses "Continue editing".
 *
 * @returns the lock store (see createLockStore in utils/editLock.js)
 */
export function useEditLocks({ facilityId, nurseId }) {
  const [store] = useState(() => createLockStore(newTabKey()));

  useEffect(() => {
    if (!facilityId || !nurseId) return undefined;

    const selfKey = store.getSnapshot().selfKey;
    let disposed = false;
    let everJoined = false;
    let gotFirstSync = false;
    let channel = null;
    let syncFallback = null;

    store.set({ status: "connecting", locks: new Map() });

    const markUnavailable = (reason) => {
      if (disposed || everJoined) return;
      console.warn("[edit-locks] live locking unavailable; saves still use the stale-write check.", reason);
      clearTimeout(syncFallback);
      store.setTracker(null);
      store.set({ status: "unavailable", locks: new Map() });
      if (channel) supabase.removeChannel(channel);
      channel = null;
    };

    const joinTimer = setTimeout(() => markUnavailable("timed out joining the lock channel"), LOCK_JOIN_TIMEOUT_MS);

    const markJoined = () => {
      if (disposed || !channel) return;
      everJoined = true;
      clearTimeout(joinTimer);
      clearTimeout(syncFallback);
      store.set({ status: "joined", locks: collectLocks(channel.presenceState()) });
      // A claim made while connecting is sent now.
      const pending = store.trackedPayload();
      if (pending) {
        Promise.resolve(channel.track(pending)).catch((err) => console.warn("[edit-locks] track failed", err));
      }
    };

    const onOffline = () => {
      if (!disposed && everJoined) store.set({ status: "disconnected" });
    };
    // A short blip can come back without the channel ever reporting a drop.
    const onOnline = () => {
      if (!disposed && everJoined && channel?.state === "joined") markJoined();
    };
    // Best effort on tab close; the socket closing removes the entry anyway.
    const onPageHide = () => {
      if (channel && everJoined) Promise.resolve(channel.untrack()).catch(() => {});
    };
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    window.addEventListener("pagehide", onPageHide);

    (async () => {
      try {
        // Private channels authorise with the signed-in user's JWT.
        await supabase.realtime.setAuth();
      } catch (err) {
        console.warn("[edit-locks] realtime setAuth failed", err);
      }
      if (disposed) return;

      channel = supabase.channel(lockChannelName(facilityId), {
        config: { private: true, presence: { key: selfKey, enabled: true } },
      });

      channel.on("presence", { event: "sync" }, () => {
        if (disposed || !channel) return;
        if (!gotFirstSync) {
          gotFirstSync = true;
          if (!everJoined) {
            markJoined();
            return;
          }
        }
        if (store.getSnapshot().status === "joined") {
          store.set({ locks: collectLocks(channel.presenceState()) });
        }
      });

      store.setTracker((payload) => {
        if (!channel) return;
        const sent = payload ? channel.track(payload) : channel.untrack();
        Promise.resolve(sent).catch((err) => console.warn("[edit-locks] track failed", err));
      });

      channel.subscribe((status, err) => {
        if (disposed) return;
        if (status === "SUBSCRIBED") {
          if (everJoined) markJoined();
          else syncFallback = setTimeout(markJoined, FIRST_SYNC_FALLBACK_MS);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          if (!everJoined) markUnavailable(err?.message || status);
          else store.set({ status: "disconnected" });
        }
      });
    })();

    return () => {
      disposed = true;
      clearTimeout(joinTimer);
      clearTimeout(syncFallback);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pagehide", onPageHide);
      store.setTracker(null);
      if (channel) supabase.removeChannel(channel);
      channel = null;
      store.set({ status: "connecting", locks: new Map() });
    };
  }, [facilityId, nurseId, store]);

  return store;
}
