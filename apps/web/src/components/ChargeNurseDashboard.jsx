import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import TopRightMenu from "./TopRightMenu";
import ViewSwitcher from "./ViewSwitcher";
import { departmentLabel } from "../i18n/enums";
import { isTaskOverdue } from "../utils/taskOverdue";

function computeRiskScore(patient) {
  const now = Date.now();
  let score = 0;
  const tasks = patient.tasks || [];

  // +2 per delayed task
  score += tasks.filter((t) => t.status === "Delayed").length * 2;

  // +2 per overdue deadline
  score += tasks.filter(isTaskOverdue).length * 2;

  // +1 per stat task still pending
  score += tasks.filter((t) => t.priority === "Stat" && t.status === "Pending").length;

  // +1 if admitted < 24 hours. Reads `admission_date` (the real Supabase
  // column) with the demo-era `admissionDate` as a fallback, so local-only
  // patients from the unmatched-voice-task path still score.
  const admission = patient.admission_date || patient.admissionDate;
  if (admission) {
    const hoursSinceAdmission = (now - new Date(admission).getTime()) / (1000 * 60 * 60);
    if (hoursSinceAdmission < 24) score += 1;
  }

  // +1 per task pending > 1 hour. Same field-name story: `created_at` is the
  // column, `timestamp`/`createdAt` are the demo shapes.
  score += tasks.filter((t) => {
    if (t.status !== "Pending") return false;
    const taskTime = new Date(t.created_at || t.timestamp || t.createdAt).getTime();
    if (Number.isNaN(taskTime)) return false;
    return (now - taskTime) > 60 * 60 * 1000;
  }).length;

  return score;
}

// `labelKey` rather than a literal: both consumers (here and PatientCard)
// render it through t(), so the badge follows the nurse's language.
function getRiskLevel(score) {
  if (score >= 4) return { labelKey: "unitView.riskHigh", color: "text-red-600", bg: "bg-red-100", border: "border-red-200" };
  if (score >= 2) return { labelKey: "unitView.riskModerate", color: "text-yellow-700", bg: "bg-yellow-100", border: "border-yellow-200" };
  return null;
}

