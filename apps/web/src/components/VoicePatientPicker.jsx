import { useState } from "react";
import { useTranslation } from "react-i18next";
import VoiceStepHeader from "./VoiceStepHeader";

// The patient picker inside a voice step, shown whenever the patient a
// command refers to could not be resolved to exactly one record: no match,
// several matches, two records with the same label, or no patient named.
//
// Nothing is ever pre-selected here. `candidates` are listed first as
// suggestions; choosing is always the nurse's tap. `onCreate` opens the Add
// Patient form (which is where the Patient_Test_N convention is enforced).
export default function VoicePatientPicker({ step, heard, label, patients, candidateIds = [], onPick, onCreate, onSkip }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  const q = query.toLowerCase().trim();
  const matches = (p) =>
    !q || (p.label || "").toLowerCase().includes(q) || (p.location_label || "").toLowerCase().includes(q);
  const roster = (patients || []).filter((p) => typeof p.label === "string");
  const suggested = roster.filter((p) => candidateIds.includes(p.id) && matches(p));
  const others = roster.filter((p) => !candidateIds.includes(p.id) && matches(p));

  const row = (p) => (
    <button
      key={p.id}
      type="button"
      onClick={() => onPick(p)}
      className="flex w-full items-center justify-between rounded-lg border-b border-gray-50 px-3 py-2 text-left hover:bg-blue-50"
    >
      <span className="font-medium text-gray-900">{p.label}</span>
      {p.location_label && <span className="text-sm text-gray-500">{p.location_label}</span>}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="voice-patient-picker-title" className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <VoiceStepHeader step={step} showClose />
        <h2 id="voice-patient-picker-title" className="mt-4 text-xl font-bold text-gray-900">
          {t("voiceQueue.choosePatientTitle")}
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          {heard ? t("voiceQueue.choosePatientHeard", { words: heard }) : t("voiceQueue.choosePatientNone")}
        </p>

        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("patientMatch.selectPlaceholder")}
          className="mt-4 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
        />

        <div className="mt-2 max-h-56 overflow-y-auto">
          {suggested.length > 0 && (
            <>
              <p className="px-3 pt-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{t("voiceQueue.suggested")}</p>
              {suggested.map(row)}
              <p className="px-3 pt-3 text-xs font-semibold uppercase tracking-wide text-gray-400">{t("voiceQueue.allPatients")}</p>
            </>
          )}
          {others.map(row)}
          {suggested.length === 0 && others.length === 0 && (
            <p className="px-3 py-4 text-center text-sm text-gray-500">{t("patientMatch.selectNoMatch")}</p>
          )}
        </div>

        <button
          type="button"
          onClick={onCreate}
          className="mt-3 w-full rounded-lg border-2 border-dashed border-gray-300 px-4 py-2 text-sm font-semibold text-gray-600 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
        >
          {label ? t("voiceQueue.createThisPatient", { label }) : t("voiceQueue.createNewPatient")}
        </button>

        <button
          type="button"
          onClick={() => onSkip()}
          className="mt-3 w-full rounded-lg bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-700 hover:text-white"
        >
          {t("voiceQueue.skip")}
        </button>
      </div>
    </div>
  );
}
