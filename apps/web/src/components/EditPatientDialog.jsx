import { useState } from "react";
import { useTranslation } from "react-i18next";
import { codeStatusLabel } from "../i18n/enums";
import { errorText } from "../utils/errors";
import { columnLabels } from "../utils/historyFormat";
import { fetchPatientRow } from "../lib/patients";
import { useEditSession } from "../hooks/useEditSession";
import EditLockBanner from "./EditLockBanner";

// Stored as-is: these are the canonical values the patients table holds.
const CODE_STATUS_OPTIONS = ["Full Code", "DNR", "DNR/DNI", "Comfort Care"];

// The form's view of a patient row. Kept as strings, the way the inputs hold
// them; `toPayload` turns them back into what updatePatient expects.
function fieldsFromRow(row) {
  return {
    diagnosis: row?.diagnosis || "",
    age: row?.age != null ? String(row.age) : "",
    codeStatus: row?.code_status || "Full Code",
    allergiesInput: (row?.allergies || []).join(", "),
    admissionDate: row?.admission_date || "",
    locationLabel: row?.location_label || "",
  };
}

// Form field -> patients column, for "Not saved: ..." and conflict messages.
const FIELD_COLUMNS = {
  diagnosis: "diagnosis",
  age: "age",
  codeStatus: "code_status",
  allergiesInput: "allergies",
  admissionDate: "admission_date",
  locationLabel: "location_label",
};

function normalise(field, value) {
  if (field === "allergiesInput") {
    return value.split(",").map((a) => a.trim()).filter(Boolean).join(",");
  }
  return typeof value === "string" ? value.trim() : value;
}

// Columns whose value in the form differs from the row it was opened from.
function unsavedColumnsOf(fields, baseline) {
  const saved = fieldsFromRow(baseline);
  return Object.keys(FIELD_COLUMNS)
    .filter((f) => normalise(f, fields[f]) !== normalise(f, saved[f]))
    .map((f) => FIELD_COLUMNS[f]);
}

function toPayload(fields) {
  return {
    diagnosis: fields.diagnosis.trim(),
    age: fields.age.trim() === "" ? null : parseInt(fields.age, 10),
    codeStatus: fields.codeStatus,
    allergies: fields.allergiesInput.split(",").map((a) => a.trim()).filter(Boolean),
    admissionDate: fields.admissionDate || null,
    locationLabel: fields.locationLabel.trim(),
  };
}

