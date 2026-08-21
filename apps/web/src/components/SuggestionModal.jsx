import { useState } from "react";

export default function SuggestionModal({ suggestions, patientName, triggerSummary, onAddAsTask, onAddAsNote, onDismissAll }) {
  const [remainingSuggestions, setRemainingSuggestions] = useState(suggestions);

  const handleAddAsTask = (suggestion) => {
    onAddAsTask(suggestion);
    const updated = remainingSuggestions.filter((s) => s.id !== suggestion.id);
    if (updated.length === 0) {
      onDismissAll();
    } else {
      setRemainingSuggestions(updated);
    }
  };

  const handleAddAsNote = (suggestion) => {
    onAddAsNote(suggestion);
    const updated = remainingSuggestions.filter((s) => s.id !== suggestion.id);
    if (updated.length === 0) {
      onDismissAll();
    } else {
      setRemainingSuggestions(updated);
    }
  };

  const handleDismissOne = (suggestionId) => {
    const updated = remainingSuggestions.filter((s) => s.id !== suggestionId);
    if (updated.length === 0) {
      onDismissAll();
    } else {
      setRemainingSuggestions(updated);
    }
  };

  if (remainingSuggestions.length === 0) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 px-4"
      onClick={onDismissAll}
    >
      <div
        className="w-full max-w-lg rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">💡</span>
            <h2 className="text-xl font-bold text-gray-900">AI Suggested Follow-ups</h2>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {patientName} &middot; {triggerSummary}
          </p>
        </div>

        {/* Suggestions list */}
        <div className="max-h-[60vh] overflow-y-auto px-6 pb-2">
          <div className="flex flex-col gap-3">
            {remainingSuggestions.map((suggestion) => (
              <div
                key={suggestion.id}
                className="rounded-lg border border-gray-200 bg-gray-50 p-4"
              >
                {/* Suggestion text */}
                <p className="text-sm text-gray-900">{suggestion.text}</p>

                {/* Suggested type badge */}
                <div className="mt-2 mb-3">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                    suggestion.type === "task"
                      ? "bg-blue-100 text-blue-800"
                      : "bg-green-100 text-green-800"
                  }`}>
                    Suggested as {suggestion.type}
                  </span>
                  {suggestion.taskDetails?.deadline && (
                    <span className="ml-2 text-xs text-gray-500">
                      Deadline: {new Date(suggestion.taskDetails.deadline).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAddAsTask(suggestion)}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700 active:scale-[0.97]"
                  >
                    Add as Task
                  </button>
                  <button
                    onClick={() => handleAddAsNote(suggestion)}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 active:scale-[0.97]"
                  >
                    Add as Note
                  </button>
                  <button
                    onClick={() => handleDismissOne(suggestion.id)}
                    className="rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-400 transition-colors hover:text-gray-600 active:scale-[0.97]"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4">
          {/* Disclaimer */}
          <div className="mb-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2">
            <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-xs text-amber-800">
              AI-generated suggestions may be inaccurate. Always apply clinical judgment and consult the attending physician for treatment decisions.
            </p>
          </div>

          <button
            onClick={onDismissAll}
            className="w-full rounded-lg bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-200 active:scale-[0.97]"
          >
            Dismiss All
          </button>
        </div>
      </div>
    </div>
  );
}
