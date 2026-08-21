export default function DeleteConfirmModal({ task, onCancel, onConfirm }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 px-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center text-center">
          {/* Warning icon */}
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <svg
              className="h-6 w-6 text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>

          {/* Title */}
          <h2 className="mt-4 text-xl font-bold text-gray-900">Delete Task?</h2>

          {/* Task description in gray box */}
          <div className="mt-3 w-full rounded-md bg-gray-100 px-4 py-3">
            <p className="text-sm text-gray-600 italic line-clamp-3">
              &ldquo;{task?.description}&rdquo;
            </p>
          </div>

          {/* Warning text */}
          <p className="mt-3 text-sm font-medium text-red-500">
            This action cannot be undone.
          </p>
        </div>

        {/* Buttons */}
        <div className="mt-6 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 active:scale-[0.97]"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm?.(task)}
            className="flex-1 rounded-lg bg-red-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-600 active:scale-[0.97]"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
