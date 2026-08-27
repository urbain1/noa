import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import TaskCard from "./TaskCard";
import TopRightMenu from "./TopRightMenu";
import ViewSwitcher from "./ViewSwitcher";
import AssigneeSelect from "./AssigneeSelect";
import { departmentLabel, priorityLabel, statusLabel } from "../i18n/enums";
import { sortTasks, taskSortGroup, SORT_GROUP_URGENT, SORT_GROUP_OVERDUE } from "../utils/taskSort";
import { isTaskOverdue } from "../utils/taskOverdue";
import { localeTag } from "../i18n";

// Every value tasks.status can actually hold (0001, plus Cancelled from
// discharge-plan cancellation) -- a superset of TaskEditDialog's
// STATUS_OPTIONS, which only lists what a nurse can manually set a task to.
const STATUS_FILTER_OPTIONS = ["Pending", "Confirmed", "Delayed", "Completed", "Cancelled"];

// Sentinel for "no assignee" in the nurse filter -- not a real nurse id, so
// it can't collide with one.
const UNASSIGNED_FILTER = "__unassigned__";

function FilterChip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
        active
          ? "border-blue-600 bg-blue-600 text-white"
          : "border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-700 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

// Deadline as an absolute time. The relative form ("Overdue by 20m") already
// lives on TaskCard in the expanded row; repeating it in the summary line
// would say the same thing twice. 24-hour in French, 12-hour with AM/PM in
// English, from the locale alone -- same rule as actionTimestamp.js.
function formatDeadline(deadline, tag) {
  if (!deadline) return null;
  const date = new Date(deadline);
  if (Number.isNaN(date.getTime())) return null;
  const time = date.toLocaleTimeString(tag, { hour: "numeric", minute: "2-digit" });
  if (date.toDateString() === new Date().toDateString()) return time;
  return `${date.toLocaleDateString(tag, { day: "numeric", month: "short" })} ${time}`;
}