// Editing a patient locks that patient record (not its tasks) for colleagues
// at the same facility, and every save is checked against changes made since
// the dialog opened (useEditSession). Typed values are never discarded
// without the nurse choosing to.
export default function EditPatientDialog({ patient, facilityId, onRowRefreshed, onCancel, onSave }) {
  const { t } = useTranslation();
  const [fields, setFields] = useState(() => fieldsFromRow(patient));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const session = useEditSession({
    recordType: "patient",
    recordId: patient.id,
    facilityId,
    initialRow: patient,
    loadRow: () => fetchPatientRow(facilityId, patient.id),
    onFreshRow: (row) => onRowRefreshed?.("patient", row),
    onBaselineReplaced: (row) => setFields(fieldsFromRow(row)),
    hasUnsaved: (baselineRow) => unsavedColumnsOf(fields, baselineRow).length > 0,
  });

  const unsavedColumns = unsavedColumnsOf(fields, session.baseline);
  const disabled = !session.canEdit;
  const setField = (name, value) => setFields((prev) => ({ ...prev, [name]: value }));

  const handleSave = async (toSave = fields) => {
    setSaving(true);
    setError(null);
    try {
      await session.guard(() => onSave(patient.id, toPayload(toSave)));
      // onSave closes the dialog on success.
    } catch (err) {
      // Refused by the lock or by a change made by someone else: the banner
      // explains, and the typed values stay in the form.
      if (err?.code !== "EDIT_NOT_HELD" && err?.code !== "EDIT_CONFLICT") {
        // FL6: the nurse gets the translated message, the console gets the
        // provider's own text.
        console.error("Update patient error:", err);
        setError(errorText(err, t("errors.updatePatient")));
      }
      setSaving(false);
    }
  };

  // "Save mine anyway". updatePatient writes every field, so the form is
  // first rebuilt from the colleague's version with only MY changed fields
  // laid over it: their edits to fields I didn't touch survive.
  const handleKeepMine = () => {
    const fresh = session.conflict?.fresh;
    if (!fresh) return;
    const mine = Object.keys(FIELD_COLUMNS).filter((f) => unsavedColumns.includes(FIELD_COLUMNS[f]));
    const merged = fieldsFromRow(fresh);
    for (const f of mine) merged[f] = fields[f];
    if (!session.keepMine()) return;
    setFields(merged);
    handleSave(merged);
  };

  // Closing while unable to save, with typed values on screen: ask first
  // rather than dropping them without a word.
  const handleClose = () => {
    if (!session.canEdit && unsavedColumns.length > 0) {
      const fieldsText = columnLabels(t, "patient", unsavedColumns).join(", ");
      if (!window.confirm(t("editLock.closeUnsaved", { fields: fieldsText }))) return;
    }
    onCancel();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 px-4"
      onClick={handleClose}
    >
      <div
        className="relative flex w-full max-w-lg flex-col rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onPointerDownCapture={session.touch}
        onKeyDownCapture={session.touch}
        onInputCapture={session.touch}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{t("patientDialog.editTitle")}</h2>
            <p className="text-sm text-gray-500">{patient.label}</p>
          </div>
          <button
            onClick={handleClose}
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
          <EditLockBanner
            session={session}
            recordType="patient"
            unsavedColumns={unsavedColumns}
            onKeepMine={handleKeepMine}
            onDiscardMine={session.discardMine}
            busy={saving}
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("patientDialog.label")}</label>
            <input
              type="text"
              value={patient.label}
              disabled
              className="w-full rounded-lg border border-gray-200 bg-gray-100 px-3 py-2 text-sm text-gray-500"
            />
            <p className="mt-1 text-xs text-gray-400">
              {t("patientDialog.labelFixedHint")}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("patientDialog.diagnosis")}</label>
            <textarea
              value={fields.diagnosis}
              onChange={(e) => setField("diagnosis", e.target.value)}
              disabled={disabled}
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none disabled:bg-gray-50 disabled:text-gray-600"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("patientDialog.age")} <span className="font-normal text-gray-400">{t("common.optional")}</span></label>
            <input
              type="number"
              min="0"
              max="130"
              value={fields.age}
              onChange={(e) => setField("age", e.target.value)}
              disabled={disabled}
              placeholder={t("patientDialog.agePlaceholder")}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-600"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("patientDialog.codeStatus")}</label>
            <select
              value={fields.codeStatus}
              onChange={(e) => setField("codeStatus", e.target.value)}
              disabled={disabled}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-600"
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
              value={patient.attending_physician || "—"}
              disabled
              className="w-full rounded-lg border border-gray-200 bg-gray-100 px-3 py-2 text-sm text-gray-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("patientDialog.allergies")}</label>
            <input
              type="text"
              value={fields.allergiesInput}
              onChange={(e) => setField("allergiesInput", e.target.value)}
              disabled={disabled}
              placeholder={t("patientDialog.allergiesPlaceholder")}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-600"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("patientDialog.admissionDate")}</label>
            <input
              type="date"
              value={fields.admissionDate}
              onChange={(e) => setField("admissionDate", e.target.value)}
              disabled={disabled}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-600"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("patientDialog.locationLabel")}</label>
            <input
              type="text"
              value={fields.locationLabel}
              onChange={(e) => setField("locationLabel", e.target.value)}
              disabled={disabled}
              placeholder={t("patientDialog.locationLabelPlaceholder")}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-600"
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
            onClick={handleClose}
            className="flex-1 rounded-lg bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-700 hover:text-white active:scale-[0.97]"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={() => handleSave()}
            disabled={saving || disabled}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? t("common.saving") : t("common.saveChanges")}
          </button>
        </div>
      </div>
    </div>
  );
}
