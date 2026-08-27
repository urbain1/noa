import { useState } from "react";
import { useTranslation } from "react-i18next";

export default function ManualRoomEntry({ onConfirm, onCancel, allPatients }) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");

  const patients = allPatients || [];
  const filteredPatients = patients.filter((p) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase().trim();
    return (
      (p.label || "").toLowerCase().includes(query) ||
      (p.location_label || "").toLowerCase().includes(query)
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="text-2xl font-bold text-gray-900">{t("patientMatch.selectPatient")}</h2>
        <p className="mt-1 text-sm text-gray-600">{t("patientMatch.selectPatientSubtitle")}</p>

        {/* Search Input */}
        <div className="mt-4">
          <input
            type="text"
            autoFocus
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("patientMatch.selectPlaceholder")}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Patient List */}
        <div className="mt-2 max-h-48 overflow-y-auto">
          {filteredPatients.length > 0 ? (
            filteredPatients.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onConfirm(p)}
                className="flex w-full items-center justify-between px-3 py-2 hover:bg-blue-50 cursor-pointer rounded-lg border-b border-gray-50 text-left"
              >
                <span className="font-medium text-gray-900">{p.label}</span>
                {p.location_label && (
                  <span className="text-sm text-gray-500">{p.location_label}</span>
                )}
              </button>
            ))
          ) : (
            <div className="px-3 py-4 text-center text-sm text-gray-500">
              {t("patientMatch.selectNoMatch")}
            </div>
          )}
        </div>

        {/* Cancel Button */}
        <div className="mt-4">
          <button
            type="button"
            onClick={onCancel}
            className="w-full rounded-lg bg-gray-200 px-4 py-2 font-semibold text-gray-700 transition-colors hover:bg-gray-700 hover:text-white"
          >
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