export default function ChargeNurseDashboard({ patients, nurses = [], view, onSwitchView, onPatientClick, delayedTasks, onGenerateHandoff, onDischargePatient, onRepageTask, onEscalateTask, onLanguageChange, onOpenProfile }) {
  const { t } = useTranslation();
  const stats = useMemo(() => {
    const allTasks = patients.flatMap((p) => p.tasks || []);
    const allNotes = patients.flatMap((p) => p.notes || []);
    const now = Date.now();

    // Status counts
    const pending = allTasks.filter((t) => t.status === "Pending").length;
    const confirmed = allTasks.filter((t) => t.status === "Confirmed").length;
    const delayed = allTasks.filter((t) => t.status === "Delayed").length;
    const completed = allTasks.filter((t) => t.status === "Completed").length;

    // Overdue deadlines
    const overdue = allTasks.filter(isTaskOverdue);

    // Department breakdown
    const deptMap = {};
    allTasks.forEach((t) => {
      if (t.status === "Completed") return;
      const dept = t.department || "Other";
      if (!deptMap[dept]) deptMap[dept] = { pending: 0, delayed: 0, confirmed: 0 };
      if (t.status === "Pending") deptMap[dept].pending++;
      if (t.status === "Delayed") deptMap[dept].delayed++;
      if (t.status === "Confirmed") deptMap[dept].confirmed++;
    });
    const departments = Object.entries(deptMap)
      .map(([name, counts]) => ({ name, ...counts, total: counts.pending + counts.delayed + counts.confirmed }))
      .sort((a, b) => b.total - a.total);

    // Attention items. `p.label` is the real Supabase column; the demo-era
    // `p.name` these rows used to read doesn't exist on them, which is why
    // this list rendered nameless entries.
    const attention = [];
    // STAT and delayed are counted separately and shown as two figures.
    // They answer different questions -- "how much is urgent by order" vs
    // "how much has slipped" -- and merging them into one number hides
    // both. A task that is Stat AND overdue is counted in both, on purpose;
    // it is genuinely both things. Counted by task id so one task can't
    // inflate a single figure twice (Delayed status and a passed deadline
    // are two ways of being late, not two late tasks).
    const statTaskIds = new Set();
    const delayedTaskIds = new Set();

    patients.forEach((p) => {
      (p.tasks || []).forEach((t) => {
        const stillOpen = t.status !== "Completed" && t.status !== "Cancelled";
        if (t.priority === "Stat" && stillOpen && t.status !== "Confirmed") {
          statTaskIds.add(t.id);
        }
        if (isTaskOverdue(t) || (t.status === "Delayed" && stillOpen)) {
          delayedTaskIds.add(t.id);
        }

        if (t.status === "Delayed") {
          attention.push({ type: "delayed", patient: p.label, task: t.description, department: t.department, patientId: p.id });
        }
        if (t.priority === "Stat" && t.status === "Pending") {
          attention.push({ type: "stat_pending", patient: p.label, task: t.description, department: t.department, patientId: p.id });
        }
        if (isTaskOverdue(t)) {
          const overdueMin = Math.round((now - new Date(t.deadline).getTime()) / 60000);
          attention.push({ type: "overdue", patient: p.label, task: t.description, overdueMin, patientId: p.id });
        }
      });
    });

    // Personnel overview. Created, assigned and completed are three
    // different figures and are never combined:
    //   created   -- this nurse raised the task (`created_by`)
    //   assigned  -- this task is currently theirs to do (`assigned_to`)
    //   completed -- this nurse marked it done (`completed_by`, 0011)
    // A task can count towards all three for different nurses, or none.
    //
    // Tasks completed before 0011 have no `completed_by`. They are reported
    // as an explicit "unknown" figure rather than being attributed to
    // whoever created them, which was never recorded and would be a guess.
    //
    // `assigned` and `unassignedCount` read as current workload, so both
    // count open tasks only. Created and completed stay historical: they
    // describe something that happened, not work outstanding.
    const isOpen = (t) => t.status !== "Completed" && t.status !== "Cancelled";
    const personnel = nurses.map((nurse) => ({
      id: nurse.id,
      name: nurse.name || nurse.email,
      created: allTasks.filter((t) => t.created_by === nurse.id).length,
      assigned: allTasks.filter((t) => t.assigned_to === nurse.id && isOpen(t)).length,
      completed: allTasks.filter((t) => t.completed_by === nurse.id).length,
    }));
    const unassignedCount = allTasks.filter((t) => !t.assigned_to && isOpen(t)).length;
    const completedUnknownCount = allTasks.filter(
      (t) => t.status === "Completed" && !t.completed_by
    ).length;

    // Risk scores
    const flaggedPatients = patients
      .map((p) => {
        const score = computeRiskScore(p);
        const risk = getRiskLevel(score);
        return risk ? { ...p, riskScore: score, risk } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.riskScore - a.riskScore);

    return {
      patientCount: patients.length,
      taskCount: allTasks.length,
      noteCount: allNotes.length,
      overdueCount: overdue.length,
      pending, confirmed, delayed, completed,
      departments,
      attention,
      statCount: statTaskIds.size,
      delayedAttentionCount: delayedTaskIds.size,
      personnel,
      unassignedCount,
      completedUnknownCount,
      flaggedPatients,
    };
  }, [patients, nurses]);

  const maxDeptTotal = Math.max(...stats.departments.map((d) => d.total), 1);

  return (
    <div className="flex min-h-screen flex-col bg-gray-100">
      {/* Header */}
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

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-4 space-y-4">
        {/* Summary bar */}
        <div className="grid grid-cols-4 gap-2">
          <div className="rounded-lg bg-white p-3 text-center shadow-sm">
            <p className="text-2xl font-bold text-gray-900">{stats.patientCount}</p>
            <p className="text-xs text-gray-500">{t("unitView.patients")}</p>
          </div>
          <div className="rounded-lg bg-white p-3 text-center shadow-sm">
            <p className="text-2xl font-bold text-gray-900">{stats.taskCount}</p>
            <p className="text-xs text-gray-500">{t("unitView.tasks")}</p>
          </div>
          <div className="rounded-lg bg-white p-3 text-center shadow-sm">
            <p className="text-2xl font-bold text-gray-900">{stats.noteCount}</p>
            <p className="text-xs text-gray-500">{t("unitView.notes")}</p>
          </div>
          <div className={`rounded-lg p-3 text-center shadow-sm ${stats.overdueCount > 0 ? "bg-red-50" : "bg-white"}`}>
            <p className={`text-2xl font-bold ${stats.overdueCount > 0 ? "text-red-600" : "text-gray-900"}`}>{stats.overdueCount}</p>
            <p className="text-xs text-gray-500">{t("unitView.overdue")}</p>
          </div>
        </div>

        {/* Patient safety flags */}
        {stats.flaggedPatients.length > 0 && (
          <div className="rounded-lg bg-white p-4 shadow-sm">
            <h2 className="text-sm font-bold text-gray-900 mb-3">{t("unitView.safetyFlags")}</h2>
            <div className="flex flex-col gap-2">
              {stats.flaggedPatients.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onPatientClick(p.id)}
                  className={`flex items-center justify-between rounded-lg border p-3 text-left transition-colors hover:bg-gray-50 ${p.risk.border}`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">{p.label}</p>
                    <p className="truncate text-xs text-gray-500">
                      {[p.location_label, p.diagnosis].filter(Boolean).join(" · ") || t("patientCard.noDiagnosis")}
                    </p>
                  </div>
                  <div className={`rounded-full px-2.5 py-1 text-xs font-bold ${p.risk.bg} ${p.risk.color}`}>
                    {t("unitView.riskBadge", { label: t(p.risk.labelKey), score: p.riskScore })}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Attention needed */}
        {stats.attention.length > 0 && (
          <div className="rounded-lg bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1">
              <h2 className="text-sm font-bold text-gray-900">{t("unitView.attentionNeeded")}</h2>
              {/* Two figures, never one merged number: STAT is "how much is
                  urgent by order", delayed is "how much has slipped". A task
                  that is both is counted in both. STAT carries the stronger
                  weight visually. */}
              <span className="flex items-center gap-1.5 text-xs">
                <span className="rounded-full bg-red-100 px-2 py-0.5 font-bold text-red-700 ring-1 ring-red-300">
                  {t("unitView.statCount", { count: stats.statCount })}
                </span>
                <span className="text-gray-300">·</span>
                <span className="rounded-full bg-orange-50 px-2 py-0.5 font-semibold text-orange-800">
                  {t("unitView.delayedAttentionCount", { count: stats.delayedAttentionCount })}
                </span>
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {stats.attention.map((item, i) => (
                <button
                  key={i}
                  onClick={() => onPatientClick(item.patientId)}
                  className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-left transition-colors hover:bg-gray-100"
                >
                  {item.type === "delayed" && (
                    <span className="mt-0.5 shrink-0 text-red-500">
                      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                    </span>
                  )}
                  {item.type === "stat_pending" && (
                    <span className="mt-0.5 shrink-0 text-orange-500">
                      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </span>
                  )}
                  {item.type === "overdue" && (
                    <span className="mt-0.5 shrink-0 text-red-500">
                      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                      </svg>
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-900">
                      <span className="font-medium">{item.patient}</span>
                      {" — "}
                      {item.task}
                    </p>
                    <p className="text-xs text-gray-500">
                      {item.type === "delayed" && t("unitView.attnDelayed", { department: departmentLabel(t, item.department) })}
                      {item.type === "stat_pending" && t("unitView.attnStatPending", { department: departmentLabel(t, item.department) })}
                      {item.type === "overdue" && t("unitView.attnOverdue", {
                        value: item.overdueMin < 60
                          ? t("taskCard.unitMinutes", { count: item.overdueMin })
                          : `${t("taskCard.unitHours", { count: Math.floor(item.overdueMin / 60) })} ${t("taskCard.unitMinutes", { count: item.overdueMin % 60 })}`,
                      })}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Task status breakdown */}
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <h2 className="text-sm font-bold text-gray-900 mb-3">{t("unitView.taskStatus")}</h2>
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="rounded-lg bg-blue-50 p-2">
              <p className="text-lg font-bold text-blue-700">{stats.pending}</p>
              <p className="text-xs text-blue-600">{t("enums.status.Pending")}</p>
            </div>
            <div className="rounded-lg bg-green-50 p-2">
              <p className="text-lg font-bold text-green-700">{stats.confirmed}</p>
              <p className="text-xs text-green-600">{t("enums.status.Confirmed")}</p>
            </div>
            <div className="rounded-lg bg-red-50 p-2">
              <p className="text-lg font-bold text-red-700">{stats.delayed}</p>
              <p className="text-xs text-red-600">{t("enums.status.Delayed")}</p>
            </div>
            <div className="rounded-lg bg-purple-50 p-2">
              <p className="text-lg font-bold text-purple-700">{stats.completed}</p>
              <p className="text-xs text-purple-600">{t("enums.status.Completed")}</p>
            </div>
          </div>
        </div>
        {/* Personnel overview. Created / assigned / completed are kept
            strictly distinct -- they answer three different questions and a
            single "tasks handled" number would answer none of them. */}
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-bold text-gray-900">{t("unitView.personnel")}</h2>
            <p className="text-xs text-gray-500">
              {t("unitView.nurseCount", { count: stats.personnel.length })}
            </p>
          </div>

          {stats.personnel.length === 0 ? (
            <p className="text-sm text-gray-400 italic">{t("unitView.noNurses")}</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[22rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-xs text-gray-500">
                      <th scope="col" className="py-1.5 pr-2 font-medium">{t("unitView.nurse")}</th>
                      <th scope="col" className="py-1.5 px-1 text-center font-medium">{t("unitView.tasksCreated")}</th>
                      <th scope="col" className="py-1.5 px-1 text-center font-medium">{t("unitView.tasksAssigned")}</th>
                      <th scope="col" className="py-1.5 pl-1 text-center font-medium">{t("unitView.tasksCompleted")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.personnel.map((nurse) => (
                      <tr key={nurse.id} className="border-b border-gray-50 last:border-b-0">
                        <td className="py-2 pr-2 text-gray-900">{nurse.name}</td>
                        <td className="py-2 px-1 text-center tabular-nums text-gray-700">{nurse.created}</td>
                        <td className="py-2 px-1 text-center tabular-nums text-gray-700">{nurse.assigned}</td>
                        <td className="py-2 pl-1 text-center tabular-nums text-gray-700">{nurse.completed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                <span>{t("unitView.unassignedTasks", { count: stats.unassignedCount })}</span>
                {stats.completedUnknownCount > 0 && (
                  // Completed before completed_by existed (0011). Reported as
                  // unknown rather than credited to whoever created the task.
                  <span>{t("unitView.completedUnknown", { count: stats.completedUnknownCount })}</span>
                )}
              </div>
            </>
          )}
        </div>

        {/* Department bottlenecks */}
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <h2 className="text-sm font-bold text-gray-900 mb-3">{t("unitView.departmentBottlenecks")}</h2>
          {stats.departments.length === 0 ? (
            <p className="text-sm text-gray-400 italic">{t("unitView.noActiveTasks")}</p>
          ) : (
            <div className="flex flex-col gap-3">
              {stats.departments.map((dept) => (
                <div key={dept.name}>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-gray-700">{departmentLabel(t, dept.name)}</p>
                    <p className="text-xs text-gray-500">
                      {dept.pending > 0 && t("unitView.pendingCount", { count: dept.pending })}
                      {dept.pending > 0 && dept.delayed > 0 && ", "}
                      {dept.delayed > 0 && <span className="text-red-600 font-medium">{t("unitView.delayedCount", { count: dept.delayed })}</span>}
                    </p>
                  </div>
                  <div className="h-3 w-full rounded-full bg-gray-100 overflow-hidden">
                    <div className="flex h-full">
                      {dept.delayed > 0 && (
                        <div
                          className="bg-red-400 h-full"
                          style={{ width: `${(dept.delayed / maxDeptTotal) * 100}%` }}
                        />
                      )}
                      {dept.pending > 0 && (
                        <div
                          className="bg-blue-400 h-full"
                          style={{ width: `${(dept.pending / maxDeptTotal) * 100}%` }}
                        />
                      )}
                      {dept.confirmed > 0 && (
                        <div
                          className="bg-green-400 h-full"
                          style={{ width: `${(dept.confirmed / maxDeptTotal) * 100}%` }}
                        />
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {/* Legend */}
              <div className="flex gap-4 mt-1">
                <div className="flex items-center gap-1">
                  <div className="h-2.5 w-2.5 rounded-full bg-blue-400" />
                  <span className="text-xs text-gray-500">{t("enums.status.Pending")}</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="h-2.5 w-2.5 rounded-full bg-red-400" />
                  <span className="text-xs text-gray-500">{t("enums.status.Delayed")}</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="h-2.5 w-2.5 rounded-full bg-green-400" />
                  <span className="text-xs text-gray-500">{t("enums.status.Confirmed")}</span>
                </div>
              </div>
            </div>
          )}
        </div>

      </main>
    </div>
  );
}

export { computeRiskScore, getRiskLevel };
