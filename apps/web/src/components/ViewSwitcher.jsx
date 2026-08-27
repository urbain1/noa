import { useTranslation } from "react-i18next";

// The three top-level screens: My Patients, Tasks, Unit View. Extracted so
// all three headers stay in step -- the pair of buttons was previously
// duplicated in Dashboard and ChargeNurseDashboard, and a third screen would
// have made that three copies to keep in sync.
//
// Navigation is still App.jsx's `view` state (no router, per the standing
// decision); this only renders the buttons.
const VIEWS = [
  { id: "patients", labelKey: "dashboard.myPatients" },
  { id: "tasks", labelKey: "dashboard.tasksView" },
  { id: "unit", labelKey: "dashboard.unitView" },
];

export default function ViewSwitcher({ current, onSwitch }) {
  const { t } = useTranslation();

  return (
    // Three buttons plus the menu have to fit a phone header, so labels
    // shrink rather than wrap or push the menu off-screen.
    <div className="flex items-center gap-1 sm:gap-2">
      {VIEWS.map((v) => (
        <button
          key={v.id}
          type="button"
          onClick={() => onSwitch(v.id)}
          aria-current={current === v.id ? "page" : undefined}
          className={`whitespace-nowrap rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors sm:px-3 sm:text-sm ${
            current === v.id
              ? "bg-blue-600 text-white"
              : "border border-blue-200 bg-blue-50 font-medium text-blue-700 hover:bg-blue-100"
          }`}
        >
          {t(v.labelKey)}
        </button>
      ))}
    </div>
  );
}
