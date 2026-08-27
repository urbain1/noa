import { useState } from "react";
import { useTranslation } from "react-i18next";

// Canonical value kept in state; only the label is translated, so the value
// handed back through onSend stays stable across languages.
const METHODS = [
  { value: "Secure Message", labelKey: "handoff.send.methodSecureMessage" },
  { value: "Text", labelKey: "handoff.send.methodText" },
  { value: "Email", labelKey: "handoff.send.methodEmail" },
];

export default function SendHandoffDialog({ onCancel, onSend }) {
  const { t } = useTranslation();
  const [nurseName, setNurseName] = useState("");
  const [sendMethod, setSendMethod] = useState("Secure Message");

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
            onChange={(e) => setNurseName(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t("handoff.send.viaLabel")}
          </label>
          <div className="flex gap-2">
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
            onClick={() => onSend({ nurseName: nurseName.trim(), sendMethod })}
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
