import { useTranslation } from "react-i18next";

// The single visual vocabulary for "something is happening", paired with
// useOperationStatus. Four placements, one look: same spinner, same
// wording, same colours, so a nurse reads a saving field and a generating
// report the same way.
//
//   inline   quiet text beside a field label (per-field auto-save)
//   button   spinner + message inside the button that started it
//   overlay  a scrim over the region the operation would conflict with --
//            only where competing interaction would actually corrupt
//            something. It always names the operation: an unexplained
//            veil is indistinguishable from a frozen screen.
//   toast    a small fixed pill for background work the nurse doesn't have
//            to wait on (AI suggestions, a report being generated)
//
// A message is never optional. Every phase renders its own text.

function Spinner({ className = "h-4 w-4" }) {
  return (
    <svg className={`animate-spin ${className}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function CheckIcon({ className = "h-3.5 w-3.5" }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  );
}

function useMessage(operation) {
  const { t } = useTranslation();
  if (!operation?.messageKey) return "";
  return t(operation.messageKey, operation.messageParams);
}

function InlineStatus({ operation, className }) {
  const message = useMessage(operation);
  if (!operation) return null;

  if (operation.phase === "running") {
    return <span className={`ml-2 text-xs font-normal text-gray-400 ${className}`}>{message}</span>;
  }
  if (operation.phase === "done") {
    return (
      <span className={`ml-2 inline-flex items-center gap-1 text-xs font-normal text-green-600 ${className}`}>
        <CheckIcon className="h-3 w-3" />
        {message}
      </span>
    );
  }
  return <span className={`ml-2 text-xs font-normal text-red-600 ${className}`}>{message}</span>;
}

function ButtonStatus({ operation, className }) {
  const message = useMessage(operation);
  if (!operation) return null;

  if (operation.phase === "running") {
    return (
      <span className={`inline-flex items-center justify-center gap-2 ${className}`}>
        <Spinner className="h-5 w-5" />
        {message}
      </span>
    );
  }
  if (operation.phase === "done") {
    return (
      <span className={`inline-flex items-center justify-center gap-2 ${className}`}>
        <CheckIcon className="h-4 w-4" />
        {message}
      </span>
    );
  }
  return <span className={className}>{message}</span>;
}

// Needs a positioned ancestor (`relative`) -- it covers that box, not the
// whole viewport, so the block is scoped to what it actually protects.
function OverlayStatus({ operation, className }) {
  const message = useMessage(operation);
  if (operation?.phase !== "running") return null;

  return (
    <div
      className={`absolute inset-0 z-30 flex items-center justify-center rounded-lg bg-white/80 ${className}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2.5 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-gray-600 shadow-md ring-1 ring-gray-200">
        <Spinner className="h-4 w-4 text-blue-600" />
        {message}
      </div>
    </div>
  );
}

function ToastStatus({ operation, className }) {
  const message = useMessage(operation);
  if (!operation) return null;

  const tone =
    operation.phase === "error"
      ? "text-red-700 ring-red-200"
      : operation.phase === "done"
        ? "text-green-700 ring-green-200"
        : "text-gray-600 ring-gray-200";

  return (
    <div
      className={`pointer-events-none flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium shadow-lg ring-1 ${tone} ${className}`}
      role="status"
      aria-live="polite"
    >
      {operation.phase === "running" && <Spinner className="h-4 w-4 text-blue-600" />}
      {operation.phase === "done" && <CheckIcon className="h-4 w-4" />}
      {message}
    </div>
  );
}

const VARIANTS = {
  inline: InlineStatus,
  button: ButtonStatus,
  overlay: OverlayStatus,
  toast: ToastStatus,
};

/**
 * Render one operation from a `useOperationStatus` map, or -- with `name`
 * omitted -- every operation whose declared `surface` matches `variant`.
 * The nameless form is how the background toast layer picks up whatever
 * happens to be running without the screen having to list them.
 *
 * @param {object} operations  the `operations` map from useOperationStatus
 * @param {string} [name]      which operation to show
 * @param {string} [variant]   "inline" | "button" | "overlay" | "toast"
 */
export default function OperationStatus({ operations, name, variant = "inline", className = "" }) {
  const Variant = VARIANTS[variant] || InlineStatus;

  if (name !== undefined) {
    return <Variant operation={operations?.[name]} className={className} />;
  }

  const matching = Object.entries(operations || {}).filter(([, op]) => op.surface === variant);
  if (matching.length === 0) return null;

  if (variant === "toast") {
    return (
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex flex-col items-center gap-2 px-4">
        {matching.map(([key, op]) => (
          <ToastStatus key={key} operation={op} className={className} />
        ))}
      </div>
    );
  }

  return matching.map(([key, op]) => <Variant key={key} operation={op} className={className} />);
}
