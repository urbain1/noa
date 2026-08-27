import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { localeTag } from "../i18n";

// Read-only view: no editing or sharing yet, both explicitly deferred until
// the SBAR-sharing session picks an email/SMS provider (see decisions.md).
export default function PatientUpdateSummary({ summaryText, patient, onClose }) {
  const { t, i18n } = useTranslation();
  const [copied, setCopied] = useState(false);

  const generatedTimestamp = useMemo(() => {
    const now = new Date();
    const tag = localeTag(i18n.language);
    const formattedDate = now.toLocaleDateString(tag, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const formattedTime = now.toLocaleTimeString(tag, {
      hour: "numeric",
      minute: "2-digit",
    });
    return t("handoff.generatedAt", { date: formattedDate, time: formattedTime });
  }, [t, i18n.language]);

  const displayText = `${summaryText}\n\n${t("patientUpdate.footer")}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(displayText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center border-b border-gray-200 bg-white px-4 py-3 shadow-sm">
        <button
          onClick={onClose}
          className="mr-3 flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-900"
          aria-label={t("common.back")}
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight text-gray-900">{t("patientUpdate.title")}</h1>
          <p className="text-xs text-gray-400 mt-0.5">{t("patientUpdate.subtitle")}</p>
        </div>
      </div>

      {/* Subheader */}
      <div className="flex items-center justify-between bg-gray-50 px-4 py-2">
        <span className="text-xs text-gray-500">{generatedTimestamp}</span>
        <span className="text-xs text-gray-500">{patient.label}</span>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto pb-32">
        <div className="mx-auto max-w-2xl px-4 py-4">
          <pre className="whitespace-pre-wrap font-sans text-sm text-gray-800 leading-relaxed">
            {displayText}
          </pre>
        </div>
      </div>

      {/* Footer */}
      <div className="sticky bottom-0 border-t border-gray-200 bg-white px-4 py-3">
        <button
          onClick={handleCopy}
          className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 active:scale-[0.97]"
        >
          {copied ? t("handoff.copied") : t("handoff.copy")}
        </button>
      </div>
    </div>
  );
}
