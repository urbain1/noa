import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

// Canonical value kept in state; only the label is translated, so the value
// handed back through onSend stays stable across languages.
const METHODS = [
  { value: "Secure Message", labelKey: "handoff.send.methodSecureMessage" },
  { value: "Text", labelKey: "handoff.send.methodText" },
  { value: "Email", labelKey: "handoff.send.methodEmail" },
];

// `nurses` is the same facility-scoped list the task assignee picker uses
// (lib/nurses.js fetchFacilityNurses). It is scoped by
// `nurses_read_same_facility` in the database, not here -- no client-side
// facility filter is added, and none should be, for the reason set out in
// that file: the boundary lives in the policy.
//
// These are suggestions, not a restriction. The incoming nurse is very often
// not a Noa user at all, so the free-text field stays the source of truth
// and stays fully usable on its own; picking a colleague just fills it in.
export default function SendHandoffDialog({ nurses = [], currentNurseId, onCancel, onSend }) {
  const { t } = useTranslation();
  const [nurseName, setNurseName] = useState("");
  const [selectedNurseId, setSelectedNurseId] = useState(null);
  const [sendMethod, setSendMethod] = useState("Secure Message");

  // Same display rule as AssigneeSelect: name, falling back to email.
  // Yourself is never a suggestion -- a handoff goes to the incoming nurse.
  const colleagues = useMemo(
    () =>
      nurses
        .filter((n) => n.id !== currentNurseId)
        .map((n) => ({ id: n.id, label: n.name || n.email }))
        .filter((n) => n.label),
    [nurses, currentNurseId],
  );

  const typed = nurseName.trim().toLowerCase();
  const suggestions = useMemo(
    () => (typed ? colleagues.filter((n) => n.label.toLowerCase().includes(typed)) : colleagues),
    [colleagues, typed],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 px-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-gray-900">{t("handoff.send.title")}</h2>
        <p className="mt-1 text-sm text-gray-500">
          {t("handoff.send.subtitle")}
        </p>

        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t("handoff.send.nurseNameLabel")}
          </label>
          <input
            type="text"
            autoFocus
            placeholder={t("handoff.send.nurseNamePlaceholder")}
            value={nurseName}
            onChange={(e) => {
              setNurseName(e.target.value);
              // Typing over a picked colleague makes this a free-text
              // recipient again, so the id doesn't outlive the name.
              setSelectedNurseId(null);
            }}
            className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {colleagues.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-medium text-gray-500">
              {t("handoff.send.colleaguesLabel")}
            </p>
            {suggestions.length > 0 ? (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {suggestions.map((nurse) => {
                  const picked = selectedNurseId === nurse.id;
                  return (
                    <button
                      key={nurse.id}
                      type="button"
                      onClick={() => {
                        setNurseName(nurse.label);
                        setSelectedNurseId(nurse.id);
                      }}
                      aria-pressed={picked}
                      className={`max-w-full truncate rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                        picked
                          ? "bg-blue-600 text-white"
                          : "bg-blue-50 text-blue-700 ring-1 ring-blue-200 hover:bg-blue-600 hover:text-white"
                      }`}
                    >
                      {nurse.label}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="mt-1.5 text-xs text-gray-400">{t("handoff.send.noColleagueMatch")}</p>
            )}
          </div>
        )}

        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t("handoff.send.viaLabel")}
          </label>
          <div className="flex flex-wrap gap-2">
            {METHODS.map((method) => (
              <button
                key={method.value}
                onClick={() => setSendMethod(method.value)}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  sendMethod === method.value
                    ? "bg-blue-100 text-blue-700 border border-blue-300"
                    : "bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200"
                }`}
              >
                {t(method.labelKey)}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-700 hover:text-white active:scale-[0.97]"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={() =>
              onSend({
                nurseName: nurseName.trim(),
                // null for a recipient who isn't a Noa user, which stays a
                // fully supported case.
                nurseId: selectedNurseId,
                sendMethod,
              })
            }
            disabled={!nurseName.trim()}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t("handoff.send.sendButton")}
          </button>
        </div>
      </div>
    </div>
  );
}