// One row per task. Collapsed by default so a whole shift's tasks stay
// scannable; expanding reveals the full TaskCard, with the same complete /
// repage / escalate / edit actions as Patient View, so there are not two
// different ways to act on a task.
function TaskRow({ task, patient, nurses, expanded, onToggle, onOpenPatient, onOpenTask, onComplete, onEdit, onRepage, onEscalate, onAssign }) {
  const { t, i18n } = useTranslation();
  const group = taskSortGroup(task);
  const deadlineText = formatDeadline(task.deadline, localeTag(i18n.language));
  const overdue = isTaskOverdue(task);
  const assignee = nurses.find((n) => n.id === task.assigned_to);

  const groupStyles = {
    [SORT_GROUP_URGENT]: "border-l-4 border-l-red-500",
    [SORT_GROUP_OVERDUE]: "border-l-4 border-l-orange-400",
  };

  return (
    <li className={`rounded-lg border border-gray-200 bg-white shadow-sm ${groupStyles[group] || ""}`}>
      <div className="flex items-start gap-2 p-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="mt-0.5 shrink-0 rounded p-0.5 text-gray-400 transition-colors hover:text-gray-700"
          aria-label={expanded ? t("tasksView.collapseAria") : t("tasksView.expandAria")}
        >
          <svg
            className={`h-4 w-4 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onOpenTask}
            className="block w-full break-words text-left text-sm font-medium leading-snug text-gray-900 hover:text-blue-700"
          >
            {task.description}
          </button>

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
            {/* Patient label is a link to that patient, not just context. */}
            <button
              type="button"
              onClick={onOpenPatient}
              className="break-words font-semibold text-blue-700 underline-offset-2 hover:underline"
            >
              {patient ? patient.label : t("tasksView.unknownPatient")}
            </button>
            <span className="text-gray-300">|</span>
            <span className={assignee ? "" : "italic text-gray-400"}>
              {/* Same fallback as AssigneeSelect: a nurse who has not set a
                  display name still has an email, and showing nothing at
                  all reads as unassigned when the task is assigned. */}
              {assignee ? assignee.name || assignee.email : t("tasksView.unassigned")}
            </span>
            <span className="text-gray-300">|</span>
            <span
              className={`font-semibold ${
                task.priority === "Stat"
                  ? "text-red-600"
                  : task.priority === "Urgent"
                    ? "text-orange-600"
                    : "text-gray-500"
              }`}
            >
              {priorityLabel(t, task.priority)}
            </span>
            <span className="text-gray-300">|</span>
            <span>{statusLabel(t, task.status)}</span>
            {deadlineText && (
              <>
                <span className="text-gray-300">|</span>
                <span className={overdue ? "font-semibold text-red-600" : ""}>
                  {t("tasksView.due", { value: deadlineText })}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 px-3 py-3">
          <p className="mb-2 text-xs text-gray-500">{departmentLabel(t, task.department)}</p>
          <TaskCard
            task={task}
            onComplete={onComplete}
            onEdit={onEdit}
            onRepage={onRepage}
            onEscalate={onEscalate}
          />
          <div className="mt-3">
            <AssigneeSelect
              value={task.assigned_to || ""}
              nurses={nurses}
              onChange={(nurseId) => onAssign(task, nurseId)}
            />
          </div>
        </div>
      )}
    </li>
  );
}

// Every task at the facility, in one urgency-ordered list (scenarios.md
// SC-7). Nothing here changes what a nurse can see: the list is built from
// the same facility-scoped `patients` state the other screens render, so
// `tasks_facility_scope` remains the only thing deciding visibility.
export default function TasksScreen({
  patients,
  nurses,
  view,
  onSwitchView,
  onOpenPatient,
  onOpenTask,
  onCompleteTask,
  onEditTask,
  onRepageTask,
  onEscalateTask,
  onAssignTask,
  delayedTasks,
  onGenerateHandoff,
  onDischargePatient,
  onLanguageChange,
  onOpenProfile,
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Multi-select per dimension: an empty array means "no filter on this
  // dimension", not "match nothing". Kept separate from `query` -- text
  // search and these dropdown filters both narrow the same list, but
  // clearing one shouldn't clear the other.
  const [nurseFilter, setNurseFilter] = useState([]);
  const [patientFilter, setPatientFilter] = useState([]);
  const [statusFilter, setStatusFilter] = useState([]);

  const toggleFilter = (setFn, value) => {
    setFn((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  };

  const activeFilterCount = nurseFilter.length + patientFilter.length + statusFilter.length;
  const clearFilters = () => {
    setNurseFilter([]);
    setPatientFilter([]);
    setStatusFilter([]);
  };

  // Flattened once, then sorted by the shared comparator so this screen and
  // Patient View can't disagree about ordering.
  const allTasks = useMemo(() => {
    const rows = [];
    for (const patient of patients) {
      for (const task of patient.tasks || []) {
        rows.push({ task, patient });
      }
    }
    const byTaskId = new Map(rows.map((row) => [row.task.id, row]));
    return sortTasks(rows.map((r) => r.task)).map((task) => byTaskId.get(task.id));
  }, [patients]);

  // Plain client-side text filter over what's already loaded -- description,
  // patient label, location label and assignee name. No server-side search,
  // no saved filters (deliberately out of scope). The dropdown filters below
  // narrow the same list further, live, on top of whatever the text search
  // already matched.
  const visibleTasks = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allTasks.filter(({ task, patient }) => {
      if (nurseFilter.length > 0) {
        const key = task.assigned_to || UNASSIGNED_FILTER;
        if (!nurseFilter.includes(key)) return false;
      }
      if (patientFilter.length > 0 && !patientFilter.includes(patient?.id)) return false;
      if (statusFilter.length > 0 && !statusFilter.includes(task.status)) return false;

      if (!q) return true;
      const assignee = nurses.find((n) => n.id === task.assigned_to);
      return [
        task.description,
        patient?.label,
        patient?.location_label,
        assignee?.name,
      ]
        .filter(Boolean)
        .some((field) => field.toLowerCase().includes(q));
    });
  }, [allTasks, query, nurses, nurseFilter, patientFilter, statusFilter]);

  return (
    <div className="flex min-h-screen flex-col bg-gray-100">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-gray-200 bg-white px-3 py-3 shadow-sm sm:px-4">
        <h1 className="text-xl font-bold text-black">noa</h1>
        <div className="flex items-center gap-1 sm:gap-3">
          <ViewSwitcher current={view} onSwitch={onSwitchView} />
          <TopRightMenu
            patients={patients}
            delayedTasks={delayedTasks || []}
            onGenerateHandoff={onGenerateHandoff}
            onDischargePatient={onDischargePatient}
            onRepageTask={onRepageTask}
            onEscalateTask={onEscalateTask}
            onLanguageChange={onLanguageChange}
            onOpenProfile={onOpenProfile}
          />
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-4">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="font-display text-lg font-bold tracking-tight text-gray-900">
            {t("tasksView.heading")}
          </h2>
          <p className="text-xs text-gray-500">
            {t("tasksView.taskCount", { count: allTasks.length })}
          </p>
        </div>

        <div className="mb-3 flex items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("tasksView.searchPlaceholder")}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
            className={`relative flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              filtersOpen
                ? "border-blue-300 bg-blue-50 text-blue-700"
                : "border-gray-300 bg-white text-gray-600 hover:bg-gray-700 hover:text-white"
            }`}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h18M6 8h12M10 12h4" />
            </svg>
            {t("tasksView.filters")}
            {activeFilterCount > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-bold text-white">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {filtersOpen && (
          <div className="mb-3 flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-3">
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">{t("tasksView.filterByNurse")}</p>
              <div className="flex flex-wrap gap-1.5">
                <FilterChip active={nurseFilter.includes(UNASSIGNED_FILTER)} onClick={() => toggleFilter(setNurseFilter, UNASSIGNED_FILTER)}>
                  {t("tasksView.unassigned")}
                </FilterChip>
                {nurses.map((nurse) => (
                  <FilterChip key={nurse.id} active={nurseFilter.includes(nurse.id)} onClick={() => toggleFilter(setNurseFilter, nurse.id)}>
                    {nurse.name || nurse.email}
                  </FilterChip>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">{t("tasksView.filterByPatient")}</p>
              <div className="flex flex-wrap gap-1.5">
                {patients.map((patient) => (
                  <FilterChip key={patient.id} active={patientFilter.includes(patient.id)} onClick={() => toggleFilter(setPatientFilter, patient.id)}>
                    {patient.label}
                  </FilterChip>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">{t("tasksView.filterByStatus")}</p>
              <div className="flex flex-wrap gap-1.5">
                {STATUS_FILTER_OPTIONS.map((status) => (
                  <FilterChip key={status} active={statusFilter.includes(status)} onClick={() => toggleFilter(setStatusFilter, status)}>
                    {statusLabel(t, status)}
                  </FilterChip>
                ))}
              </div>
            </div>

            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={clearFilters}
                className="self-start text-xs font-semibold text-blue-700 hover:underline"
              >
                {t("tasksView.clearFilters")}
              </button>
            )}
          </div>
        )}

        {allTasks.length === 0 ? (
          <p className="rounded-lg bg-white p-6 text-center text-sm text-gray-400">
            {t("tasksView.empty")}
          </p>
        ) : visibleTasks.length === 0 ? (
          <p className="rounded-lg bg-white p-6 text-center text-sm text-gray-400">
            {query.trim() ? t("tasksView.noMatches", { query: query.trim() }) : t("tasksView.noFilterMatches")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2 pb-8">
            {visibleTasks.map(({ task, patient }) => (
              <TaskRow
                key={task.id}
                task={task}
                patient={patient}
                nurses={nurses}
                expanded={expandedId === task.id}
                onToggle={() => setExpandedId(expandedId === task.id ? null : task.id)}
                onOpenPatient={() => onOpenPatient(patient?.id)}
                onOpenTask={() => onOpenTask(task)}
                onComplete={onCompleteTask}
                onEdit={onEditTask}
                onRepage={onRepageTask}
                onEscalate={onEscalateTask}
                onAssign={onAssignTask}
              />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
