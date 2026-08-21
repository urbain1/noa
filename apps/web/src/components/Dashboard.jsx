import PatientCard from "./PatientCard";
import TopRightMenu from "./TopRightMenu";

export default function Dashboard({ patients, onVoiceClick, dismissedCount, onClearDismissed, onDischargeClick, onDeleteTask, onEditTask, onGenerateHandoff, onPatientHandoff, handoffLoading, onAddNote, onEditNote, onDeleteNote, onGeneratePatientUpdate, onShowContacts, patientUpdateLoading, onSwitchToChargeView, delayedTasks, onDischargePatient, onFollowUp, onDismissAlert, onOpenVoiceCapture }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 shadow-sm">
        <h1 className="text-xl font-bold text-black">noa</h1>
        <div className="flex items-center gap-4">
          <button className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-blue-600 text-white">My Patients</button>
          <button onClick={onSwitchToChargeView} className="px-3 py-1.5 rounded-lg text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 hover:bg-blue-100">Unit View</button>
          <TopRightMenu
            patients={patients}
            delayedTasks={delayedTasks || []}
            onGenerateHandoff={onGenerateHandoff}
            onDischargePatient={onDischargePatient}
            onFollowUp={onFollowUp}
            onDismissAlert={onDismissAlert}
          />
        </div>
      </header>

      {/* Patient list */}
      <main className="mx-auto max-w-2xl space-y-4 px-4 pt-4 pb-28 sm:px-6">
        {patients.map((patient) => (
          <PatientCard
            key={patient.id}
            patient={patient}
            patientId={patient.id}
            onDischargeClick={onDischargeClick}
            onDeleteTask={onDeleteTask}
            onEditTask={onEditTask}
            onPatientHandoff={onPatientHandoff}
            handoffLoading={handoffLoading}
            onAddNote={onAddNote}
            onEditNote={onEditNote}
            onDeleteNote={onDeleteNote}
            onGeneratePatientUpdate={onGeneratePatientUpdate}
            onShowContacts={onShowContacts}
            patientUpdateLoading={patientUpdateLoading}
            onOpenVoiceCapture={onOpenVoiceCapture}
          />
        ))}
      </main>

      {/* Floating mic button */}
      <button
        onClick={onVoiceClick}
        className="fixed bottom-6 right-6 flex h-16 w-16 items-center justify-center rounded-full border-none bg-blue-600 text-white shadow-lg ring-4 ring-blue-600/20 transition-all duration-200 hover:scale-105 hover:bg-blue-700 hover:shadow-xl hover:ring-blue-700/20 active:scale-95"
        aria-label="Voice input"
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
