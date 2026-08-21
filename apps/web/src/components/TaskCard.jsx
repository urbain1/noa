const statusStyles = {
  Pending: "bg-yellow-100 text-yellow-800",
  Confirmed: "bg-green-100 text-green-800",
  Delayed: "bg-red-100 text-red-800",
  Completed: "bg-blue-100 text-blue-800",
};

function getTimeElapsed(timestamp) {
  const diff = Math.floor((Date.now() - new Date(timestamp).getTime()) / 60000);
  if (diff < 1) return "just now";
  return `${diff} min ago`;
}

function getDeadlineDisplay(deadline) {
  if (!deadline) return null;

  const now = Date.now();
  const deadlineTime = new Date(deadline).getTime();
  const diffMs = deadlineTime - now;
  const diffMin = Math.round(diffMs / 60000);
  const absDiffMin = Math.abs(diffMin);

  let text;
  let colorClass;

  if (diffMin < 0) {
    // Overdue
    if (absDiffMin < 60) {
      text = `Overdue by ${absDiffMin}m`;
    } else if (absDiffMin < 1440) {
      const hours = Math.floor(absDiffMin / 60);
      const mins = absDiffMin % 60;
      text = mins > 0 ? `Overdue by ${hours}h ${mins}m` : `Overdue by ${hours}h`;
    } else {
      const days = Math.floor(absDiffMin / 1440);
      text = `Overdue by ${days}d`;
    }
    colorClass = "text-red-600";
  } else if (diffMin <= 120) {
    // Approaching (2 hours or less)
    if (absDiffMin < 60) {
      text = `Due in ${absDiffMin}m`;
    } else {
      const hours = Math.floor(absDiffMin / 60);
      const mins = absDiffMin % 60;
      text = mins > 0 ? `Due in ${hours}h ${mins}m` : `Due in ${hours}h`;
    }
    colorClass = "text-orange-600";
  } else {
    // Plenty of time (more than 2 hours)
    if (absDiffMin < 1440) {
      const hours = Math.floor(absDiffMin / 60);
      const mins = absDiffMin % 60;
      text = mins > 0 ? `Due in ${hours}h ${mins}m` : `Due in ${hours}h`;
    } else {
      const days = Math.floor(absDiffMin / 1440);
      const hours = Math.floor((absDiffMin % 1440) / 60);
      text = hours > 0 ? `Due in ${days}d ${hours}h` : `Due in ${days}d`;
    }
    colorClass = "text-green-600";
  }

  return { text, colorClass };
}

export default function TaskCard({ task, isNew, onEdit, onDelete }) {
  const badgeClass = statusStyles[task.status] || "bg-gray-100 text-gray-800";
  const deadlineInfo = getDeadlineDisplay(task.deadline);

  return (
    <div className={`flex items-start justify-between gap-3 rounded-lg border p-3 shadow-sm transition-shadow duration-200 hover:shadow-md ${isNew ? 'bg-blue-50 border-blue-200' : 'border-gray-200 bg-white'}`}>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-gray-900 leading-snug">{task.description}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
          <span>{task.department}</span>
          <span className="text-gray-300">|</span>
          <span>{getTimeElapsed(task.timestamp)}</span>
          <span className="text-gray-300">|</span>
          <span
            className={`font-semibold ${task.priority === "Stat" ? "text-red-600" : task.priority === "Urgent" ? "text-orange-600" : "text-gray-500"}`}
          >
            {task.priority}
          </span>
        </div>
        {deadlineInfo && (
          <div className={`mt-1 flex items-center gap-1 text-xs font-medium ${deadlineInfo.colorClass}`}>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
            </svg>
            {deadlineInfo.text}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors duration-300 ${badgeClass}`}
        >
          {task.status}
        </span>
        <button
          onClick={() => onEdit?.(task)}
          className="rounded p-1 text-gray-400 transition-colors duration-150 hover:text-blue-500"
          aria-label="Edit task"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
        <button
          onClick={() => onDelete?.(task)}
          className="rounded p-1 text-gray-400 transition-colors duration-150 hover:text-red-500"
          aria-label="Delete task"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  );
}
