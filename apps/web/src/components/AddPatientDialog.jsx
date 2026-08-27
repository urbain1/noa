import { useState } from "react";
import { useTranslation } from "react-i18next";
import { codeStatusLabel } from "../i18n/enums";

// Stored as-is: these are the canonical values the patients table holds.
const CODE_STATUS_OPTIONS = ["Full Code", "DNR", "DNR/DNI", "Comfort Care"];

// `initialFields` pre-fills the form from a voice capture (App.jsx
// handlePatientParsed). This dialog is the review step of that flow, not a
// second way of creating a patient: a patient is only ever created by the
// nurse confirming these fields here. Fields the parser couldn't extract
// arrive undefined and stay blank -- nothing is invented to fill them.
export default function AddPatientDialog({ initialFields, onCancel, onSave }) {
  const { t } = useTranslation();
  const fromVoice = Boolean(initialFields);
  const [label, setLabel] = useState(initialFields?.label || "");
  const [diagnosis, setDiagnosis] = useState(initialFields?.diagnosis || "");
  const [age, setAge] = useState(
    initialFields?.age === null || initialFields?.age === undefined ? "" : String(initialFields.age)
  );
  const [codeStatus, setCodeStatus] = useState(initialFields?.codeStatus || "Full Code");
  const [attendingPhysician, setAttendingPhysician] = useState(initialFields?.attendingPhysician || "");
  const [allergiesInput, setAllergiesInput] = useState((initialFields?.allergies || []).join(", "));
  const [admissionDate, setAdmissionDate] = useState(initialFields?.admissionDate || "");
  const [locationLabel, setLocationLabel] = useState(initialFields?.locationLabel || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSave = async () => {
    const trimmedLabel = label.trim();
    if (!trimmedLabel) {
      setError(t("errors.labelRequired"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const allergies = allergiesInput
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean);
      await onSave({
        label: trimmedLabel,
        diagnosis: diagnosis.trim(),
        age: age.trim() === "" ? null : parseInt(age, 10),
        codeStatus,
        attendingPhysician: attendingPhysician.trim(),
        allergies,
        admissionDate: admissionDate || null,
        locationLabel: locationLabel.trim(),
      });
    } catch (err) {
      setError(err.message || t("errors.createPatient"));
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 px-4"
      onClick={onCancel}
    >
      <div
        className="relative flex w-full max-w-lg flex-col rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <h2 className="text-xl font-bold text-gray-900">{t("patientDialog.addTitle")}</h2>
          <button
            onClick={onCancel}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:text-gray-700"
            aria-label={t("patientDialog.closeAria")}
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-4 overflow-y-auto px-6 pb-2" style={{ maxHeight: "70vh" }}>
          {fromVoice && (
            <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
              {t("patientDialog.voiceReviewHint")}
            </p>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("patientDialog.label")}</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t("patientDialog.labelPlaceholder")}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("patientDialog.diagnosis")}</label>
            <textarea
              value={diagnosis}
              onChange={(e) => setDiagnosis(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("patientDialog.age")} <span className="font-normal text-gray-400">{t("common.optional")}</span></label>
            <input
              type="number"
              min="0"
              max="130"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              placeholder={t("patientDialog.agePlaceholder")}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("patientDialog.codeStatus")}</label>
            <select
              value={codeStatus}
              onChange={(e) => setCodeStatus(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {CODE_STATUS_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{codeStatusLabel(t, opt)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("patientDialog.attendingPhysician")}</label>
            <input
              type="text"
              value={attendingPhysician}
              onChange={(e) => setAttendingPhysician(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("patientDialog.allergies")}</label>
            <input
              type="text"
              value={allergiesInput}
              onChange={(e) => setAllergiesInput(e.target.value)}
              placeholder={t("patientDialog.allergiesPlaceholder")}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("patientDialog.admissionDate")}</label>
            <input
              type="date"
              value={admissionDate}
              onChange={(e) => setAdmissionDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("patientDialog.locationLabel")}</label>
            <input
              type="text"
              value={locationLabel}
              onChange={(e) => setLocationLabel(e.target.value)}
              placeholder={t("patientDialog.locationLabelPlaceholder")}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-center text-sm text-red-600">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 border-t border-gray-200 px-6 py-4">
          <button
            onClick={onCancel}
            className="flex-1 rounded-lg bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-200 active:scale-[0.97]"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={handleSave}
            disabled={!label.trim() || saving}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? t("common.saving") : t("patientDialog.addButton")}
          </button>
        </div>
      </div>
    </div>
  );
}
