import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetchPatientHistory } from "../lib/auditLog";
import { formatHistoryEntry } from "../utils/historyFormat";

// Who changed what on one patient, and when: the patient itself plus its
// tasks and notes, newest first, 50 at a time (scenarios.md SC-17).
//
// Read-only, and opening it locks nothing. Lines are built by
// utils/historyFormat.js from column names and derived events only; the only
// content shown is the *current* description of a task or note that still
// exists, taken from data the app has already loaded, never from the log.
//
// If migration 0012 hasn't been applied, the query fails with
// AUDIT_UNAVAILABLE and the dialog says history isn't available yet. The
// patient card underneath is unaffected either way.
export default function PatientHistoryDialog({ patient, nurses = [], facilityId, onClose }) {
  const { t, i18n } = useTranslation();
  const [rows, setRows] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  // "loading" | "ready" | "unavailable" | "error"
  const [status, setStatus] = useState("loading");
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);
  // Bumped by "Try again" to re-run the first-page load.
  const [attempt, setAttempt] = useState(0);

  const patientId = patient?.id;

  useEffect(() => {
    let cancelled = false;
    fetchPatientHistory(facilityId, patientId, 0).then(
      (page) => {
        if (cancelled) return;
        setRows(page.rows);
        setHasMore(page.hasMore);
        setStatus("ready");
      },
      (err) => {
        if (cancelled) return;
        if (err?.code === "AUDIT_UNAVAILABLE") {
          console.warn("[history] audit log not readable yet (migration 0012 not applied?):", err.cause || err);
          setStatus("unavailable");
        } else {
          console.error("History load error:", err);
          setStatus("error");
        }
      }
    );
    return () => {
      cancelled = true;
    };
  }, [facilityId, patientId, attempt]);

  const handleRetry = () => {
    setStatus("loading");
    setAttempt((n) => n + 1);
  };

  const handleLoadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    setMoreError(false);
    try {
      const page = await fetchPatientHistory(facilityId, patientId, rows.length);
      // A row can arrive twice if new changes landed between pages and shifted
      // the offsets; keep the first copy.
      setRows((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...page.rows.filter((r) => !seen.has(r.id))];
      });
      setHasMore(page.hasMore);
    } catch (err) {
      console.error("History load-more error:", err);
      setMoreError(true);
    }
    setLoadingMore(false);
  };

  const entries = useMemo(() => {
    const tasksById = new Map((patient?.tasks || []).map((task) => [task.id, task]));
    const notesById = new Map((patient?.notes || []).map((note) => [note.id, note]));
    return rows.map((row) =>
      formatHistoryEntry(row, { t, language: i18n.language, nurses, tasksById, notesById })
    );
  }, [rows, patient?.tasks, patient?.notes, nurses, t, i18n.language]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 px-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="patient-history-title"
        className="relative flex w-full max-w-lg flex-col rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <div className="min-w-0">
            <h2 id="patient-history-title" className="text-xl font-bold text-gray-900">
              {t("history.title")}
            </h2>
            <p className="break-words text-sm text-gray-500">{patient?.label}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:text-gray-700"
            aria-label={t("history.closeAria")}
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 pb-2" style={{ maxHeight: "65vh" }}>
          {status === "loading" && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
              {t("history.loading")}
            </div>
          )}

          {status === "unavailable" && (
            <p className="rounded-lg bg-gray-50 p-4 text-center text-sm text-gray-600">
              {t("history.unavailable")}
            </p>
          )}

          {status === "error" && (
            <div className="rounded-lg bg-red-50 p-4 text-center text-sm text-red-600">
              <p>{t("history.error")}</p>
              <button
                type="button"
                onClick={handleRetry}
                className="mt-2 rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-red-700 ring-1 ring-red-200 transition-colors hover:bg-red-600 hover:text-white"
              >
                {t("history.retry")}
              </button>
            </div>
          )}

          {status === "ready" && entries.length === 0 && (
            <p className="py-8 text-center text-sm text-gray-500">{t("history.empty")}</p>
          )}

          {status === "ready" && entries.length > 0 && (
            <ol className="flex flex-col divide-y divide-gray-100">
              {entries.map((entry) => (
                <li key={entry.id} className="py-2.5">
                  <p className="break-words text-sm text-gray-900">{entry.text}</p>
                  {entry.subject && (
                    <p className="mt-0.5 break-words text-xs text-gray-500">{entry.subject}</p>
                  )}
                  <p className="mt-0.5 text-xs text-gray-400">{entry.when}</p>
                </li>
              ))}
            </ol>
          )}

          {status === "ready" && hasMore && (
            <div className="py-3 text-center">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="rounded-md bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 ring-1 ring-blue-200 transition-colors hover:bg-blue-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingMore ? t("common.loading") : t("history.loadMore")}
              </button>
              {moreError && <p className="mt-1 text-xs text-red-600">{t("history.error")}</p>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4">
          {status === "ready" && (
            <p className="mb-3 text-xs text-gray-400">{t("history.trackingNote")}</p>
          )}
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-700 hover:text-white active:scale-[0.97]"
          >
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
