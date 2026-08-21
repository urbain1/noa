export default function Alert({ task, onDismiss, onRepage, onEscalate, currentIndex, totalCount }) {
  return (
    <div className="animate-slide-down fixed top-14 right-0 left-0 z-20 mx-auto max-w-2xl px-4 pt-2 sm:px-6">
      <div className="bg-white border-l-4 border-red-500 shadow-lg rounded-lg p-4">
        {/* Heading row */}
        <div className="mb-2 flex items-center gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-6 w-6 shrink-0 text-red-500"
          >
            <path
              fillRule="evenodd"
              d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.499-2.599 4.499H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.004ZM12 8.25a.75.75 0 0 1 .75.75v3.75a.75.75 0 0 1-1.5 0V9a.75.75 0 0 1 .75-.75Zm0 8.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z"
              clipRule="evenodd"
            />
          </svg>
          <h2 className="text-lg font-bold text-gray-900">Task Delayed</h2>
        </div>
        {totalCount > 1 && (
          <p className="mb-1 text-sm text-gray-500">{currentIndex + 1} of {totalCount} delayed tasks</p>
        )}

        {/* Details */}
        <p className="text-sm font-semibold text-gray-900">
          {task.description}
        </p>
        <p className="mb-4 text-sm text-gray-500">
          {task.patientName && <>{task.patientName} &middot; </>}{task.department} &middot; Room {task.patientRoom || task.room}
        </p>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={() => onRepage(task)}
            className="flex-1 rounded-lg border-2 border-orange-400 bg-white px-3 py-2 text-sm font-semibold text-orange-600 transition-colors hover:bg-orange-50 active:scale-[0.97]"
          >
            Repage Dept
          </button>
          <button
            onClick={() => onEscalate(task)}
            className="flex-1 rounded-lg bg-red-500 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-600 active:scale-[0.97]"
          >
            Escalate
          </button>
        </div>
        <button
          onClick={onDismiss}
          className="mt-1 w-full text-center text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}
