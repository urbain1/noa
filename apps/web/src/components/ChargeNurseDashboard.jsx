import { useMemo } from "react";
import TopRightMenu from "./TopRightMenu";

function computeRiskScore(patient) {
  const now = Date.now();
  let score = 0;
  const tasks = patient.tasks || [];

  // +2 per delayed task
  score += tasks.filter((t) => t.status === "Delayed").length * 2;

  // +2 per overdue deadline
  score += tasks.filter((t) => t.deadline && new Date(t.deadline).getTime() < now && t.status !== "Completed" && t.status !== "Confirmed").length * 2;

  // +1 per stat task still pending
  score += tasks.filter((t) => t.priority === "Stat" && t.status === "Pending").length;

  // +1 if admitted < 24 hours
  if (patient.admissionDate) {
    const hoursSinceAdmission = (now - new Date(patient.admissionDate).getTime()) / (1000 * 60 * 60);
    if (hoursSinceAdmission < 24) score += 1;
  }

  // +1 per task pending > 1 hour
  score += tasks.filter((t) => {
    if (t.status !== "Pending") return false;
    const taskTime = new Date(t.timestamp || t.createdAt).getTime();
    return (now - taskTime) > 60 * 60 * 1000;
  }).length;

  return score;
}

function getRiskLevel(score) {
  if (score >= 4) return { label: "High Risk", color: "text-red-600", bg: "bg-red-100", border: "border-red-200" };
  if (score >= 2) return { label: "Moderate", color: "text-yellow-700", bg: "bg-yellow-100", border: "border-yellow-200" };
  return null;
}

