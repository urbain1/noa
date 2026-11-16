import { useTranslation } from "react-i18next";
import { lockedByMessage } from "../utils/editLockText";

// The line a card shows while a colleague has that record open for editing:
// "[name] is currently editing this. Wait, or ask them to finish." The card
// disables its one-tap actions alongside it; opening the edit dialog is
// still possible and is where "Take over" lives.
export default function EditLockNotice({ holder, nurses, currentNurseId, className = "" }) {
  const { t } = useTranslation();
  if (!holder) return null;
  return (
    <p
      role="status"
      className={`flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200 ${className}`}
    >
      <svg className="mt-px h-3.5 w-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fillRule="evenodd" d="M10 2a4 4 0 00-4 4v2H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-1V6a4 4 0 00-4-4zm2 6V6a2 2 0 10-4 0v2h4z" clipRule="evenodd" />
      </svg>
      <span className="break-words">{lockedByMessage(t, holder, nurses, currentNurseId)}</span>
    </p>
  );
}
