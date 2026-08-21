import { useState } from "react";

export default function TopRightMenu({ patients, delayedTasks, onGenerateHandoff, onDischargePatient, onFollowUp, onDismissAlert }) {
  const [isOpen, setIsOpen] = useState(false);
  const [showPatientList, setShowPatientList] = useState(false);
  const [showBottomSheet, setShowBottomSheet] = useState(false);

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
                  ← Back
                </button>
                <div className="border-t border-gray-100">
                  {patients.map((patient) => (
                    <button
                      key={patient.id}
                      onClick={() => {
                        onDischargePatient(patient);
                        closeMenu();
                      }}
                      className="w-full text-left px-4 py-2 hover:bg-gray-50 cursor-pointer border-t border-gray-100 first:border-t-0"
                    >
                      <p className="text-sm text-gray-700 font-medium">{patient.name}</p>
                      <p className="text-xs text-gray-400">Room {patient.room}</p>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                {/* Generate handoff report */}
                <button
                  onClick={() => {
                    onGenerateHandoff();
                    closeMenu();
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-start gap-3"
                >
                  <span className="text-lg mt-0.5">📋</span>
                  <div>
                    <p className="text-sm text-gray-700">Generate handoff report</p>
                    <p className="text-xs text-gray-400">SBAR summary for shift change</p>
                  </div>
                </button>

                {/* Discharge a patient */}
                <button
                  onClick={() => setShowPatientList(true)}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-start gap-3"
                >
                  <span className="text-lg mt-0.5">🏥</span>
                  <div>
                    <p className="text-sm text-gray-700">Discharge a patient</p>
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
                    Delayed tasks
                  </span>
                  {delayedTasks.length > 0 && (
                    <span className="bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                      {delayedTasks.length}
                    </span>
                  )}
                </button>
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
              <span>Delayed Tasks ({delayedTasks.length})</span>
              <button onClick={() => setShowBottomSheet(false)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
            </div>
            {delayedTasks.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-400 text-sm">No delayed tasks</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {delayedTasks.map((task) => (
                  <div key={task.id} className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-900">{task.description}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {task.department} · {task.patientName} · Room {task.patientRoom}
                    </p>
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => {
                          onFollowUp(task);
                        }}
                        className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                      >
                        Follow Up
                      </button>
                      <button
                        onClick={() => {
                          setShowBottomSheet(false);
                        }}
                        className="rounded-lg bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
