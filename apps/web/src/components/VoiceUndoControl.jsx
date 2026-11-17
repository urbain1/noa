import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import VoiceUndoSession from "./VoiceUndoSession";
import { planUndo, undoSecondsLeft } from "../utils/voiceUndo";
import { nurseDisplayName } from "../utils/editLockText";
import { columnLabels, formatHistoryTime } from "../utils/historyFormat";

// Why an undo was refused, in the nurse's language.
function refusalText(t, language, result, nurses, currentNurseId, recordType) {
  const time = result.at ? formatHistoryTime(result.at, language) : "";
  switch (result.reason) {
    case "changed":
      if (result.byNurseId && result.byNurseId === currentNurseId) return t("voiceQueue.summary.undoChangedBySelf", { time });
      if (result.byNurseId) return t("voiceQueue.summary.undoChangedBy", { name: nurseDisplayName(t, nurses, result.byNurseId), time });
      return t("voiceQueue.summary.undoChangedBySomeone");
    case "deleted":
      return t("voiceQueue.summary.undoDeleted");
    case "locked":
      return t("voiceQueue.summary.undoLocked", { name: nurseDisplayName(t, nurses, result.byNurseId) });
    case "lockLost":
      return t("voiceQueue.summary.undoLockLost");
    case "expired":
      return t("voiceQueue.summary.undoExpired");
    case "partial":
      return t("voiceQueue.summary.undoPartial", {
        restored: columnLabels(t, recordType, result.restored || []).join(", "),
        missing: columnLabels(t, recordType, result.missing || []).join(", "),
      });
    default:
      return t("voiceQueue.summary.undoFailed");
  }
}

// The Undo control on one line of the voice command summary.
//
// Offered for 60 seconds after the action was applied, for what can be
// undone: an edit (its previous values go back) and a created task (it is
// deleted through the existing delete path). A created note or patient has
// no delete path, so there is no button, only a line saying where to change
// it. Each undo runs through VoiceUndoSession, i.e. the same lock and
// stale-write guard as an edit, and is refused, with the reason, if the
// record changed since.
//
// `onRowRestored(recordType, row)` / `onTaskDeleted(task)` keep the app's
// copy of the roster in step. `onUndone()` tells the summary.
export default function VoiceUndoControl({ applied, facilityId, nurses, currentNurseId, onRowRestored, onTaskDeleted, onUndone }) {
  const { t, i18n } = useTranslation();
  const [plans] = useState(() => planUndo(applied));
  const [now, setNow] = useState(() => Date.now());
  // phase: "idle" | "running" | "undone" | "refused"
  const [state, setState] = useState({ phase: "idle", index: 0, message: null });

  useEffect(() => {
    if (state.phase !== "idle" || plans.length === 0) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [state.phase, plans.length]);

  if (plans.length === 0) {
    if (applied?.kind === "createNote" || applied?.kind === "createPatient") {
      return <p className="mt-2 text-xs text-gray-500">{t("voiceQueue.summary.noUndoCreated")}</p>;
    }
    return null;
  }

  const seconds = undoSecondsLeft(applied, now);

  const start = () => {
    // Checked at the moment of the press, not only when the button was drawn.
    if (undoSecondsLeft(applied, Date.now()) <= 0) {
      setState({ phase: "refused", index: 0, message: t("voiceQueue.summary.undoExpired") });
      return;
    }
    setState({ phase: "running", index: 0, message: null });
  };

  const handleResult = (result) => {
    const plan = plans[state.index];
    if (result.ok) {
      if (result.row) onRowRestored?.(plan.recordType, result.row);
      else onTaskDeleted?.(plan.expected);
      if (state.index + 1 < plans.length) {
        setState({ phase: "running", index: state.index + 1, message: null });
      } else {
        setState({ phase: "undone", index: 0, message: null });
        onUndone?.();
      }
      return;
    }
    if (result.reason === "partial" && result.row) onRowRestored?.(plan.recordType, result.row);
    const message = refusalText(t, i18n.language, result, nurses, currentNurseId, plan.recordType);
    // A colleague's lock is temporary: the nurse may try again while the
    // minute lasts. Anything else is final.
    const retry = (result.reason === "locked" || result.reason === "lockLost") && state.index === 0;
    setState({ phase: retry ? "idle" : "refused", index: 0, message });
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
      {state.phase === "idle" && seconds > 0 && (
        <button
          type="button"
          onClick={start}
          className="rounded-md bg-white px-2.5 py-1.5 font-semibold text-gray-800 ring-1 ring-gray-300 transition-colors hover:bg-gray-100"
        >
          {t("voiceQueue.summary.undo", { seconds })}
        </button>
      )}
      {state.phase === "running" && (
        <>
          <span role="status" className="text-gray-500">{t("status.undoing")}</span>
          <VoiceUndoSession key={state.index} plan={plans[state.index]} facilityId={facilityId} onResult={handleResult} />
        </>
      )}
      {state.phase === "undone" && (
        <span role="status" className="font-semibold text-green-700">{t("voiceQueue.summary.undone")}</span>
      )}
      {state.message && (
        <span role="alert" className="break-words text-red-700">{state.message}</span>
      )}
    </div>
  );
}
