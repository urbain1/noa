const categoryStyles = {
  Situation: "bg-blue-100 text-blue-800",
  Background: "bg-gray-100 text-gray-800",
  Assessment: "bg-orange-100 text-orange-800",
  Recommendation: "bg-green-100 text-green-800",
};

function getTimeElapsed(timestamp) {
  const diff = Math.floor((Date.now() - new Date(timestamp).getTime()) / 60000);
  if (diff < 1) return "just now";
  if (diff < 60) return `${diff}m ago`;
  const hours = Math.floor(diff / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function NoteCard({ note, isNew, onEdit, onDelete }) {
  const badgeClass = categoryStyles[note.category] || "bg-gray-100 text-gray-800";

  return (
    <div className={`flex items-start justify-between gap-3 rounded-lg border p-3 shadow-sm transition-shadow duration-200 hover:shadow-md ${isNew ? 'bg-blue-50 border-blue-200' : 'border-gray-200 bg-white'}`}>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-gray-900">{note.text}</p>
        <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badgeClass}`}>
            {note.category}
          </span>
          <span className="text-gray-300">|</span>
          <span>{getTimeElapsed(note.timestamp)}</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          onClick={() => onEdit?.(note)}
          className="rounded p-1 text-gray-400 transition-colors duration-150 hover:text-blue-500"
          aria-label="Edit note"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
        <button
          onClick={() => onDelete?.(note)}
          className="rounded p-1 text-gray-400 transition-colors duration-150 hover:text-red-500"
          aria-label="Delete note"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  );
}
