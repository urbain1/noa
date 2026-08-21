import { useState, useEffect, useMemo } from "react";
import SendHandoffDialog from "./SendHandoffDialog";

export default function HandoffSummary({ summaryText, title, onClose, patientCount }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState(summaryText);
  const [copied, setCopied] = useState(false);
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [sentConfirmation, setSentConfirmation] = useState(null);

  const generatedTimestamp = useMemo(() => {
    const now = new Date();
    const formattedDate = now.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const formattedTime = now.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
    return `Generated ${formattedDate} at ${formattedTime}`;
  }, []);

  useEffect(() => {
    if (sentConfirmation) {
      const timer = setTimeout(() => setSentConfirmation(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [sentConfirmation]);

  const handleCopy = () => {
    navigator.clipboard.writeText(editedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const displayText = editedText;

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center border-b border-gray-200 bg-white px-4 py-3 shadow-sm">
        <button onClick={onClose} className="mr-3 flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-900">
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight text-gray-900">{title}</h1>
          <p className="text-xs text-gray-400 mt-0.5">SBAR summary for shift change</p>
        </div>
        <div className="flex-1" />
      </div>

      {/* Subheader */}
      <div className="flex items-center justify-between bg-gray-50 px-4 py-2">
        <span className="text-xs text-gray-500">{generatedTimestamp}</span>
        <span className="text-xs text-gray-500">
          {patientCount} patient{patientCount !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto pb-32">
        <div className="mx-auto max-w-2xl px-4 py-4">
          {isEditing ? (
            <textarea
              value={editedText}
              onChange={(e) => setEditedText(e.target.value)}
              className="w-full min-h-[60vh] p-4 border border-gray-300 rounded-lg text-sm font-sans leading-relaxed focus:border-blue-500 focus:outline-none resize-none"
            />
          ) : (
            <pre className="whitespace-pre-wrap font-sans text-sm text-gray-800 leading-relaxed">
              {displayText}
            </pre>
          )}
        </div>
      </div>

      {/* Success toast */}
      {sentConfirmation && (
        <div className="fixed bottom-20 left-0 right-0 z-50 mx-auto max-w-md px-4">
          <div className="rounded-lg bg-green-600 p-3 text-center text-sm font-semibold text-white shadow-lg">
            Handoff sent to {sentConfirmation}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="sticky bottom-0 border-t border-gray-200 bg-white px-4 py-3">
        <div className="flex gap-3">
          <button
            onClick={handleCopy}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 active:scale-[0.97]"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
          <button
            onClick={() => setShowSendDialog(true)}
            className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 active:scale-[0.97]"
          >
            Send to Nurse
          </button>
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="flex-1 rounded-lg bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-200 active:scale-[0.97]"
          >
            {isEditing ? "Done Editing" : "Edit"}
          </button>
        </div>
      </div>

      {showSendDialog && (
        <SendHandoffDialog
          onCancel={() => setShowSendDialog(false)}
          onSend={(details) => {
            setShowSendDialog(false);
            setSentConfirmation(details.nurseName);
          }}
        />
      )}
    </div>
  );
}
