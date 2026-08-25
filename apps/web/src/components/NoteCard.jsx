function getTimeElapsed(timestamp) {
  const diff = Math.floor((Date.now() - new Date(timestamp).getTime()) / 60000);
  if (diff < 1) return "just now";
  if (diff < 60) return `${diff}m ago`;
  const hours = Math.floor(diff / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function NoteCard({ note, isNew }) {
  return (
    <div className={`flex items-start justify-between gap-3 rounded-lg border p-3 shadow-sm transition-shadow duration-200 hover:shadow-md ${isNew ? 'bg-blue-50 border-blue-200' : 'border-gray-200 bg-white'}`}>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-gray-900">{note.content}</p>
        <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
          <span>{getTimeElapsed(note.created_at)}</span>
        </div>
      </div>
    </div>
  );
}
