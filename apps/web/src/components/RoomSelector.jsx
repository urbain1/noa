import { useState, useRef, useEffect } from "react";

export default function RoomSelector({ value, onChange, rooms }) {
  const [isFocused, setIsFocused] = useState(false);
  const [filter, setFilter] = useState(value || "");
  const containerRef = useRef(null);

  // Sync internal filter with external value changes
  useEffect(() => {
    setFilter(value || "");
  }, [value]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsFocused(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter rooms based on typed text. Match against room number or patient name.
  const filteredRooms = rooms.filter((r) => {
    if (!filter.trim()) return true;
    const f = filter.toLowerCase().trim();
    return r.room.toLowerCase().includes(f) || r.name.toLowerCase().includes(f);
  });

  // Deduplicate rooms (in case multiple tasks per patient). Use room string as key.
  const uniqueRooms = [];
  const seenRooms = new Set();
  for (const r of filteredRooms) {
    if (!seenRooms.has(r.room)) {
      seenRooms.add(r.room);
      uniqueRooms.push(r);
    }
  }

  const showDropdown = isFocused && uniqueRooms.length > 0;

  function handleInputChange(e) {
    const val = e.target.value;
    setFilter(val);
    onChange(val);
  }

  function handleSelect(room) {
    setFilter(room.room);
    onChange(room.room);
    setIsFocused(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={filter}
        onChange={handleInputChange}
        onFocus={() => setIsFocused(true)}
        placeholder="Type or select room..."
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      {showDropdown && (
        <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-40 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {uniqueRooms.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => handleSelect(r)}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-blue-50 transition-colors"
            >
              <span className="font-medium text-gray-900">{r.room}</span>
              <span className="text-xs text-gray-500">{r.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
