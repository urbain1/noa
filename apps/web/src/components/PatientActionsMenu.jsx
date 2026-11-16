import { useState } from "react";
import { useTranslation } from "react-i18next";

// The patient card's ⋯ menu. It replaced the edit pencil, so the card header
// gained no new always-visible button: Edit patient moved in here, and
// History sits beside it.
//
// Same open/close pattern as TopRightMenu: a transparent full-screen layer
// under the popover catches the outside tap that closes it.
export default function PatientActionsMenu({ onEdit, onHistory }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const choose = (action) => {
    setOpen(false);
    action?.();
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("patientCard.menuAria")}
        className="rounded p-1 text-gray-400 transition-colors duration-150 hover:text-blue-500"
      >
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <circle cx="4" cy="10" r="1.75" />
          <circle cx="10" cy="10" r="1.75" />
          <circle cx="16" cy="10" r="1.75" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="absolute right-0 top-full z-30 mt-1 w-44 rounded-lg border border-gray-100 bg-white py-1 shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => choose(onEdit)}
              className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
            >
              {t("patientCard.menuEdit")}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => choose(onHistory)}
              className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
            >
              {t("patientCard.menuHistory")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
