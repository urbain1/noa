import { useState } from "react";

export default function ManualRoomEntry({ defaultRoom = "", onConfirm, onCancel, allPatients }) {
  const [room, setRoom] = useState(defaultRoom);
  const [searchName, setSearchName] = useState("");
  const [isNewPatient, setIsNewPatient] = useState(false);
  const [patientName, setPatientName] = useState("");
  const [patientAge, setPatientAge] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const isValid = (searchName.trim() !== "" || room.trim() !== "") && (!isNewPatient || (patientName.trim() !== "" && patientAge !== ""));

  const patients = allPatients || [];
  const filteredPatients = patients.filter((p) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase().trim();
    return p.name.toLowerCase().includes(query) || p.room.toLowerCase().includes(query);
  });

  function handleSelectPatient(p) {
    setSearchName(p.name);
    setRoom(p.room);
    setIsNewPatient(false);
    setSearchQuery("");
    // Auto-confirm with selected patient
    onConfirm({ room: p.room, searchName: p.name, isNewPatient: false });
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!isValid) return;

    const result = { room: room.trim(), searchName: searchName.trim(), isNewPatient };
    if (isNewPatient) {
      result.patientName = patientName.trim();
      result.patientAge = Number(patientAge);
    }
    onConfirm(result);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="text-2xl font-bold text-gray-900">Select Patient</h2>
        <p className="mt-1 text-sm text-gray-600">Search for a patient or create a new one.</p>

        {/* Search Input */}
        <div className="mt-4">
          <input
            type="text"
            autoFocus
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by patient name or room..."
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Patient List */}
        <div className="mt-2 max-h-48 overflow-y-auto">
          {filteredPatients.length > 0 ? (
            filteredPatients.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSelectPatient(p)}
                className="flex w-full items-center justify-between px-3 py-2 hover:bg-blue-50 cursor-pointer rounded-lg border-b border-gray-50 text-left"
              >
                <span className="font-medium text-gray-900">{p.name}</span>
                <span className="text-sm text-gray-500">Room {p.room}</span>
              </button>
            ))
          ) : (
            <div className="px-3 py-4 text-center text-sm text-gray-500">
              No patients match your search.
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="mt-4 border-t border-gray-200 pt-4">
          <p className="text-sm font-medium text-gray-700 mb-3">Patient not in the list?</p>

          {/* New Patient Checkbox */}
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={isNewPatient}
              onChange={(e) => setIsNewPatient(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-gray-700">Create new patient</span>
          </label>

          {isNewPatient && (
            <form onSubmit={handleSubmit} className="mt-3 space-y-3 overflow-hidden rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Room Number</label>
                <input
                  type="text"
                  value={room}
                  onChange={(e) => setRoom(e.target.value)}
                  placeholder="e.g., 2A-208, 415"
                  className="mt-1 w-full rounded border border-gray-300 p-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Patient Name</label>
                <input
                  type="text"
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  placeholder="Full name"
                  className="mt-1 w-full rounded border border-gray-300 p-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Patient Age</label>
                <input
                  type="number"
                  value={patientAge}
                  onChange={(e) => setPatientAge(e.target.value)}
                  placeholder="Age"
                  min="0"
                  max="150"
                  className="mt-1 w-full rounded border border-gray-300 p-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>
              <button
                type="submit"
                disabled={!isValid}
                className="w-full rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Create & Assign
              </button>
            </form>
          )}
        </div>

        {/* Cancel Button */}
        <div className="mt-4">
          <button
            type="button"
            onClick={onCancel}
            className="w-full rounded-lg bg-gray-200 px-4 py-2 font-semibold text-gray-700 transition-colors hover:bg-gray-300"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
