import { useTranslation } from "react-i18next";
import EditLockNotice from "./EditLockNotice";

function getTimeElapsed(t, timestamp) {
  const diff = Math.floor((Date.now() - new Date(timestamp).getTime()) / 60000);
  if (diff < 1) return t("noteCard.justNow");
  if (diff < 60) return t("noteCard.minutesAgo", { count: diff });
  const hours = Math.floor(diff / 60);
  if (hours < 24) return t("noteCard.hoursAgo", { count: hours });
  const days = Math.floor(hours / 24);
  return t("noteCard.daysAgo", { count: days });
}

// `onEdit` is passed only for notes the current nurse wrote (PatientCard);
// without it there is no Edit control. `lockHolder`: a colleague editing it.
export default function NoteCard({ note, isNew, onEdit, lockHolder, nurses, currentNurseId }) {
  const { t } = useTranslation();

  return (
    <div className={`rounded-lg border p-3 shadow-sm transition-shadow duration-200 hover:shadow-md ${isNew ? 'bg-blue-50 border-blue-200' : 'border-gray-200 bg-white'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm text-gray-900">{note.content}</p>
          <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
            <span>{getTimeElapsed(t, note.created_at)}</span>
          </div>
        </div>
        {onEdit && (
          <button
            type="button"
            onClick={() => onEdit(note)}
            aria-label={t("noteCard.editAria")}
            className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-blue-600 transition-colors hover:bg-blue-50"
          >
            {t("noteCard.edit")}
          </button>
        )}
      </div>
      <EditLockNotice holder={lockHolder} nurses={nurses} currentNurseId={currentNurseId} className="mt-2" />
    </div>
  );
}
