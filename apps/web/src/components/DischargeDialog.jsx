import { useState } from "react";

export default function DischargeDialog({ patient, onCancel, onConfirm }) {
  const [notifyPatient, setNotifyPatient] = useState(true);
  const [needsNursingHome, setNeedsNursingHome] = useState(false);
  const [notes, setNotes] = useState("");

  function handleConfirm() {
    onConfirm({ notifyPatient, needsNursingHome, notes });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-gray-900">
          Discharge Planning &ndash; Room {patient.room}
        </h2>
        <p className="mt-1 text-sm text-gray-500">{patient.name}</p>

        <div className="mt-5 flex flex-col gap-3">
          <label className="flex items-center gap-3 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={notifyPatient}
              onChange={(e) => setNotifyPatient(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Notify patient about discharge
          </label>

          <label className="flex items-center gap-3 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={needsNursingHome}
              onChange={(e) => setNeedsNursingHome(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Request nursing home placement
          </label>
        </div>

        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700">
            Additional notes (optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Enter any additional discharge notes..."
          />
        </div>

        <div className="mt-5 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-lg border border-gray-300 bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-200 active:scale-[0.97]"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 active:scale-[0.97]"
          >
            Create Tasks
          </button>
        </div>
      </div>
    </div>
  );
}
