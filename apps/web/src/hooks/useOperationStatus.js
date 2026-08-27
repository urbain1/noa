import { useCallback, useEffect, useRef, useState } from "react";

// How long a finished operation's confirmation stays on screen before it
// fades on its own. Carried over from the per-field auto-save flash in
// TaskEditDialog, which this hook generalises.
export const DONE_FLASH_MS = 1800;

// A failure stays up longer than a success -- it has to be read, not just
// noticed -- but it still clears itself. Nothing this hook sets is ever
// permanent, which is what keeps a rejected promise from leaving a control
// disabled for the rest of the session.
export const ERROR_FLASH_MS = 5000;

/**
 * One place to track "something is happening" for any async operation, so
 * every feature reports progress the same way instead of each growing its
 * own boolean and its own spinner.
 *
 * An operation is identified by a `name` the caller chooses, and moves
 * through: absent -> "running" -> "done" or "error", both of which fade on
 * their own. The phase is
 * always left by way of a `finally`, so a rejected promise can never leave a
 * button spinning or a form permanently disabled -- that is the whole point
 * of routing writes through here rather than through a bare
 * `setLoading(true)`.
 *
 * Messages are i18n keys, not text: the operation says what it is
 * ("status.creatingTask"), and `OperationStatus` translates it at render
 * time, so a language change mid-flight still reads correctly.
 *
 * `surface` is where the caller intends this operation to be shown
 * ("inline" | "button" | "overlay" | "toast"). It is only a hint for the
 * component; the hook itself doesn't render anything.
 *
 * Several named operations can run at once (per-field auto-save relies on
 * that); the same name started twice replaces the earlier state rather than
 * stacking.
 */
export function useOperationStatus({ doneFlashMs = DONE_FLASH_MS, errorFlashMs = ERROR_FLASH_MS } = {}) {
  const [operations, setOperations] = useState({});
  const flashTimers = useRef({});
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const timersAtMount = flashTimers.current;
    return () => {
      mountedRef.current = false;
      Object.values(timersAtMount).forEach(clearTimeout);
    };
  }, []);

  // An operation can outlive the component that started it (a voice capture
  // screen closes as soon as its task is written). Dropping the update is
  // correct there -- there is nothing left to show it on.
  const write = useCallback((name, value) => {
    if (!mountedRef.current) return;
    setOperations((prev) => {
      if (value === undefined) {
        if (!(name in prev)) return prev;
        const next = { ...prev };
        delete next[name];
        return next;
      }
      return { ...prev, [name]: value };
    });
  }, []);

  const clear = useCallback(
    (name) => {
      clearTimeout(flashTimers.current[name]);
      write(name, undefined);
    },
    [write],
  );

  /**
   * Run `task` while reporting it under `name`.
   *
   * @param {string} name          Operation key, e.g. "createTask" or "field:status".
   * @param {object} options
   * @param {string} options.messageKey   i18n key for the in-progress message. Required:
   *                                      an unlabelled spinner is what makes a screen read as frozen.
   * @param {object} [options.messageParams]  Interpolation values for that key.
   * @param {string} [options.doneKey]    i18n key for a brief success confirmation. Omit for
   *                                      operations whose result is its own confirmation
   *                                      (a report opening, a dialog closing).
   * @param {string} [options.errorKey]   i18n key shown if `task` rejects.
   * @param {string} [options.surface]    Where this is meant to be shown.
   * @returns {Promise<*>} whatever `task` resolves to. Rejections are re-thrown
   *                       after the status is cleared, so callers keep their own
   *                       error handling.
   */
  const run = useCallback(
    async (name, options, task) => {
      const { messageKey, messageParams, doneKey, errorKey, surface = "inline" } = options;
      clearTimeout(flashTimers.current[name]);
      write(name, { phase: "running", messageKey, messageParams, surface });

      try {
        const result = await task();
        if (doneKey) {
          write(name, { phase: "done", messageKey: doneKey, surface });
          flashTimers.current[name] = setTimeout(() => write(name, undefined), doneFlashMs);
        } else {
          write(name, undefined);
        }
        return result;
      } catch (err) {
        if (errorKey) {
          write(name, { phase: "error", messageKey: errorKey, surface });
          flashTimers.current[name] = setTimeout(() => write(name, undefined), errorFlashMs);
        } else {
          write(name, undefined);
        }
        throw err;
      }
    },
    [write, doneFlashMs, errorFlashMs],
  );

  const isRunning = useCallback((name) => operations[name]?.phase === "running", [operations]);

  // True while any operation the caller marked as blocking-worthy is in
  // flight. Callers decide what that means for their own screen.
  const anyRunning = Object.values(operations).some((op) => op.phase === "running");

  return { operations, run, clear, isRunning, anyRunning };
}
