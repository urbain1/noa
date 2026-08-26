import { useState, useEffect } from "react";
import Dashboard from "./components/Dashboard";
import VoiceCapture from "./components/VoiceCapture";
import Alert from "./components/Alert";
import DischargeDialog from "./components/DischargeDialog";
import HandoffSummary from "./components/HandoffSummary";
import AddNoteDialog from "./components/AddNoteDialog";
import SuggestionModal from "./components/SuggestionModal";
import AddPatientDialog from "./components/AddPatientDialog";
import EditPatientDialog from "./components/EditPatientDialog";
import TaskEditDialog from "./components/TaskEditDialog";
import ChargeNurseDashboard from "./components/ChargeNurseDashboard";
import AuthScreen from "./components/AuthScreen";
import FacilityScreen from "./components/FacilityScreen";
import { supabase } from "./lib/supabase";
import { fetchPatients, createPatient, updatePatient, completeTask, updateTask, addNote, createTask } from "./lib/patients";
import { generateHandoffSummary, generateSuggestions } from "./utils/claudeAPI";

function App() {
  // --- Auth state ---
  const [session, setSession] = useState(undefined); // undefined = loading, null = logged out
  const [nurseProfile, setNurseProfile] = useState(undefined); // undefined = loading, null = needs facility
  const [authLoading, setAuthLoading] = useState(true);

  // Restore session and listen for auth changes
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession);
      if (currentSession) {
        fetchNurseProfile(currentSession.user.id);
      } else {
        setAuthLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession) {
        fetchNurseProfile(newSession.user.id);
      } else {
        setNurseProfile(undefined);
        setAuthLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchNurseProfile = async (userId) => {
    const { data, error } = await supabase
      .from('nurses')
      .select('id, facility_id')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      console.error('Nurse profile fetch error:', error);
      setNurseProfile(null);
    } else {
      setNurseProfile(data); // null if no row exists yet
    }
    setAuthLoading(false);
  };

  const handleAuthSuccess = (newSession) => {
    setSession(newSession);
    fetchNurseProfile(newSession.user.id);
  };

  const handleFacilityComplete = () => {
    // Re-fetch nurse profile now that the row exists
    if (session) {
      fetchNurseProfile(session.user.id);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setNurseProfile(undefined);
  };

  // --- Patient data (Supabase-backed) ---
  const [patients, setPatients] = useState([]);
  const [patientsLoading, setPatientsLoading] = useState(true);
  const [patientsError, setPatientsError] = useState(null);
  const [showAddPatient, setShowAddPatient] = useState(false);
  const [patientToEdit, setPatientToEdit] = useState(null);
  const [taskToEdit, setTaskToEdit] = useState(null);

  const loadPatients = async () => {
    setPatientsLoading(true);
    setPatientsError(null);
    try {
      const data = await fetchPatients();
      setPatients(data.map((p) => ({ ...p, tasks: p.tasks || [], notes: p.notes || [] })));
    } catch (err) {
      console.error('Patient fetch error:', err);
      setPatientsError('Could not load patients. Please try reloading.');
    }
    setPatientsLoading(false);
  };

  useEffect(() => {
    if (nurseProfile?.facility_id) {
      loadPatients();
    }
  }, [nurseProfile]);

  const [showVoice, setShowVoice] = useState(false);
  // Set when Voice Capture is opened from a specific patient's "+ Add Task"
  // button, so matching can be skipped entirely; null for the header/floating
  // mic button, which still needs to match a spoken/typed patient.
  const [voiceCapturePatient, setVoiceCapturePatient] = useState(null);
  const [delayedTasks, setDelayedTasks] = useState([]);
  const [selectedPatientForDischarge, setSelectedPatientForDischarge] = useState(null);
  const [showHandoff, setShowHandoff] = useState(false);
  const [handoffData, setHandoffData] = useState(null);
  const [showAddNote, setShowAddNote] = useState(null); // patientId or null
  const [suggestionData, setSuggestionData] = useState(null); // { suggestions, patientId, patientName, triggerSummary } or null
  const [showChargeView, setShowChargeView] = useState(false);
  const [alertHidden, setAlertHidden] = useState(false);
  const [dismissedTaskIds, setDismissedTaskIds] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("dismissedTasks") || "[]");
    } catch {
      return [];
    }
  });

  // Simulate delayed status on mock tasks after 30 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setPatients((prev) =>
        prev.map((p) => ({
          ...p,
          tasks: p.tasks.map((t) =>
            (t.id === 9001 || t.id === 9002) && t.status === "Pending"
              ? { ...t, status: "Delayed" }
              : t
          ),
        }))
      );
    }, 30000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const delayed = [];
    for (const patient of patients) {
      for (const task of patient.tasks) {
        if (task.status === "Delayed" && !dismissedTaskIds.includes(task.id)) {
          delayed.push({ ...task, patientName: patient.label, patientRoom: patient.location_label });
        }
      }
    }
    setDelayedTasks(delayed);
  }, [patients, dismissedTaskIds]);

  const dismissAlert = (taskId) => {
    setDismissedTaskIds((prev) => {
      const updated = [...prev, taskId];
      localStorage.setItem("dismissedTasks", JSON.stringify(updated));
      return updated;
    });
  };

  const handleFollowUp = (task) => {
    setPatients((prevPatients) =>
      prevPatients.map((patient) => ({
        ...patient,
        tasks: patient.tasks.map((t) =>
          t.id === task.id ? { ...t, status: "Confirmed" } : t
        ),
      }))
    );
    dismissAlert(task.id);
  };

  const simulateStatusChange = (taskId) => {
    setPatients((prev) =>
      prev.map((p) => ({
        ...p,
        tasks: p.tasks.map((t) => {
          if (t.id !== taskId) return t;
          // Don't touch completed tasks
          if (t.status === "Completed") return t;
          // If task is still Pending after 15s, simulate department confirmation
          if (t.status === "Pending") {
            return { ...t, status: "Confirmed" };
          }
          return t;
        }),
      }))
    );
  };

  const handleTaskCreated = async (taskData) => {
    // Matching already happened in VoiceCapture (name/room fuzzy match
    // against the label/location_label-shimmed patient list); a resolved
    // match always carries the matched patient's exact `label` through as
    // `patientName`, so look the real Supabase patient up by that.
    const matchedPatient = !taskData.isNewPatient && taskData.patientName
      ? patients.find((p) => p.label === taskData.patientName)
      : null;

    if (matchedPatient) {
      try {
        const newTask = await createTask(nurseProfile.facility_id, matchedPatient.id, session.user.id, {
          description: taskData.description,
          department: taskData.department,
          priority: taskData.priority,
          deadline: taskData.deadline,
          rawTranscript: taskData.rawTranscript,
        });
        setPatients((prev) =>
          prev.map((p) =>
            p.id === matchedPatient.id ? { ...p, tasks: [newTask, ...p.tasks] } : p
          )
        );
        triggerSuggestions(matchedPatient.id, { type: "task", data: newTask });
      } catch (err) {
        console.error("Task creation error:", err);
        alert("Failed to save task. Please try again.");
      }
      setShowVoice(false);
      return;
    }

    // Could not resolve to a real patient (new-patient-via-voice, or no
    // match found at all). Voice-based patient creation isn't wired to
    // Supabase -- label must follow the Patient_Test_N convention via the
    // Add Patient dialog -- so this stays local-only, same as before.
    const newTask = {
      id: Date.now(),
      description: taskData.description,
      department: taskData.department,
      status: taskData.status || "Pending",
      priority: taskData.priority || "Routine",
      deadline: taskData.deadline || null,
      created_at: new Date().toISOString(),
    };

    let targetPatientId = null;

    // Case 1: New patient being created
    if (taskData.isNewPatient) {
      const newPatientId = Date.now();
      const newPatient = {
        id: newPatientId,
        room: taskData.room,
        name: taskData.patientName || `Patient (Room ${taskData.room})`,
        age: taskData.patientAge || 0,
        notes: [],
        tasks: [newTask],
      };
      setPatients((prev) => [...prev, newPatient]);
      targetPatientId = newPatientId;
    } else {
      // Case 2: Add task to existing (local-only) patient
      const roomExists = patients.find((p) => p.room === taskData.room);

      if (roomExists) {
        setPatients((prev) =>
          prev.map((p) =>
            p.room === taskData.room
              ? { ...p, tasks: [...p.tasks, newTask] }
              : p
          )
        );
        targetPatientId = roomExists.id;
      } else {
        // Create new patient card (unknown patient)
        const newPatientId = Date.now() + 1;
        const newPatient = {
          id: newPatientId,
          room: taskData.room,
          name: `Patient (Room ${taskData.room})`,
          age: 0,
          notes: [],
          tasks: [newTask],
        };
        setPatients((prev) => [...prev, newPatient]);
        targetPatientId = newPatientId;
      }
    }

    // Simulate status change after 15 seconds (local-only demo path)
    setTimeout(() => {
      simulateStatusChange(newTask.id);
    }, 15000);

    // Stat tasks that aren't confirmed within 45 seconds become delayed
    if (newTask.priority === "Stat") {
      setTimeout(() => {
        setPatients((prev) =>
          prev.map((p) => ({
            ...p,
            tasks: p.tasks.map((t) => {
              if (t.id !== newTask.id) return t;
              // Only delay if still just Confirmed (not Completed)
              if (t.status === "Confirmed") {
                return { ...t, status: "Delayed" };
              }
              return t;
            }),
          }))
        );
      }, 45000);
    }

    setShowVoice(false);

    // Trigger AI suggestions (async, non-blocking)
    if (targetPatientId) {
      triggerSuggestions(targetPatientId, {
        type: "task",
        data: newTask,
      });
    }
  };

  const handleDischargeConfirm = (options) => {
    const newTasks = [];

    if (options.notifyPatient) {
      newTasks.push({
        id: `discharge-notify-${Date.now()}`,
        description:
          "Notify patient about discharge plan" +
          (options.notes ? ` — ${options.notes}` : ""),
        department: "Nursing",
        priority: "Routine",
        status: "Pending",
        type: "discharge",
        timestamp: new Date().toISOString(),
      });
    }

    if (options.needsNursingHome) {
      newTasks.push({
        id: `discharge-nh-${Date.now()}`,
        description:
          "Arrange nursing home placement" +
          (!options.notifyPatient && options.notes ? ` — ${options.notes}` : ""),
        department: "Social Work",
        priority: "Urgent",
        status: "Pending",
        type: "discharge",
        timestamp: new Date().toISOString(),
      });
    }

    if (newTasks.length > 0) {
      setPatients((prev) =>
        prev.map((p) =>
          p.id === selectedPatientForDischarge.id
            ? { ...p, tasks: [...newTasks, ...p.tasks] }
            : p
        )
      );
    }

    setSelectedPatientForDischarge(null);
  };

  const handleGenerateShiftHandoff = async () => {
    const result = await generateHandoffSummary(patients);
    if (result) {
      setHandoffData({ summaryText: result, title: "Shift Handoff Report", patientCount: patients.length });
      setShowHandoff(true);
    } else {
      alert("Failed to generate handoff summary. Please try again.");
    }
  };

  const handleCloseHandoff = () => {
    setShowHandoff(false);
    setHandoffData(null);
  };

  // --- Patient handlers (real writes) ---

  const handleAddPatientClick = () => {
    setShowAddPatient(true);
  };

  const handleAddPatientSave = async (fields) => {
    const newPatient = await createPatient(nurseProfile.facility_id, fields);
    setPatients((prev) => [{ ...newPatient, tasks: [], notes: [] }, ...prev]);
    setShowAddPatient(false);
  };

  const handleEditPatientClick = (patient) => {
    setPatientToEdit(patient);
  };

  const handleEditPatientSave = async (patientId, fields) => {
    const updated = await updatePatient(patientId, fields);
    setPatients((prev) =>
      prev.map((p) => (p.id === patientId ? { ...p, ...updated } : p))
    );
    setPatientToEdit(null);
  };

  // --- Task handlers (real writes) ---

  const handleCompleteTask = async (task) => {
    try {
      const updated = await completeTask(task.id);
      setPatients((prev) =>
        prev.map((p) =>
          p.id === task.patient_id
            ? { ...p, tasks: p.tasks.map((t) => (t.id === task.id ? updated : t)) }
            : p
        )
      );
    } catch (err) {
      console.error("Complete task error:", err);
      alert("Failed to mark task complete. Please try again.");
    }
  };

  const handleEditTaskClick = (task) => {
    setTaskToEdit(task);
  };

  const handleManualUpdateTask = async (updates, task) => {
    const updated = await updateTask(task.id, updates);
    setPatients((prev) =>
      prev.map((p) =>
        p.id === task.patient_id
          ? { ...p, tasks: p.tasks.map((t) => (t.id === task.id ? updated : t)) }
          : p
      )
    );
    setTaskToEdit(null);
  };

  // --- Note handlers (real writes) ---

  const handleAddNoteClick = (patientId) => {
    setShowAddNote(patientId);
  };

  const handleAddNoteSave = async (noteData) => {
    if (showAddNote === null) return;
    const patientId = showAddNote;
    try {
      const newNote = await addNote(nurseProfile.facility_id, patientId, session.user.id, noteData.text);
      setPatients((prev) =>
        prev.map((p) =>
          p.id === patientId ? { ...p, notes: [newNote, ...p.notes] } : p
        )
      );
      setShowAddNote(null);

      // Trigger AI suggestions (async, non-blocking)
      triggerSuggestions(patientId, {
        type: "note",
        data: newNote,
      });
    } catch (err) {
      console.error("Add note error:", err);
      alert("Failed to save note. Please try again.");
    }
  };

  // --- Suggestion handlers ---

  const handleSuggestionAddAsTask = (suggestion) => {
    if (!suggestionData) return;
    const patientId = suggestionData.patientId;
    const details = suggestion.taskDetails || {};
    const newTask = {
      id: Date.now(),
      description: details.description || suggestion.text,
      department: details.department || "Nursing",
      status: "Pending",
      priority: details.priority || "Routine",
      timestamp: new Date().toISOString(),
      deadline: details.deadline || null,
    };
    setPatients((prev) =>
      prev.map((p) =>
        p.id === patientId
          ? { ...p, tasks: [...p.tasks, newTask] }
          : p
      )
    );

    // Simulate status change after 15 seconds (same as regular task creation)
    setTimeout(() => {
      simulateStatusChange(newTask.id);
    }, 15000);
  };

  const handleSuggestionAddAsNote = (suggestion) => {
    if (!suggestionData) return;
    const patientId = suggestionData.patientId;
    const details = suggestion.noteDetails || {};
    const newNote = {
      id: Date.now(),
      content: details.text || suggestion.text,
      created_at: new Date().toISOString(),
    };
    setPatients((prev) =>
      prev.map((p) =>
        p.id === patientId
          ? { ...p, notes: [...(p.notes || []), newNote] }
          : p
      )
    );
  };

  const handleSuggestionDismissAll = () => {
    setSuggestionData(null);
  };

  // --- Charge Nurse Dashboard handlers ---

  const handleSwitchToChargeView = () => {
    setShowChargeView(true);
  };

  const handleSwitchToMyPatients = () => {
    setShowChargeView(false);
  };

  const handleChargePatientClick = (patientId) => {
    setShowChargeView(false);
    // Scroll to patient card would happen here in a real app
  };

  // --- Alert escalation handlers ---

  const handleRepageDepartment = (task) => {
    // Simulate repaging: reset the task's delayed status back to Pending
    // and restart the status simulation timer
    setPatients((prev) =>
      prev.map((p) => ({
        ...p,
        tasks: p.tasks.map((t) =>
          t.id === task.id ? { ...t, status: "Pending" } : t
        ),
      }))
    );
    // Simulate a new status change after 15 seconds
    setTimeout(() => {
      simulateStatusChange(task.id);
    }, 15000);
  };

  const handleEscalateToCharge = (task) => {
    // Escalate: change priority to Stat and add escalated flag
    setPatients((prev) =>
      prev.map((p) => ({
        ...p,
        tasks: p.tasks.map((t) =>
          t.id === task.id ? { ...t, priority: "Stat", escalated: true } : t
        ),
      }))
    );
  };

  const triggerSuggestions = async (patientId, newItem) => {
    const patient = patients.find((p) => p.id === patientId);
    if (!patient) return;

    try {
      const suggestions = await generateSuggestions(patient, newItem);
      if (suggestions && suggestions.length > 0) {
        const triggerSummary = newItem.type === "task"
          ? `New task: ${newItem.data.description}`
          : `New note: ${newItem.data.content.slice(0, 50)}${newItem.data.content.length > 50 ? "..." : ""}`;
        setSuggestionData({
          suggestions,
          patientId,
          patientName: patient.label,
          triggerSummary,
        });
      }
    } catch (err) {
      console.error("Suggestion generation failed:", err);
      // Silently fail - suggestions are non-critical
    }
  };

  // --- Auth gates ---

  // Still loading session
  if (authLoading || session === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <p className="text-sm text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  // Not logged in
  if (!session) {
    return <AuthScreen onAuthSuccess={handleAuthSuccess} />;
  }

  // Logged in but no nurse profile yet (needs facility selection)
  if (nurseProfile === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (!nurseProfile) {
    return <FacilityScreen session={session} onFacilityComplete={handleFacilityComplete} />;
  }

  // Patients still loading for this facility
  if (patientsLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (showChargeView) {
    return (
      <>
        <ChargeNurseDashboard
          patients={patients}
          onSwitchView={handleSwitchToMyPatients}
          onPatientClick={handleChargePatientClick}
          delayedTasks={delayedTasks}
          onGenerateHandoff={handleGenerateShiftHandoff}
          onDischargePatient={(patient) => setSelectedPatientForDischarge(patient)}
          onFollowUp={handleFollowUp}
          onDismissAlert={dismissAlert}
        />
        {/* Keep alert visible on charge view */}
        {delayedTasks.length > 0 && !alertHidden && (
          <Alert
            task={delayedTasks[0]}
            onRepage={handleRepageDepartment}
            onEscalate={handleEscalateToCharge}
            onDismiss={() => setAlertHidden(true)}
            currentIndex={0}
            totalCount={delayedTasks.length}
          />
        )}
      </>
    );
  }

  if (showHandoff && handoffData) {
    return (
      <HandoffSummary
        summaryText={handoffData.summaryText}
        title={handoffData.title}
        patientCount={handoffData.patientCount}
        onClose={handleCloseHandoff}
      />
    );
  }

  if (showVoice) {
    return (
      <VoiceCapture
        onClose={() => {
          setShowVoice(false);
          setVoiceCapturePatient(null);
        }}
        onTaskCreated={handleTaskCreated}
        allPatients={patients}
        knownPatient={voiceCapturePatient}
      />
    );
  }

  return (
    <>
      {patientsError && (
        <div className="bg-red-50 px-4 py-2 text-center text-sm text-red-600">
          {patientsError}
        </div>
      )}
      {delayedTasks.length > 0 && !showVoice && !alertHidden && (
        <Alert
          task={delayedTasks[0]}
          onDismiss={() => setAlertHidden(true)}
          onRepage={handleRepageDepartment}
          onEscalate={handleEscalateToCharge}
          currentIndex={0}
          totalCount={delayedTasks.length}
        />
      )}
      <Dashboard
        patients={patients}
        onVoiceClick={() => {
          setVoiceCapturePatient(null);
          setShowVoice(true);
        }}
        onGenerateHandoff={handleGenerateShiftHandoff}
        onSwitchToChargeView={handleSwitchToChargeView}
        delayedTasks={delayedTasks}
        onDischargePatient={(patient) => setSelectedPatientForDischarge(patient)}
        onFollowUp={handleFollowUp}
        onDismissAlert={dismissAlert}
        onOpenVoiceCapture={(patient) => {
          setVoiceCapturePatient(patient);
          setShowVoice(true);
        }}
        onAddPatient={handleAddPatientClick}
        onEditPatient={handleEditPatientClick}
        onCompleteTask={handleCompleteTask}
        onEditTask={handleEditTaskClick}
        onAddNote={handleAddNoteClick}
      />
      {selectedPatientForDischarge && (
        <DischargeDialog
          patient={selectedPatientForDischarge}
          onCancel={() => setSelectedPatientForDischarge(null)}
          onConfirm={handleDischargeConfirm}
        />
      )}
      {showAddNote !== null && (
        <AddNoteDialog
          patientName={(patients.find((p) => p.id === showAddNote)?.label) || "Patient"}
          onCancel={() => setShowAddNote(null)}
          onSave={handleAddNoteSave}
        />
      )}
      {suggestionData && (
        <SuggestionModal
          suggestions={suggestionData.suggestions}
          patientName={suggestionData.patientName}
          triggerSummary={suggestionData.triggerSummary}
          onAddAsTask={handleSuggestionAddAsTask}
          onAddAsNote={handleSuggestionAddAsNote}
          onDismissAll={handleSuggestionDismissAll}
        />
      )}
      {showAddPatient && (
        <AddPatientDialog
          onCancel={() => setShowAddPatient(false)}
          onSave={handleAddPatientSave}
        />
      )}
      {patientToEdit && (
        <EditPatientDialog
          patient={patientToEdit}
          onCancel={() => setPatientToEdit(null)}
          onSave={handleEditPatientSave}
        />
      )}
      {taskToEdit && (
        <TaskEditDialog
          task={taskToEdit}
          patientId={taskToEdit.patient_id}
          onCancel={() => setTaskToEdit(null)}
          onManualUpdate={handleManualUpdateTask}
        />
      )}
    </>
  );
}

export default App;
