import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, normalizeLanguage } from "../i18n";
import { departmentLabel } from "../i18n/enums";
import { formatActionTimestamp } from "../utils/actionTimestamp";

// Real Supabase patient rows carry `label`, `location_label` and
// `diagnosis`. The demo-era `name`/`room` fields these lists used to read
// don't exist on them, which is why the discharge patient list rendered
// blank rows. Location is a synthetic label (SECURITY.md), never a real
// room number, so it is shown as-is rather than as "Room N".
function patientSubtitle(t, patient) {
  const parts = [patient.location_label, patient.diagnosis].filter(Boolean);
  return parts.length > 0 ? parts.join(" \u00b7 ") : t("patientCard.noDiagnosis");
}

export default function TopRightMenu({ patients, delayedTasks, onGenerateHandoff, onDischargePatient, onRepageTask, onEscalateTask, onLanguageChange, onOpenProfile }) {
  const { t, i18n } = useTranslation();
  // Which button reads as selected comes from the one live value, not a
  // separately-passed copy, so the highlight can never disagree with what
  // the rest of the app is using.
  const activeLanguage = normalizeLanguage(i18n.language);
  const [isOpen, setIsOpen] = useState(false);
  const [showPatientList, setShowPatientList] = useState(false);
  const [showBottomSheet, setShowBottomSheet] = useState(false);
  const [handoffLoading, setHandoffLoading] = useState(false);

  const handleGenerateHandoff = () => {
    if (handoffLoading) return;
    setHandoffLoading(true);
    Promise.resolve(onGenerateHandoff())
      .finally(() => {
        setHandoffLoading(false);
        closeMenu();
      });
  };

  const closeMenu = () => {
    setIsOpen(false);
    setShowPatientList(false);
  };

  return (
    <>
      {/* Menu trigger button */}
      <button
        onClick={() => setIsOpen(true)}
        className="relative text-gray-600 text-xl p-2 rounded-full hover:bg-gray-100"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <circle cx="10" cy="4" r="2" />
          <circle cx="10" cy="10" r="2" />
          <circle cx="10" cy="16" r="2" />
        </svg>
        {delayedTasks.length > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
            {delayedTasks.length}
          </span>
        )}
      </button>

      {/* Menu overlay + popup */}
      {isOpen && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={closeMenu} />
          <div className="fixed top-16 right-4 z-50 bg-white rounded-xl shadow-xl border border-gray-100 py-2 w-72">
            {showPatientList ? (
              <>
                <button
                  onClick={() => setShowPatientList(false)}
                  className="w-full text-left px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 flex items-center gap-1"
                >
                  {t("topMenu.backArrow")}
                </button>
                <div className="border-t border-gray-100">
                  {patients.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-gray-400">{t("topMenu.noPatients")}</p>
                  ) : (
                    patients.map((patient) => (
                      <button
                        key={patient.id}
                        onClick={() => {
                          onDischargePatient(patient);
                          closeMenu();
                        }}
                        className="w-full text-left px-4 py-2 hover:bg-gray-50 cursor-pointer border-t border-gray-100 first:border-t-0"
                      >
                        <p className="text-sm text-gray-700 font-medium">{patient.label}</p>
                        <p className="text-xs text-gray-400">{patientSubtitle(t, patient)}</p>
                      </button>
                    ))
                  )}
                </div>
              </>
            ) : (
              <>
                {/* Generate handoff report */}
                <button
                  onClick={handleGenerateHandoff}
                  disabled={handoffLoading}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-start gap-3 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="text-lg mt-0.5">📋</span>
                  <div>
                    <p className="text-sm text-gray-700">{handoffLoading ? t("common.generating") : t("topMenu.generateHandoff")}</p>
                    <p className="text-xs text-gray-400">{t("topMenu.generateHandoffSubtitle")}</p>
                  </div>
                </button>

                {/* Discharge a patient */}
                <button
                  onClick={() => setShowPatientList(true)}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-start gap-3"
                >
                  <span className="text-lg mt-0.5">🏥</span>
                  <div>
                    <p className="text-sm text-gray-700">{t("topMenu.dischargePatient")}</p>
                  </div>
                </button>

                {/* Delayed tasks */}
                <button
                  onClick={() => {
                    closeMenu();
                    setShowBottomSheet(true);
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-3"
                >
                  <span className="text-lg">⚠️</span>
                  <span className={`text-sm ${delayedTasks.length > 0 ? "text-red-600 font-medium" : "text-gray-700"}`}>
                    {t("topMenu.delayedTasks")}
                  </span>
                  {delayedTasks.length > 0 && (
                    <span className="bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                      {delayedTasks.length}
                    </span>
                  )}
                </button>

                {/* Profile: name, email, sign out. */}
                <button
                  onClick={() => {
                    closeMenu();
                    onOpenProfile?.();
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-3"
                >
                  <span className="text-lg">👤</span>
                  <span className="text-sm text-gray-700">{t("topMenu.profile")}</span>
                </button>

                {/* Language: applies immediately and is saved to the nurse's
                    profile, so it survives sign-out and other devices. */}
                <div className="border-t border-gray-100 px-4 pt-3 pb-2">
                  <p className="text-sm text-gray-700">{t("language.label")}</p>
                  <p className="text-xs text-gray-400">{t("language.menuSubtitle")}</p>
                  <div className="mt-2 flex gap-2">
                    {SUPPORTED_LANGUAGES.map((code) => (
                      <button
                        key={code}
                        type="button"
                        onClick={() => onLanguageChange?.(code)}
                        className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                          activeLanguage === code
                            ? "bg-blue-100 text-blue-700 border border-blue-300"
                            : "bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200"
                        }`}
                      >
                        {t(`language.${code}`)}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* Bottom sheet for delayed tasks */}
      {showBottomSheet && (
        <>
          <div className="fixed inset-0 bg-black/30 z-50" onClick={() => setShowBottomSheet(false)} />
          <div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-xl z-50 max-h-[60vh] overflow-y-auto">
            <div className="px-4 py-3 border-b font-semibold text-gray-900 flex items-center justify-between sticky top-0 bg-white rounded-t-2xl">
              <span>{t("topMenu.delayedTasksHeading", { count: delayedTasks.length })}</span>
              <button onClick={() => setShowBottomSheet(false)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
            </div>
            {delayedTasks.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-400 text-sm">{t("topMenu.noDelayedTasks")}</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {delayedTasks.map((task) => {
                  const repagedText = formatActionTimestamp(t, i18n.language, task.last_repaged_at, "repaged");
                  const escalatedText = formatActionTimestamp(t, i18n.language, task.escalated_at, "escalated");
                  return (
                    <div key={task.id} className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">{task.description}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {[departmentLabel(t, task.department), task.patientName, task.patientRoom]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => onRepageTask(task)}
                          title={repagedText || undefined}
                          className="rounded-lg border-2 border-orange-400 bg-white px-3 py-1.5 text-xs font-semibold text-orange-600 hover:bg-orange-50"
                        >
                          {t("topMenu.repage")}
                        </button>
                        <button
                          onClick={() => onEscalateTask(task)}
                          title={escalatedText || undefined}
                          className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600"
                        >
                          {t("topMenu.escalate")}
                        </button>
                      </div>
                      {(repagedText || escalatedText) && (
                        <div className="mt-1.5 flex flex-wrap gap-x-2 text-[11px] text-gray-400">
                          {repagedText && <span>{repagedText}</span>}
                          {escalatedText && <span>{escalatedText}</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
