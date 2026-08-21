import { useState } from 'react';

export default function RoomDisambiguationDialog({ spokenRoom, matchingRooms, onSelect, onManualEntry, onCancel, matchedBy }) {
  const [searchFilter, setSearchFilter] = useState('');

  const filteredRooms = matchingRooms.filter(patient => {
    if (!searchFilter.trim()) return true;

    const filter = searchFilter.toLowerCase().trim();
    const roomMatch = patient.room.toLowerCase().includes(filter);
    const nameMatch = patient.name.toLowerCase().includes(filter);

    return roomMatch || nameMatch;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        {/* Header */}
        <h2 className="text-2xl font-bold text-gray-900">Multiple Patients Found</h2>
        <p className="text-gray-600 mb-2">
          Found {matchingRooms.length} patients matching &lsquo;{spokenRoom}&rsquo;.
        </p>
        {matchedBy === 'name' && (
          <p className="mt-1 text-gray-600">Multiple patients match &lsquo;{spokenRoom}&rsquo;.</p>
        )}
        {matchedBy === 'name+room' && (
          <p className="mt-1 text-gray-600">Multiple patients match your description.</p>
        )}
        {(!matchedBy || matchedBy === 'room') && (
          <p className="mt-1 text-gray-600">Multiple rooms match &lsquo;{spokenRoom}&rsquo;.</p>
        )}

        {/* Search Input */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Search to narrow results:
          </label>
          <input
            type="text"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder="Type patient name or room number..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
            autoFocus
          />
          <p className="text-xs text-gray-500 mt-1">
            {filteredRooms.length} of {matchingRooms.length} patients shown
          </p>
        </div>

        {/* Scrollable Room Options */}
        <div className="max-h-56 overflow-y-auto space-y-3 mb-4" style={{maxHeight: '224px', overflowY: 'auto'}}>
          {filteredRooms.length > 0 ? (
            filteredRooms.map(patient => (
              <div
                key={patient.id}
                onClick={() => onSelect(patient)}
                className="bg-gray-50 border border-gray-200 rounded-lg p-4 hover:bg-blue-50 hover:border-blue-300 cursor-pointer transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold text-blue-600">{patient.room}</p>
                    <p className="text-lg text-gray-900 mt-1">{patient.name}</p>
                    <p className="text-sm text-gray-600">Age: {patient.age}</p>
                  </div>
                  <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-8 text-gray-500">
              <p>No patients match &ldquo;{searchFilter}&rdquo;</p>
              <p className="text-sm mt-2">Try a different search or use &ldquo;None of these&rdquo; below</p>
            </div>
          )}
        </div>

        {/* Bottom Actions */}
        <div className="mt-4 flex gap-3">
          <button
            onClick={onManualEntry}
            className="flex-1 rounded-lg bg-gray-200 px-4 py-2 font-semibold text-gray-700 transition-colors hover:bg-gray-300"
          >
            None of these
          </button>
          <button
            onClick={onCancel}
            className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 font-semibold text-gray-700 transition-colors hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
