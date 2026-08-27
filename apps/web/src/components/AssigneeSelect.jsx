import { useState } from "react";
import { useTranslation } from "react-i18next";

// Assign a task to a colleague at the same facility, or leave it
// unassigned. Colleagues come from `nurses`, which
// `nurses_read_same_facility` (0001/0002) already scopes -- no facility
// filter is applied client-side.
//
// Unassigned is a first-class option, not an empty state to be corrected:
// most tasks in the beta have no assignee and that stays valid.
//
// Assignment does not change who sees the task. Every nurse at the facility
// still sees every task (project.md defers per-nurse visibility to the
// ward-manager design session).
export default function AssigneeSelect({ value, nurses, onChange, disabled, compact }) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);

  const handleChange = async (event) => {
    const next = event.target.value || null;
    if (next === (value || null)) return;
    setSaving(true);
    try {
      await onChange(next);
    } finally {
      setSaving(false);
    }
  };

  return (
    <label className={compact ? "block" : "flex items-center gap-2"}>
      <span className={compact ? "mb-1 block text-sm font-medium text-gray-700" : "text-xs font-medium text-gray-600"}>
        {t("tasksView.assignee")}
      </span>
      <select
        value={value || ""}
        onChange={handleChange}
        disabled={disabled || saving}
        className={`rounded-lg border border-gray-300 bg-white py-2 pl-3 pr-8 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60 ${
          compact ? "w-full" : "flex-1"
        }`}
      >
        <option value="">{t("tasksView.unassigned")}</option>
        {nurses.map((nurse) => (
          <option key={nurse.id} value={nurse.id}>
            {nurse.name || nurse.email}
          </option>
        ))}
      </select>
      {saving && <span className="text-xs text-gray-400">{t("common.saving")}</span>}
    </label>
  );
}
