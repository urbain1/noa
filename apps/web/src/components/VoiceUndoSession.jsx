import { useCallback, useEffect, useRef } from "react";
import { useEditSession } from "../hooks/useEditSession";
import { fetchLastChange } from "../lib/auditLog";
import { fetchPatientRow, fetchTaskRow } from "../lib/patients";
import { changeSince, executeUndoSteps } from "../utils/voiceUndo";

// How long to wait for the lock before giving up. Longer than the lock
// channel's own join timeout, after which locking reports "unavailable" and
// the stale-write check alone applies.
const UNDO_TIMEOUT_MS = 12000;

// One record's undo, run through the SAME guarded path as an edit: a real
// useEditSession, so the record's lock is claimed for the moment of the
// write and the write goes through the stale-write check. Renders nothing.
// Mounted while the undo runs; unmounting releases the lock.
//
// useEditSession takes the fresh row as its baseline when it opens, which is
// right for a dialog but not for an undo: an undo must refuse if the record
// is no longer what the voice command left. So before anything is written,
// the fresh row is compared with `plan.expected` here. `hasUnsaved` is always
// true, so a change that lands while the lock is being taken becomes a
// conflict instead of being adopted quietly.
//
// `onResult` is called exactly once:
//   { ok: true, row }                         row is null after a delete
//   { ok: false, reason, byNurseId?, at?, columns?, restored?, missing?, row? }
// reason: "changed" | "deleted" | "locked" | "lockLost" | "partial" | "failed"
export default function VoiceUndoSession({ plan, facilityId, onResult }) {
  const reported = useRef(false);
  const running = useRef(false);
  const staleRef = useRef(null);

  const report = (result) => {
    if (reported.current) return;
    reported.current = true;
    onResult(result);
  };
  const reportRef = useRef(report);
  useEffect(() => {
    reportRef.current = report;
  });

  const loadRow = useCallback(
    () => (plan.recordType === "patient" ? fetchPatientRow(facilityId, plan.recordId) : fetchTaskRow(facilityId, plan.recordId)),
    [plan.recordType, plan.recordId, facilityId],
  );

  const session = useEditSession({
    recordType: plan.recordType,
    recordId: plan.recordId,
    facilityId,
    initialRow: plan.expected,
    loadRow,
    // Called with the fresh row when the session opens (and if it re-reads).
    onBaselineReplaced: (row) => {
      const change = changeSince(plan.expected, row);
      if (change) staleRef.current = change;
    },
    hasUnsaved: () => true,
  });

  const { ready, canEdit, conflict, phase, holder, guard } = session;

  useEffect(() => {
    if (reported.current || running.current) return;

    // The session itself found the record changed or gone.
    if (conflict) {
      reportRef.current({ ok: false, reason: conflict.kind === "deleted" ? "deleted" : "changed", byNurseId: conflict.byNurseId, at: conflict.at, columns: conflict.columns });
      return;
    }
    // Changed between the voice command and now: say who.
    if (ready && staleRef.current) {
      const change = staleRef.current;
      running.current = true;
      fetchLastChange(facilityId, plan.recordId)
        .catch(() => null)
        .then((last) => reportRef.current({ ok: false, ...change, byNurseId: last?.nurse_id ?? null, at: last?.created_at ?? null }));
      return;
    }
    if (phase === "locked") {
      reportRef.current({ ok: false, reason: "locked", byNurseId: holder?.nurseId ?? null });
      return;
    }
    if (phase === "lost" || phase === "paused") {
      reportRef.current({ ok: false, reason: "lockLost" });
      return;
    }
    if (!canEdit) return;

    running.current = true;
    guard(() => executeUndoSteps(plan, facilityId)).then(
      (row) => reportRef.current({ ok: true, row: row ?? null }),
      (err) => {
        if (err?.code === "EDIT_NOT_HELD") reportRef.current({ ok: false, reason: "lockLost" });
        else if (err?.code === "EDIT_CONFLICT") {
          // Refused by the stale-write check at the moment of writing:
          // someone changed or deleted the record in the meantime. Say which,
          // and who.
          Promise.all([loadRow().catch(() => undefined), fetchLastChange(facilityId, plan.recordId).catch(() => null)]).then(([fresh, last]) =>
            reportRef.current({ ok: false, reason: fresh === null ? "deleted" : "changed", byNurseId: last?.nurse_id ?? null, at: last?.created_at ?? null }),
          );
        } else if (err?.code === "RESTORE_STALE") reportRef.current({ ok: false, reason: "changed", byNurseId: null, at: null, columns: ["status"] });
        else if (err?.code === "UNDO_PARTIAL") {
          console.error("[voice-undo] partly undone", err.cause);
          reportRef.current({ ok: false, reason: "partial", restored: err.restored, missing: err.missing, row: err.row });
        } else {
          console.error("[voice-undo] undo failed", err);
          reportRef.current({ ok: false, reason: "failed" });
        }
      },
    );
  }, [ready, canEdit, conflict, phase, holder, guard, plan, facilityId, loadRow]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!running.current) reportRef.current({ ok: false, reason: "lockLost" });
    }, UNDO_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  return null;
}