export default function ChargeNurseDashboard({ patients, onSwitchView, onPatientClick, delayedTasks, onGenerateHandoff, onDischargePatient, onFollowUp, onDismissAlert }) {
  const stats = useMemo(() => {
    const allTasks = patients.flatMap((p) => p.tasks || []);
    const allNotes = patients.flatMap((p) => p.comments || []);
    const now = Date.now();

    // Status counts
    const pending = allTasks.filter((t) => t.status === "Pending").length;
    const confirmed = allTasks.filter((t) => t.status === "Confirmed").length;
    const delayed = allTasks.filter((t) => t.status === "Delayed").length;
    const completed = allTasks.filter((t) => t.status === "Completed").length;

    // Overdue deadlines
    const overdue = allTasks.filter(
      (t) => t.deadline && new Date(t.deadline).getTime() < now && t.status !== "Completed" && t.status !== "Confirmed"
    );

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

    // Attention items
    const attention = [];
    patients.forEach((p) => {
      (p.tasks || []).forEach((t) => {
        if (t.status === "Delayed") {
          attention.push({ type: "delayed", patient: p.name, task: t.description, department: t.department, patientId: p.id });
        }
        if (t.priority === "Stat" && t.status === "Pending") {
          attention.push({ type: "stat_pending", patient: p.name, task: t.description, department: t.department, patientId: p.id });
        }
        if (t.deadline && new Date(t.deadline).getTime() < now && t.status !== "Completed" && t.status !== "Confirmed") {
          const overdueMin = Math.round((now - new Date(t.deadline).getTime()) / 60000);
          attention.push({ type: "overdue", patient: p.name, task: t.description, overdueMin, patientId: p.id });
        }
      });
    });

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
      flaggedPatients,
    };
  }, [patients]);

  const maxDeptTotal = Math.max(...stats.departments.map((d) => d.total), 1);

  return (
    <div className="flex min-h-screen flex-col bg-gray-100">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 shadow-sm">
        <h1 className="text-xl font-bold text-black">noa</h1>
        <div className="flex items-center gap-4">
          <button onClick={onSwitchView} className="px-3 py-1.5 rounded-lg text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 hover:bg-blue-100">My Patients</button>
          <button className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-blue-600 text-white">Unit View</button>
          <TopRightMenu
            patients={patients}
            delayedTasks={delayedTasks || []}
            onGenerateHandoff={onGenerateHandoff}
            onDischargePatient={onDischargePatient}
            onFollowUp={onFollowUp}
            onDismissAlert={onDismissAlert}
          />
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-4 space-y-4">
        {/* Summary bar */}
        <div className="grid grid-cols-4 gap-2">
          <div className="rounded-lg bg-white p-3 text-center shadow-sm">
            <p className="text-2xl font-bold text-gray-900">{stats.patientCount}</p>
            <p className="text-xs text-gray-500">Patients</p>
          </div>
          <div className="rounded-lg bg-white p-3 text-center shadow-sm">
            <p className="text-2xl font-bold text-gray-900">{stats.taskCount}</p>
            <p className="text-xs text-gray-500">Tasks</p>
          </div>
          <div className="rounded-lg bg-white p-3 text-center shadow-sm">
            <p className="text-2xl font-bold text-gray-900">{stats.noteCount}</p>
            <p className="text-xs text-gray-500">Notes</p>
          </div>
          <div className={`rounded-lg p-3 text-center shadow-sm ${stats.overdueCount > 0 ? "bg-red-50" : "bg-white"}`}>
            <p className={`text-2xl font-bold ${stats.overdueCount > 0 ? "text-red-600" : "text-gray-900"}`}>{stats.overdueCount}</p>
            <p className="text-xs text-gray-500">Overdue</p>
          </div>
        </div>

        {/* Patient safety flags */}
        {stats.flaggedPatients.length > 0 && (
          <div className="rounded-lg bg-white p-4 shadow-sm">
            <h2 className="text-sm font-bold text-gray-900 mb-3">Patient Safety Flags</h2>
            <div className="flex flex-col gap-2">
              {stats.flaggedPatients.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onPatientClick(p.id)}
                  className={`flex items-center justify-between rounded-lg border p-3 text-left transition-colors hover:bg-gray-50 ${p.risk.border}`}
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">{p.name}</p>
                    <p className="text-xs text-gray-500">Room {p.room} &middot; {p.diagnosis}</p>
                  </div>
                  <div className={`rounded-full px-2.5 py-1 text-xs font-bold ${p.risk.bg} ${p.risk.color}`}>
                    {p.risk.label} ({p.riskScore})
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Attention needed */}
        {stats.attention.length > 0 && (
          <div className="rounded-lg bg-white p-4 shadow-sm">
            <h2 className="text-sm font-bold text-gray-900 mb-3">Attention Needed</h2>
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
                      {item.type === "delayed" && `${item.department} — delayed, no response`}
                      {item.type === "stat_pending" && `${item.department} — stat order pending`}
                      {item.type === "overdue" && `Overdue by ${item.overdueMin < 60 ? `${item.overdueMin}m` : `${Math.floor(item.overdueMin / 60)}h ${item.overdueMin % 60}m`}`}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Department bottlenecks */}
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <h2 className="text-sm font-bold text-gray-900 mb-3">Department Bottlenecks</h2>
          {stats.departments.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No active tasks</p>
          ) : (
            <div className="flex flex-col gap-3">
              {stats.departments.map((dept) => (
                <div key={dept.name}>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-gray-700">{dept.name}</p>
                    <p className="text-xs text-gray-500">
                      {dept.pending > 0 && `${dept.pending} pending`}
                      {dept.pending > 0 && dept.delayed > 0 && ", "}
                      {dept.delayed > 0 && <span className="text-red-600 font-medium">{dept.delayed} delayed</span>}
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
                  <span className="text-xs text-gray-500">Pending</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="h-2.5 w-2.5 rounded-full bg-red-400" />
                  <span className="text-xs text-gray-500">Delayed</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="h-2.5 w-2.5 rounded-full bg-green-400" />
                  <span className="text-xs text-gray-500">Confirmed</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Task status breakdown */}
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <h2 className="text-sm font-bold text-gray-900 mb-3">Task Status</h2>
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="rounded-lg bg-blue-50 p-2">
              <p className="text-lg font-bold text-blue-700">{stats.pending}</p>
              <p className="text-xs text-blue-600">Pending</p>
            </div>
            <div className="rounded-lg bg-green-50 p-2">
              <p className="text-lg font-bold text-green-700">{stats.confirmed}</p>
              <p className="text-xs text-green-600">Confirmed</p>
            </div>
            <div className="rounded-lg bg-red-50 p-2">
              <p className="text-lg font-bold text-red-700">{stats.delayed}</p>
              <p className="text-xs text-red-600">Delayed</p>
            </div>
            <div className="rounded-lg bg-purple-50 p-2">
              <p className="text-lg font-bold text-purple-700">{stats.completed}</p>
              <p className="text-xs text-purple-600">Completed</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export { computeRiskScore, getRiskLevel };
