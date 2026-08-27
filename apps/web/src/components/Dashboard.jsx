import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import PatientCard from "./PatientCard";
import TopRightMenu from "./TopRightMenu";
import ViewSwitcher from "./ViewSwitcher";

export default function Dashboard({
  patients,
  view,
  onSwitchView,
  onVoiceClick,
  onGenerateHandoff,
  delayedTasks,
  onDischargePatient,
  onOpenVoiceCapture,
  onAddPatient,
  onAddPatientByVoice,
  onEditPatient,
  onCompleteTask,
  onEditTask,
  onRepageTask,
  onEscalateTask,
  onAddNote,
  onGenerateSbar,
  onGeneratePatientUpdate,
  onLanguageChange,
  onOpenProfile,
  patientFocus,
  onReturnFromPatient,
}) {
  const { t } = useTranslation();
  const focusRef = useRef(null);
  const focusedId = patientFocus?.patientId ?? null;

  // Arriving from the Tasks screen or Unit View, scroll the patient that was
  // clicked into view rather than leaving the nurse to find them in the
  // list. Runs only when the focused patient changes.
  useEffect(() => {
    if (focusedId && focusRef.current) {
      focusRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [focusedId]);

  const focusedPatient = focusedId ? patients.find((p) => p.id === focusedId) : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-gray-200 bg-white px-3 py-3 shadow-sm sm:px-4">
        <h1 className="text-xl font-bold text-black">noa</h1>
        <div className="flex items-center gap-1 sm:gap-3">
          <ViewSwitcher current={view} onSwitch={onSwitchView} />
          <TopRightMenu
            patients={patients}
            delayedTasks={delayedTasks || []}
            onGenerateHandoff={onGenerateHandoff}
            onDischargePatient={onDischargePatient}
            onRepageTask={onRepageTask}
            onEscalateTask={onEscalateTask}
            onLanguageChange={onLanguageChange}
            onOpenProfile={onOpenProfile}
          />
        </div>
      </header>

      {/* Back to wherever this patient was opened from. Only shown when the
          nurse actually arrived from another screen, so the home screen
          doesn't grow a back link to itself. */}
      {patientFocus && (
        <div className="flex items-center justify-between gap-3 border-b border-blue-100 bg-blue-50 px-4 py-2">
          <button
            type="button"
            onClick={onReturnFromPatient}
            className="flex items-center gap-1 text-sm font-semibold text-blue-700 hover:text-blue-900"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {patientFocus.returnView === "unit"
              ? t("nav.backToUnit")
              : t("nav.backToTasks")}
          </button>
          {focusedPatient && (
            <span className="truncate text-xs text-blue-700">{focusedPatient.label}</span>
          )}
        </div>
      )}

      {/* Patient list */}
      <main className="mx-auto max-w-2xl space-y-4 px-4 pt-4 pb-28 sm:px-6">
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={onAddPatient}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-500 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            {t("dashboard.addPatient")}
          </button>
          <button
            type="button"
            onClick={onAddPatientByVoice}
            className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-500 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 sm:w-auto"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
              <path d="M12 1a4 4 0 0 0-4 4v6a4 4 0 0 0 8 0V5a4 4 0 0 0-4-4Z" />
              <path d="M19 11a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.93V21H8a1 1 0 1 0 0 2h8a1 1 0 1 0 0-2h-3v-3.07A7 7 0 0 0 19 11Z" />
            </svg>
            {t("dashboard.addPatientByVoice")}
          </button>
        </div>

        {patients.length === 0 && (
          <p className="rounded-xl bg-white p-6 text-center text-sm text-gray-400 shadow-sm">
            {t("dashboard.noPatients")}
          </p>
        )}

        {patients.map((patient) => {
          const isFocused = patient.id === focusedId;
          return (
            <div key={patient.id} ref={isFocused ? focusRef : null}>
              <PatientCard
                patient={patient}
                isFocused={isFocused}
                onEditPatient={onEditPatient}
                onCompleteTask={onCompleteTask}
                onEditTask={onEditTask}
                onRepageTask={onRepageTask}
                onEscalateTask={onEscalateTask}
                onAddNote={onAddNote}
                onOpenVoiceCapture={onOpenVoiceCapture}
                onGenerateSbar={onGenerateSbar}
                onGeneratePatientUpdate={onGeneratePatientUpdate}
                onDischargePatient={onDischargePatient}
              />
            </div>
          );
        })}
      </main>

      {/* Floating mic button */}
      <button
        onClick={onVoiceClick}
        className="fixed bottom-6 right-6 flex h-16 w-16 items-center justify-center rounded-full border-none bg-blue-600 text-white shadow-lg ring-4 ring-blue-600/20 transition-all duration-200 hover:scale-105 hover:bg-blue-700 hover:shadow-xl hover:ring-blue-700/20 active:scale-95"
        aria-label={t("dashboard.voiceInputAria")}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="h-7 w-7"
        >
          <path d="M12 1a4 4 0 0 0-4 4v6a4 4 0 0 0 8 0V5a4 4 0 0 0-4-4Z" />
          <path d="M19 11a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.93V21H8a1 1 0 1 0 0 2h8a1 1 0 1 0 0-2h-3v-3.07A7 7 0 0 0 19 11Z" />
        </svg>
      </button>
    </div>
  );
}
