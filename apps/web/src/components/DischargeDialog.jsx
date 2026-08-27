import { useState } from "react";
import { useTranslation } from "react-i18next";

// Discharge planning for one patient. The checklist and free-text notes are
// carried over from the demo version; what changed is where the tasks go --
// they are now real rows in `tasks` (see App.handleDischargeConfirm), not
// local-only objects that vanished on reload.
//
// Patient identity is read from the real Supabase columns (`label`,
// `location_label`, `diagnosis`). The demo-era `name`/`room` fields this
// dialog used to render don't exist on those rows, which is why it showed
// an empty header.
export default function DischargeDialog({ patient, onCancel, onConfirm }) {
  const { t } = useTranslation();
  const [notifyPatient, setNotifyPatient] = useState(true);
  const [needsNursingHome, setNeedsNursingHome] = useState(false);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const nothingSelected = !notifyPatient && !needsNursingHome;

  async function handleConfirm() {
    if (nothingSelected || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onConfirm({ notifyPatient, needsNursingHome, notes });
    } catch (err) {
      console.error("Discharge planning error:", err);
      setError(err.message || t("errors.createDischargeTasks"));
      setSaving(false);
    }
  }

  const subtitleParts = [patient.location_label, patient.diagnosis].filter(Boolean);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={saving ? undefined : onCancel}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-gray-900">
          {t("discharge.title", { patient: patient.label })}
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          {subtitleParts.length > 0 ? subtitleParts.join(" · ") : t("patientCard.noDiagnosis")}
        </p>

        <div className="mt-5 flex flex-col gap-3">
          <label className="flex items-center gap-3 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={notifyPatient}
              onChange={(e) => setNotifyPatient(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            {t("discharge.notifyPatient")}
          </label>

          <label className="flex items-center gap-3 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={needsNursingHome}
              onChange={(e) => setNeedsNursingHome(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            {t("discharge.requestNursingHome")}
          </label>
        </div>

        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700">
            {t("discharge.notesLabel")}
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder={t("discharge.notesPlaceholder")}
          />
        </div>

        {nothingSelected && (
          <p className="mt-3 text-xs text-gray-500">{t("discharge.selectAtLeastOne")}</p>
        )}

        {error && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        )}

        <div className="mt-5 flex gap-3">
          <button
            onClick={onCancel}
            disabled={saving}
            className="flex-1 rounded-lg border border-gray-300 bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-700 hover:text-white active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving || nothingSelected}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? t("common.saving") : t("discharge.createTasks")}
          </button>
        </div>
      </div>
    </div>
  );
}
