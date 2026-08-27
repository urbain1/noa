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
            className="block w-full text-left text-sm font-medium leading-snug text-gray-900 hover:text-blue-700"
          >
            {task.description}
          </button>

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
            {/* Patient label is a link to that patient, not just context. */}
            <button
              type="button"
              onClick={onOpenPatient}
              className="font-semibold text-blue-700 underline-offset-2 hover:underline"
            >
              {patient ? patient.label : t("tasksView.unknownPatient")}
            </button>
            <span className="text-gray-300">|</span>
            <span className={assignee ? "" : "italic text-gray-400"}>
              {assignee ? assignee.name : t("tasksView.unassigned")}
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
  // no saved filters (deliberately out of scope).
  const visibleTasks = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allTasks;
    return allTasks.filter(({ task, patient }) => {
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
  }, [allTasks, query, nurses]);

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

        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("tasksView.searchPlaceholder")}
          className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />

        {allTasks.length === 0 ? (
          <p className="rounded-lg bg-white p-6 text-center text-sm text-gray-400">
            {t("tasksView.empty")}
          </p>
        ) : visibleTasks.length === 0 ? (
          <p className="rounded-lg bg-white p-6 text-center text-sm text-gray-400">
            {t("tasksView.noMatches", { query: query.trim() })}
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
