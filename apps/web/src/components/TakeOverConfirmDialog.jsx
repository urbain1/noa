import { useTranslation } from "react-i18next";

// The confirmation step before taking over an edit lock. Says plainly what
// happens to the other nurse: their screen stops saving at once and they are
// told, and anything they haven't saved stays on their screen only.
//
// Layered above the edit dialog (z-[60]); backdrop and Cancel both back out
// without doing anything.
export default function TakeOverConfirmDialog({ holderName, isSelf, onCancel, onConfirm }) {
  const { t } = useTranslation();
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="take-over-title"
        className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="take-over-title" className="text-lg font-bold text-gray-900">
          {t("editLock.takeOverTitle")}
        </h3>
        <p className="mt-2 text-sm text-gray-600">
          {isSelf ? t("editLock.takeOverBodySelf") : t("editLock.takeOverBody", { name: holderName })}
        </p>
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-700 hover:text-white"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-700"
          >
            {t("editLock.takeOver")}
          </button>
        </div>
      </div>
    </div>
  );
}
