import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useEditLockView } from "../hooks/editLockContext";
import { columnLabels, formatHistoryTime } from "../utils/historyFormat";
import { lockedByMessage, nurseDisplayName } from "../utils/editLockText";
import TakeOverConfirmDialog from "./TakeOverConfirmDialog";

const TONES = {
  info: "bg-gray-50 text-gray-600 ring-gray-200",
  notice: "bg-blue-50 text-blue-800 ring-blue-200",
  warn: "bg-amber-50 text-amber-900 ring-amber-200",
  danger: "bg-red-50 text-red-800 ring-red-200",
};

function ActionButton({ onClick, disabled, children, primary }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md px-2.5 py-1.5 text-xs font-semibold ring-1 transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
        primary
          ? "bg-amber-600 text-white ring-amber-600 hover:bg-amber-700"
          : "bg-white text-gray-800 ring-gray-300 hover:bg-gray-100"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Everything an edit dialog needs to say about its lock and about changes
 * made by others, in one place (scenarios.md SC-16). Driven by
 * useEditSession; renders nothing while the dialog simply holds the lock.
 *
 * `unsavedColumns` are column names the dialog holds unsaved values for.
 * Whenever saving isn't possible they are listed ("Not saved: ..."), so an
 * interrupted edit is never silently lost, and the values stay in the form.
 */
export default function EditLockBanner({
  session,
  recordType,
  unsavedColumns = [],
  onKeepMine,
  onDiscardMine,
  onSaveUnsaved,
  busy = false,
}) {
  const { t, i18n } = useTranslation();
  const { nurses, currentNurseId, status } = useEditLockView();
  const [confirmingTakeOver, setConfirmingTakeOver] = useState(false);

  const fieldList = (columns) => columnLabels(t, recordType, columns).join(", ");
  const notSaved = unsavedColumns.length > 0 ? t("editLock.notSaved", { fields: fieldList(unsavedColumns) }) : null;

  const holder = session.holder;
  const holderIsSelf = Boolean(holder && currentNurseId && holder.nurseId === currentNurseId);
  const holderName = holder ? nurseDisplayName(t, nurses, holder.nurseId) : null;

  let tone = null;
  let message = null;
  let actions = null;
  let showNotSaved = !session.canEdit;

  const conflict = session.conflict;
  if (conflict) {
    tone = "danger";
    showNotSaved = true;
    const bySelf = conflict.byNurseId && conflict.byNurseId === currentNurseId;
    const byName = conflict.byNurseId ? nurseDisplayName(t, nurses, conflict.byNurseId) : null;
    if (conflict.kind === "deleted") {
      message = bySelf
        ? t("editLock.deletedBySelf")
        : byName
          ? t("editLock.deletedBy", { name: byName })
          : t("editLock.deletedBySomeone");
    } else {
      const fields = fieldList(conflict.columns);
      const time = conflict.at ? formatHistoryTime(conflict.at, i18n.language) : "";
      message = bySelf
        ? t("editLock.changedBySelf", { fields, time })
        : byName
          ? t("editLock.changedBy", { name: byName, fields, time })
          : t("editLock.changedBySomeone", { fields });
      actions = (
        <>
          {unsavedColumns.length > 0 && (
            <ActionButton primary onClick={onKeepMine} disabled={busy}>
              {t("editLock.keepMine")}
            </ActionButton>
          )}
          <ActionButton onClick={onDiscardMine} disabled={busy}>
            {t("editLock.discardMine")}
          </ActionButton>
        </>
      );
    }
  } else if (session.phase === "locked") {
    tone = "warn";
    message = lockedByMessage(t, holder, nurses, currentNurseId);
    actions = (
      <ActionButton primary onClick={() => setConfirmingTakeOver(true)} disabled={busy}>
        {t("editLock.takeOver")}
      </ActionButton>
    );
  } else if (session.phase === "lost") {
    tone = "danger";
    message = holderIsSelf ? t("editLock.takenOverSelf") : t("editLock.takenOver", { name: holderName || t("editLock.aColleague") });
    actions = (
      <ActionButton onClick={session.resume} disabled={busy}>
        {t("editLock.continueEditing")}
      </ActionButton>
    );
  } else if (session.phase === "paused") {
    tone = "warn";
    const offline = session.pauseReason === "disconnected";
    message = offline ? t("editLock.pausedOffline") : t("editLock.pausedIdle");
    const waiting = offline && status !== "joined";
    actions = waiting ? (
      <span className="text-xs text-amber-800">{t("editLock.waitingForConnection")}</span>
    ) : (
      <ActionButton onClick={session.resume} disabled={busy}>
        {t("editLock.continueEditing")}
      </ActionButton>
    );
  } else if (session.phase === "connecting" || !session.ready) {
    tone = "info";
    message = t("editLock.connecting");
  } else if (session.rechecking) {
    tone = "info";
    message = t("editLock.rechecking");
  } else if (session.phase === "unavailable") {
    tone = "info";
    message = t("editLock.unavailable");
    showNotSaved = false;
  }

  // Back in control with values that never made it: say so and offer to
  // save them now.
  if (!message && session.canEdit && onSaveUnsaved && unsavedColumns.length > 0) {
    tone = "notice";
    message = notSaved;
    showNotSaved = false;
    actions = (
      <ActionButton primary onClick={onSaveUnsaved} disabled={busy}>
        {t("editLock.saveMine")}
      </ActionButton>
    );
  }

  if (!message) return null;

  return (
    <>
      <div role="status" className={`rounded-lg p-3 text-sm ring-1 ${TONES[tone]}`}>
        <p className="break-words">{message}</p>
        {showNotSaved && notSaved && <p className="mt-1 break-words text-xs font-semibold">{notSaved}</p>}
        {actions && <div className="mt-2 flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {confirmingTakeOver && (
        <TakeOverConfirmDialog
          holderName={holderName}
          isSelf={holderIsSelf}
          onCancel={() => setConfirmingTakeOver(false)}
          onConfirm={() => {
            setConfirmingTakeOver(false);
            session.takeOver();
          }}
        />
      )}
    </>
  );
}
